import { useState } from 'react';
import { Layout } from '@/layouts/Layout';
import { useActivity } from '@/hooks/useGlobal';
import { formatDateTime, cn } from '@/utils';
import { Input } from '@/components/ui/input';
import { Search, Activity as ActivityIcon, Server, Users, Archive, Settings, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { EmptyState } from '@/components/shared/States';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'server-start': <CheckCircle2 className="w-3.5 h-3.5 text-primary" />,
  'server-stop': <Info className="w-3.5 h-3.5 text-muted-foreground" />,
  'player-join': <Users className="w-3.5 h-3.5 text-accent" />,
  'player-leave': <Users className="w-3.5 h-3.5 text-muted-foreground" />,
  'config-change': <Settings className="w-3.5 h-3.5 text-yellow-400" />,
  'backup': <Archive className="w-3.5 h-3.5 text-primary" />,
  'error': <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  'ban': <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  'plugin': <Info className="w-3.5 h-3.5 text-accent" />,
};

const CATEGORY_FILTERS = ['All', 'server-start', 'server-stop', 'player-join', 'player-leave', 'config-change', 'backup', 'error', 'ban'];

export default function ActivityPage() {
  const { activity } = useActivity();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [serverFilter, setServerFilter] = useState('All');

  const servers = ['All', ...Array.from(new Set(activity.map(e => e.serverName).filter(Boolean))) as string[]];

  const filtered = activity.filter(e => {
    if (search && !e.event.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter !== 'All' && e.category !== catFilter) return false;
    if (serverFilter !== 'All' && e.serverName !== serverFilter) return false;
    return true;
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 animate-fade-in">
        <div>
          <h1 className="text-lg font-bold text-foreground">Activity</h1>
          <p className="text-xs text-muted-foreground">Global infrastructure event log</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40 max-w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-input" />
          </div>
          <select value={serverFilter} onChange={e => setServerFilter(e.target.value)} className="h-8 text-xs bg-card border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            {servers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="h-8 text-xs bg-card border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            {CATEGORY_FILTERS.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
        </div>

        {/* Event list */}
        <div className="bg-card border border-border rounded overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={<ActivityIcon className="w-8 h-8" />} title="No activity found" />
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map(event => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <span className="mt-0.5 shrink-0">{CATEGORY_ICONS[event.category] ?? <ActivityIcon className="w-3.5 h-3.5 text-muted-foreground" />}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{event.event}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      {event.serverName && <span className="flex items-center gap-1"><Server className="w-3 h-3" />{event.serverName}</span>}
                      {event.actor && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{event.actor}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{formatDateTime(event.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
