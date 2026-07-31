import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import Fastify from 'fastify';
import { registerRemindersApi, type RemindersBridge } from './api.js';

const types: Record<string, string> = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

export function createRemindersApp(clientDirectory: string, bridge: RemindersBridge) {
  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });
  app.get('/health', async () => ({ status: 'ok' }));
  registerRemindersApi(app, bridge);
  const root = resolve(clientDirectory);
  app.get('/*', async (request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (relative(root, file).startsWith('..')) return reply.code(404).send({ error: 'not found' });
    try {
      return reply.type(types[extname(file)] ?? 'application/octet-stream').send(await readFile(file));
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
  });
  return app;
}
