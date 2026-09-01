import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { totpAt } from './authCrypto.js';
import type { BackendConfig } from './config.js';
import { parseServerProperties, patchServerProperties } from './serverProperties.js';
import { emptyState, type ManagedServer } from './types.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function managedServer(id: string, name: string, directory: string): ManagedServer {
  return {
    id,
    name,
    status: 'OFFLINE',
    software: 'Fabric',
    minecraftVersion: '26.2',
    javaVersion: 'Java 25',
    ip: '0.0.0.0',
    port: 25565,
    playerCount: 0,
    maxPlayers: 20,
    cpu: 0,
    ram: 0,
    ramMax: 4096,
    disk: 0,
    diskMax: 0,
    uptime: 0,
    directory,
    startupCommand: 'java -jar fabric.jar nogui',
    startupExecutable: 'java',
    startupArgs: ['-jar', 'fabric.jar', 'nogui'],
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-settings-'));
  temporary.push(root);
  const config: BackendConfig = {
    host: '127.0.0.1',
    port: 0,
    readOnly: false,
    dataDir: path.join(root, 'data'),
    serversRoot: path.join(root, 'servers'),
    frontendDist: path.join(root, 'missing-dist'),
    allowedOrigins: ['https://darkcraft.projectdarkhope.xyz'],
    secureCookies: true,
  };
  const firstDirectory = path.join(config.serversRoot, 'first');
  const secondDirectory = path.join(config.serversRoot, 'second');
  await mkdir(firstDirectory, { recursive: true });
  await mkdir(secondDirectory, { recursive: true });
  await writeFile(path.join(firstDirectory, 'server.properties'), [
    '#Minecraft server properties',
    'online-mode=false',
    'server-port=25565',
    'max-players=12',
    'motd=First server',
    'gamemode=creative',
    'difficulty=normal',
    'white-list=true',
    'allow-flight=true',
    'pvp=false',
    'enable-command-block=true',
    'hardcore=true',
    'spawn-animals=false',
    'spawn-monsters=false',
    'spawn-npcs=false',
    'spawn-protection=5',
    'view-distance=14',
    'simulation-distance=8',
    'accepts-transfers=true',
    'bug-report-link=https://bugs.example.test/minecraft-26.2',
    'pause-when-empty-seconds=60',
    '',
  ].join('\n'));
  await writeFile(path.join(secondDirectory, 'server.properties'), [
    'online-mode=true',
    'server-port=25566',
    'max-players=40',
    'motd=Second server',
    'difficulty=hard',
    'custom-second-server-property=isolated',
    '',
  ].join('\n'));

  const state = {
    ...emptyState(),
    servers: [managedServer('first', 'First', firstDirectory), managedServer('second', 'Second', secondDirectory)],
    settings: {
      first: { crackedMode: false, rawProperties: {} },
      second: { crackedMode: true, rawProperties: {} },
    },
  };
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(path.join(config.dataDir, 'dashboard.json'), `${JSON.stringify(state, null, 2)}\n`);
  const context = await buildApp(config);
  const setup = await context.auth.service.beginSetup();
  const grant = await context.auth.service.completeSetup({
    setupToken: setup.setupToken,
    password: 'Testing-password-7',
    totpCode: totpAt(setup.manualKey, Date.now()).code,
  });
  return {
    context,
    config,
    firstDirectory,
    secondDirectory,
    headers: {
      cookie: `darkcraft_session=${grant.sessionToken}`,
      origin: 'https://darkcraft.projectdarkhope.xyz',
      'x-csrf-token': grant.csrfToken,
    },
  };
}

describe('server.properties source of truth', () => {
  it('parses every supported field and retains every actual raw property', () => {
    const content = 'online-mode=false\nserver-port=25570\nmax-players=33\ngamemode=adventure\ndifficulty=peaceful\nwhite-list=true\nallow-flight=true\npvp=false\nenable-command-block=true\nhardcore=true\nspawn-animals=false\nspawn-monsters=false\nspawn-npcs=false\nspawn-protection=0\nview-distance=16\nsimulation-distance=7\nunknown-26.2-option=preserved\n';
    const settings = parseServerProperties(content, { serverId: 'one', serverName: 'One' });
    expect(settings).toMatchObject({
      crackedMode: true,
      serverPort: 25570,
      maxPlayers: 33,
      gamemode: 'adventure',
      difficulty: 'peaceful',
      whitelist: true,
      allowFlight: true,
      pvp: false,
      commandBlocks: true,
      hardcore: true,
      spawnAnimals: false,
      spawnMonsters: false,
      spawnNpcs: false,
      spawnProtection: 0,
      viewDistance: 16,
      simulationDistance: 7,
    });
    expect(settings.rawProperties).toEqual(expect.objectContaining({
      'online-mode': 'false',
      'unknown-26.2-option': 'preserved',
    }));
    expect(Object.keys(settings.rawProperties)).toHaveLength(17);
  });

  it('updates only explicit properties without regenerating comments or unknown properties', () => {
    const original = '# keep this comment\r\nonline-mode=false\r\ndifficulty=easy\r\nunknown-26.2-option=keep-me\r\n';
    const updated = patchServerProperties(original, { difficulty: 'hard' });
    expect(updated).toBe('# keep this comment\r\nonline-mode=false\r\ndifficulty=hard\r\nunknown-26.2-option=keep-me\r\n');
  });

  it('reads and patches each server directory independently while ignoring stale dashboard settings', async () => {
    const { context, config, firstDirectory, secondDirectory, headers } = await fixture();
    try {
      const first = await context.app.inject({ method: 'GET', url: '/api/v1/servers/first/settings', headers: { cookie: headers.cookie } });
      const second = await context.app.inject({ method: 'GET', url: '/api/v1/servers/second/settings', headers: { cookie: headers.cookie } });
      expect(first.statusCode).toBe(200);
      expect(first.json().data).toMatchObject({ crackedMode: true, serverPort: 25565, maxPlayers: 12, motd: 'First server' });
      expect(first.json().data.rawProperties).toMatchObject({
        'online-mode': 'false',
        'accepts-transfers': 'true',
        'bug-report-link': 'https://bugs.example.test/minecraft-26.2',
        'pause-when-empty-seconds': '60',
      });
      const originalFirstRaw = first.json().data.rawProperties as Record<string, string>;
      expect(second.json().data).toMatchObject({ crackedMode: false, serverPort: 25566, maxPlayers: 40, motd: 'Second server' });

      const changed = await context.app.inject({
        method: 'PATCH',
        url: '/api/v1/servers/first/settings',
        headers,
        payload: { difficulty: 'hard' },
      });
      expect(changed.statusCode).toBe(200);
      const firstFile = await readFile(path.join(firstDirectory, 'server.properties'), 'utf8');
      const secondFile = await readFile(path.join(secondDirectory, 'server.properties'), 'utf8');
      expect(firstFile).toContain('online-mode=false\n');
      expect(firstFile).toContain('difficulty=hard\n');
      expect(firstFile).toContain('accepts-transfers=true\n');
      expect(firstFile).toContain('bug-report-link=https://bugs.example.test/minecraft-26.2\n');
      expect(firstFile).toContain('pause-when-empty-seconds=60\n');
      expect(secondFile).toContain('online-mode=true\n');
      expect(secondFile).toContain('custom-second-server-property=isolated\n');

      const refreshed = await context.app.inject({ method: 'GET', url: '/api/v1/servers/first/settings', headers: { cookie: headers.cookie } });
      expect(refreshed.json().data).toMatchObject({ crackedMode: true, difficulty: 'hard' });
      expect(refreshed.json().data.rawProperties).toEqual({ ...originalFirstRaw, difficulty: 'hard' });

      const migratedDashboard = JSON.parse(await readFile(path.join(config.dataDir, 'dashboard.json'), 'utf8')) as Record<string, unknown>;
      expect(migratedDashboard).not.toHaveProperty('settings');
    } finally {
      await context.app.close();
    }
  });
});
