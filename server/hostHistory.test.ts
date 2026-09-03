import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostStats } from '../src/types/index.js';
import { HostHistoryStore, HostMonitor } from './hostHistory.js';

const temporary: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
const stats: HostStats = { uptime: 5, cpuModel: 'Test', cpuUsage: 25, ramTotal: 1000, ramUsed: 500, diskTotal: 100, diskUsed: 20, networkIn: null, networkOut: null };

describe('host metric history', () => {
  it('persists across store recreation, filters ranges, and never fabricates missing metrics', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-host-history-')); temporary.push(directory);
    const now = Date.now();
    const first = new HostHistoryStore({ maxPoints: 20 });
    await first.append(directory, { timestamp: now - 30 * 60_000, cpu: 10, ram: 100, ramTotal: 1000, ramPercent: 10 });
    await first.append(directory, { timestamp: now, cpu: null, ram: null, ramTotal: null, ramPercent: null });
    await first.flush();
    const recovered = await new HostHistoryStore({ maxPoints: 20 }).read(directory, '1h', now);
    expect(recovered).toHaveLength(2);
    expect(recovered[1]).toMatchObject({ cpu: null, ram: null, ramPercent: null });
    expect(await new HostHistoryStore().read(directory, '15m', now)).toHaveLength(1);
  });

  it('physically compacts expired records and preserves gaps during downsampling', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-host-history-')); temporary.push(directory);
    const now = Date.now();
    const store = new HostHistoryStore({ retentionMs: 60_000, compactionIntervalMs: 1, maxPoints: 2 });
    await store.append(directory, { timestamp: now - 120_000, cpu: 1, ram: 1, ramTotal: 10, ramPercent: 10 }, now - 120_000);
    await store.append(directory, { timestamp: now - 20_000, cpu: null, ram: null, ramTotal: null, ramPercent: null }, now - 20_000);
    await store.append(directory, { timestamp: now, cpu: 3, ram: 3, ramTotal: 10, ramPercent: 30 }, now);
    const history = await store.read(directory, '15m', now);
    expect(history.length).toBeLessThanOrEqual(2);
    expect(history.some(sample => sample.gapBefore)).toBe(true);
    const physical = (await readFile(path.join(directory, 'host', 'history.ndjson'), 'utf8')).trim();
    expect(physical).not.toContain(String(now - 120_000));
  });

  it('collects without a browser and reports failures as unavailable samples', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-host-history-')); temporary.push(directory);
    let now = 1000;
    const collect = vi.fn().mockResolvedValueOnce(stats).mockRejectedValueOnce(new Error('probe failed'));
    const errors: unknown[] = [];
    const monitor = new HostMonitor(new HostHistoryStore(), directory, collect, async () => {}, error => { errors.push(error); }, 10_000, () => now);
    await monitor.sampleNow();
    expect(monitor.stats()).toEqual(stats);
    now += 10_000;
    await monitor.sampleNow();
    expect(monitor.stats()).toBeNull();
    expect(errors).toHaveLength(1);
    expect((await monitor.history.read(directory, '15m', now))[1]).toMatchObject({ cpu: null, ram: null, ramPercent: null });
    await monitor.stop();
  });
});
