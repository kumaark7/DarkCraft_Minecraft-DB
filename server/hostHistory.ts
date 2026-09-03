import path from 'node:path';
import type { HostMetricSample, HostStats } from '../src/types/index.js';
import { hostSample } from '../src/types/hostMetrics.js';
import { MetricHistoryStore } from './metricHistory.js';

export class HostHistoryStore extends MetricHistoryStore<HostMetricSample> {
  protected override file(dataDirectory: string): string {
    return path.join(dataDirectory, 'host', 'history.ndjson');
  }

  protected override downsample(samples: HostMetricSample[]): HostMetricSample[] {
    const stride = Math.max(1, Math.ceil(samples.length / this.maxPoints));
    const result: HostMetricSample[] = [];
    for (let index = 0; index < samples.length; index += stride) {
      const bucket = samples.slice(index, index + stride);
      // Keep actual readings (not invented averages) and preserve gaps even when
      // a missing observation is not the representative point of a long-range bucket.
      const gapBefore = bucket.some((sample, offset) => {
        const previous = samples[index + offset - 1];
        return sample.cpu === null || sample.ramPercent === null ||
          (previous !== undefined && (sample.timestamp - previous.timestamp > 30_000 || previous.cpu === null || previous.ramPercent === null));
      });
      result.push({ ...bucket[bucket.length - 1]!, gapBefore });
    }
    return result;
  }
}

/** A single, serialized collector independent of requests/browser tabs. */
export class HostMonitor {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private inFlight?: Promise<void>;
  private latest: HostStats | null = null;
  private sampledAt = 0;

  constructor(
    readonly history: HostHistoryStore,
    private readonly dataDirectory: string,
    private readonly collect: () => Promise<HostStats>,
    private readonly observe: (stats: HostStats | null, now: number) => Promise<void> = async () => {},
    private readonly reportError: (error: unknown) => void = () => {},
    private readonly intervalMs = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  stats(): HostStats | null {
    return this.now() - this.sampledAt <= Math.max(30_000, this.intervalMs * 3) ? this.latest : null;
  }

  sampleNow(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const sample = async () => {
      let stats: HostStats | null = null;
      try { stats = await this.collect(); } catch (error) { this.reportError(error); }
      const timestamp = this.now();
      this.latest = stats;
      this.sampledAt = timestamp;
      // History failure must not suppress alerts, and alert failure must not stop sampling.
      await Promise.all([
        this.history.append(this.dataDirectory, hostSample(stats, timestamp), timestamp).catch(this.reportError),
        this.observe(stats, timestamp).catch(this.reportError),
      ]);
    };
    this.inFlight = sample().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      try { await this.sampleNow(); } finally {
        if (!this.stopped) { this.timer = setTimeout(() => void tick(), this.intervalMs); this.timer.unref?.(); }
      }
    };
    void tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
    await this.history.flush();
  }
}
