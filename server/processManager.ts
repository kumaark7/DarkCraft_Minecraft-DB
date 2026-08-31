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

interface Runtime {
  process: ChildProcessWithoutNullStreams;
  startedAt: number;
}

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

  constructor(
    private readonly store: JsonStore,
    private readonly events: DashboardEvents,
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
        if (target) {
          target.status = 'ONLINE';
          target.pid = child.pid;
        }
      });
    });
    child.once('error', async (error) => {
      this.record(serverId, `Failed to start server: ${error.message}`);
      this.runtimes.delete(serverId);
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

  async stats(serverId: string): Promise<ServerStats | null> {
    const server = this.store.get().servers.find((item) => item.id === serverId);
    if (!server) return null;
    const runtime = this.runtimes.get(serverId);
    const uptime = runtime ? Math.floor((Date.now() - runtime.startedAt) / 1000) : 0;
    const usage = runtime?.process.pid ? await pidusage(runtime.process.pid).catch(() => null) : null;
    const disk = await this.directorySize(server.directory).catch(() => 0);
    return {
      serverId,
      cpu: usage?.cpu ?? 0,
      ram: usage ? usage.memory / 1048576 : 0,
      ramMax: server.ramMax,
      disk: disk / 1048576,
      diskMax: server.diskMax,
      networkIn: 0,
      networkOut: 0,
      players: server.playerCount,
      maxPlayers: server.maxPlayers,
      uptime,
      tps: runtime ? 20 : 0,
      mspt: runtime ? 0 : 0,
      timestamp: Date.now(),
    };
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.runtimes.keys()].map((id) => this.stop(id)));
  }
}
