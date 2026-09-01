import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom';
import {
  Play, Square, RotateCcw, Skull, Download,
  MoreHorizontal, ArrowLeft, Trash2,
  LayoutDashboard, Terminal, Users, FolderOpen,
  Package, Archive, Calendar, Settings2
} from 'lucide-react';
import { Layout } from '@/layouts/Layout';
import { ServerStatusBadge } from '@/components/server/ServerStatusBadge';
import { ExportServerDialog } from '@/components/server/ExportServerDialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useServer } from '@/hooks/useServers';
import { serverService } from '@/services';
import { serverIconFallback, cn } from '@/utils';
import { useState } from 'react';
import { toast } from 'sonner';

const TABS = [
  { label: 'Overview', path: '', icon: LayoutDashboard },
  { label: 'Console', path: 'console', icon: Terminal },
  { label: 'Players', path: 'players', icon: Users },
  { label: 'Files', path: 'files', icon: FolderOpen },
  { label: 'Plugins', path: 'plugins', icon: Package },
  { label: 'Backups', path: 'backups', icon: Archive },
  { label: 'Schedules', path: 'schedules', icon: Calendar },
  { label: 'Settings', path: 'settings', icon: Settings2 },
];

export default function ServerManagementPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { server, loading, reload: loadServer } = useServer(id!);
  const [exportOpen, setExportOpen] = useState(false);
  const [killConfirm, setKillConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const isRunning = server?.status === 'ONLINE' || server?.status === 'STARTING';

  const handleStart = async () => {
    if (!id || actionBusy) return;
    setActionBusy(true);
    try {
      console.info('[DarkCraft] Starting server', id);
      await serverService.startServer(id);
      toast.success('Server starting…');
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadServer();
    } catch (error) {
      console.error('[DarkCraft] Failed to start server', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start server');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStop = () => serverService.stopServer(id!).then(() => toast.success('Server stopping…'));
  const handleRestart = () => serverService.restartServer(id!).then(() => toast.success('Server restarting…'));
  const handleKill = () => { serverService.killServer(id!); setKillConfirm(false); toast.warning('Server killed'); };
  const handleDelete = () => {
    if (!server || deleteInput !== server.name) return;
    serverService.deleteServer(id!, server.name).then(() => {
      toast.success('Server deleted');
      navigate('/servers');
    });
  };

  if (loading && !server) {
    return (
      <Layout>
        <div className="animate-pulse p-6 space-y-4">
          <div className="h-12 bg-muted rounded w-64" />
          <div className="h-8 bg-muted rounded w-full" />
        </div>
      </Layout>
    );
  }

  if (!server) {
    return (
      <Layout>
        <div className="p-6 text-center text-muted-foreground">Server not found</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full min-h-0">
        {/* Server header */}
        <div className="border-b border-border bg-card/50 px-4 md:px-6 pt-4 pb-0 shrink-0">
          {/* Breadcrumb */}
          <button
            onClick={() => navigate('/servers')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Servers
          </button>

          {/* Server info + actions */}
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                {serverIconFallback(server.name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-bold text-foreground truncate">{server.name}</h1>
                  <ServerStatusBadge status={server.status} />
                </div>
                <p className="text-xs text-muted-foreground">{server.software} · {server.minecraftVersion}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {!isRunning && server.status !== 'STOPPING' && (
                <Button type="button" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => void handleStart()} disabled={actionBusy}>
                  <Play className="w-3 h-3" /> {actionBusy ? 'Starting…' : 'Start'}
                </Button>
              )}
              {isRunning && (
                <>
                  <Button size="sm" variant="secondary" className="gap-1.5 h-8 text-xs" onClick={handleRestart}>
                    <RotateCcw className="w-3 h-3" /> Restart
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1.5 h-8 text-xs" onClick={handleStop}>
                    <Square className="w-3 h-3" /> Stop
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-8 w-8 px-0">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => setExportOpen(true)}>
                    <Download className="w-3.5 h-3.5 mr-2" /> Export
                  </DropdownMenuItem>
                  {isRunning && (
                    <DropdownMenuItem className="text-destructive" onClick={() => setKillConfirm(true)}>
                      <Skull className="w-3.5 h-3.5 mr-2" /> Kill
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => { setDeleteInput(''); setDeleteConfirm(true); }}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 overflow-x-auto whitespace-nowrap scrollbar-thin">
            {TABS.map(tab => {
              const to = tab.path
                ? `/servers/${id}/${tab.path}`
                : `/servers/${id}`;
              return (
                <NavLink
                  key={tab.path}
                  to={to}
                  end={tab.path === ''}
                  className={({ isActive }) => cn(
                    'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <Outlet />
        </div>
      </div>

      {/* Dialogs */}
      <ExportServerDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        serverId={server.id}
        serverName={server.name}
        serverStatus={server.status}
      />
      <ConfirmDialog
        open={killConfirm}
        onOpenChange={setKillConfirm}
        title={`Kill ${server.name}?`}
        description="Forcefully terminates the server process. All unsaved data will be lost."
        confirmLabel="Kill Server"
        destructive
        onConfirm={handleKill}
      />
      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={o => { setDeleteConfirm(o); if (!o) setDeleteInput(''); }}
        title={`Delete ${server.name}?`}
        description="Permanently deletes this server and all its data. This cannot be undone."
        confirmLabel="Delete Server"
        destructive
        confirmDisabled={deleteInput !== server.name}
        onConfirm={handleDelete}
      >
        <div className="mt-3">
          <label className="text-xs text-muted-foreground block mb-1">
            Type <span className="font-mono text-foreground">{server.name}</span> to confirm
          </label>
          <input
            className="w-full bg-input border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={deleteInput}
            onChange={e => setDeleteInput(e.target.value)}
            placeholder={server.name}
            autoFocus
          />
        </div>
      </ConfirmDialog>
    </Layout>
  );
}
