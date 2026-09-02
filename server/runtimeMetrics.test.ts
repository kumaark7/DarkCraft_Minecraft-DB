import { describe, expect, it, vi } from 'vitest';
import { RuntimeMetrics, SparkTickProbe } from './runtimeMetrics.js';
import type { TcpSnapshot } from './processNetwork.js';

const lines = [
  '[12:00:00] [Server thread/INFO]: [⚡] TPS from last 5s, 10s, 1m, 5m, 15m:',
  '[12:00:00] [Server thread/INFO]: [⚡] *20.0, 19.9, 19.8, 19.7, 19.6',
  '[12:00:00] [Server thread/INFO]: [⚡] ',
  '[12:00:00] [Server thread/INFO]: [⚡] Tick durations (min/med/95%ile/max ms) from last 10s, 1m:',
  '[12:00:00] [Server thread/INFO]: [⚡] 1.0/3.5/7.8/10.0; 0.9/4.0/8.1/11.0',
];
describe('Spark tick collector', () => {
  it('reads measured 5-second TPS and 10-second median MSPT, strips colors, and expires stale data', () => {
    let now = 1000;
    const probe = new SparkTickProbe(() => now); const send = vi.fn();
    lines.forEach(line => probe.consume(line));
    expect(probe.values()).toEqual({ tps: null, mspt: null });
    probe.query(send);
    lines.forEach(line => probe.consume('\u001b[32m' + line + '\u001b[0m'));
    expect(probe.values()).toEqual({ tps: 20, mspt: 3.5 });
    now += 76_000;
    expect(probe.values()).toEqual({ tps: null, mspt: null });
  });
  it('throttles probes and never repeatedly sends unsupported commands', () => {
    let now = 1000; const send = vi.fn(); const probe = new SparkTickProbe(() => now);
    probe.query(send); probe.query(send); now += 40_000; probe.query(send);
    expect(send).toHaveBeenCalledTimes(1);
    const supported = new SparkTickProbe(() => now);
    supported.query(send); lines.forEach(line => supported.consume(line));
    now += 29_000; supported.query(send);
    expect(send).toHaveBeenCalledTimes(2);
    now += 1000; supported.query(send);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('rejects chat spoofing, unrelated logs, malformed values, and late responses', () => {
    let now = 1000; const probe = new SparkTickProbe(() => now);
    probe.query(() => {});
    lines.forEach(line => probe.consume(line.replace('[⚡]', '<Steve> [⚡]')));
    expect(probe.values()).toEqual({ tps: null, mspt: null });
    probe.consume(lines[0]!);
    probe.consume('[Server thread/INFO]: [⚡] NaN, -1, Infinity, 20, 20');
    expect(probe.values()).toEqual({ tps: null, mspt: null });
    const late = new SparkTickProbe(() => now); late.query(() => {}); now += 6000;
    lines.forEach(line => late.consume(line));
    expect(late.values()).toEqual({ tps: null, mspt: null });
  });
});
describe('per-runtime sampling lifecycle', () => {
  it('collects in the backend, keeps servers isolated, and clears stale/paused/restarted readings', async () => {
    let now = 1000;
    const networkReader = vi.fn(async (pid: number): Promise<TcpSnapshot> => ({
      identity: String(pid), timestamp: now, sockets: [{ id: 'socket', received: now * 1024, sent: now * 2048 }],
    }));
    const metrics = new RuntimeMetrics({ now: () => now, networkReader, intervalMs: 1_000_000 });
    const send = vi.fn();
    try {
      metrics.start('one', 123, send); await metrics.sampleNow('one');
      lines.forEach(line => metrics.consume('one', line));
      expect(metrics.values('one')).toMatchObject({ tps: 20, mspt: 3.5, tpsSource: 'spark-5s', msptSource: 'spark-median-10s' });
      expect(metrics.values('two')).toMatchObject({ tps: null, networkIn: null });
      for (let i = 0; i < 100; i++) metrics.values('one');
      expect(send).toHaveBeenCalledTimes(1);
      now += 10_000; await metrics.sampleNow('one');
      expect(metrics.values('one')).toMatchObject({ networkIn: 1000, networkOut: 2000, networkSource: 'linux-tcp-sockets' });
      metrics.consume('one', '[Server thread/INFO]: Server empty for 60 seconds, pausing');
      expect(metrics.values('one')).toMatchObject({ tps: null, mspt: null });
      lines.forEach(line => metrics.consume('one', line));
      expect(metrics.values('one').tps).toBeNull();
      now += 30_000; await metrics.sampleNow('one');
      expect(send).toHaveBeenCalledTimes(1);
      metrics.consume('one', '[Server thread/INFO]: Steve joined the game');
      await metrics.sampleNow('one'); lines.forEach(line => metrics.consume('one', line));
      expect(metrics.values('one').tps).toBe(20);
      now += 76_000;
      expect(metrics.values('one')).toMatchObject({ tps: null, mspt: null, networkIn: null });
      metrics.stop('one'); metrics.start('one', 456, send); await metrics.sampleNow('one');
      expect(metrics.values('one')).toMatchObject({ tps: null, networkIn: null });
    } finally { metrics.stop('one'); }
  });
  it('does not issue commands in read-only mode and coalesces overlapping samples', async () => {
    const send = vi.fn();
    let resolve!: (snapshot: TcpSnapshot) => void;
    const reader = vi.fn(() => new Promise<TcpSnapshot>(r => { resolve = r; }));
    const metrics = new RuntimeMetrics({ tickQueriesEnabled: false, networkReader: reader, intervalMs: 1_000_000 });
    try {
      metrics.start('one', 1, send);
      const a = metrics.sampleNow('one'); const b = metrics.sampleNow('one');
      expect(reader).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
      resolve({ identity: '1', timestamp: 1, sockets: [] }); await Promise.all([a, b]);
    } finally { metrics.stop('one'); }
  });
});
