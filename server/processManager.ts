import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import pidusage from 'pidusage';
import type { ConsoleEntry, ConsoleSeverity, ServerStats } from '../src/types/index.js';
import type { JsonStore } from './store.js';
import type { DashboardEvents } from './events.js';
import type { ManagedServer } from './types.js';
import { detectRuntime } from './runtimeDetection.js';
import { readJavaVersion } from './javaVersion.js';
import { readRawProperties } from './serverProperties.js';

interface Runtime {
  process: ChildProcessWithoutNullStreams;
  startedAt: number;
}

interface ProcessUsage {
  cpu: number;
  memory: number;
}

type ProcessUsageReader = (pid: number) => Promise<ProcessUsage>;
type JavaVersionReader = (executable: string) => Promise<string | null>;
const PLAYER_LIST_REFRESH_INTERVAL_MS = 15_000;

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
  private readonly javaVersionCache = new Map<string, Promise<string | null>>();
  private readonly runtimeJavaVersions = new Map<string, string>();
  private readonly listRefreshes = new Map<string, Promise<void>>();
  private readonly listResolvers = new Map<string, () => void>();
  private readonly lastListRefreshAt = new Map<string, number>();
  private readonly loadedMods = new Map<string, Set<string>>();
  private readonly fabricModCaptures = new Map<string, { expected: number; captured: number }>();

  constructor(
    private readonly store: JsonStore,
    private readonly events: DashboardEvents,
    private readonly readProcessUsage: ProcessUsageReader = (pid) => pidusage(pid),
    private readonly readExecutableJavaVersion: JavaVersionReader = readJavaVersion,
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
    this.updateLoadedModEvidence(serverId, message);
    void this.updatePlayerPresence(serverId, message);
    void this.updateListedPlayers(serverId, message);
    void this.updateRuntimeState(serverId, message);
  }

  async updateRuntimeState(serverId: string, message: string): Promise<void> {
    const detected = detectRuntime(message);
    if (!detected.ready && !detected.software && !detected.javaVersion) return;
    await this.store.update((state) => {
      const server = state.servers.find((item) => item.id === serverId);
      if (!server) return;
      if (detected.ready && server.status === 'STARTING') server.status = 'ONLINE';
      if (detected.javaVersion) {
        server.javaVersion = detected.javaVersion;
        this.runtimeJavaVersions.set(serverId, detected.javaVersion);
      }
      const confidence = detected.softwareConfidence ?? 0;
      if (detected.software && confidence >= (this.metadataConfidence.get(serverId) ?? 0)) {
        server.software = detected.software;
        if (detected.minecraftVersion) server.minecraftVersion = detected.minecraftVersion;
        this.metadataConfidence.set(serverId, confidence);
      }
    });
    if (detected.ready) {
      this.fabricModCaptures.delete(serverId);
      void this.refreshOnlinePlayers(serverId, true);
    }
  }

  private updateLoadedModEvidence(serverId: string, message: string): void {
    const line = message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
    const loading = /\bLoading\s+(\d+)\s+mods:\s*$/i.exec(line);
    if (loading) {
      this.loadedMods.set(serverId, new Set());
      this.fabricModCaptures.set(serverId, { expected: Number(loading[1]), captured: 0 });
      return;
    }
    const capture = this.fabricModCaptures.get(serverId);
    if (!capture) return;
    const loaded = /(?:^|:\s*)\s*(?:-|\|--|\+--)\s*([a-z0-9][a-z0-9_.-]*)\s+\S+/i.exec(line)?.[1];
    if (!loaded) return;
    const identifiers = this.loadedMods.get(serverId) ?? new Set<string>();
    const before = identifiers.size;
    identifiers.add(loaded.toLowerCase());
    this.loadedMods.set(serverId, identifiers);
    if (identifiers.size > before) capture.captured += 1;
    if (capture.captured >= capture.expected) this.fabricModCaptures.delete(serverId);
  }

  private async updateListedPlayers(serverId: string, message: string): Promise<void> {
    const match = /There are\s+(\d+)\s+of(?:\s+a max of)?\s+(\d+)\s+players online:?\s*(.*)$/i.exec(message);
    if (!match) return;
    const usernames = (match[3] ?? '').split(',').map((name) => name.trim()).filter((name) => /^[A-Za-z0-9_]{1,16}$/.test(name));
    await this.store.update((state) => {
      const players = (state.players[serverId] ?? []).map((player) => ({ ...player, online: false }));
      for (const username of usernames) {
        const existing = players.find((player) => player.username.toLowerCase() === username.toLowerCase());
        if (existing) existing.online = true;
        else players.push({ username, uuid: `observed-${username}`, online: true, isOp: false, isWhitelisted: false, isBanned: false });
      }
      state.players[serverId] = players;
      const server = state.servers.find((item) => item.id === serverId);
      if (server) {
        server.playerCount = usernames.length;
        server.maxPlayers = Number(match[2]);
      }
    });
    this.listResolvers.get(serverId)?.();
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
    this.loadedMods.delete(serverId);
    this.fabricModCaptures.delete(serverId);
    this.lastListRefreshAt.delete(serverId);
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
      state.players[serverId] = (state.players[serverId] ?? []).map((player) => ({ ...player, online: false }));
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
      this.loadedMods.delete(serverId);
      this.fabricModCaptures.delete(serverId);
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) target.status = 'CRASHED';
      });
    });
    child.once('exit', async (code, signal) => {
      this.record(serverId, `Server process exited (code=${code ?? 'none'}, signal=${signal ?? 'none'})`);
      this.runtimes.delete(serverId);
      this.loadedMods.delete(serverId);
      this.fabricModCaptures.delete(serverId);
      this.lastListRefreshAt.delete(serverId);
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

  loadedModIds(serverId: string): ReadonlySet<string> {
    return new Set(this.loadedMods.get(serverId) ?? []);
  }

  onlinePlayers(serverId: string) {
    if (!this.runtimes.has(serverId)) return [];
    return (this.store.get().players[serverId] ?? []).filter((player) => player.online);
  }

  async refreshOnlinePlayers(serverId: string, force = false): Promise<void> {
    const runtime = this.runtimes.get(serverId);
    if (!runtime?.process.stdin.writable) return;
    const pending = this.listRefreshes.get(serverId);
    if (pending) return pending;
    const lastRefresh = this.lastListRefreshAt.get(serverId) ?? 0;
    if (!force && Date.now() - lastRefresh < PLAYER_LIST_REFRESH_INTERVAL_MS) return;
    this.lastListRefreshAt.set(serverId, Date.now());
    const refresh = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 750);
      this.listResolvers.set(serverId, () => {
        clearTimeout(timer);
        resolve();
      });
      runtime.process.stdin.write('list\n');
    }).finally(() => {
      this.listResolvers.delete(serverId);
      this.listRefreshes.delete(serverId);
    });
    this.listRefreshes.set(serverId, refresh);
    return refresh;
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
    const bytes = await this.directorySize(directory).catch((error) => {
      if (cached) return cached.bytes;
      throw error;
    });
    this.diskCache.set(serverId, { bytes, timestamp: Date.now() });
    return bytes;
  }

  private javaVersion(executable: string): Promise<string | null> {
    let cached = this.javaVersionCache.get(executable);
    if (!cached) {
      cached = this.readExecutableJavaVersion(executable).catch(() => null);
      this.javaVersionCache.set(executable, cached);
    }
    return cached;
  }

  private async fileConfiguration(server: ManagedServer): Promise<{ ip: string; port: number; maxPlayers: number }> {
    try {
      const properties = readRawProperties(await readFile(path.join(server.directory, 'server.properties'), 'utf8'));
      const port = Number(properties['server-port']);
      const maxPlayers = Number(properties['max-players']);
      return {
        ip: properties['server-ip']?.trim() || '0.0.0.0',
        port: Number.isInteger(port) && port > 0 ? port : server.port,
        maxPlayers: Number.isInteger(maxPlayers) && maxPlayers > 0 ? maxPlayers : server.maxPlayers,
      };
    } catch {
      return { ip: server.ip || 'N/A', port: server.port, maxPlayers: server.maxPlayers };
    }
  }

  async stats(serverId: string): Promise<ServerStats | null> {
    const server = this.store.get().servers.find((item) => item.id === serverId);
    if (!server) return null;
    const runtime = this.runtimes.get(serverId);
    const uptime = runtime ? Math.floor((Date.now() - runtime.startedAt) / 1000) : 0;
    const sampledUsage = runtime?.process.pid ? await this.readProcessUsage(runtime.process.pid).catch(() => null) : null;
    if (sampledUsage) this.usageCache.set(serverId, sampledUsage);
    const usage = sampledUsage ?? (runtime ? this.usageCache.get(serverId) : undefined);
    const [disk, filesystem, fileConfiguration] = await Promise.all([
      this.cachedDirectorySize(serverId, server.directory).catch(() => null),
      statfs(server.directory).catch(() => null),
      this.fileConfiguration(server),
    ]);
    const diskMax = filesystem ? Number(filesystem.blocks) * Number(filesystem.bsize) : null;
    return {
      serverId,
      cpu: usage?.cpu ?? null,
      ram: usage ? usage.memory / 1048576 : null,
      ramMax: server.ramMax,
      disk: disk === null ? null : disk / 1048576,
      diskMax: diskMax === null ? null : diskMax / 1048576,
      networkIn: null,
      networkOut: null,
      players: this.onlinePlayers(serverId).length,
      maxPlayers: fileConfiguration.maxPlayers,
      uptime,
      tps: null,
      mspt: null,
      timestamp: Date.now(),
    };
  }

  async serverSnapshot(serverId: string): Promise<ManagedServer | null> {
    const server = this.store.get().servers.find((item) => item.id === serverId);
    if (!server) return null;
    const [stats, actualJavaVersion, fileConfiguration] = await Promise.all([
      this.stats(serverId),
      this.javaVersion(server.startupExecutable),
      this.fileConfiguration(server),
    ]);
    const running = this.runtimes.has(serverId);
    const status = !running && ['ONLINE', 'STARTING', 'STOPPING'].includes(server.status) ? 'OFFLINE' : server.status;
    const playerCount = running
      ? this.onlinePlayers(serverId).length
      : 0;
    return {
      ...server,
      javaVersion: this.runtimeJavaVersions.get(serverId) ?? actualJavaVersion ?? 'N/A',
      ip: fileConfiguration.ip,
      port: fileConfiguration.port,
      maxPlayers: fileConfiguration.maxPlayers,
      status,
      playerCount,
      cpu: running ? (stats?.cpu ?? null) : null,
      ram: running ? (stats?.ram ?? null) : null,
      disk: stats?.disk ?? null,
      diskMax: stats?.diskMax ?? null,
      uptime: running ? (stats?.uptime ?? 0) : 0,
      pid: running ? this.runtimes.get(serverId)?.process.pid ?? server.pid : undefined,
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
