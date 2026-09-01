import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, LayoutGrid, List, Search, ChevronDown,
  Play, Square, RotateCcw, Skull, Terminal, Settings2,
  Download, MoreHorizontal, Trash2, Server as ServerIcon
} from 'lucide-react';
import { Layout } from '@/layouts/Layout';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ExportServerDialog } from '@/components/server/ExportServerDialog';
import { SkeletonCard, EmptyState } from '@/components/shared/States';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServers } from '@/hooks/useServers';
import { formatBytes, formatUptime, cn, serverIconFallback } from '@/utils';
import type { Server, ServerStatus } from '@/types';

type View = 'card' | 'list';
type SortKey = 'name' | 'status' | 'players' | 'cpu';
const STATUS_FILTERS: { value: ServerStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'OFFLINE', label: 'Offline' },
  { value: 'STARTING', label: 'Starting' },
  { value: 'STOPPING', label: 'Stopping' },
  { value: 'CRASHED', label: 'Crashed' },
];
const TYPE_FILTERS = ['All', 'Vanilla', 'Paper', 'Purpur', 'Fabric', 'Forge', 'NeoForge'];

function ServerRowActions({ server, onStart, onStop, onRestart, onKill, onExport, onDelete }: {
  server: Server;
  onStart: () => void; onStop: () => void; onRestart: () => void;
  onKill: () => void; onExport: () => void; onDelete: () => void;
}) {
  const running = server.status === 'ONLINE' || server.status === 'STARTING';
  return (
    <div className="flex items-center gap-1 shrink-0">
      {!running && server.status !== 'STOPPING' && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-primary" onClick={onStart}>
          <Play className="w-3 h-3" /><span className="sr-only md:not-sr-only">Start</span>
        </Button>
      )}
      {running && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={onStop}>
          <Square className="w-3 h-3" /><span className="sr-only md:not-sr-only">Stop</span>
        </Button>
      )}
      {running && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={onRestart}>
          <RotateCcw className="w-3 h-3" /><span className="sr-only md:not-sr-only">Restart</span>
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.location.href = `/servers/${server.id}/console`}>
        <Terminal className="w-3 h-3" /><span className="sr-only md:not-sr-only">Console</span>
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.location.href = `/servers/${server.id}`}>
        <Settings2 className="w-3 h-3" /><span className="sr-only md:not-sr-only">Manage</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 px-0">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onExport}><Download className="w-3.5 h-3.5 mr-2" />Export</DropdownMenuItem>
          {running && (
            <DropdownMenuItem className="text-destructive" onClick={onKill}>
              <Skull className="w-3.5 h-3.5 mr-2" />Kill
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function ServersPage() {
  const navigate = useNavigate();
  const { servers, loading, startServer, stopServer, restartServer, killServer, deleteServer } = useServers();
  const [view, setView] = useState<View>('card');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServerStatus | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [exportId, setExportId] = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [deleteInput, setDeleteInput] = useState('');

  const filtered = servers
    .filter(s => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (typeFilter !== 'All' && s.software !== typeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'status') return a.status.localeCompare(b.status);
      if (sortKey === 'players') return b.playerCount - a.playerCount;
      if (sortKey === 'cpu') return (b.cpu ?? -1) - (a.cpu ?? -1);
      return 0;
    });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">Servers</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{servers.length} server{servers.length !== 1 ? 's' : ''} configured</p>
          </div>
          <Button className="gap-1.5 shrink-0" onClick={() => navigate('/servers/new')}>
            <Plus className="w-4 h-4" /> Add Server
          </Button>
        </div>

        {/* Filters toolbar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-40 max-w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search servers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-input"
              />
            </div>

            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs shrink-0">
                  Status: {statusFilter === 'ALL' ? 'All' : statusFilter} <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {STATUS_FILTERS.map(f => (
                  <DropdownMenuItem key={f.value} onClick={() => setStatusFilter(f.value as ServerStatus | 'ALL')}>
                    {f.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Type filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs shrink-0">
                  Type: {typeFilter} <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {TYPE_FILTERS.map(t => (
                  <DropdownMenuItem key={t} onClick={() => setTypeFilter(t)}>{t}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs shrink-0">
                  Sort <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSortKey('name')}>Name</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortKey('status')}>Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortKey('players')}>Players</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortKey('cpu')}>CPU</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View toggle */}
            <div className="flex border border-border rounded overflow-hidden ml-auto shrink-0">
              <button
                onClick={() => setView('card')}
                className={cn('px-2 py-1', view === 'card' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              ><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button
                onClick={() => setView('list')}
                className={cn('px-2 py-1', view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
              ><List className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className={view === 'card' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2'}>
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ServerIcon className="w-10 h-10" />}
            title={search || statusFilter !== 'ALL' || typeFilter !== 'All' ? 'No servers match your filters' : 'No servers yet'}
            description={search || statusFilter !== 'ALL' ? 'Try adjusting your filters' : 'Click Add Server to get started'}
          />
        ) : view === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(server => (
              <ServerCardFull
                key={server.id}
                server={server}
                onStart={() => startServer(server.id)}
                onStop={() => stopServer(server.id)}
                onRestart={() => restartServer(server.id)}
                onKill={() => { setKillTarget(server); }}
                onExport={() => setExportId(server.id)}
                onDelete={() => { setDeleteInput(''); setDeleteTarget(server); }}
              />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Server</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Version</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Address</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Players</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">CPU</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">RAM</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Uptime</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(server => (
                    <tr key={server.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                            {serverIconFallback(server.name)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{server.name}</p>
                            <p className="text-[10px] text-muted-foreground">{server.software}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><ServerStatusBadge status={server.status} size="sm" /></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{server.minecraftVersion}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">{server.ip}:{server.port}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(server.playerCount > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                          {server.playerCount}/{server.maxPlayers}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {server.status === 'ONLINE' && server.cpu !== null ? (
                          <div className="flex items-center gap-1.5">
                            <span className={server.cpu > 80 ? 'text-red-400' : server.cpu > 60 ? 'text-yellow-400' : 'text-foreground'}>
                              {server.cpu.toFixed(0)}%
                            </span>
                            <ProgressBar value={server.cpu} size="sm" className="w-14" />
                          </div>
                        ) : <span className="text-muted-foreground">N/A</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {server.status === 'ONLINE' && server.ram !== null ? formatBytes(server.ram * 1024 * 1024) : 'N/A'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {server.status === 'ONLINE' ? formatUptime(server.uptime) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <ServerRowActions
                          server={server}
                          onStart={() => startServer(server.id)}
                          onStop={() => stopServer(server.id)}
                          onRestart={() => restartServer(server.id)}
                          onKill={() => setKillTarget(server)}
                          onExport={() => setExportId(server.id)}
                          onDelete={() => { setDeleteInput(''); setDeleteTarget(server); }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Kill dialog */}
      <ConfirmDialog
        open={!!killTarget}
        onOpenChange={o => { if (!o) setKillTarget(null); }}
        title={`Kill ${killTarget?.name ?? ''}?`}
        description="This will forcefully terminate the server process. All unsaved data will be lost."
        confirmLabel="Kill Server"
        destructive
        onConfirm={() => { if (killTarget) { killServer(killTarget.id); setKillTarget(null); } }}
      />

      {/* Delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) { setDeleteTarget(null); setDeleteInput(''); } }}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description="This will permanently delete the server and all its data. This cannot be undone."
        confirmLabel="Delete Server"
        destructive
        confirmDisabled={deleteInput !== deleteTarget?.name}
        onConfirm={() => {
          if (deleteTarget) { deleteServer(deleteTarget.id, deleteTarget.name); setDeleteTarget(null); }
        }}
      >
        <div className="mt-3">
          <label className="text-xs text-muted-foreground block mb-1">
            Type <span className="font-mono text-foreground">{deleteTarget?.name}</span> to confirm
          </label>
          <input
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={deleteInput}
            onChange={e => setDeleteInput(e.target.value)}
            placeholder={deleteTarget?.name ?? ''}
            autoFocus
          />
        </div>
      </ConfirmDialog>

      {exportId && (
        <ExportServerDialog
          open
          onOpenChange={o => { if (!o) setExportId(null); }}
          serverId={exportId}
          serverName={servers.find(s => s.id === exportId)?.name ?? ''}
          serverStatus={servers.find(s => s.id === exportId)?.status ?? 'OFFLINE'}
        />
      )}
    </Layout>
  );
}

// Full card variant used on Servers page
function ServerCardFull({ server, onStart, onStop, onRestart, onKill, onExport, onDelete }: {
  server: Server;
  onStart: () => void; onStop: () => void; onRestart: () => void;
  onKill: () => void; onExport: () => void; onDelete: () => void;
}) {
  const running = server.status === 'ONLINE' || server.status === 'STARTING';
  return (
    <div className="bg-card border border-border rounded p-4 flex flex-col h-full">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
          {serverIconFallback(server.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground truncate">{server.name}</h3>
            <ServerStatusBadge status={server.status} size="sm" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{server.software} · {server.minecraftVersion}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div><p className="text-muted-foreground">Players</p><p className="font-medium text-foreground">{server.playerCount}/{server.maxPlayers}</p></div>
        <div>
          <p className="text-muted-foreground">CPU</p>
          <p className={cn('font-medium', server.cpu !== null && server.cpu > 80 ? 'text-red-400' : server.cpu !== null && server.cpu > 60 ? 'text-yellow-400' : 'text-foreground')}>
            {server.status === 'ONLINE' && server.cpu !== null ? `${server.cpu.toFixed(0)}%` : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">RAM</p>
          <p className="font-medium text-foreground">{server.status === 'ONLINE' && server.ram !== null ? formatBytes(server.ram * 1024 * 1024) : 'N/A'}</p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-3 font-mono">
        {server.ip}:{server.port}
        {server.status === 'ONLINE' && <span className="ml-2 font-sans">· {formatUptime(server.uptime)}</span>}
      </div>

      <div className="flex items-center gap-1 flex-wrap mt-auto">
        {!running && server.status !== 'STOPPING' && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-primary" onClick={onStart}>
            <Play className="w-3 h-3" /> Start
          </Button>
        )}
        {running && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={onStop}>
            <Square className="w-3 h-3" /> Stop
          </Button>
        )}
        {running && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={onRestart}>
            <RotateCcw className="w-3 h-3" /> Restart
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.location.href=`/servers/${server.id}/console`}>
          <Terminal className="w-3 h-3" /> Console
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => window.location.href=`/servers/${server.id}`}>
          <Settings2 className="w-3 h-3" /> Manage
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 px-0">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onExport}><Download className="w-3.5 h-3.5 mr-2" />Export</DropdownMenuItem>
            {running && <DropdownMenuItem className="text-destructive" onClick={onKill}><Skull className="w-3.5 h-3.5 mr-2" />Kill</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
