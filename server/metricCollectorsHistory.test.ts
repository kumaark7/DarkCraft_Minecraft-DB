import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { MetricHistorySampler, MetricHistoryStore } from './metricHistory.js';
import type { ServerStats } from '../src/types/index.js';

it('persists measured collector values and unavailable gaps through the history sampler', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-collector-history-'));
  const stats: ServerStats = {
    serverId: 'one', timestamp: Date.now(), cpu: 1, ram: 256, ramMax: 1024, disk: 12, diskMax: 1024,
    players: 1, maxPlayers: 20, uptime: 60, tps: 19.8, mspt: 3.5, networkIn: 12, networkOut: 24,
  };
  try {
    const sampler = new MetricHistorySampler(new MetricHistoryStore(), async () => [{ directory, stats }]);
    await sampler.sampleNow();
    stats.tps = null; stats.mspt = null; stats.networkIn = null; stats.networkOut = null;
    await sampler.sampleNow(); await sampler.stop();
    const recovered = await new MetricHistoryStore().read(directory, '1h');
    expect(recovered).toEqual([
      expect.objectContaining({ tps: 19.8, mspt: 3.5, networkIn: 12, networkOut: 24 }),
      expect.objectContaining({ tps: null, mspt: null, networkIn: null, networkOut: null }),
    ]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
