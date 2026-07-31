import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRemindersApp } from './app.js';

describe('createRemindersApp', () => {
  it('keeps the Reminders service local and serves its protected API and client', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reminders-client-'));
    await writeFile(join(directory, 'index.html'), '<title>Reminders</title>');
    await mkdir(join(directory, 'assets'));
    const bridge = { list: vi.fn().mockResolvedValue([]), create: vi.fn(), pause: vi.fn(), resume: vi.fn(), update: vi.fn(), remove: vi.fn() };
    const app = createRemindersApp(directory, bridge);

    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
    expect((await app.inject({ method: 'GET', url: '/api/reminders' })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('Reminders');
    await app.close();
  });
});
