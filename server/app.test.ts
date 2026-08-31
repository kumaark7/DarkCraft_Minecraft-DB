import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { BackendConfig } from './config.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function config(readOnly: boolean): Promise<BackendConfig> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-app-')); temporary.push(root);
  return { host: '127.0.0.1', port: 0, readOnly, dataDir: path.join(root, 'data'), serversRoot: path.join(root, 'servers'), frontendDist: path.join(root, 'missing-dist') };
}

describe('backend API guarantees', () => {
  it('reports health and blocks mutations in read-only mode', async () => {
    const cfg = await config(true); const context = await buildApp(cfg);
    const health = await context.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200); expect(health.json().data.readOnly).toBe(true);
    const write = await context.app.inject({ method: 'POST', url: '/api/v1/servers', payload: { serverName: 'Blocked' } });
    expect(write.statusCode).toBe(403); expect(await readdir(cfg.serversRoot)).toEqual([]);
    await context.app.close();
  });

  it('creates a sandboxed server and rejects traversal reads', async () => {
    const cfg = await config(false); const context = await buildApp(cfg);
    const created = await context.app.inject({ method: 'POST', url: '/api/v1/servers', payload: { serverName: 'Test Server', serverType: 'Paper', ram: 1024 } });
    expect(created.statusCode).toBe(201); const id = created.json().data.id as string;
    const traversal = await context.app.inject({ method: 'GET', url: `/api/v1/servers/${id}/files/content?path=%252e%252e%252fsecret` });
    expect(traversal.statusCode).toBe(400);
    await context.app.close();
  });
});
