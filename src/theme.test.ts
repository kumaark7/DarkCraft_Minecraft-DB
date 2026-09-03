import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { severityColors, statusBgColors, statusColors, statusDotColors } from './utils';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
function token(name: string): string {
  const value = css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing theme token ${name}`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  return alias ? token(alias[1]) : value;
}
function rgb(name: string): number[] {
  const [h, s, l] = token(name).split(/\s+/).map(Number.parseFloat);
  const a = s / 100 * Math.min(l / 100, 1 - l / 100);
  return [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}
function luminance(color: number[]): number {
  return color.reduce((sum, channel, i) => sum + [0.2126, 0.7152, 0.0722][i]
    * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4), 0);
}
function contrast(first: number[], second: number[]): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('blue dashboard theme', () => {
  it('shares blue accents across navigation, focus rings, charts and success status', () => {
    expect(token('primary')).toBe('217 91% 65%');
    for (const name of ['ring', 'chart-1', 'sidebar-primary', 'sidebar-ring', 'status-online', 'success']) {
      expect(token(name)).toBe(token('primary'));
    }
    expect(statusColors.ONLINE).toBe('text-primary');
    expect(statusBgColors.ONLINE).toBe('bg-primary/10 text-primary border-primary/20');
    expect(statusDotColors.ONLINE).toBe('bg-primary');
    expect(severityColors.PLAYER).toBe('text-primary');
    const graph = readFileSync(new URL('./components/server/PerformanceHistoryGraph.tsx', import.meta.url), 'utf8');
    expect(graph).toContain("color: 'hsl(var(--chart-1))'");
    expect(graph).not.toContain('#22c55e');
  });
  it('keeps blue control labels and selected navigation text readable', () => {
    const primary = rgb('primary');
    expect(contrast(rgb('primary-foreground'), primary)).toBeGreaterThanOrEqual(4.5);
    const hovered = primary.map((c, i) => c * 0.9 + rgb('card')[i] * 0.1);
    expect(contrast(rgb('primary-foreground'), hovered)).toBeGreaterThanOrEqual(4.5);
    const selected = primary.map((c, i) => c * 0.1 + rgb('sidebar-background')[i] * 0.9);
    expect(contrast(primary, selected)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb('accent-foreground'), rgb('accent'))).toBeGreaterThanOrEqual(4.5);
  });
  it('preserves distinct warnings, errors and the red logout treatment', () => {
    expect(statusColors.STARTING).toBe('text-yellow-400');
    expect(statusColors.CRASHED).toBe('text-red-400');
    expect(severityColors.ERROR).toBe('text-red-400');
    expect(token('destructive')).toBe('0 72% 51%');
    expect(token('warning')).toBe('38 92% 50%');
    expect(readFileSync(new URL('./layouts/Sidebar.tsx', import.meta.url), 'utf8')).toContain('bg-destructive/10');
  });
});
