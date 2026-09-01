import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, RotateCcw, Skull, Terminal, Settings, Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn, formatUptime, formatBytes, serverIconFallback } from '@/utils';
import { ServerStatusBadge } from './ServerStatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { Server } from '@/types';

interface Props {
  server: Server;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onKill: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onExport: (id: string) => void;
  compact?: boolean;
}

export function ServerCard({ server, onStart, onStop, onRestart, onKill, onDelete, onExport, compact }: Props) {
  const [killConfirm, setKillConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  const isRunning = server.status === 'ONLINE' || server.status === 'STARTING';

  return (
    <>
      <div className={cn(
        'bg-card border border-border rounded hover:border-border/80 transition-colors group',
        compact ? 'p-3' : 'p-4'
      )}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn(
            'flex items-center justify-center rounded bg-muted text-muted-foreground font-bold shrink-0 text-xs',
            compact ? 'w-8 h-8' : 'w-10 h-10'
          )}>
            {serverIconFallback(server.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn('font-semibold text-foreground truncate', compact ? 'text-sm' : 'text-sm')}>
                {server.name}
              </h3>
              <ServerStatusBadge status={server.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {server.software} · {server.minecraftVersion}
            </p>
          </div>
        </div>

        {/* Stats row */}
        {!compact && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div>
              <p className="text-muted-foreground">Players</p>
              <p className="font-medium text-foreground">{server.playerCount}/{server.maxPlayers}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CPU</p>
              <p className={cn('font-medium', server.cpu !== null && server.cpu > 80 ? 'text-red-400' : server.cpu !== null && server.cpu > 60 ? 'text-yellow-400' : 'text-foreground')}>
                {server.status === 'ONLINE' && server.cpu !== null ? `${server.cpu.toFixed(0)}%` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">RAM</p>
              <p className="font-medium text-foreground">
                {server.status === 'ONLINE' && server.ram !== null ? formatBytes(server.ram * 1024 * 1024) : 'N/A'}
              </p>
            </div>
          </div>
        )}

        {!compact && (
          <div className="text-xs text-muted-foreground mb-3">
            <span>{server.ip}:{server.port}</span>
            {server.status === 'ONLINE' && <span className="ml-2">· Up {formatUptime(server.uptime)}</span>}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isRunning && server.status !== 'STOPPING' && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary" onClick={() => onStart(server.id)}>
              <Play className="w-3 h-3" /> Start
            </Button>
          )}
          {isRunning && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => onStop(server.id)}>
              <Square className="w-3 h-3" /> Stop
            </Button>
          )}
          {isRunning && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => onRestart(server.id)}>
              <RotateCcw className="w-3 h-3" /> Restart
            </Button>
          )}
          <Link to={`/servers/${server.id}/console`}>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
              <Terminal className="w-3 h-3" /> Console
            </Button>
          </Link>
          <Link to={`/servers/${server.id}`}>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
              <Settings className="w-3 h-3" /> Manage
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 px-0">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onExport(server.id)}>
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

      {/* Kill confirm */}
      <ConfirmDialog
        open={killConfirm}
        onOpenChange={setKillConfirm}
        title={`Kill ${server.name}?`}
        description="This will forcefully terminate the server process immediately. All unsaved data will be lost."
        confirmLabel="Kill Server"
        destructive
        onConfirm={() => { onKill(server.id); setKillConfirm(false); }}
      />

      {/* Delete confirm with name typing */}
      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={(o) => { setDeleteConfirm(o); if (!o) setDeleteInput(''); }}
        title={`Delete ${server.name}?`}
        description={`This will permanently delete the server and all its data. This action cannot be undone.`}
        confirmLabel="Delete Server"
        destructive
        confirmDisabled={deleteInput !== server.name}
        onConfirm={() => { onDelete(server.id, server.name); setDeleteConfirm(false); }}
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
    </>
  );
}
