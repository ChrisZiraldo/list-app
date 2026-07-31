import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ReminderJob, ReminderJobInput } from './cron-bridge.js';

export type RemindersBridge = {
  list?: () => Promise<ReminderJob[]>;
  create?: (input: ReminderJobInput) => Promise<void>;
  pause?: (jobId: string) => Promise<void>;
  resume?: (jobId: string) => Promise<void>;
  update?: (jobId: string, input: ReminderJobInput) => Promise<void>;
  remove?: (jobId: string) => Promise<void>;
};

const jobId = z.string().regex(/^[A-Za-z0-9_-]+$/);
const input = z.object({
  name: z.string().trim().min(1).max(200),
  schedule: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(10_000),
  deliver: z.string().trim().min(1).max(500),
});

function requireMethod<T>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`cron bridge does not support ${name}`);
  return method;
}

export function registerRemindersApi(app: FastifyInstance, bridge: RemindersBridge) {
  app.get('/api/reminders', async () => requireMethod(bridge.list, 'listing').call(bridge));
  app.post('/api/reminders', async (request, reply) => {
    await requireMethod(bridge.create, 'creation').call(bridge, input.parse(request.body));
    return reply.code(201).send({ created: true });
  });
  app.post('/api/reminders/:jobId/pause', async (request, reply) => {
    await requireMethod(bridge.pause, 'pausing').call(bridge, jobId.parse((request.params as { jobId: string }).jobId));
    return reply.code(204).send();
  });
  app.post('/api/reminders/:jobId/resume', async (request, reply) => {
    await requireMethod(bridge.resume, 'resuming').call(bridge, jobId.parse((request.params as { jobId: string }).jobId));
    return reply.code(204).send();
  });
  app.patch('/api/reminders/:jobId', async (request, reply) => {
    await requireMethod(bridge.update, 'editing').call(bridge, jobId.parse((request.params as { jobId: string }).jobId), input.parse(request.body));
    return reply.code(204).send();
  });
  app.delete('/api/reminders/:jobId', async (request, reply) => {
    await requireMethod(bridge.remove, 'deletion').call(bridge, jobId.parse((request.params as { jobId: string }).jobId));
    return reply.code(204).send();
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid request' });
    return reply.code(400).send({ error: error instanceof Error ? error.message : 'request failed' });
  });
}

export function buildRemindersApi(bridge: RemindersBridge) {
  const app = Fastify();
  registerRemindersApi(app, bridge);
  return app;
}
