import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { totpAt } from './authCrypto.js';
import type { BackendConfig } from './config.js';
import type { ManagedServer } from './types.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-modrinth-api-')); temporary.push(root);
  const config: BackendConfig = {
    host: '127.0.0.1', port: 0, readOnly: false, dataDir: path.join(root, 'data'),
    serversRoot: path.join(root, 'servers'), frontendDist: path.join(root, 'missing'),
    allowedOrigins: ['https://darkcraft.projectdarkhope.xyz'], secureCookies: true,
  };
  const project = { project_id: 'Project1', project_type: 'mod', title: 'Server Mod', description: 'Safe description', server_side: 'required' };
  const version = {
    id: 'Version1', project_id: 'Project1', status: 'listed', version_type: 'release', version_number: '1.0.0',
    game_versions: ['26.2'], loaders: ['fabric'], environment: 'server_only', dependencies: [], date_published: '2026-09-01T00:00:00Z',
    files: [{ filename: 'server-mod.jar', size: 123 }],
  };
  const fetcher = vi.fn(async (input: unknown) => new Response(JSON.stringify(String(input).includes('/search?')
    ? { hits: [project], total_hits: 1 } : [version])));
  const context = await buildApp(config, { modrinthFetcher: fetcher as typeof fetch });
  const directory = path.join(config.serversRoot, 'server-1'); await mkdir(directory, { recursive: true });
  const server: ManagedServer = {
    id: 'server-1', name: 'Test', status: 'OFFLINE', software: 'Fabric', minecraftVersion: '26.2', javaVersion: 'Unknown',
    ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 20, cpu: null, ram: null, ramMax: 4096,
    disk: null, diskMax: null, uptime: 0, directory, startupCommand: 'java -jar fabric.jar nogui', startupExecutable: 'java',
    startupArgs: ['-jar', 'fabric.jar', 'nogui'], createdAt: new Date().toISOString(),
  };
  await context.store.update(state => { state.servers.push(server); });
  const setup = await context.auth.service.beginSetup();
  const grant = await context.auth.service.completeSetup({
    setupToken: setup.setupToken, password: 'Testing-password-7', totpCode: totpAt(setup.manualKey, Date.now()).code,
  });
  return { context, fetcher, cookie: 'darkcraft_session=' + grant.sessionToken, csrf: grant.csrfToken };
}

describe('Modrinth API boundary', () => {
  it('protects installation with authentication, CSRF, origin and read-only enforcement', async () => {
    const { context, fetcher, cookie, csrf } = await fixture();
    const url = '/api/v1/servers/server-1/modrinth/install';
    const origin = 'https://darkcraft.projectdarkhope.xyz';
    const payload = { versionId: 'Version1' };
    expect((await context.app.inject({ method: 'POST', url, payload, headers: { origin } })).statusCode).toBe(401);
    expect((await context.app.inject({ method: 'POST', url, payload, headers: { cookie, origin } })).statusCode).toBe(403);
    expect((await context.app.inject({ method: 'POST', url, payload, headers: { cookie, origin: 'https://evil.example', 'x-csrf-token': csrf } })).statusCode).toBe(403);
    context.config.readOnly = true;
    expect((await context.app.inject({ method: 'POST', url, payload, headers: { cookie, origin, 'x-csrf-token': csrf } })).statusCode).toBe(403);
    context.config.readOnly = false;
    expect((await context.app.inject({ method: 'POST', url, payload: { versionId: '../escape' }, headers: { cookie, origin, 'x-csrf-token': csrf } })).statusCode).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    await context.app.close();
  });

  it('requires authentication and derives exact compatibility from the managed server', async () => {
    const { context, fetcher, cookie } = await fixture();
    const unauthenticated = await context.app.inject({ method: 'GET', url: '/api/v1/servers/server-1/modrinth' });
    expect(unauthenticated.statusCode).toBe(401);
    const response = await context.app.inject({ method: 'GET', url: '/api/v1/servers/server-1/modrinth?q=server', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      supported: true, loader: 'fabric', minecraftVersion: '26.2',
      matches: [expect.objectContaining({ projectId: 'Project1', versionId: 'Version1' })],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await context.app.close();
  });

  it('returns no guessed matches for unsupported servers and validates pagination before upstream access', async () => {
    const { context, fetcher, cookie } = await fixture();
    await context.store.update(state => { state.servers[0]!.software = 'Paper'; });
    const unsupported = await context.app.inject({ method: 'GET', url: '/api/v1/servers/server-1/modrinth', headers: { cookie } });
    expect(unsupported.json().data).toMatchObject({ supported: false, matches: [] });
    const invalid = await context.app.inject({ method: 'GET', url: '/api/v1/servers/server-1/modrinth?offset=-1', headers: { cookie } });
    expect(invalid.statusCode).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    await context.app.close();
  });
});
