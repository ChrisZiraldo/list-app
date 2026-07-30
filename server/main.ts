import { createApp } from './app.js';
import { loadServerConfig } from './config.js';
import { reminderWebhookFromEnvironment } from './mcp.js';

const config = loadServerConfig();
const app = createApp(config.LISTS_DATABASE_PATH, undefined, { reminderWebhook: reminderWebhookFromEnvironment(process.env) });
await app.listen({ host: '127.0.0.1', port: config.PORT });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}
