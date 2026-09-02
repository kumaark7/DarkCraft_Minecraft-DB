import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardEvents } from './events.js';
import { ProcessManager } from './processManager.js';
import { JsonStore } from './store.js';
import type { ManagedServer } from './types.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function waitFor(check: () => boolean, timeout = 5000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for runtime state');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('managed Minecraft runtime', () => {
  it('uses readiness logs for ONLINE and exposes live metrics, players, and detected metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-process-'));
    temporary.push(root);
    const serverDirectory = path.join(root, 'server');
    await mkdir(serverDirectory);
    await writeFile(path.join(serverDirectory, 'server.properties'), 'server-ip=127.0.0.1\nserver-port=25570\nmax-players=42\n');
    const store = new JsonStore(path.join(root, 'dashboard.json'));
    await store.load();
    const script = [
      "console.log('Running Java 25 (OpenJDK 64-Bit Server VM)')",
      "console.log('Starting Paper version 26.2-42-master')",
      "console.log('This server is running CraftBukkit version 4123-Spigot (MC: 26.2)')",
      "console.log('[main/INFO]: Loading 2 mods:')",
      "console.log('[main/INFO]: \\t- dark-example 1.0.0')",
      "console.log('[main/INFO]: \\t- fabric-api 1.2.3')",
      "console.error('[Server thread/WARN]: stderr diagnostic')",
      "console.log('[Server thread/INFO]: Steve joined the game')",
      "setTimeout(() => console.log('[Server thread/INFO]: Done (1.00s)! For help, type \\\"help\\\"'), 50)",
      "process.stdin.on('data', data => { if (String(data).includes('spark tps')) { console.log('[Server thread/INFO]: [⚡] TPS from last 5s, 10s, 1m, 5m, 15m:'); console.log('[Server thread/INFO]: [⚡] 19.5, 19.6, 19.7, 19.8, 19.9'); console.log('[Server thread/INFO]: [⚡] Tick durations (min/med/95%ile/max ms) from last 10s, 1m:'); console.log('[Server thread/INFO]: [⚡] 1.0/4.0/9.0/15.0; 1.0/5.0/10.0/20.0'); } })",
      "let listRequests = 0; process.stdin.on('data', data => { if (String(data).includes('list')) { console.log('List request ' + (++listRequests)); console.log('[Server thread/INFO]: There are 2 of a max of 42 players online: Steve, Alex') } })",
      'setInterval(() => {}, 1000)',
    ].join(';');
    const server: ManagedServer = {
      id: 'runtime-test', name: 'Runtime Test', status: 'OFFLINE', software: 'Fabric', minecraftVersion: '1.21.4',
      javaVersion: 'Java 21', ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 20, cpu: 0, ram: 0,
      ramMax: 4096, disk: 0, diskMax: 0, uptime: 0, directory: serverDirectory, startupCommand: 'node -e',
      startupExecutable: process.execPath, startupArgs: ['-e', script], createdAt: new Date().toISOString(),
    };
    await store.update((state) => { state.servers.push(server); state.players[server.id] = []; });
    const manager = new ProcessManager(store, new DashboardEvents(), async () => ({ cpu: 12.5, memory: 256 * 1048576 }), async () => 'Java 25');

    await manager.start(server.id);
    expect(store.get().servers[0]?.status).toBe('STARTING');
    await waitFor(() => store.get().servers[0]?.status === 'ONLINE');
    await manager.refreshOnlinePlayers(server.id);
    await waitFor(() => manager.getHistory(server.id).some((entry) => entry.message === 'List request 1'));
    await Promise.all([manager.refreshOnlinePlayers(server.id), manager.refreshOnlinePlayers(server.id), manager.refreshOnlinePlayers(server.id)]);
    expect(manager.getHistory(server.id).filter((entry) => entry.message.startsWith('List request '))).toHaveLength(1);
    expect([...manager.loadedModIds(server.id)]).toEqual(['dark-example', 'fabric-api']);
    await waitFor(() => manager.getHistory(server.id).some(entry => entry.message.includes('1.0/4.0/9.0/15.0')));
    const snapshot = await manager.serverSnapshot(server.id);
    expect(snapshot).toMatchObject({ status: 'ONLINE', software: 'Paper', minecraftVersion: '26.2', javaVersion: 'Java 25', playerCount: 2, maxPlayers: 42, ip: '127.0.0.1', port: 25570, cpu: 12.5, ram: 256 });
    expect(snapshot?.pid).toBeTypeOf('number');
    expect(snapshot?.disk).toBeGreaterThan(0);
    expect(snapshot?.diskMax).toBeGreaterThan(0);
    const stats = await manager.stats(server.id);
    expect(stats).toMatchObject({ networkIn: null, networkOut: null, tps: 19.5, mspt: 4, tpsSource: 'spark-5s', msptSource: 'spark-median-10s', players: 2, maxPlayers: 42 });
    const persisted = await manager.readHistory(server.id);
    expect(persisted.some((entry) => entry.message.includes('Done (1.00s)') && entry.stream === 'stdout')).toBe(true);
    expect(persisted.some((entry) => entry.message.includes('stderr diagnostic') && entry.stream === 'stderr')).toBe(true);

    await manager.kill(server.id);
    await waitFor(() => store.get().servers[0]?.status === 'CRASHED');
  });
});
