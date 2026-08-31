import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import pidusage from 'pidusage';
import type { ConsoleEntry, ConsoleSeverity, ServerStats } from '../src/types/index.js';
import type { JsonStore } from './store.js';
import type { DashboardEvents } from './events.js';
import type { ManagedServer } from './types.js';
import { detectRuntime } from './runtimeDetection.js';

interface Runtime {
  process: ChildProcessWithoutNullStreams;
  startedAt: number;
}

interface ProcessUsage {
  cpu: number;
  memory: number;
}

type ProcessUsageReader = (pid: number) => Promise<ProcessUsage>;

function severityFor(line: string): ConsoleSeverity {
  if (/\b(ERROR|FATAL|SEVERE)\b/i.test(line)) return 'ERROR';
  if (/\bWARN(?:ING)?\b/i.test(line)) return 'WARN';
  if (/issued server command|^>/.test(line)) return 'COMMAND';
  if (/joined the game|left the game/i.test(line)) return 'PLAYER';
  return 'INFO';
}

export class ProcessManager {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly history = new Map<string, ConsoleEntry[]>();
  private readonly metadataConfidence = new Map<string, number>();
  private readonly usageCache = new Map<string, ProcessUsage>();
  private readonly diskCache = new Map<string, { bytes: number; timestamp: number }>();

  constructor(
    private readonly store: JsonStore,
    private readonly events: DashboardEvents,
    private readonly readProcessUsage: ProcessUsageReader = (pid) => pidusage(pid),
  ) {}

  private record(serverId: string, message: string, source: ConsoleEntry['source'] = 'LIVE'): void {
    const entry: ConsoleEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      severity: severityFor(message),
      message,
      source,
    };
    const entries = [...(this.history.get(serverId) ?? []), entry].slice(-5000);
    this.history.set(serverId, entries);
    this.events.emitConsole(serverId, entry);
    void this.updatePlayerPresence(serverId, message);
    void this.updateRuntimeState(serverId, message);
  }

  async updateRuntimeState(serverId: string, message: string): Promise<void> {
    const detected = detectRuntime(message);
    if (!detected.ready && !detected.software && !detected.javaVersion) return;
    await this.store.update((state) => {
      const server = state.servers.find((item) => item.id === serverId);
      if (!server) return;
      if (detected.ready && server.status === 'STARTING') server.status = 'ONLINE';
      if (detected.javaVersion) server.javaVersion = detected.javaVersion;
      const confidence = detected.softwareConfidence ?? 0;
      if (detected.software && confidence >= (this.metadataConfidence.get(serverId) ?? 0)) {
        server.software = detected.software;
        if (detected.minecraftVersion) server.minecraftVersion = detected.minecraftVersion;
        this.metadataConfidence.set(serverId, confidence);
      }
    });
  }

  private async updatePlayerPresence(serverId: string, message: string): Promise<void> {
    const joined = message.match(/:\s*([A-Za-z0-9_]{1,16}) joined the game/i);
    const left = message.match(/:\s*([A-Za-z0-9_]{1,16}) left the game/i);
    const username = joined?.[1] ?? left?.[1];
    if (!username) return;
    await this.store.update((state) => {
      const players = state.players[serverId] ?? [];
      const existing = players.find((player) => player.username === username);
      if (existing) existing.online = Boolean(joined);
      else players.push({ username, uuid: `observed-${username}`, online: Boolean(joined), isOp: false, isWhitelisted: false, isBanned: false });
      state.players[serverId] = players;
      const server = state.servers.find((item) => item.id === serverId);
      if (server) server.playerCount = players.filter((player) => player.online).length;
    });
  }

  private server(serverId: string): ManagedServer {
    const server = this.store.get().servers.find((item) => item.id === serverId);
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    return server;
  }

  async start(serverId: string): Promise<void> {
    if (this.runtimes.has(serverId)) return;
    const server = this.server(serverId);
    const child = spawn(server.startupExecutable, server.startupArgs, {
      cwd: server.directory,
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
    });
    this.runtimes.set(serverId, { process: child, startedAt: Date.now() });
    await this.store.update((state) => {
      const target = state.servers.find((item) => item.id === serverId);
      if (target) target.status = 'STARTING';
    });

    const attach = (stream: NodeJS.ReadableStream) => {
      const lines = createInterface({ input: stream });
      lines.on('line', (line) => this.record(serverId, line));
    };
    attach(child.stdout);
    attach(child.stderr);

    child.once('spawn', async () => {
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) target.pid = child.pid;
      });
    });
    child.once('error', async (error) => {
      this.record(serverId, `Failed to start server: ${error.message}`);
      this.runtimes.delete(serverId);
      this.metadataConfidence.delete(serverId);
      this.usageCache.delete(serverId);
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) target.status = 'CRASHED';
      });
    });
    child.once('exit', async (code, signal) => {
      this.record(serverId, `Server process exited (code=${code ?? 'none'}, signal=${signal ?? 'none'})`);
      this.runtimes.delete(serverId);
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) {
          target.status = code === 0 ? 'OFFLINE' : 'CRASHED';
          target.pid = undefined;
          target.playerCount = 0;
          target.uptime = 0;
        }
        state.players[serverId] = (state.players[serverId] ?? []).map((player) => ({ ...player, online: false }));
      });
    });
  }

  async stop(serverId: string): Promise<void> {
    const runtime = this.runtimes.get(serverId);
    if (!runtime) {
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) target.status = 'OFFLINE';
      });
      return;
    }
    await this.store.update((state) => {
      const target = state.servers.find((item) => item.id === serverId);
      if (target) target.status = 'STOPPING';
    });
    runtime.process.stdin.write('stop\n');
    const timer = setTimeout(() => runtime.process.kill('SIGTERM'), 20_000);
    runtime.process.once('exit', () => clearTimeout(timer));
  }

  async restart(serverId: string): Promise<void> {
    await this.stop(serverId);
    const started = Date.now();
    while (this.runtimes.has(serverId) && Date.now() - started < 25_000) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await this.start(serverId);
  }

  async kill(serverId: string): Promise<void> {
    const runtime = this.runtimes.get(serverId);
    if (runtime) runtime.process.kill('SIGKILL');
  }

  sendCommand(serverId: string, command: string): void {
    const runtime = this.runtimes.get(serverId);
    if (!runtime) throw Object.assign(new Error('Server is not running'), { statusCode: 409 });
    if (command.includes('\n') || command.includes('\r') || command.length > 1024) {
      throw Object.assign(new Error('Invalid console command'), { statusCode: 400 });
    }
    runtime.process.stdin.write(`${command}\n`);
    this.record(serverId, `> ${command}`);
  }

  getHistory(serverId: string): ConsoleEntry[] {
    return [...(this.history.get(serverId) ?? [])];
  }

  clearHistory(serverId: string): void {
    this.history.set(serverId, []);
  }

  private async directorySize(directory: string): Promise<number> {
    let bytes = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const current = path.join(directory, entry.name);
      bytes += entry.isDirectory() ? await this.directorySize(current) : (await stat(current)).size;
    }
    return bytes;
  }

  private async cachedDirectorySize(serverId: string, directory: string): Promise<number> {
    const cached = this.diskCache.get(serverId);
    if (cached && Date.now() - cached.timestamp < 30_000) return cached.bytes;
    const bytes = await this.directorySize(directory).catch(() => cached?.bytes ?? 0);
    this.diskCache.set(serverId, { bytes, timestamp: Date.now() });
    return bytes;
  }

  async stats(serverId: string): Promise<ServerStats | null> {
    const server = this.store.get().servers.find((item) => item.id === serverId);
    if (!server) return null;
    const runtime = this.runtimes.get(serverId);
    const uptime = runtime ? Math.floor((Date.now() - runtime.startedAt) / 1000) : 0;
    const sampledUsage = runtime?.process.pid ? await this.readProcessUsage(runtime.process.pid).catch(() => null) : null;
    if (sampledUsage) this.usageCache.set(serverId, sampledUsage);
    const usage = sampledUsage ?? (runtime ? this.usageCache.get(serverId) : undefined);
    const disk = await this.cachedDirectorySize(serverId, server.directory);
    return {
      serverId,
      cpu: usage?.cpu ?? 0,
      ram: usage ? usage.memory / 1048576 : 0,
      ramMax: server.ramMax,
      disk: disk / 1048576,
      diskMax: server.diskMax,
      networkIn: 0,
      networkOut: 0,
      players: (this.store.get().players[serverId] ?? []).filter((player) => player.online).length,
      maxPlayers: server.maxPlayers,
      uptime,
      tps: runtime ? 20 : 0,
      mspt: runtime ? 0 : 0,
      timestamp: Date.now(),
    };
  }

  async serverSnapshot(serverId: string): Promise<ManagedServer | null> {
    const server = this.store.get().servers.find((item) => item.id === serverId);
    if (!server) return null;
    const stats = await this.stats(serverId);
    const running = this.runtimes.has(serverId);
    const status = !running && ['ONLINE', 'STARTING', 'STOPPING'].includes(server.status) ? 'OFFLINE' : server.status;
    const playerCount = running
      ? (this.store.get().players[serverId] ?? []).filter((player) => player.online).length
      : 0;
    return {
      ...server,
      status,
      playerCount,
      cpu: running ? (stats?.cpu ?? 0) : 0,
      ram: running ? (stats?.ram ?? 0) : 0,
      disk: stats?.disk ?? server.disk,
      uptime: running ? (stats?.uptime ?? 0) : 0,
      pid: running ? server.pid : undefined,
    };
  }

  async serverSnapshots(): Promise<ManagedServer[]> {
    return Promise.all(this.store.get().servers.map((server) => this.serverSnapshot(server.id))).then(
      (servers) => servers.filter((server): server is ManagedServer => server !== null),
    );
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map((id) => this.stop(id)));
  }
}
