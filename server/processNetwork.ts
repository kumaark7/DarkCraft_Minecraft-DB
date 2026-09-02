import { execFile } from 'node:child_process';
import { readFile, readdir, readlink } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export interface TcpSocket { id: string; received: number; sent: number }
export interface TcpSnapshot { identity: string; timestamp: number; sockets: TcpSocket[] }
export type TcpReader = (pid: number) => Promise<TcpSnapshot>;
export type NetworkRates = { networkIn: number | null; networkOut: number | null };
const unavailable = (): NetworkRates => ({ networkIn: null, networkOut: null });

export function parseTcpSockets(output: string, owned: ReadonlySet<string>): TcpSocket[] {
  const sockets: TcpSocket[] = [];
  let matched = false;
  for (const line of output.split('\n')) {
    const inode = /\bino:(\d+)\b/.exec(line)?.[1];
    if (!inode || !owned.has(inode)) continue;
    matched = true;
    if (line.startsWith('LISTEN ')) continue;
    if (!line.startsWith('ESTAB ')) throw new Error('TCP connection is changing state');
    // Older kernels/tooling that omit both counters are unavailable, not zero.
    if (!/\bbytes_(?:sent|received):\d+\b/.test(line)) throw new Error('TCP counters unavailable');
    const received = Number(/\bbytes_received:(\d+)\b/.exec(line)?.[1] ?? 0);
    const sent = Number(/\bbytes_sent:(\d+)\b/.exec(line)?.[1] ?? 0);
    if (!Number.isSafeInteger(received) || !Number.isSafeInteger(sent)) throw new Error('Invalid TCP counters');
    sockets.push({ id: inode, received, sent });
  }
  if (!matched) throw new Error('No observable TCP sockets owned by the process');
  return sockets.sort((a, b) => a.id.localeCompare(b.id));
}

async function identity(pid: number): Promise<string> {
  const stat = await readFile('/proc/' + pid + '/stat', 'utf8');
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/)[19];
  if (!start || !/^\d+$/.test(start)) throw new Error('Process identity unavailable');
  return pid + ':' + start;
}

async function socketInodes(pid: number): Promise<Set<string>> {
  const directory = '/proc/' + pid + '/fd';
  const entries = await readdir(directory);
  if (entries.length > 4096) throw new Error('Too many file descriptors to inspect');
  const sockets = new Set<string>();
  // Bound concurrency; never inspect file contents or credentials.
  for (let i = 0; i < entries.length; i += 32) {
    await Promise.all(entries.slice(i, i + 32).map(async fd => {
      const target = await readlink(directory + '/' + fd).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
      if (inode) sockets.add(inode);
    }));
  }
  return sockets;
}

export const readLinuxTcpSnapshot: TcpReader = async pid => {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid <= 0) throw new Error('Unsupported process network collector');
  const before = await identity(pid);
  const owned = await socketInodes(pid);
  const { stdout } = await execFileAsync('ss', ['-H', '-t', '-i', '-n', '-e', '-O', 'state', 'all'], {
    timeout: 2500, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C' },
  });
  const afterOwned = await socketInodes(pid);
  if (await identity(pid) !== before || owned.size !== afterOwned.size || [...owned].some(id => !afterOwned.has(id))) {
    throw new Error('Process or sockets changed during collection');
  }
  return { identity: before, timestamp: performance.now(), sockets: parseTcpSockets(stdout, owned) };
};

export class TcpRateSampler {
  private previous?: TcpSnapshot;
  constructor(private readonly reader: TcpReader = readLinuxTcpSnapshot) {}
  async sample(pid: number): Promise<NetworkRates> {
    let current: TcpSnapshot;
    try { current = await this.reader(pid); }
    catch { this.previous = undefined; return unavailable(); }
    const previous = this.previous;
    this.previous = current;
    if (!previous || previous.identity !== current.identity) return unavailable();
    const seconds = (current.timestamp - previous.timestamp) / 1000;
    if (seconds <= 0 || seconds > 30 || current.sockets.length !== previous.sockets.length) return unavailable();
    let received = 0; let sent = 0;
    for (const socket of current.sockets) {
      const old = previous.sockets.find(item => item.id === socket.id);
      if (!old || socket.received < old.received || socket.sent < old.sent) return unavailable();
      received += socket.received - old.received; sent += socket.sent - old.sent;
    }
    // Existing API uses KiB/s. Do not divide accumulated traffic by process uptime.
    return { networkIn: received / seconds / 1024, networkOut: sent / seconds / 1024 };
  }
}
