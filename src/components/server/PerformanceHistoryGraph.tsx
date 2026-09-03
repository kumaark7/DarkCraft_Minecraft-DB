import { useState } from 'react';
import type { MetricHistoryRange, ServerMetricSample } from '@/types';
import { formatBytes } from '@/utils';

const ranges: MetricHistoryRange[] = ['15m', '1h', '6h', '24h'];

function percent(value: number | null, maximum = 100): number | null {
  return value === null || maximum <= 0 ? null : Math.max(0, Math.min(100, (value / maximum) * 100));
}

function paths(samples: ServerMetricSample[], value: (sample: ServerMetricSample) => number | null): string[] {
  const segments: string[] = [];
  let current = '';
  samples.forEach((sample, index) => {
    const rawPoint = value(sample);
    const point = rawPoint === null ? null : Math.max(0, Math.min(100, rawPoint));
    if (point === null) { if (current) segments.push(current); current = ''; return; }
    const x = samples.length <= 1 ? 0 : (index / (samples.length - 1)) * 100;
    const command = current ? 'L' : 'M';
    current += `${command}${x.toFixed(2)},${(100 - point).toFixed(2)} `;
  });
  if (current) segments.push(current);
  return segments;
}

export function PerformanceHistoryGraph({ samples, range, onRangeChange, loading }: {
  samples: ServerMetricSample[];
  range: MetricHistoryRange;
  onRangeChange: (range: MetricHistoryRange) => void;
  loading: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const selected = hovered === null ? null : samples[hovered];
  const series = [
    { label: 'CPU', color: '#ef4444', values: paths(samples, (sample) => sample.cpu) },
    { label: 'RAM', color: '#eab308', values: paths(samples, (sample) => percent(sample.ram, sample.ramMax)) },
    { label: 'Players', color: 'hsl(var(--chart-1))', values: paths(samples, (sample) => percent(sample.players, sample.maxPlayers)) },
  ];

  return (
    <div className="bg-card border border-border rounded p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Performance History</h2>
          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
            {series.map((item) => <span key={item.label} className="flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
          </div>
        </div>
        <div className="flex border border-border rounded overflow-hidden">
          {ranges.map((value) => <button key={value} type="button" onClick={() => onRangeChange(value)} className={`px-2 py-1 text-[10px] ${range === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{value}</button>)}
        </div>
      </div>
      {loading && samples.length === 0 ? <p className="h-44 grid place-items-center text-xs text-muted-foreground">Loading history…</p> : samples.length === 0 ? <p className="h-44 grid place-items-center text-xs text-muted-foreground">No performance history collected yet</p> : (
        <div className="relative h-44 md:h-56" onMouseLeave={() => setHovered(null)}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="CPU, RAM and player utilization history" onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setHovered(Math.min(samples.length - 1, Math.max(0, Math.round(((event.clientX - bounds.left) / bounds.width) * (samples.length - 1)))));
          }}>
            {[0, 25, 50, 75, 100].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" className="text-border" vectorEffect="non-scaling-stroke" />)}
            {series.flatMap((item) => item.values.map((d, index) => <path key={`${item.label}-${index}`} d={d} fill="none" stroke={item.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />))}
          </svg>
          {selected && <div className="absolute top-2 left-2 bg-popover border border-border rounded p-2 text-[10px] shadow pointer-events-none">
            <p className="text-muted-foreground mb-1">{new Date(selected.timestamp).toLocaleString()}</p>
            <p>CPU: {selected.cpu === null ? 'N/A' : `${selected.cpu.toFixed(1)}%`}</p>
            <p>RAM: {selected.ram === null ? 'N/A' : `${formatBytes(selected.ram * 1048576)} / ${formatBytes(selected.ramMax * 1048576)}`}</p>
            <p>Players: {selected.players}/{selected.maxPlayers}</p>
          </div>}
        </div>
      )}
    </div>
  );
}
