import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HermesCronBridge } from './cron-bridge.js';
import { createRemindersMcpServer } from './mcp.js';

const server = createRemindersMcpServer({ bridge: new HermesCronBridge() });
await server.connect(new StdioServerTransport());
