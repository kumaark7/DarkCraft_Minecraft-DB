import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MetricHistoryRange, ServerMetricSample, ServerStats } from '../src/types/index.js';

const RANGE_MS: Record<MetricHistoryRange, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

export interface MetricHistoryOptions {
  retentionMs?: number;
  maxBytes?: number;
  maxPoints?: number;
  compactionIntervalMs?: number;
}

export class MetricHistoryStore<T extends { timestamp: number } = ServerMetricSample> {
  private readonly retentionMs: number;
  private readonly maxBytes: number;
  protected readonly maxPoints: number;
  private readonly compactionIntervalMs: number;
  private readonly queues = new Map<string, Promise<void>>();
  private readonly lastCompactionAt = new Map<string, number>();

  constructor(options: MetricHistoryOptions = {}) {
    this.retentionMs = options.retentionMs ?? RANGE_MS['24h'];
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.maxPoints = options.maxPoints ?? 500;
    this.compactionIntervalMs = options.compactionIntervalMs ?? 15 * 60_000;
  }

  protected file(serverDirectory: string): string {
    return path.join(serverDirectory, '.darkcraft', 'metrics', 'history.ndjson');
  }

  private async parse(serverDirectory: string): Promise<T[]> {
    const content = await readFile(this.file(serverDirectory), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return content.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const sample = JSON.parse(line) as T;
        return Number.isFinite(sample.timestamp) ? [sample] : [];
      } catch { return []; }
    });
  }

  append(serverDirectory: string, sample: T, now = Date.now()): Promise<void> {
    const line = `${JSON.stringify(sample)}\n`;
    const previous = this.queues.get(serverDirectory) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const file = this.file(serverDirectory);
      await mkdir(path.dirname(file), { recursive: true });
      const size = await stat(file).then((value) => value.size).catch(() => 0);
      const periodicCompactionDue = now - (this.lastCompactionAt.get(serverDirectory) ?? 0) >= this.compactionIntervalMs;
      if (periodicCompactionDue || size + Buffer.byteLength(line) > this.maxBytes) {
        let retained = (await this.parse(serverDirectory)).filter((value) => value.timestamp >= now - this.retentionMs);
        let content = retained.map((value) => JSON.stringify(value)).join('\n') + (retained.length ? '\n' : '');
        while (retained.length > 0 && Buffer.byteLength(content) + Buffer.byteLength(line) > this.maxBytes) {
          retained = retained.slice(Math.max(1, Math.floor(retained.length / 4)));
          content = retained.map((value) => JSON.stringify(value)).join('\n') + (retained.length ? '\n' : '');
        }
        const temporary = `${file}.tmp`;
        await writeFile(temporary, content, { mode: 0o600 });
        await rename(temporary, file);
        this.lastCompactionAt.set(serverDirectory, now);
      }
      await appendFile(file, line, { encoding: 'utf8', mode: 0o600 });
    });
    this.queues.set(serverDirectory, next);
    const cleanup = () => { if (this.queues.get(serverDirectory) === next) this.queues.delete(serverDirectory); };
    void next.then(cleanup, cleanup);
    return next;
  }

  async read(serverDirectory: string, range: MetricHistoryRange, now = Date.now()): Promise<T[]> {
    await (this.queues.get(serverDirectory) ?? Promise.resolve());
    const samples = (await this.parse(serverDirectory)).filter((sample) => sample.timestamp >= now - RANGE_MS[range] && sample.timestamp <= now);
    return this.downsample(samples);
  }

  protected downsample(samples: T[]): T[] {
    if (samples.length <= this.maxPoints) return samples;
    const stride = Math.ceil(samples.length / this.maxPoints);
    const downsampled = samples.filter((_sample, index) => index % stride === 0);
    if (downsampled.at(-1) !== samples.at(-1)) downsampled.push(samples.at(-1)!);
    return downsampled;
  }

  async flush(): Promise<void> {
    await Promise.all([...this.queues.values()]);
  }
}

interface MetricTarget {
  directory: string;
  stats: ServerStats | null;
}

export class MetricHistorySampler {
  private timer?: ReturnType<typeof setInterval>;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: MetricHistoryStore,
    private readonly targets: () => Promise<MetricTarget[]>,
    private readonly intervalMs = 10_000,
  ) {}

  async sampleNow(): Promise<void> {
    const timestamp = Date.now();
    const targets = await this.targets();
    await Promise.all(targets.flatMap(({ directory, stats }) => stats ? [this.store.append(directory, {
      timestamp,
      cpu: stats.cpu,
      ram: stats.ram,
      ramMax: stats.ramMax,
      players: stats.players,
      maxPlayers: stats.maxPlayers,
      tps: stats.tps,
      mspt: stats.mspt,
      networkIn: stats.networkIn,
      networkOut: stats.networkOut,
    })] : []));
  }

  start(): void {
    if (this.timer) return;
    const sample = () => {
      this.inFlight = this.inFlight.then(() => this.sampleNow()).catch(() => undefined);
    };
    sample();
    this.timer = setInterval(sample, this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
    await this.store.flush();
  }
}
