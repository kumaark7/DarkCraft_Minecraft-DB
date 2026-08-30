import { useState } from 'react';
import { Layout } from '@/layouts/Layout';
import { useLogs } from '@/hooks/useGlobal';
import { formatDateTime, cn } from '@/utils';
import { Input } from '@/components/ui/input';
import { Search, FileText, AlertTriangle, Info, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/shared/States';
import type { LogSeverity } from '@/types';

const SEV_ICONS: Record<LogSeverity, React.ReactNode> = {
  INFO: <Info className="w-3.5 h-3.5 text-accent" />,
  WARN: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  ERROR: <XCircle className="w-3.5 h-3.5 text-red-400" />,
};
const SEV_COLORS: Record<LogSeverity, string> = {
  INFO: 'text-foreground',
  WARN: 'text-yellow-400/90',
  ERROR: 'text-red-400/90',
};

export default function LogsPage() {
  const { logs } = useLogs();
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<LogSeverity | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState('All');

  const sources = ['All', ...Array.from(new Set(logs.map(l => l.source)))];

  const filtered = logs.filter(l => {
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    if (sevFilter !== 'ALL' && l.severity !== sevFilter) return false;
    if (sourceFilter !== 'All' && l.source !== sourceFilter) return false;
    return true;
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 animate-fade-in">
        <div>
          <h1 className="text-lg font-bold text-foreground">Logs</h1>
          <p className="text-xs text-muted-foreground">Control panel application logs — separate from individual server consoles</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40 max-w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search logs…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-input" />
          </div>
          <select value={sevFilter} onChange={e => setSevFilter(e.target.value as LogSeverity | 'ALL')} className="h-8 text-xs bg-card border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="ALL">All Severities</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="h-8 text-xs bg-card border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Log list */}
        <div className="bg-card border border-border rounded overflow-hidden font-mono">
          {filtered.length === 0 ? (
            <EmptyState icon={<FileText className="w-8 h-8" />} title="No logs found" />
          ) : (
            <div className="divide-y divide-border/30">
              {filtered.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2 hover:bg-muted/20 transition-colors">
                  <span className="mt-0.5 shrink-0">{SEV_ICONS[log.severity]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs break-words', SEV_COLORS[log.severity])}>{log.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{log.source}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{formatDateTime(log.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
