import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createRemindersMcpServer } from './mcp.js';

describe('Reminders MCP server', () => {
  it('exposes tools to inspect and manage Hermes cron reminders', async () => {
    const bridge = { list: vi.fn().mockResolvedValue([]), create: vi.fn(), pause: vi.fn(), resume: vi.fn(), update: vi.fn(), remove: vi.fn() };
    const server = createRemindersMcpServer({ bridge });
    const client = new Client({ name: 'test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      'create_reminder',
      'delete_reminder',
      'edit_reminder',
      'list_reminders',
      'pause_reminder',
      'resume_reminder',
    ]);
    await client.callTool({ name: 'pause_reminder', arguments: { jobId: 'job-1' } });
    expect(bridge.pause).toHaveBeenCalledWith('job-1');
    await Promise.all([client.close(), server.close()]);
  });
});
