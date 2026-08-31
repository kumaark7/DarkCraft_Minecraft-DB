import { mkdtemp, mkdir, rm } from 'node:fs/promises';
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
    const store = new JsonStore(path.join(root, 'dashboard.json'));
    await store.load();
    const script = [
      "console.log('Running Java 25 (OpenJDK 64-Bit Server VM)')",
      "console.log('Starting Paper version 26.2-42-master')",
      "console.log('This server is running CraftBukkit version 4123-Spigot (MC: 26.2)')",
      "console.log('[Server thread/INFO]: Steve joined the game')",
      "setTimeout(() => console.log('[Server thread/INFO]: Done (1.00s)! For help, type \\\"help\\\"'), 50)",
      'setInterval(() => {}, 1000)',
    ].join(';');
    const server: ManagedServer = {
      id: 'runtime-test', name: 'Runtime Test', status: 'OFFLINE', software: 'Fabric', minecraftVersion: '1.21.4',
      javaVersion: 'Java 21', ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 20, cpu: 0, ram: 0,
      ramMax: 4096, disk: 0, diskMax: 0, uptime: 0, directory: serverDirectory, startupCommand: 'node -e',
      startupExecutable: process.execPath, startupArgs: ['-e', script], createdAt: new Date().toISOString(),
    };
    await store.update((state) => { state.servers.push(server); state.players[server.id] = []; });
    const manager = new ProcessManager(store, new DashboardEvents(), async () => ({ cpu: 12.5, memory: 256 * 1048576 }));

    await manager.start(server.id);
    expect(store.get().servers[0]?.status).toBe('STARTING');
    await waitFor(() => store.get().servers[0]?.status === 'ONLINE');
    const snapshot = await manager.serverSnapshot(server.id);
    expect(snapshot).toMatchObject({ status: 'ONLINE', software: 'Paper', minecraftVersion: '26.2', javaVersion: 'Java 25', playerCount: 1, cpu: 12.5, ram: 256 });

    await manager.kill(server.id);
    await waitFor(() => store.get().servers[0]?.status === 'CRASHED');
  });
});
