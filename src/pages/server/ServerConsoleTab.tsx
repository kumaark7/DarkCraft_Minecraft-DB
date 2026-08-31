import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ChevronDown, Play, Pause, Trash2, Search, X,
  SendHorizonal, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConsole } from '@/hooks/useConsole';
import { severityColors, cn } from '@/utils';
import type { ConsoleSeverity, ConsoleViewMode } from '@/types';

const FILTERS: { value: ConsoleSeverity | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARN', label: 'WARN' },
  { value: 'ERROR', label: 'ERROR' },
  { value: 'COMMAND', label: 'Commands' },
  { value: 'PLAYER', label: 'Players' },
];

const VIEW_MODES: { value: ConsoleViewMode; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'older', label: 'Older' },
];

function colorLine(sev: ConsoleSeverity): string {
  return severityColors[sev];
}

export default function ServerConsoleTab() {
  const { id } = useParams<{ id: string }>();
  const { entries, loading, mode, setMode, filter, setFilter, search, setSearch, paused, setPaused, sendCommand, clear } = useConsole(id!);
  const [cmd, setCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries, autoScroll]);

  const handleSend = useCallback(async () => {
    if (!cmd.trim()) return;
    const c = cmd.trim().replace(/^\//, '');
    setCmdHistory(prev => [c, ...prev.slice(0, 49)]);
    setHistIdx(-1);
    setCmd('');
    await sendCommand(c);
  }, [cmd, sendCommand]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { handleSend(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(idx);
      setCmd(cmdHistory[idx] ?? '');
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setCmd(idx >= 0 ? cmdHistory[idx] : '');
    }
  };

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  return (
    <div className="flex flex-col h-full min-h-0" style={{ height: 'calc(100vh - 200px)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 shrink-0 flex-wrap">
        {/* View mode */}
        <div className="flex border border-border rounded overflow-hidden text-xs">
          {VIEW_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'px-2.5 py-1 transition-colors',
                mode === m.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Severity filters */}
        <div className="flex border border-border rounded overflow-hidden text-xs">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'px-2.5 py-1 transition-colors',
                filter === f.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-28 max-w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search console…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-6 h-6 text-xs bg-input"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={clear}>
            <Trash2 className="w-3 h-3" />
            <span className="sr-only md:not-sr-only">Clear</span>
          </Button>
        </div>
      </div>

      {/* 72h notice for non-live mode */}
      {mode !== 'live' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/5 border-b border-yellow-500/20 text-xs text-yellow-400/80 shrink-0">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Viewing dashboard-retained console history (max 72 hours per server). Native Minecraft logs are in <code className="font-mono text-xs mx-1">server/logs/</code>
        </div>
      )}

      {/* Console output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 bg-background font-mono text-xs px-4 py-3 space-y-0.5 scrollbar-thin"
      >
        {loading ? (
          <p className="text-muted-foreground animate-pulse">Loading console history…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">No entries for this filter. {mode === 'live' ? 'Waiting for server output…' : 'Try a different time range.'}</p>
        ) : (
          entries.map(entry => (
            <div
              key={entry.id}
              className={cn('leading-relaxed break-words whitespace-pre-wrap', colorLine(entry.severity))}
            >
              {entry.message}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {!autoScroll && (
        <button
          onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
          className="absolute right-6 bottom-16 bg-primary/90 hover:bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg"
        >
          <ChevronDown className="w-3 h-3" /> Jump to bottom
        </button>
      )}

      {/* Command input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card/50 shrink-0">
        <span className="text-muted-foreground text-xs font-mono shrink-0">&gt;</span>
        <Input
          value={cmd}
          onChange={e => { setCmd(e.target.value); setHistIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder="Enter command… (↑↓ for history)"
          className="flex-1 font-mono text-xs bg-input h-8"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          size="sm"
          className="h-8 px-3 gap-1.5 text-xs shrink-0"
          onClick={handleSend}
          disabled={!cmd.trim()}
        >
          <SendHorizonal className="w-3.5 h-3.5" />
          <span className="sr-only md:not-sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}
