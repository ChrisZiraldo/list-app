import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { registerListsApi } from './api.js';
import { ListsService } from './service.js';

const staticTypes: Record<string, string> = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

// The app is reachable externally under /lists (shared/base-path.ts), but Tailscale
// Serve strips that mount prefix before forwarding, so the server itself is unprefixed.
export function createApp(databasePath: string, clientDirectory = fileURLToPath(new URL('../client', import.meta.url))) {
  const database = new Database(databasePath);
  const service = new ListsService(database);
  const root = resolve(clientDirectory);

  const app = Fastify({ logger: process.env.NODE_ENV === 'production' });
  app.addHook('onClose', () => database.close());

  app.get('/health', async () => ({ status: 'ok' }));

  registerListsApi(app, service);

  app.get('/*', async (request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });

    const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (relative(root, file).startsWith('..')) return reply.code(404).send({ error: 'not found' });

    let contents: Buffer;
    try {
      contents = await readFile(file);
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
    return reply.type(staticTypes[extname(file)] ?? 'application/octet-stream').send(contents);
  });

  return app;
}
