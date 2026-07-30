import { createHmac } from 'node:crypto';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createListsMcpServer, postReminderWebhook, reminderWebhookFromEnvironment } from './mcp.js';
import { ListsService } from './service.js';

function toolText(result: unknown) {
  return (result as { content: Array<{ text: string }> }).content[0].text;
}

describe('Lists MCP server', () => {
  it('exposes list and item tools through the MCP protocol', async () => {
    const service = new ListsService(new Database(':memory:'));
    const server = createListsMcpServer({ service });
    const client = new Client({ name: 'lists-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      'create_item',
      'create_list',
      'delete_item',
      'delete_list',
      'get_list',
      'list_lists',
      'move_item',
      'update_item',
      'update_list',
    ]);

    const createdList = await client.callTool({
      name: 'create_list',
      arguments: { title: 'Home', kind: 'todo' },
    });
    const list = JSON.parse(toolText(createdList));
    const createdItem = await client.callTool({
      name: 'create_item',
      arguments: { listId: list.id, text: 'Take bins out', priority: 'high' },
    });
    const item = JSON.parse(toolText(createdItem));

    const updatedItem = await client.callTool({
      name: 'update_item',
      arguments: { itemId: item.id, completed: true },
    });

    expect(JSON.parse(toolText(updatedItem))).toMatchObject({
      id: item.id,
      completed: true,
      priority: 'high',
    });

    const renamedList = await client.callTool({
      name: 'update_list',
      arguments: { listId: list.id, title: 'Household', pinned: true },
    });
    expect(JSON.parse(toolText(renamedList))).toMatchObject({ id: list.id, title: 'Household', pinned: true });

    const secondItem = await client.callTool({
      name: 'create_item',
      arguments: { listId: list.id, text: 'Second' },
    });
    const second = JSON.parse(toolText(secondItem));
    await client.callTool({ name: 'move_item', arguments: { itemId: second.id, beforeItemId: item.id } });
    const reordered = JSON.parse(toolText(await client.callTool({ name: 'get_list', arguments: { listId: list.id } })));
    expect(reordered.items.map((candidate: { id: string }) => candidate.id)).toEqual([second.id, item.id]);

    await client.callTool({ name: 'delete_item', arguments: { itemId: second.id } });
    const afterItemDelete = JSON.parse(toolText(await client.callTool({ name: 'get_list', arguments: { listId: list.id } })));
    expect(afterItemDelete.items.map((candidate: { id: string }) => candidate.id)).toEqual([item.id]);

    await client.callTool({ name: 'delete_list', arguments: { listId: list.id } });
    expect(JSON.parse(toolText(await client.callTool({ name: 'list_lists', arguments: {} })))).toEqual([]);

    await Promise.all([client.close(), server.close()]);
  });
});

describe('postReminderWebhook', () => {
  it('requires both webhook environment values before exposing reminder delivery', () => {
    expect(reminderWebhookFromEnvironment({})).toBeUndefined();
    expect(() => reminderWebhookFromEnvironment({ LISTS_REMINDER_WEBHOOK_URL: 'https://example.test/reminders' }))
      .toThrow('LISTS_REMINDER_WEBHOOK_URL and LISTS_REMINDER_WEBHOOK_SECRET must be set together');
    expect(reminderWebhookFromEnvironment({
      LISTS_REMINDER_WEBHOOK_URL: 'https://example.test/reminders',
      LISTS_REMINDER_WEBHOOK_SECRET: 'test-shared-secret',
    })).toEqual({ url: 'https://example.test/reminders', secret: 'test-shared-secret' });
  });

  it('exposes a reminder tool only when a webhook destination is configured', async () => {
    const receiver = Fastify();
    let received: unknown;
    receiver.post('/reminders', async (request) => {
      received = request.body;
      return { accepted: true };
    });
    await receiver.listen({ host: '127.0.0.1', port: 0 });
    const address = receiver.server.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP listener');

    const server = createListsMcpServer({
      service: new ListsService(new Database(':memory:')),
      reminderWebhook: { url: `http://127.0.0.1:${address.port}/reminders`, secret: 'test-shared-secret' },
    });
    const client = new Client({ name: 'lists-test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('request_reminder');
    await client.callTool({
      name: 'request_reminder',
      arguments: { title: 'Take bins out', when: '2026-08-01T09:00:00.000Z' },
    });

    expect(received).toEqual({
      event: 'lists.reminder.requested',
      reminder: { title: 'Take bins out', when: '2026-08-01T09:00:00.000Z' },
    });
    await Promise.all([client.close(), server.close(), receiver.close()]);
  });

  it('sends timestamp-bound HMAC payloads accepted by Hermes generic V2 webhooks', async () => {
    const secret = 'test-shared-secret';
    const receiver = Fastify();
    let received: { body: unknown; headers: Record<string, unknown> } | undefined;
    receiver.post('/reminders', async (request) => {
      received = { body: request.body, headers: request.headers };
      return { accepted: true };
    });
    await receiver.listen({ host: '127.0.0.1', port: 0 });
    const address = receiver.server.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP listener');

    await postReminderWebhook({
      url: `http://127.0.0.1:${address.port}/reminders`,
      secret,
      reminder: { title: 'Take bins out', when: '2026-08-01T09:00:00.000Z', listId: 'list-1', itemId: 'item-1' },
      now: () => new Date('2026-07-30T12:00:00.000Z'),
    });

    const rawBody = JSON.stringify({
      event: 'lists.reminder.requested',
      reminder: { title: 'Take bins out', when: '2026-08-01T09:00:00.000Z', listId: 'list-1', itemId: 'item-1' },
    });
    const timestamp = '1785412800';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

    expect(received).toEqual({
      body: JSON.parse(rawBody),
      headers: expect.objectContaining({
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature-v2': signature,
      }),
    });
    await receiver.close();
  });
});
