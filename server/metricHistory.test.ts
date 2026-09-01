import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerMetricSample } from '../src/types/index.js';
import { MetricHistoryStore } from './metricHistory.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function sample(timestamp: number, cpu: number | null = 10): ServerMetricSample {
  return { timestamp, cpu, ram: 512, ramMax: 1024, players: 2, maxPlayers: 20, tps: null, mspt: null, networkIn: null, networkOut: null };
}

describe('metric history', () => {
  it('survives backend store recreation and preserves unavailable collectors', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-metrics-'));
    temporary.push(directory);
    const now = Date.now();
    await new MetricHistoryStore().append(directory, sample(now, null));
    const recovered = await new MetricHistoryStore().read(directory, '1h', now);
    expect(recovered).toEqual([expect.objectContaining({ cpu: null, tps: null, mspt: null, networkIn: null, networkOut: null })]);
  });

  it('retains a bounded recent window and downsamples large responses', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-metrics-'));
    temporary.push(directory);
    const now = Date.now();
    const store = new MetricHistoryStore({ retentionMs: 60_000, maxBytes: 350, maxPoints: 3 });
    for (let index = 0; index < 8; index += 1) await store.append(directory, sample(now - 120_000 + index));
    for (let index = 0; index < 8; index += 1) await store.append(directory, sample(now - 8000 + index));
    const recent = await store.read(directory, '15m', now);
    expect(recent.length).toBeLessThanOrEqual(4);
    expect(recent.every((value) => value.timestamp >= now - 60_000)).toBe(true);
    expect(recent.at(-1)?.timestamp).toBe(now - 7993);
  });

  it('physically removes expired samples on periodic compaction below the byte limit', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-metrics-'));
    temporary.push(directory);
    const now = Date.now();
    const store = new MetricHistoryStore({ retentionMs: 60_000, maxBytes: 5 * 1024 * 1024, compactionIntervalMs: 60_000 });
    await store.append(directory, sample(now - 120_000), now - 120_000);
    await store.append(directory, sample(now - 90_000), now - 90_000);
    await store.append(directory, sample(now), now);

    const physicalLines = (await readFile(path.join(directory, '.darkcraft', 'metrics', 'history.ndjson'), 'utf8'))
      .trim().split(/\r?\n/).map((line) => JSON.parse(line) as ServerMetricSample);
    expect(physicalLines.map((value) => value.timestamp)).toEqual([now]);
  });
});
