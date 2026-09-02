import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendActivity, playerPresence, setServerStatus } from './activity.js';
import { buildApp } from './app.js';
import { totpAt } from './authCrypto.js';
import { JsonStore } from './store.js';
import { emptyState, type ManagedServer } from './types.js';
import { readServerIcon } from './serverIcon.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-activity-icons-')); temporary.push(root);
  const context = await buildApp({
    host: '127.0.0.1', port: 0, readOnly: false, dataDir: path.join(root, 'data'),
    serversRoot: path.join(root, 'servers'), frontendDist: path.join(root, 'missing'),
    allowedOrigins: ['https://darkcraft.projectdarkhope.xyz'], secureCookies: true,
  }, { metricIntervalMs: 60_000 });
  const script = [
    "console.log('[Server thread/INFO]: Done (1s)! For help, type \"help\"')",
    "process.stdin.on('data', data => { for (const command of String(data).trim().split('\\n')) {",
    "if (command === 'stop') process.exit(0);",
    "if (command === 'crash') process.exit(2);",
    "if (command === 'evidence') {",
    "console.log('[Server thread/INFO]: Steve joined the game');",
    "console.log('[Server thread/INFO]: Steve joined the game');",
    "console.log('[Server thread/INFO]: <Alex> Fake joined the game');",
    "console.log('[Server thread/INFO]: There are 2 of a max of 20 players online: Steve, Alex');",
    "console.log('[Server thread/INFO]: Steve left the game');",
    "console.log('[Server thread/INFO]: Steve left the game');",
    "console.log('[Server thread/INFO]: evidence complete');",
    "} } })",
  ].join(';');
  for (const id of ['one', 'two']) {
    const directory = path.join(context.config.serversRoot, id);
    await mkdir(directory, { recursive: true });
    const server: ManagedServer = {
      id, name: 'Server ' + id, status: 'OFFLINE', software: 'Fabric', minecraftVersion: '26.2',
      javaVersion: 'Unknown', ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 20,
      cpu: null, ram: null, ramMax: 1024, disk: null, diskMax: null, uptime: 0, directory,
      startupCommand: 'fixture', startupExecutable: process.execPath, startupArgs: ['-e', script],
      createdAt: new Date().toISOString(),
    };
    await context.store.update(state => { state.servers.push(server); });
  }
  const setup = await context.auth.service.beginSetup();
  const grant = await context.auth.service.completeSetup({
    setupToken: setup.setupToken, password: 'Testing-password-7', totpCode: totpAt(setup.manualKey, Date.now()).code,
  });
  return { context, root, headers: { cookie: 'darkcraft_session=' + grant.sessionToken } };
}

async function waitFor(check: () => boolean) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 5000) throw new Error('Timed out waiting for fixture');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

describe('runtime activity', () => {
  it('persists lifecycle and join/leave evidence, including graceful dashboard shutdown, without list/chat duplicates', async () => {
    const { context, headers } = await fixture();
    try {
      await context.processes.start('one');
      await waitFor(() => context.store.get().servers[0]?.status === 'ONLINE');
      context.processes.sendCommand('one', 'evidence');
      await waitFor(() => context.processes.getHistory('one').some(entry => entry.message.includes('evidence complete')));
      await context.store.save();
      const response = await context.app.inject({ method: 'GET', url: '/api/v1/activity', headers });
      const activity = response.json().data;
      expect(activity.filter((event: { category: string }) => event.category.startsWith('player-'))).toEqual([
        expect.objectContaining({ category: 'player-leave', actor: 'Steve', serverId: 'one' }),
        expect.objectContaining({ category: 'player-join', actor: 'Steve', serverId: 'one' }),
      ]);
      await context.processes.updateRuntimeState('one', '[Server thread/INFO]: Done (1s)! For help, type "help"');
      expect(context.store.get().activity.filter(event => event.event === 'Server started — online')).toHaveLength(1);
    } finally { await context.app.close(); }

    const recovered = new JsonStore(path.join(context.config.dataDir, 'dashboard.json'));
    await recovered.load();
    const activity = recovered.get().activity.filter(event => event.serverId === 'one');
    expect(activity.map(event => event.category)).toEqual([
      'server-stop', 'server-stop', 'player-leave', 'player-join', 'server-start', 'server-start',
    ]);
    expect(activity[0]?.event).toBe('Server stopped');
    expect(activity.every(event => event.serverName === 'Server one' && Number.isFinite(Date.parse(event.timestamp)))).toBe(true);
    expect(recovered.get().activity.some(event => event.serverId === 'two')).toBe(false);
  });

  it('records crashes and spawn failures without misreporting them as successful stops', async () => {
    const { context } = await fixture();
    try {
      await context.processes.start('one');
      await waitFor(() => context.store.get().servers[0]?.status === 'ONLINE');
      context.processes.sendCommand('one', 'crash');
      await waitFor(() => context.store.get().servers[0]?.status === 'CRASHED');
      await context.store.update(state => { state.servers[1]!.startupExecutable = path.join(context.config.dataDir, 'missing-java'); });
      await context.processes.start('two');
      await waitFor(() => context.store.get().servers[1]?.status === 'CRASHED');
      expect(context.store.get().activity.filter(event => event.category === 'error')).toHaveLength(2);
      expect(context.store.get().activity.some(event => event.event === 'Server stopped')).toBe(false);
    } finally { await context.app.close(); }
  });

  it('anchors presence evidence and bounds history without duplicating status transitions', () => {
    expect(playerPresence('[12:34:56] [Server thread/INFO]: Alex joined the game')).toEqual({ username: 'Alex', online: true });
    expect(playerPresence('[12:34:56 INFO]: Alex left the game')).toEqual({ username: 'Alex', online: false });
    for (const line of ['> say Alex joined the game', '[INFO]: <Steve> Alex joined the game', '[INFO]: Warning: Alex left the game', '[INFO]: Alex lost connection: Disconnected']) {
      expect(playerPresence(line)).toBeNull();
    }
    const state = emptyState();
    for (let i = 0; i < 1001; i++) appendActivity(state, { category: 'config-change', event: String(i) });
    expect(state.activity).toHaveLength(1000);
    expect(state.activity[0]?.event).toBe('1000');
    setServerStatus(state, 'missing', 'OFFLINE');
    expect(state.activity).toHaveLength(1000);
  });
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN7kAAAAASUVORK5CYII=', 'base64');

describe('server icon boundary', () => {
  it('reads each real server icon, reflects replacements, and protects auth, sandbox and read-only behavior', async () => {
    const { context, root, headers } = await fixture();
    const icon = path.join(context.config.serversRoot, 'one', 'server-icon.png');
    try {
      await writeFile(icon, png);
      expect((await context.app.inject({ method: 'GET', url: '/api/v1/servers/one/icon' })).statusCode).toBe(401);
      const get = (id: string) => context.app.inject({ method: 'GET', url: '/api/v1/servers/' + id + '/icon', headers });
      const first = await get('one');
      expect(first.json().data).toBe('data:image/png;base64,' + png.toString('base64'));
      expect(first.headers['cache-control']).toBe('private, no-store');
      expect((await get('two')).json().data).toBeNull();
      expect((await get('missing')).statusCode).toBe(404);
      expect((await get('%252e%252e')).statusCode).toBe(400);
      context.config.readOnly = true;
      expect((await get('one')).statusCode).toBe(200);
      await writeFile(icon, '<svg>not a PNG</svg>');
      expect((await get('one')).json().data).toBeNull();
      await writeFile(icon, png);
      expect((await get('one')).json().data).toBe(first.json().data);
      if (process.platform !== 'win32') {
        await rm(icon);
        const outside = path.join(root, 'outside.png'); await writeFile(outside, png);
        await symlink(outside, icon);
        expect((await get('one')).statusCode).toBe(400);
      }
    } finally { await context.app.close(); }
  });

  it('returns a fallback for missing, oversized, invalid, and non-file icons', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-icon-limit-')); temporary.push(root);
    const filename = path.join(root, 'server-icon.png');
    expect(await readServerIcon(filename)).toBeNull();
    expect(await readServerIcon(root)).toBeNull();
    await writeFile(filename, Buffer.alloc(1024 * 1024 + 1));
    expect(await readServerIcon(filename)).toBeNull();
    const invalid = Buffer.from(png); invalid.writeUInt32BE(0xffffffff, 16);
    await writeFile(filename, invalid);
    expect(await readServerIcon(filename)).toBeNull();
  });
});
