import type { HostMetricSample, HostStats } from './index.js';
const measured = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function hostSample(stats: HostStats | null, timestamp: number): HostMetricSample {
  const cpu = stats && measured(stats.cpuUsage) && stats.cpuUsage <= 100 ? stats.cpuUsage : null;
  const ramTotal = stats && measured(stats.ramTotal) && stats.ramTotal > 0 ? stats.ramTotal : null;
  const ram = stats && measured(stats.ramUsed) && (ramTotal === null || stats.ramUsed <= ramTotal) ? stats.ramUsed : null;
  return { timestamp, cpu, ram, ramTotal, ramPercent: ram !== null && ramTotal !== null ? ram / ramTotal * 100 : null };
}
