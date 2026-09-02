import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { RuntimeMetrics, type RuntimeMetricsOptions } from './runtimeMetrics.js';
import { appendActivity, playerPresence, setServerStatus } from './activity.js';
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
import { ConsoleLogStore } from './consoleLogStore.js';
import { detectModIssue, ModIssueStore } from './modIssues.js';

interface Runtime {
  process: ChildProcessWithoutNullStreams;
  startedAt: number;
  closed: Promise<void>;
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
  private readonly runtimeMetrics: RuntimeMetrics;
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
  private readonly diagnosticRunIds = new Map<string, string>();
  private readonly playerTransitions = new Map<string, Map<string, boolean>>();

  constructor(
    private readonly store: JsonStore,
    private readonly events: DashboardEvents,
    private readonly readProcessUsage: ProcessUsageReader = (pid) => pidusage(pid),
    private readonly readExecutableJavaVersion: JavaVersionReader = readJavaVersion,
    private readonly consoleLogs: ConsoleLogStore = new ConsoleLogStore(),
    private readonly modIssues: ModIssueStore = new ModIssueStore(),
    metricsOptions: RuntimeMetricsOptions = {},
  ) { this.runtimeMetrics = new RuntimeMetrics(metricsOptions); }

  private record(
    serverId: string,
    message: string,
    source: ConsoleEntry['source'] = 'LIVE',
    stream: ConsoleEntry['stream'] = 'system',
  ): void {
    const entry: ConsoleEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      severity: severityFor(message),
      message,
      source,
      stream,
    };
    const entries = [...(this.history.get(serverId) ?? []), entry].slice(-5000);
    this.history.set(serverId, entries);
    const directory = this.store.get().servers.find((server) => server.id === serverId)?.directory;
    if (directory) void this.consoleLogs.append(directory, entry).catch(() => undefined);
    this.updateLoadedModEvidence(serverId, message);
    const detectedIssue = detectModIssue(message, this.loadedMods.get(serverId) ?? new Set());
    if (directory && detectedIssue) {
      void this.modIssues.record(directory, detectedIssue, this.diagnosticRunIds.get(serverId)).catch(() => undefined);
    }
    if (stream === 'stdout') this.runtimeMetrics.consume(serverId, message);
    this.events.emitConsole(serverId, entry);
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
      if (detected.ready && server.status === 'STARTING') setServerStatus(state, serverId, 'ONLINE');
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
      const runtime = this.runtimes.get(serverId);
      if (runtime?.process.pid) this.runtimeMetrics.start(serverId, runtime.process.pid, () => {
        if (this.runtimes.get(serverId) === runtime && runtime.process.stdin.writable) runtime.process.stdin.write('spark tps\n');
      });
      this.fabricModCaptures.delete(serverId);
      const directory = this.store.get().servers.find((server) => server.id === serverId)?.directory;
      const runId = this.diagnosticRunIds.get(serverId);
      if (directory && runId) void this.modIssues.markNotSeenAfterStartup(directory, this.loadedMods.get(serverId) ?? new Set(), runId).catch(() => undefined);
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
    const presence = playerPresence(message);
    if (!presence) return;
    const { username, online } = presence;
    const key = username.toLowerCase();
    const transitions = this.playerTransitions.get(serverId) ?? new Map<string, boolean>();
    const changed = transitions.get(key) !== online;
    transitions.set(key, online);
    this.playerTransitions.set(serverId, transitions);
    await this.store.update((state) => {
      const server = state.servers.find((item) => item.id === serverId);
      if (!server) return;
      const players = state.players[serverId] ?? [];
      const existing = players.find((player) => player.username.toLowerCase() === key);
      if (existing) existing.online = online;
      else players.push({ username, uuid: `observed-${username}`, online, isOp: false, isWhitelisted: false, isBanned: false });
      state.players[serverId] = players;
      server.playerCount = players.filter((player) => player.online).length;
      if (changed) appendActivity(state, {
        serverId, serverName: server.name, actor: username,
        category: online ? 'player-join' : 'player-leave',
        event: `${username} ${online ? 'joined' : 'left'} the game`,
      });
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
    this.runtimeMetrics.stop(serverId);
    this.playerTransitions.delete(serverId);
    const diagnosticRunId = randomUUID();
    this.diagnosticRunIds.set(serverId, diagnosticRunId);
    await this.modIssues.beginRun(server.directory, diagnosticRunId);
    this.loadedMods.delete(serverId);
    this.fabricModCaptures.delete(serverId);
    this.lastListRefreshAt.delete(serverId);
    await this.store.update((state) => {
      setServerStatus(state, serverId, 'STARTING');
      state.players[serverId] = (state.players[serverId] ?? []).map((player) => ({ ...player, online: false }));
    });
    const child = spawn(server.startupExecutable, server.startupArgs, {
      cwd: server.directory,
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
    });
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
    this.runtimes.set(serverId, { process: child, startedAt: Date.now(), closed });

    const attach = (input: NodeJS.ReadableStream, stream: 'stdout' | 'stderr') => {
      const lines = createInterface({ input });
      lines.on('line', (line) => this.record(serverId, line, 'LIVE', stream));
    };
    attach(child.stdout, 'stdout');
    attach(child.stderr, 'stderr');

    child.once('spawn', async () => {
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) target.pid = child.pid;
      });
    });
    child.once('error', async (error) => {
      this.record(serverId, `Failed to start server: ${error.message}`);
      this.runtimeMetrics.stop(serverId);
      this.runtimes.delete(serverId);
      this.metadataConfidence.delete(serverId);
      this.usageCache.delete(serverId);
      this.loadedMods.delete(serverId);
      this.fabricModCaptures.delete(serverId);
      await this.store.update((state) => {
        setServerStatus(state, serverId, 'CRASHED', `Server failed to start: ${error.message}`);
      });
    });
    child.once('exit', async (code, signal) => {
      this.record(serverId, `Server process exited (code=${code ?? 'none'}, signal=${signal ?? 'none'})`);
      this.runtimeMetrics.stop(serverId);
      this.runtimes.delete(serverId);
      this.loadedMods.delete(serverId);
      this.fabricModCaptures.delete(serverId);
      this.lastListRefreshAt.delete(serverId);
      await this.store.update((state) => {
        const target = state.servers.find((item) => item.id === serverId);
        if (target) {
          const stopped = code === 0 || (target.status === 'STOPPING' && signal === 'SIGTERM');
          setServerStatus(state, serverId, stopped ? 'OFFLINE' : 'CRASHED',
            stopped ? undefined : `Server crashed (code=${code ?? 'none'}, signal=${signal ?? 'none'})`);
          target.pid = undefined;
          target.playerCount = 0;
          target.uptime = 0;
        }
        state.players[serverId] = (state.players[serverId] ?? []).map((player) => ({ ...player, online: false }));
      });
    });
  }

  async stop(serverId: string): Promise<void> {
    this.runtimeMetrics.stop(serverId);
    const runtime = this.runtimes.get(serverId);
    if (!runtime) {
      await this.store.update((state) => {
        setServerStatus(state, serverId, 'OFFLINE', 'Server is offline — no managed process');
      });
      return;
    }
    await this.store.update((state) => {
      setServerStatus(state, serverId, 'STOPPING');
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
    this.record(serverId, `> ${command}`, 'LIVE', 'command');
  }

  getHistory(serverId: string): ConsoleEntry[] {
    return [...(this.history.get(serverId) ?? [])];
  }

  async readHistory(serverId: string, mode: import('../src/types/index.js').ConsoleViewMode = 'live'): Promise<ConsoleEntry[]> {
    const server = this.server(serverId);
    try {
      return await this.consoleLogs.read(server.directory, mode);
    } catch {
      return this.getHistory(serverId);
    }
  }

  async clearHistory(serverId: string): Promise<void> {
    const server = this.server(serverId);
    this.history.set(serverId, []);
    await this.consoleLogs.markCleared(server.directory);
  }

  loadedModIds(serverId: string): ReadonlySet<string> {
    return new Set(this.loadedMods.get(serverId) ?? []);
  }

  async getModIssues(serverId: string) {
    return this.modIssues.list(this.server(serverId).directory);
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
      ...this.runtimeMetrics.values(serverId),
      players: this.onlinePlayers(serverId).length,
      maxPlayers: fileConfiguration.maxPlayers,
      uptime,
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
    const running = [...this.runtimes.values()];
    await Promise.all([...this.runtimes.keys()].map((id) => this.stop(id)));
    // Let exit handlers persist the final stop event and drain stdout/stderr before shutdown.
    await Promise.all(running.map(runtime => runtime.closed));
    await this.consoleLogs.flush();
    await this.store.save();
  }
}
