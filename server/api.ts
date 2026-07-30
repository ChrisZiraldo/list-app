import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ListsService } from './service.js';

const listInput = z.object({
  title: z.string(),
  kind: z.enum(['todo', 'shopping', 'agenda']),
});
const listUpdateInput = z.object({
  title: z.string().optional(),
  kind: z.enum(['todo', 'shopping', 'agenda']).optional(),
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
});
const listIdParams = z.object({ listId: z.uuid() });
const itemInput = z.object({
  text: z.string(),
  note: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueDate: z.string().optional(),
  snoozedUntil: z.string().optional(),
  completed: z.boolean().optional(),
});
const itemIdParams = z.object({ itemId: z.uuid() });
const moveInput = z.object({ beforeItemId: z.uuid().optional() });

export function registerListsApi(app: FastifyInstance, service: ListsService) {
  app.get('/api/lists', () => service.listLists());
  app.get('/api/lists/:listId', (request) => service.getList(listIdParams.parse(request.params).listId));

  app.post('/api/lists', { schema: { response: { 201: {} } } }, async (request, reply) => {
    const input = listInput.parse(request.body);
    return reply.code(201).send(service.createList(input));
  });

  app.patch('/api/lists/:listId', (request) => service.updateList(listIdParams.parse(request.params).listId, listUpdateInput.parse(request.body)));

  app.delete('/api/lists/:listId', async (request, reply) => {
    service.deleteList(listIdParams.parse(request.params).listId);
    return reply.code(204).send();
  });

  app.post('/api/lists/:listId/items', async (request, reply) => {
    const listId = listIdParams.parse(request.params).listId;
    return reply.code(201).send(service.createItem(listId, itemInput.parse(request.body)));
  });

  app.patch('/api/items/:itemId', (request) => service.updateItem(itemIdParams.parse(request.params).itemId, itemInput.partial().parse(request.body)));

  app.delete('/api/items/:itemId', async (request, reply) => {
    service.deleteItem(itemIdParams.parse(request.params).itemId);
    return reply.code(204).send();
  });

  app.post('/api/items/:itemId/move', async (request, reply) => {
    const itemId = itemIdParams.parse(request.params).itemId;
    const { beforeItemId } = moveInput.parse(request.body);
    service.moveItem(itemId, beforeItemId);
    return reply.code(204).send();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid request' });
    return reply.code(400).send({ error: error instanceof Error ? error.message : 'request failed' });
  });
}

export function buildApi(service: ListsService) {
  const app = Fastify();
  registerListsApi(app, service);
  return app;
}
