import { createApp } from './app.js';
import { loadServerConfig } from './config.js';

const config = loadServerConfig();
const app = createApp(config.LISTS_DATABASE_PATH);
await app.listen({ host: '127.0.0.1', port: config.PORT });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}
