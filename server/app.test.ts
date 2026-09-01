import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { BackendConfig } from './config.js';
import { totpAt } from './authCrypto.js';
import AdmZip from 'adm-zip';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function config(readOnly: boolean): Promise<BackendConfig> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-app-')); temporary.push(root);
  return { host: '127.0.0.1', port: 0, readOnly, dataDir: path.join(root, 'data'), serversRoot: path.join(root, 'servers'), frontendDist: path.join(root, 'missing-dist'), allowedOrigins: ['https://darkcraft.projectdarkhope.xyz'], secureCookies: true };
}

async function authenticate(context: Awaited<ReturnType<typeof buildApp>>) {
  const setup = await context.auth.service.beginSetup();
  const grant = await context.auth.service.completeSetup({ setupToken: setup.setupToken, password: 'Testing-password-7', totpCode: totpAt(setup.manualKey, Date.now()).code });
  return { cookie: `darkcraft_session=${grant.sessionToken}`, origin: 'https://darkcraft.projectdarkhope.xyz', 'x-csrf-token': grant.csrfToken };
}

const testJar = new AdmZip(); testJar.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\n'));
const installerFetcher = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url === 'https://fill.papermc.io/v3/projects/paper/versions/26.2/builds') return new Response(JSON.stringify([{
    id: 1, channel: 'STABLE', downloads: { 'server:default': { url: 'https://fill-data.papermc.io/server.jar' } },
  }]));
  if (url === 'https://fill-data.papermc.io/server.jar') return new Response(new Uint8Array(testJar.toBuffer()));
  return new Response('missing fixture', { status: 404 });
}) as typeof fetch;

describe('backend API guarantees', () => {
  it('reports health and blocks mutations in read-only mode', async () => {
    const cfg = await config(true); const context = await buildApp(cfg);
    const headers = await authenticate(context);
    const health = await context.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200); expect(health.json().data.readOnly).toBe(true);
    const write = await context.app.inject({ method: 'POST', url: '/api/v1/servers', headers, payload: { serverName: 'Blocked' } });
    expect(write.statusCode).toBe(403); expect(await readdir(cfg.serversRoot)).toEqual([]);
    await context.app.close();
  });

  it('creates a sandboxed server and rejects traversal reads', async () => {
    const cfg = await config(false); const context = await buildApp(cfg, { catalogFetcher: installerFetcher, installerFetcher });
    const headers = await authenticate(context);
    const created = await context.app.inject({ method: 'POST', url: '/api/v1/servers', headers, payload: { serverName: 'Test Server', serverType: 'Paper', minecraftVersion: '26.2', softwareBuild: '1', ram: 1024, port: 25565, maxPlayers: 20 } });
    expect(created.statusCode).toBe(201); const id = created.json().data.id as string;
    const traversal = await context.app.inject({ method: 'GET', url: `/api/v1/servers/${id}/files/content?path=%252e%252e%252fsecret`, headers: { cookie: headers.cookie } });
    expect(traversal.statusCode).toBe(400);
    await context.app.close();
  });
});
