import Database from 'better-sqlite3';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createListsMcpServer, reminderWebhookFromEnvironment } from './mcp.js';
import { ListsService } from './service.js';

const server = createListsMcpServer({
  service: new ListsService(new Database(process.env.LISTS_DATABASE_PATH ?? 'lists.sqlite3')),
  reminderWebhook: reminderWebhookFromEnvironment(process.env),
});

await server.connect(new StdioServerTransport());
