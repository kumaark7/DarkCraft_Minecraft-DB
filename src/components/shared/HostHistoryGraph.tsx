import { useId, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatBytes } from '@/utils';
import { HOST_RANGES, hostPaths, nearestHostSample, type HostSample } from '@/utils/hostHistory';
import type { MetricHistoryRange } from '@/types';

function values(sample: HostSample) {
  return `CPU: ${sample.cpu === null ? 'N/A' : `${sample.cpu.toFixed(1)}%`} · RAM: ${sample.ramPercent === null || sample.ram === null || sample.ramTotal === null ? 'N/A' : `${formatBytes(sample.ram * 1048576)} / ${formatBytes(sample.ramTotal * 1048576)} (${sample.ramPercent.toFixed(1)}%)`}`;
}
const time = (timestamp: number) => new Date(timestamp).toLocaleTimeString();
export function graphKeyIndex(key: string, current: number, length: number): number | null {
  if (!length) return null;
  const last = length - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, current - 1);
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(last, current + 1);
  if (key === 'PageDown') return Math.max(0, current - 10);
  if (key === 'PageUp') return Math.min(last, current + 10);
  return null;
}


export function HostHistoryGraph({ samples, range = '1h', onRangeChange, loading = false, error = false }: { samples: HostSample[]; range?: MetricHistoryRange; onRangeChange?: (range: MetricHistoryRange) => void; loading?: boolean; error?: boolean }) {
  const windowMs = HOST_RANGES[range];
  const id = useId();
  const [frozen, setFrozen] = useState<HostSample[] | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const history = frozen ?? samples;
  const latest = history[history.length - 1];
  const foundIndex = history.findIndex(sample => sample.timestamp === selectedTime);
  const selectedIndex = foundIndex < 0 ? Math.max(0, history.length - 1) : foundIndex;
  const selected = history[selectedIndex];
  const available = latest && (latest.cpu !== null || latest.ramPercent !== null);
  const series = [
    { label: 'CPU', color: 'hsl(var(--chart-1))', metric: 'cpu' as const, dash: undefined },
    { label: 'RAM', color: 'hsl(var(--chart-3))', metric: 'ramPercent' as const, dash: '5 3' },
  ];
  return (
    <section aria-label="Live host CPU and RAM monitor" className="mt-4 border-t border-border/50 pt-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground mb-2">
        <div className="flex items-center gap-3">
          {series.map(item => <span key={item.label} className="flex items-center gap-1">
            <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} /></svg>{item.label}
          </span>)}
          <span>{frozen ? 'Paused' : loading ? 'Loading history…' : error ? 'History unavailable · retrying' : !latest ? 'Collecting…' : available ? 'Live · ~10s' : 'Unavailable · retrying'}</span>
        </div>
        <button type="button" disabled={!history.length} aria-pressed={frozen !== null}
          aria-label={frozen ? 'Resume graph' : 'Pause graph'}
          onClick={() => { setFrozen(frozen ? null : samples.slice()); setSelectedTime(null); }}
          className="inline-flex h-7 items-center gap-1.5 px-2 rounded border border-border/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {frozen ? <Play aria-hidden="true" className="w-3 h-3" /> : <Pause aria-hidden="true" className="w-3 h-3" />}
          {frozen ? 'Resume' : 'Pause'}
        </button>
      </div>
      {onRangeChange && <div role="group" aria-label="Host history time range" className="flex flex-wrap gap-1 mb-3">
        {(Object.keys(HOST_RANGES) as MetricHistoryRange[]).map(value => <button key={value} type="button" aria-pressed={range === value}
          onClick={() => onRangeChange(value)} className={`min-h-8 min-w-10 px-2 text-xs rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${range === value ? 'bg-primary/15 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{value}</button>)}
      </div>}
      <div className="flex gap-2">
        <div aria-hidden="true" className="h-32 flex flex-col justify-between text-[9px] text-muted-foreground text-right w-7 shrink-0"><span>100%</span><span>50%</span><span>0%</span></div>
        <div className="flex-1 min-w-0 rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring"
          role="slider" tabIndex={history.length > 1 ? 0 : -1} aria-disabled={history.length < 2}
          aria-label="Inspect host measurement" aria-describedby={`${id} ${id}-help`} aria-orientation="horizontal"
          aria-valuemin={0} aria-valuemax={Math.max(0, history.length - 1)} aria-valuenow={selectedIndex}
          aria-valuetext={selected ? `${time(selected.timestamp)} ${values(selected)}` : 'No measurements yet'}
          onFocus={() => { if (latest) setSelectedTime(latest.timestamp); }} onBlur={() => setSelectedTime(null)}
          onKeyDown={event => {
            if (event.key === 'Escape') { setSelectedTime(null); return; }
            const index = graphKeyIndex(event.key, selectedIndex, history.length);
            if (index !== null) { event.preventDefault(); setSelectedTime(history[index].timestamp); }
          }}>
          <span id={`${id}-help`} className="sr-only">Use arrow keys to inspect samples, Home and End to jump, or hover or tap the graph. Escape returns to the latest reading.</span>
          <svg role="img" aria-label={`Host CPU and RAM usage over the last ${range}`} viewBox="0 0 100 100" preserveAspectRatio="none"
            className="w-full h-32 overflow-visible" onPointerMove={event => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width && history.length) setSelectedTime(history[nearestHostSample(history, (event.clientX - bounds.left) / bounds.width, windowMs)].timestamp);
            }} onPointerDown={event => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (bounds.width && history.length) setSelectedTime(history[nearestHostSample(history, (event.clientX - bounds.left) / bounds.width, windowMs)].timestamp);
            }} onPointerLeave={event => { if (event.pointerType === 'mouse') setSelectedTime(null); }}>
            {[0, 50, 100].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} className="text-border" stroke="currentColor" vectorEffect="non-scaling-stroke" />)}
            {selectedTime !== null && selected && latest && <line
              x1={100 - 100 * (latest.timestamp - selected.timestamp) / windowMs} x2={100 - 100 * (latest.timestamp - selected.timestamp) / windowMs}
              y1="0" y2="100" stroke="currentColor" className="text-muted-foreground/50" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
            {series.flatMap(item => hostPaths(history, item.metric, windowMs).map((d, index) => <path key={`${item.label}-${index}`} d={d} fill="none" stroke={item.color}
              strokeWidth="2" strokeLinecap="round" strokeDasharray={item.dash} vectorEffect="non-scaling-stroke" />))}
          </svg>
          <div aria-hidden="true" className="flex justify-between mt-1 text-[9px] text-muted-foreground"><span>−{range}</span><span>{latest ? time(latest.timestamp - windowMs / 2) : '—'}</span><span>{latest ? time(latest.timestamp) : 'Now'}</span></div>
        </div>
      </div>
      <p id={id} className="mt-3 flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] tabular-nums">
        {selected ? <><span className="text-foreground/90 break-words">{values(selected)}</span><span className="text-muted-foreground">{time(selected.timestamp)}</span></> : <span className="text-muted-foreground">Waiting for real host measurements…</span>}
      </p>
      <p className="text-[9px] text-muted-foreground mt-1">{range} window · saved on the server · hover, tap or use arrow keys to inspect</p>
    </section>
  );
}
