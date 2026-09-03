import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostStats } from '@/types';
import { appendHostSample, hostSample, hostPaths, nearestHostSample, pollHostStats } from '@/utils/hostHistory';
import { HostHistoryGraph, graphKeyIndex } from './HostHistoryGraph';

const stats: HostStats = { cpuUsage: 12.5, ramUsed: 2048, ramTotal: 8192, diskUsed: 10, diskTotal: 40, cpuModel: 'Test', uptime: 10, networkIn: null, networkOut: null };
afterEach(() => vi.useRealTimers());
describe('live host monitor', () => {
  it('uses host CPU and RAM units and percentages', () => {
    expect(hostSample(stats, 100)).toEqual({ timestamp: 100, cpu: 12.5, ram: 2048, ramTotal: 8192, ramPercent: 25 });
    expect(hostSample({ ...stats, cpuUsage: 0, ramUsed: 0 }, 100)).toMatchObject({ cpu: 0, ramPercent: 0 });
  });
  it('never fabricates zero for unavailable or invalid metrics', () => {
    expect(hostSample(null, 100)).toMatchObject({ cpu: null, ram: null, ramPercent: null });
    expect(hostSample({ ...stats, cpuUsage: NaN, ramTotal: 0 }, 100)).toMatchObject({ cpu: null, ramPercent: null });
    expect(hostSample({ ...stats, cpuUsage: Infinity, ramUsed: -1 }, 100)).toMatchObject({ cpu: null, ram: null });
  });
  it('bounds history by both five minutes and sample count, replacing duplicate timestamps', () => {
    let samples = [hostSample(stats, 0)];
    for (let i = 1; i <= 100; i++) samples = appendHostSample(samples, hostSample(stats, i * 5000));
    expect(samples).toHaveLength(61);
    expect(samples[0].timestamp).toBe(200000);
    expect(appendHostSample(samples, hostSample(stats, 500000))).toHaveLength(61);
    expect(appendHostSample(samples, hostSample(stats, 900000))).toHaveLength(1);
  });
  it('places observations by real timestamp and breaks lines at unavailable values and polling gaps', () => {
    const samples = [hostSample(stats, 0), hostSample(null, 5000), hostSample(stats, 10000), hostSample(stats, 40000)];
    expect(hostPaths(samples, 'cpu')).toHaveLength(3);
    expect(hostPaths(samples, 'ramPercent')[2]).toContain('M100.000,75.000');
    expect(nearestHostSample(samples, 1)).toBe(3);
    expect(nearestHostSample(samples, 0)).toBe(0);
    expect(hostPaths([hostSample(null, 0)], 'cpu')).toEqual([]);
  });
  it('provides responsive SVG, distinct line styles, current values and keyboard controls', () => {
    const html = renderToStaticMarkup(createElement(HostHistoryGraph, { samples: [hostSample(stats, 0), hostSample(stats, 5000)] }));
    expect(html).toContain('w-full h-32');
    expect(html).toContain('CPU: 12.5%');
    expect(html).toContain('2 GB / 8 GB (25.0%)');
    expect(html).toContain('stroke-dasharray="5 3"');
    expect(html).toContain('aria-label="Inspect host measurement"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('<input');
    expect(html).toContain('Pause');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
  it('keeps keyboard inspection without a visible native range control', () => {
    expect(graphKeyIndex('ArrowLeft', 4, 6)).toBe(3);
    expect(graphKeyIndex('ArrowRight', 5, 6)).toBe(5);
    expect(graphKeyIndex('ArrowDown', 0, 6)).toBe(0);
    expect(graphKeyIndex('Home', 4, 6)).toBe(0);
    expect(graphKeyIndex('End', 0, 6)).toBe(5);
    expect(graphKeyIndex('PageUp', 0, 20)).toBe(10);
    expect(graphKeyIndex('Tab', 0, 6)).toBeNull();
    expect(graphKeyIndex('Home', 0, 0)).toBeNull();
  });
  it('explains empty and failed samples instead of drawing fake data', () => {
    expect(renderToStaticMarkup(createElement(HostHistoryGraph, { samples: [] }))).toContain('Waiting for real host measurements');
    const html = renderToStaticMarkup(createElement(HostHistoryGraph, { samples: [hostSample(null, 0)] }));
    expect(html).toContain('Unavailable · retrying');
    expect(html).toContain('CPU: N/A · RAM: N/A');
  });
  it('polls once per interval, records failures as unavailable and cancels on unmount', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce(stats).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(stats);
    const receive = vi.fn();
    const stop = pollHostStats(load, receive);
    await vi.advanceTimersByTimeAsync(0);
    expect(receive).toHaveBeenLastCalledWith(stats);
    await vi.advanceTimersByTimeAsync(5000);
    expect(receive).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(receive).toHaveBeenLastCalledWith(stats);
    stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('does not overlap slow requests or publish late results after cleanup', async () => {
    vi.useFakeTimers();
    let resolve!: (stats: HostStats) => void;
    const load = vi.fn(() => new Promise<HostStats>(done => { resolve = done; }));
    const receive = vi.fn();
    const stop = pollHostStats(load, receive);
    await vi.advanceTimersByTimeAsync(20000);
    expect(load).toHaveBeenCalledTimes(1);
    stop(); resolve(stats);
    await vi.advanceTimersByTimeAsync(10000);
    expect(receive).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
