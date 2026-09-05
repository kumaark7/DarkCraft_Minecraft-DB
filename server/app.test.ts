import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { BackendConfig } from './config.js';
import { totpAt } from './authCrypto.js';
import AdmZip from 'adm-zip';
import type { ManagedServer } from './types.js';

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

  it('serves mod metadata and Minecraft player JSON instead of stale dashboard values', async () => {
    const cfg = await config(false); const context = await buildApp(cfg);
    const headers = await authenticate(context);
    const directory = path.join(cfg.serversRoot, 'real-data');
    await mkdir(path.join(directory, 'mods'), { recursive: true });
    const modJar = new AdmZip();
    modJar.addFile('fabric.mod.json', Buffer.from(JSON.stringify({ id: 'real-mod', name: 'Real Mod', version: '3.1.4', depends: { minecraft: '>=26.2 <27' } })));
    await writeFile(path.join(directory, 'mods', 'real-mod.jar'), modJar.toBuffer());
    await writeFile(path.join(directory, 'usercache.json'), JSON.stringify([{ name: 'Steve', uuid: 'uuid-steve' }]));
    await writeFile(path.join(directory, 'ops.json'), JSON.stringify([{ name: 'Steve', uuid: 'uuid-steve', level: 4 }]));
    await writeFile(path.join(directory, 'whitelist.json'), '[]');
    await writeFile(path.join(directory, 'banned-players.json'), '[]');
    await writeFile(path.join(directory, 'banned-ips.json'), JSON.stringify([{ ip: '192.0.2.25', source: 'Admin', reason: 'Spam', created: '2026-09-02 00:00:00 +0000' }]));
    const server: ManagedServer = {
      id: 'real-data', name: 'Real Data', status: 'OFFLINE', software: 'Fabric', minecraftVersion: '26.2', javaVersion: 'Java 21',
      ip: '0.0.0.0', port: 25565, playerCount: 1, maxPlayers: 20, cpu: null, ram: null, ramMax: 4096,
      disk: null, diskMax: null, uptime: 0, directory, startupCommand: 'java -jar fabric.jar nogui', startupExecutable: 'java',
      startupArgs: ['-jar', 'fabric.jar', 'nogui'], createdAt: new Date().toISOString(),
    };
    await context.store.update((state) => {
      state.servers.push(server);
      state.players[server.id] = [{ username: 'StaleOnline', uuid: 'stale', online: true, isOp: true, isWhitelisted: true, isBanned: true }];
      state.bannedIPs[server.id] = [{ ip: '198.51.100.1', reason: 'Stale', bannedBy: 'Cache', date: '' }];
    });

    const players = await context.app.inject({ method: 'GET', url: '/api/v1/servers/real-data/players', headers: { cookie: headers.cookie } });
    const bannedIps = await context.app.inject({ method: 'GET', url: '/api/v1/servers/real-data/banned-ips', headers: { cookie: headers.cookie } });
    const mods = await context.app.inject({ method: 'GET', url: '/api/v1/servers/real-data/mods', headers: { cookie: headers.cookie } });
    expect(players.json().data).toEqual([expect.objectContaining({ username: 'Steve', uuid: 'uuid-steve', online: false, isOp: true })]);
    expect(bannedIps.json().data).toEqual([{ ip: '192.0.2.25', reason: 'Spam', bannedBy: 'Admin', date: '2026-09-02 00:00:00 +0000' }]);
    expect(mods.json().data).toEqual([expect.objectContaining({ id: 'real-mod', name: 'Real Mod', version: '3.1.4', size: expect.any(Number), loader: 'Fabric', minecraftCompatibility: '>=26.2 <27', status: 'Unknown' })]);
    await context.app.close();
  });

  it('bridges console fwhitelist to the real Floodgate whitelist without changing case', async () => {
    const cfg = await config(false);
    const bedrockFetcher = (async () => new Response(JSON.stringify({
      id: '0000000000000000000901f26d300855', name: '.Nocturne17Dani',
    }))) as typeof fetch;
    const context = await buildApp(cfg, { bedrockFetcher });
    const headers = await authenticate(context);
    const directory = path.join(cfg.serversRoot, 'bedrock-whitelist');
    await mkdir(path.join(directory, 'config', 'floodgate'), { recursive: true });
    await writeFile(path.join(directory, 'config', 'floodgate', 'config.yml'), 'username-prefix: "."\n');
    await writeFile(path.join(directory, 'server.properties'), 'online-mode=false\n');
    await writeFile(path.join(directory, 'whitelist.json'), JSON.stringify([{ uuid: 'java-uuid', name: 'JavaPlayer' }]));
    const server: ManagedServer = {
      id: 'bedrock-whitelist', name: 'Bedrock Whitelist', status: 'OFFLINE', software: 'Fabric', minecraftVersion: '26.2', javaVersion: 'Java 25',
      ip: '0.0.0.0', port: 25565, playerCount: 0, maxPlayers: 20, cpu: null, ram: null, ramMax: 4096,
      disk: null, diskMax: null, uptime: 0, directory, startupCommand: 'java -jar fabric.jar', startupExecutable: 'java', startupArgs: ['-jar', 'fabric.jar'], createdAt: new Date().toISOString(),
    };
    await context.store.update((state) => { state.servers.push(server); });

    const added = await context.app.inject({
      method: 'POST', url: '/api/v1/servers/bedrock-whitelist/console/commands', headers,
      payload: { command: 'fwhitelist add Nocturne17Dani' },
    });
    expect(added.statusCode).toBe(200);
    expect(JSON.parse(await readFile(path.join(directory, 'whitelist.json'), 'utf8'))).toEqual([
      { uuid: 'java-uuid', name: 'JavaPlayer' },
      { uuid: '00000000-0000-0000-0009-01f26d300855', name: '.Nocturne17Dani' },
    ]);
    const players = await context.app.inject({ method: 'GET', url: '/api/v1/servers/bedrock-whitelist/players', headers: { cookie: headers.cookie } });
    expect(players.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: '.Nocturne17Dani', uuid: '00000000-0000-0000-0009-01f26d300855', isWhitelisted: true }),
    ]));
    expect((await context.processes.readHistory(server.id, 'live')).some((entry) => entry.message === '> fwhitelist add Nocturne17Dani')).toBe(true);

    const removed = await context.app.inject({
      method: 'DELETE', url: '/api/v1/servers/bedrock-whitelist/players/whitelist', headers,
      payload: { username: '.Nocturne17Dani', edition: 'bedrock', uuid: '00000000-0000-0000-0009-01f26d300855' },
    });
    expect(removed.statusCode).toBe(200);
    expect(JSON.parse(await readFile(path.join(directory, 'whitelist.json'), 'utf8'))).toEqual([{ uuid: 'java-uuid', name: 'JavaPlayer' }]);

    const javaAdded = await context.app.inject({
      method: 'POST', url: '/api/v1/servers/bedrock-whitelist/players/whitelist', headers,
      payload: { username: 'Test123CAPa', edition: 'java' },
    });
    expect(javaAdded.statusCode).toBe(200);
    expect(JSON.parse(await readFile(path.join(directory, 'whitelist.json'), 'utf8'))).toEqual([
      { uuid: 'java-uuid', name: 'JavaPlayer' },
      { uuid: 'a64a0144-06a3-322c-b775-7fa28832bf6b', name: 'Test123CAPa' },
    ]);

    const consoleAdded = await context.app.inject({
      method: 'POST', url: '/api/v1/servers/bedrock-whitelist/console/commands', headers,
      payload: { command: 'whitelist add ConsoleCase' },
    });
    expect(consoleAdded.statusCode).toBe(200);
    const exactPlayers = await context.app.inject({ method: 'GET', url: '/api/v1/servers/bedrock-whitelist/players', headers: { cookie: headers.cookie } });
    expect(exactPlayers.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: 'Test123CAPa', uuid: 'a64a0144-06a3-322c-b775-7fa28832bf6b', isWhitelisted: true }),
      expect.objectContaining({ username: 'ConsoleCase', isWhitelisted: true }),
    ]));
    await context.app.close();
  });
});

  it('protects and serves persistent host history with validated ranges', async () => {
    const cfg = await config(false);
    const measured = { uptime: 5, cpuModel: 'Test CPU', cpuUsage: 12, ramTotal: 1000, ramUsed: 500, diskTotal: 100, diskUsed: 25, networkIn: null, networkOut: null };
    const context = await buildApp(cfg, { hostCollector: async () => measured });
    try {
      expect((await context.app.inject({ method: 'GET', url: '/api/v1/host/metrics?range=1h' })).statusCode).toBe(401);
      const headers = await authenticate(context);
      const history = await context.app.inject({ method: 'GET', url: '/api/v1/host/metrics?range=1h', headers: { cookie: headers.cookie } });
      expect(history.statusCode).toBe(200);
      expect(history.json().data).toEqual([expect.objectContaining({ cpu: 12, ram: 500, ramPercent: 50 })]);
      expect((await context.app.inject({ method: 'GET', url: '/api/v1/host/metrics?range=forever', headers: { cookie: headers.cookie } })).statusCode).toBe(400);
    } finally { await context.app.close(); }
  });

  it('persists a cooldown-controlled notification when a backup fails', async () => {
    const cfg = await config(false); const context = await buildApp(cfg);
    try {
      const headers = await authenticate(context); const directory = path.join(cfg.serversRoot, 'backup-alert');
      await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, 'backups'), 'blocks backup directory creation');
      const server: ManagedServer = {
        id: 'backup-alert', name: 'Backup Alert', status: 'OFFLINE', software: 'Fabric', minecraftVersion: '26.2', javaVersion: 'Java 25',
        ip: '0.0.0.0', port: 25565, playerCount: 0, maxPlayers: 20, cpu: null, ram: null, ramMax: 4096,
        disk: null, diskMax: null, uptime: 0, directory, startupCommand: 'java -jar fabric.jar', startupExecutable: 'java', startupArgs: ['-jar', 'fabric.jar'], createdAt: new Date().toISOString(),
      };
      await context.store.update(state => { state.servers.push(server); });
      const failed = await context.app.inject({ method: 'POST', url: '/api/v1/servers/backup-alert/backups', headers });
      expect(failed.statusCode).toBe(500);
      const notifications = await context.app.inject({ method: 'GET', url: '/api/v1/notifications', headers: { cookie: headers.cookie } });
      expect(notifications.json().data).toEqual([expect.objectContaining({ type: 'backup-failed', serverId: 'backup-alert', severity: 'error' })]);
    } finally { await context.app.close(); }
  });
