import type { HostStats } from '@/types';

export const HOST_WINDOW_MS = 5 * 60_000;
export const HOST_POLL_MS = 5000;
export interface HostSample { timestamp: number; cpu: number | null; ram: number | null; ramTotal: number | null; ramPercent: number | null }
const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function hostSample(stats: HostStats | null, timestamp: number): HostSample {
  const cpu = stats && measured(stats.cpuUsage) && stats.cpuUsage <= 100 ? stats.cpuUsage : null;
  const ramTotal = stats && measured(stats.ramTotal) && stats.ramTotal > 0 ? stats.ramTotal : null;
  const ram = stats && measured(stats.ramUsed) && (ramTotal === null || stats.ramUsed <= ramTotal) ? stats.ramUsed : null;
  return { timestamp, cpu, ram, ramTotal, ramPercent: ram !== null && ramTotal !== null ? ram / ramTotal * 100 : null };
}

export function appendHostSample(history: HostSample[], sample: HostSample): HostSample[] {
  return [...history.filter(item => item.timestamp >= sample.timestamp - HOST_WINDOW_MS && item.timestamp < sample.timestamp), sample].slice(-61);
}

export function hostPaths(samples: HostSample[], metric: 'cpu' | 'ramPercent'): string[] {
  const end = samples[samples.length - 1]?.timestamp;
  if (end === undefined) return [];
  const result: string[] = [];
  let path = '';
  let previous: number | null = null;
  for (const sample of samples) {
    const value = sample[metric];
    if (value === null || !Number.isFinite(value) || (previous !== null && sample.timestamp - previous > HOST_POLL_MS * 3)) {
      if (path) result.push(path);
      path = '';
    }
    previous = sample.timestamp;
    if (value === null || !Number.isFinite(value)) continue;
    const x = 100 * (sample.timestamp - (end - HOST_WINDOW_MS)) / HOST_WINDOW_MS;
    const y = 100 - Math.min(100, Math.max(0, value));
    // A tiny round-capped segment makes an isolated real sample visible too.
    path += path ? ` L${x.toFixed(3)},${y.toFixed(3)}` : `M${x.toFixed(3)},${y.toFixed(3)} l0.001,0`;
  }
  if (path) result.push(path);
  return result;
}

export function nearestHostSample(samples: HostSample[], fraction: number): number {
  if (!samples.length) return 0;
  const end = samples[samples.length - 1].timestamp;
  const target = end - HOST_WINDOW_MS + Math.max(0, Math.min(1, fraction)) * HOST_WINDOW_MS;
  return samples.reduce((best, sample, index) => Math.abs(sample.timestamp - target) < Math.abs(samples[best].timestamp - target) ? index : best, 0);
}

export function pollHostStats(load: () => Promise<HostStats>, receive: (stats: HostStats | null) => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    let stats: HostStats | null = null;
    try { stats = await load(); } catch { /* Shared adapter retains authentication/401 handling. */ }
    if (cancelled) return;
    receive(stats);
    timer = setTimeout(() => void poll(), HOST_POLL_MS);
  };
  void poll();
  return () => { cancelled = true; clearTimeout(timer); };
}
