import { createHmac } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ListsService } from './service.js';

const listId = z.uuid();
const itemId = z.uuid();
const itemInput = {
  text: z.string().optional(),
  note: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueDate: z.string().optional(),
  snoozedUntil: z.string().optional(),
  completed: z.boolean().optional(),
};

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function createListsMcpServer({
  service,
  reminderWebhook,
}: {
  service: ListsService;
  reminderWebhook?: Pick<ReminderWebhookOptions, 'url' | 'secret'>;
}) {
  const server = new McpServer({ name: 'lists-app', version: '0.1.0' });

  server.registerTool(
    'list_lists',
    {
    description: 'List all Lists App lists.',
    },
    async () => jsonContent(service.listLists()),
  );

  server.registerTool(
    'get_list',
    {
    description: 'Get one list and its items.',
    inputSchema: { listId },
    },
    async ({ listId: id }) => jsonContent(service.getList(id)),
  );

  server.registerTool(
    'create_list',
    {
    description: 'Create a new todo, shopping, or agenda list.',
    inputSchema: { title: z.string(), kind: z.enum(['todo', 'shopping', 'agenda']) },
    },
    async (input) => jsonContent(service.createList(input)),
  );

  server.registerTool(
    'update_list',
    {
    description: 'Rename a list, change its kind, or set pinned/favorite.',
    inputSchema: {
      listId,
      title: z.string().optional(),
      kind: z.enum(['todo', 'shopping', 'agenda']).optional(),
      pinned: z.boolean().optional(),
      favorite: z.boolean().optional(),
    },
    },
    async ({ listId: id, ...input }) => jsonContent(service.updateList(id, input)),
  );

  server.registerTool(
    'delete_list',
    {
    description: 'Delete a list and all of its items.',
    inputSchema: { listId },
    },
    async ({ listId: id }) => {
    service.deleteList(id);
    return jsonContent({ deleted: true, listId: id });
    },
  );

  server.registerTool(
    'create_item',
    {
    description: 'Add an item to a list.',
      inputSchema: {
        listId,
        text: z.string(),
        note: itemInput.note,
        priority: itemInput.priority,
        dueDate: itemInput.dueDate,
        snoozedUntil: itemInput.snoozedUntil,
        completed: itemInput.completed,
      },
    },
    async ({ listId: id, ...input }) => jsonContent(service.createItem(id, input)),
  );

  server.registerTool(
    'update_item',
    {
    description: 'Update item text, details, or completion state.',
    inputSchema: { itemId, ...itemInput },
    },
    async ({ itemId: id, ...input }) => jsonContent(service.updateItem(id, input)),
  );

  server.registerTool(
    'delete_item',
    {
    description: 'Delete an item from its list.',
    inputSchema: { itemId },
    },
    async ({ itemId: id }) => {
    service.deleteItem(id);
    return jsonContent({ deleted: true, itemId: id });
    },
  );

  server.registerTool(
    'move_item',
    {
    description: 'Reorder an item within its list, placing it before another item (or at the end if omitted).',
    inputSchema: { itemId, beforeItemId: itemId.optional() },
    },
    async ({ itemId: id, beforeItemId }) => {
    service.moveItem(id, beforeItemId);
    return jsonContent({ moved: true, itemId: id });
    },
  );

  if (reminderWebhook) {
    server.registerTool(
      'request_reminder',
      {
      description: 'Request a Hermes reminder through the configured webhook destination.',
      inputSchema: { title: z.string(), when: z.string(), listId: listId.optional(), itemId: itemId.optional() },
      },
      async (reminder) => {
      await postReminderWebhook({ ...reminderWebhook, reminder });
      return jsonContent({ requested: true, reminder });
      },
    );
  }

  return server;
}

export type ReminderRequest = {
  title: string;
  when: string;
  listId?: string;
  itemId?: string;
};

type ReminderWebhookOptions = {
  url: string;
  secret: string;
  reminder: ReminderRequest;
  now?: () => Date;
};

export type ReminderWebhookDestination = Pick<ReminderWebhookOptions, 'url' | 'secret'>;

export function reminderWebhookFromEnvironment(environment: Record<string, string | undefined>) {
  const url = environment.LISTS_REMINDER_WEBHOOK_URL;
  const secret = environment.LISTS_REMINDER_WEBHOOK_SECRET;
  if (!url && !secret) return undefined;
  if (!url || !secret) throw new Error('LISTS_REMINDER_WEBHOOK_URL and LISTS_REMINDER_WEBHOOK_SECRET must be set together');
  return { url, secret };
}

export async function postReminderWebhook({ url, secret, reminder, now = () => new Date() }: ReminderWebhookOptions): Promise<void> {
  const body = JSON.stringify({ event: 'lists.reminder.requested', reminder });
  const timestamp = Math.floor(now().getTime() / 1_000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature-v2': signature,
    },
    body,
  });
  if (!response.ok) throw new Error(`reminder webhook failed: ${response.status}`);
}
