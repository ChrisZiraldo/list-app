# Lists App

Standalone Node.js/TypeScript Lists application. Deployment, Hermes integration, cron, and Tailnet routing are configured separately.

The app is served under the `/lists` path (see `shared/base-path.ts`) — both the Vite build base and the server's route prefix derive from that single constant, since Tailscale Serve forwards the full request path unstripped.

## Commands

- `npm test` — SQLite repository, domain service, HTTP API, and MCP tests
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint over the whole project
- `npm run format` — Prettier write
- `npm run build` — compile TypeScript and build the client to `dist/`
- `npm run mcp` — run the Lists MCP server over stdio (after `npm run build`)
- `npm run server:smoke` — initialize an in-memory SQLite repository

## Current domain foundation

`server/repository.ts` owns SQLite schema initialization, immutable UUID list/item identities, stable item positions, title validation, and transactions. `server/service.ts` is the shared domain adapter. Live list data is stored in the configured SQLite database.

Lists have a title, kind (`todo`/`shopping`/`agenda`), and `pinned`/`favorite` flags. Items have text, `priority` (`low`/`normal`/`high`), `dueDate`, `snoozedUntil`, a `note`, completion state, and a stable manual position that can be changed via `moveItem`/the `/move` endpoint.

Both lists and items can be deleted. Deleting a list cascades to its items.

## HTTP API (mounted under `/lists`)

- `GET /api/lists`, `POST /api/lists`, `PATCH /api/lists/:listId`, `DELETE /api/lists/:listId`
- `GET /api/lists/:listId`
- `POST /api/lists/:listId/items`
- `PATCH /api/items/:itemId`, `DELETE /api/items/:itemId`
- `POST /api/items/:itemId/move` — reorder an item, `{ beforeItemId? }`

`GET /health` (unprefixed, for local/systemd health checks) returns `{ status: "ok" }`.

## Environment

Validated at startup by `server/config.ts` (`loadServerConfig`):

- `PORT` — defaults to `3000`
- `LISTS_DATABASE_PATH` — defaults to `lists.sqlite3`

The process closes its SQLite connection and exits cleanly on `SIGTERM`/`SIGINT`. Logging is enabled (pino, via Fastify) when `NODE_ENV=production`.

## MCP and reminder webhook

`server/mcp-main.ts` exposes `list_lists`, `get_list`, `create_list`, `update_list`, `delete_list`, `create_item`, `update_item`, `delete_item`, and `move_item` over stdio MCP. Point an MCP client at `node /home/hermes/lists-app/dist/server/mcp-main.js` after building and set `LISTS_DATABASE_PATH` to the SQLite database if it is not the working-directory default.

To expose the optional `request_reminder` tool, set both `LISTS_REMINDER_WEBHOOK_URL` and `LISTS_REMINDER_WEBHOOK_SECRET`. It POSTs `lists.reminder.requested` payloads using Hermes generic HMAC V2 headers: `X-Webhook-Timestamp` and `X-Webhook-Signature-V2`, where the signature is HMAC-SHA256 of `<timestamp>.<raw JSON body>`. It deliberately does not configure or enable a Hermes webhook route; that deployment step remains separate.

## PWA

`public/manifest.json`, `public/icon.svg`, and `public/sw.js` make the app installable to a phone home screen. The service worker does no offline caching — it exists only to satisfy Chrome/Android's installability check (a controlling SW with a fetch handler); every request still goes to the network.
