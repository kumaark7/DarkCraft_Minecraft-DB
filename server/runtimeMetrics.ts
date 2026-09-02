import { TcpRateSampler, type TcpReader, type NetworkRates } from './processNetwork.js';

export interface TickValues { tps: number | null; mspt: number | null }
const noTicks = (): TickValues => ({ tps: null, mspt: null });

function sparkMessage(message: string): string | null {
  const clean = message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/§[0-9a-fk-or]/gi, '')
    .replace(/^(?:\[\d{2}:\d{2}:\d{2}\]\s*)?\[[^\]\r\n]*\bINFO\]\s*:?\s*/, '').trim();
  return /^\[(?:⚡|spark)\]\s*(.*)$/.exec(clean)?.[1]?.trim() ?? null;
}

function numbers(value: string, separator: string, count: number, limit: number): number[] | null {
  const parts = value.split(separator).map(part => part.trim().replace(/^\*/, ''));
  if (parts.length !== count || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return null;
  const parsed = parts.map(Number);
  return parsed.every(n => Number.isFinite(n) && n >= 0 && n <= limit) ? parsed : null;
}

// Read Spark's structured, prefixed console response only while our query is pending.
export class SparkTickProbe {
  private lastQueryAt = -Infinity;
  private deadline = 0;
  private probed = false;
  private supported = false;
  private stage: 'header' | 'tps' | 'duration-header' | 'durations' = 'header';
  private tps?: { value: number; at: number };
  private mspt?: { value: number; at: number };
  constructor(private readonly now: () => number = Date.now) {}
  query(send: () => void): void {
    const now = this.now();
    if (now - this.lastQueryAt < 30_000 || (this.probed && !this.supported)) return;
    this.probed = true; this.lastQueryAt = now; this.deadline = now + 5000; this.stage = 'header';
    try { send(); } catch { this.deadline = 0; }
  }
  consume(message: string): void {
    const now = this.now();
    if (!this.deadline || now > this.deadline) return;
    const line = sparkMessage(message);
    if (line === null) return;
    if (this.stage === 'header' && line === 'TPS from last 5s, 10s, 1m, 5m, 15m:') {
      this.stage = 'tps'; return;
    }
    if (this.stage === 'tps') {
      const values = numbers(line, ',', 5, 10000);
      if (values) { this.tps = { value: values[0]!, at: now }; this.supported = true; this.stage = 'duration-header'; }
      else if (line) this.deadline = 0;
      return;
    }
    if (this.stage === 'duration-header' && line === 'Tick durations (min/med/95%ile/max ms) from last 10s, 1m:') {
      this.stage = 'durations'; return;
    }
    if (this.stage === 'durations' && line) {
      const windows = line.split(';');
      const recent = numbers(windows[0] ?? '', '/', 4, 3_600_000);
      const minute = numbers(windows[1] ?? '', '/', 4, 3_600_000);
      if (windows.length === 2 && recent && minute && recent.every((n, i) => i === 0 || n >= recent[i - 1]!)) {
        this.mspt = { value: recent[1]!, at: now };
      }
      this.deadline = 0;
    }
  }
  invalidate(): void { this.tps = undefined; this.mspt = undefined; this.deadline = 0; }
  values(): TickValues {
    const now = this.now();
    return {
      tps: this.tps && now - this.tps.at <= 75_000 ? this.tps.value : null,
      mspt: this.mspt && now - this.mspt.at <= 75_000 ? this.mspt.value : null,
    };
  }
}

export interface RuntimeMetricsOptions {
  tickQueriesEnabled?: boolean;
  networkReader?: TcpReader;
  now?: () => number;
  intervalMs?: number;
}
interface Session {
  pid: number; send: () => void; ticks: SparkTickProbe; network: TcpRateSampler;
  rates: NetworkRates; sampledAt: number; paused: boolean;
  timer: ReturnType<typeof setInterval>; pending?: Promise<void>;
}

export class RuntimeMetrics {
  private readonly sessions = new Map<string, Session>();
  private readonly now: () => number;
  constructor(private readonly options: RuntimeMetricsOptions = {}) { this.now = options.now ?? Date.now; }
  start(serverId: string, pid: number, send: () => void): void {
    if (this.sessions.has(serverId)) return;
    const session: Session = {
      pid, send, ticks: new SparkTickProbe(this.now), network: new TcpRateSampler(this.options.networkReader),
      rates: { networkIn: null, networkOut: null }, sampledAt: -Infinity, paused: false,
      timer: setInterval(() => void this.sampleNow(serverId), this.options.intervalMs ?? 10_000),
    };
    session.timer.unref?.();
    this.sessions.set(serverId, session);
    void this.sampleNow(serverId);
  }
  async sampleNow(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) return;
    if (session.pending) return session.pending;
    if (this.options.tickQueriesEnabled !== false && !session.paused) session.ticks.query(session.send);
    session.pending = session.network.sample(session.pid).then(rates => {
      session.rates = rates; session.sampledAt = this.now();
    }).finally(() => { session.pending = undefined; });
    return session.pending;
  }
  consume(serverId: string, message: string): void {
    const session = this.sessions.get(serverId);
    if (!session) return;
    const clean = message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
    if (/^(?:\[[^\]\r\n]+\]\s*)+:?\s*Server empty for \d+ seconds, pausing\s*$/.test(clean)) {
      session.paused = true; session.ticks.invalidate();
    } else if (/^(?:\[[^\]\r\n]+\]\s*)+:?\s*(?:[A-Za-z0-9_]{1,16} joined the game|Resuming server|Unpausing server)\s*$/.test(clean)) {
      session.paused = false;
    }
    if (!session.paused) session.ticks.consume(message);
  }
  values(serverId: string) {
    const session = this.sessions.get(serverId);
    const ticks = session && !session.paused ? session.ticks.values() : noTicks();
    const rates = session && this.now() - session.sampledAt <= 25_000
      ? session.rates : { networkIn: null, networkOut: null };
    return {
      ...ticks, ...rates,
      tpsSource: ticks.tps === null ? undefined : 'spark-5s' as const,
      msptSource: ticks.mspt === null ? undefined : 'spark-median-10s' as const,
      networkSource: rates.networkIn === null ? undefined : 'linux-tcp-sockets' as const,
    };
  }
  stop(serverId: string): void {
    const session = this.sessions.get(serverId);
    if (session) clearInterval(session.timer);
    this.sessions.delete(serverId);
  }
}
