import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CpuTicks {
  idle: number;
  total: number;
}

export interface NetworkCounters {
  received: number;
  sent: number;
}

export interface NetworkRates {
  networkIn: number | null;
  networkOut: number | null;
}

export function readCpuTicks(): CpuTicks {
  return os.cpus().reduce<CpuTicks>((result, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: result.idle + cpu.times.idle, total: result.total + total };
  }, { idle: 0, total: 0 });
}

export function cpuUsageBetween(previous: CpuTicks, current: CpuTicks): number {
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((total - idle) / total) * 100));
}

async function linuxNetworkCounters(): Promise<NetworkCounters> {
  const content = await readFile('/proc/net/dev', 'utf8');
  let received = 0;
  let sent = 0;
  for (const row of content.split('\n').slice(2)) {
    const [name, values] = row.trim().split(':');
    if (!name || !values || name.trim() === 'lo') continue;
    const columns = values.trim().split(/\s+/).map(Number);
    received += columns[0] ?? 0;
    sent += columns[8] ?? 0;
  }
  return { received, sent };
}

async function windowsNetworkCounters(): Promise<NetworkCounters> {
  const script = 'Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json -Compress';
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    timeout: 4000,
    maxBuffer: 1024 * 1024,
  });
  const parsed = JSON.parse(stdout.trim()) as { ReceivedBytes?: number; SentBytes?: number } | Array<{ ReceivedBytes?: number; SentBytes?: number }>;
  const adapters = Array.isArray(parsed) ? parsed : [parsed];
  return adapters.reduce<NetworkCounters>((total, adapter) => ({
    received: total.received + Number(adapter.ReceivedBytes ?? 0),
    sent: total.sent + Number(adapter.SentBytes ?? 0),
  }), { received: 0, sent: 0 });
}

export async function readNetworkCounters(): Promise<NetworkCounters> {
  if (process.platform === 'linux') return linuxNetworkCounters();
  if (process.platform === 'win32') return windowsNetworkCounters();
  throw new Error(`Network counters are unavailable on ${process.platform}`);
}

export class HostMetricsSampler {
  private previousCpu: CpuTicks | undefined;
  private previousNetwork: (NetworkCounters & { timestamp: number }) | undefined;

  constructor(
    private readonly cpuReader: () => CpuTicks = readCpuTicks,
    private readonly networkReader: () => Promise<NetworkCounters> = readNetworkCounters,
    private readonly now: () => number = Date.now,
  ) {
    this.previousCpu = this.cpuReader();
  }

  cpuUsage(): number {
    const current = this.cpuReader();
    const usage = this.previousCpu ? cpuUsageBetween(this.previousCpu, current) : 0;
    this.previousCpu = current;
    return usage;
  }

  async networkRates(): Promise<NetworkRates> {
    try {
      const current = await this.networkReader();
      const timestamp = this.now();
      const previous = this.previousNetwork;
      this.previousNetwork = { ...current, timestamp };
      if (!previous || timestamp <= previous.timestamp || current.received < previous.received || current.sent < previous.sent) {
        return { networkIn: null, networkOut: null };
      }
      const seconds = (timestamp - previous.timestamp) / 1000;
      return {
        networkIn: (current.received - previous.received) / 1024 / seconds,
        networkOut: (current.sent - previous.sent) / 1024 / seconds,
      };
    } catch {
      this.previousNetwork = undefined;
      return { networkIn: null, networkOut: null };
    }
  }
}
