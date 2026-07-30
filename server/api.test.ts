import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApi } from './api.js';
import { ListsService } from './service.js';

function createApi() {
  return buildApi(new ListsService(new Database(':memory:')));
}

describe('Lists HTTP API', () => {
  it('creates a list and returns it through the collection endpoint', async () => {
    const app = createApi();

    const created = await app.inject({
      method: 'POST',
      url: '/api/lists',
      payload: { title: '  Family  ', kind: 'todo' },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ title: 'Family', kind: 'todo' });
    const listed = await app.inject({ method: 'GET', url: '/api/lists' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
    await app.close();
  });

  it('adds an item and returns it from its list detail', async () => {
    const app = createApi();
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Groceries', kind: 'shopping' } })).json();

    const created = await app.inject({ method: 'POST', url: `/api/lists/${list.id}/items`, payload: { text: 'Milk', priority: 'high' } });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ text: 'Milk', priority: 'high', completed: false });
    const detail = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });
    expect(detail.json()).toMatchObject({ id: list.id, items: [expect.objectContaining({ text: 'Milk' })] });
    await app.close();
  });

  it('accepts an explicit reminder time for an agenda item', async () => {
    const app = createApi();
    const agenda = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Family calendar', kind: 'agenda' } })).json();

    const created = await app.inject({
      method: 'POST',
      url: `/api/lists/${agenda.id}/items`,
      payload: { text: 'Leave for dentist', reminderAt: '2026-08-03T13:45:00.000Z' },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ text: 'Leave for dentist', reminderAt: '2026-08-03T13:45:00.000Z' });
    await app.close();
  });

  it('posts an authenticated reminder request when an agenda item has a reminder time', async () => {
    const receiver = Fastify();
    let received: unknown;
    receiver.post('/reminders', async (request) => {
      received = request.body;
      return { accepted: true };
    });
    await receiver.listen({ host: '127.0.0.1', port: 0 });
    const address = receiver.server.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP listener');
    const app = buildApi(new ListsService(new Database(':memory:')), {
      reminderWebhook: { url: `http://127.0.0.1:${address.port}/reminders`, secret: 'test-shared-secret' },
    });
    const agenda = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Family calendar', kind: 'agenda' } })).json();

    const created = await app.inject({
      method: 'POST',
      url: `/api/lists/${agenda.id}/items`,
      payload: { text: 'Leave for dentist', reminderAt: '2026-08-03T13:45:00.000Z' },
    });

    expect(created.statusCode).toBe(201);
    expect(received).toEqual({
      event_type: 'lists.reminder.requested',
      reminder: expect.objectContaining({ title: 'Leave for dentist', when: '2026-08-03T13:45:00.000Z', listId: agenda.id }),
    });
    await Promise.all([app.close(), receiver.close()]);
  });

  it('marks an item complete through a patch request', async () => {
    const app = createApi();
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Today', kind: 'todo' } })).json();
    const item = (await app.inject({ method: 'POST', url: `/api/lists/${list.id}/items`, payload: { text: 'Call Mum' } })).json();

    const updated = await app.inject({ method: 'PATCH', url: `/api/items/${item.id}`, payload: { completed: true } });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: item.id, completed: true });
    await app.close();
  });

  it('renames a list through a patch request', async () => {
    const app = createApi();
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Today', kind: 'todo' } })).json();

    const updated = await app.inject({ method: 'PATCH', url: `/api/lists/${list.id}`, payload: { title: 'This week', pinned: true } });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: list.id, title: 'This week', pinned: true });
    await app.close();
  });

  it('deletes a list', async () => {
    const app = createApi();
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Today', kind: 'todo' } })).json();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/lists/${list.id}` });
    const missing = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });

    expect(deleted.statusCode).toBe(204);
    expect(missing.statusCode).toBe(400);
    await app.close();
  });

  it('deletes an item', async () => {
    const app = createApi();
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Today', kind: 'todo' } })).json();
    const item = (await app.inject({ method: 'POST', url: `/api/lists/${list.id}/items`, payload: { text: 'Call Mum' } })).json();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/items/${item.id}` });
    const detail = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });

    expect(deleted.statusCode).toBe(204);
    expect(detail.json().items).toEqual([]);
    await app.close();
  });

  it('moves an item before another item', async () => {
    const app = createApi();
    const list = (await app.inject({ method: 'POST', url: '/api/lists', payload: { title: 'Today', kind: 'todo' } })).json();
    const first = (await app.inject({ method: 'POST', url: `/api/lists/${list.id}/items`, payload: { text: 'First' } })).json();
    const second = (await app.inject({ method: 'POST', url: `/api/lists/${list.id}/items`, payload: { text: 'Second' } })).json();

    const moved = await app.inject({ method: 'POST', url: `/api/items/${second.id}/move`, payload: { beforeItemId: first.id } });
    const detail = await app.inject({ method: 'GET', url: `/api/lists/${list.id}` });

    expect(moved.statusCode).toBe(204);
    expect(detail.json().items.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
    await app.close();
  });
});
