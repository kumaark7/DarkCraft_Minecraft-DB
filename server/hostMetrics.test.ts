import { describe, expect, it } from 'vitest';
import { cpuUsageBetween, HostMetricsSampler, type CpuTicks, type NetworkCounters } from './hostMetrics.js';

describe('host metrics', () => {
  it('calculates CPU from cross-platform os tick deltas', () => {
    expect(cpuUsageBetween({ idle: 700, total: 1000 }, { idle: 750, total: 1200 })).toBe(75);
  });

  it('calculates RX/TX rates and reports the initial sample as unavailable', async () => {
    const cpu: CpuTicks[] = [{ idle: 0, total: 1 }, { idle: 1, total: 2 }];
    const network: NetworkCounters[] = [{ received: 1000, sent: 2000 }, { received: 3048, sent: 6096 }];
    const times = [1000, 3000];
    const sampler = new HostMetricsSampler(
      () => cpu.shift() ?? { idle: 1, total: 2 },
      async () => network.shift() ?? { received: 3048, sent: 6096 },
      () => times.shift() ?? 3000,
    );
    expect(await sampler.networkRates()).toEqual({ networkIn: null, networkOut: null });
    expect(await sampler.networkRates()).toEqual({ networkIn: 1, networkOut: 2 });
  });

  it('reports unavailable rather than fake zero when counters are unsupported', async () => {
    const sampler = new HostMetricsSampler(undefined, async () => { throw new Error('unsupported'); });
    expect(await sampler.networkRates()).toEqual({ networkIn: null, networkOut: null });
  });
});
