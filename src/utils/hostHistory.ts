import type { HostMetricSample, HostStats, MetricHistoryRange } from '@/types';
export { hostSample } from '@/types/hostMetrics';

export const HOST_WINDOW_MS = 5 * 60_000;
export const HOST_POLL_MS = 5000;
export type HostSample = HostMetricSample;
export const HOST_RANGES: Record<MetricHistoryRange, number> = { '15m': 900_000, '1h': 3600_000, '6h': 21600_000, '24h': 86400_000 };

export function appendHostSample(history: HostSample[], sample: HostSample): HostSample[] {
  return [...history.filter(item => item.timestamp >= sample.timestamp - HOST_WINDOW_MS && item.timestamp < sample.timestamp), sample].slice(-61);
}

export function hostPaths(samples: HostSample[], metric: 'cpu' | 'ramPercent', windowMs = HOST_WINDOW_MS): string[] {
  const end = samples[samples.length - 1]?.timestamp;
  if (end === undefined) return [];
  const result: string[] = [];
  let path = '';
  let previous: number | null = null;
  for (const sample of samples) {
    const value = sample[metric];
    if (value === null || !Number.isFinite(value) || (sample.gapBefore ?? (previous !== null && sample.timestamp - previous > HOST_POLL_MS * 3))) {
      if (path) result.push(path);
      path = '';
    }
    previous = sample.timestamp;
    if (value === null || !Number.isFinite(value)) continue;
    const x = 100 * (sample.timestamp - (end - windowMs)) / windowMs;
    const y = 100 - Math.min(100, Math.max(0, value));
    // A tiny round-capped segment makes an isolated real sample visible too.
    path += path ? ` L${x.toFixed(3)},${y.toFixed(3)}` : `M${x.toFixed(3)},${y.toFixed(3)} l0.001,0`;
  }
  if (path) result.push(path);
  return result;
}

export function nearestHostSample(samples: HostSample[], fraction: number, windowMs = HOST_WINDOW_MS): number {
  if (!samples.length) return 0;
  const end = samples[samples.length - 1].timestamp;
  const target = end - windowMs + Math.max(0, Math.min(1, fraction)) * windowMs;
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
export function pollHostHistory(load: () => Promise<HostSample[]>, receive: (samples: HostSample[] | null) => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    let samples: HostSample[] | null = null;
    try { samples = await load(); } catch { /* Existing adapter handles 401. */ }
    if (cancelled) return;
    receive(samples);
    timer = setTimeout(() => void poll(), 10_000);
  };
  void poll();
  return () => { cancelled = true; clearTimeout(timer); };
}
