import { fileURLToPath } from 'node:url';
import { createRemindersApp } from './app.js';
import { HermesCronBridge } from './cron-bridge.js';

const port = Number(process.env.REMINDERS_PORT ?? 3458);
const app = createRemindersApp(fileURLToPath(new URL('../../reminders/client', import.meta.url)), new HermesCronBridge());
await app.listen({ host: '127.0.0.1', port });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
