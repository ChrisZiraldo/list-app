import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('creates a local API backed by its supplied database path', async () => {
    const app = createApp(':memory:');

    const response = await app.inject({ method: 'GET', url: '/api/lists' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });

  it('serves the compiled client entry point without intercepting API routes', async () => {
    const clientDirectory = await mkdtemp(join(tmpdir(), 'lists-client-'));
    await writeFile(join(clientDirectory, 'index.html'), '<!doctype html><title>Lists</title>');
    await mkdir(join(clientDirectory, 'assets'));
    await writeFile(join(clientDirectory, 'assets', 'app.js'), 'console.log("Lists")');
    const app = createApp(':memory:', clientDirectory);

    const page = await app.inject({ method: 'GET', url: '/' });
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    const api = await app.inject({ method: 'GET', url: '/api/lists' });

    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('<title>Lists</title>');
    expect(asset.body).toContain('console.log("Lists")');
    expect(api.json()).toEqual([]);
    await app.close();
  });

  it('returns a clean 404 for a missing static file instead of a malformed payload error', async () => {
    const clientDirectory = await mkdtemp(join(tmpdir(), 'lists-client-'));
    await writeFile(join(clientDirectory, 'index.html'), '<!doctype html><title>Lists</title>');
    const app = createApp(':memory:', clientDirectory);

    const missing = await app.inject({ method: 'GET', url: '/does-not-exist.png' });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'not found' });
    await app.close();
  });

  it('exposes a health check', async () => {
    const app = createApp(':memory:');

    const health = await app.inject({ method: 'GET', url: '/health' });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
