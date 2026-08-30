import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Archive, Plus, Download, Trash2, RotateCcw, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/shared/States';
import { ProgressBar } from '@/components/shared/ProgressBar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { backupService } from '@/services';
import { formatBytes, formatDate, cn } from '@/utils';
import { toast } from 'sonner';
import type { Backup, BackupProgress } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-primary',
  creating: 'text-yellow-400',
  failed: 'text-red-400',
  restoring: 'text-accent',
  running: 'text-yellow-400',
  pending: 'text-muted-foreground',
};

export default function ServerBackupsTab() {
  const { id } = useParams<{ id: string }>();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
  const [retention, setRetention] = useState('10');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await backupService.getBackups(id!);
    setBackups(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setProgress({ stage: 'preparing', percent: 0, message: 'Preparing backup…' });
    try {
      await backupService.createBackup(id!, setProgress);
      toast.success('Backup created');
      setProgress(null);
      load();
    } catch {
      toast.error('Backup failed');
      setProgress(null);
    }
  };

  const handleRestore = async (backup: Backup) => {
    setRestoreTarget(null);
    toast.info(`Restoring from "${backup.name}"…`);
    await backupService.restoreBackup(id!, backup.id);
    toast.success('Restore complete');
  };

  const handleDelete = async (backup: Backup) => {
    await backupService.deleteBackup(id!, backup.id);
    toast.success(`Backup deleted`);
    setDeleteTarget(null);
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Backups</h2>
          <p className="text-xs text-muted-foreground">{backups.length} backup{backups.length !== 1 ? 's' : ''} · Routine server snapshots</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 w-8 px-0" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleCreate} disabled={!!progress}>
            <Plus className="w-3.5 h-3.5" /> Create Backup
          </Button>
        </div>
      </div>

      {/* Retention settings */}
      <div className="bg-card border border-border rounded px-4 py-3 flex items-center justify-between gap-3 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium">Keep Latest</span>
          <span className="text-xs text-muted-foreground">— older backups are automatically removed</span>
        </div>
        <Select value={retention} onValueChange={setRetention}>
          <SelectTrigger className="bg-input h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 backups</SelectItem>
            <SelectItem value="10">10 backups</SelectItem>
            <SelectItem value="20">20 backups</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Export notice */}
      <div className="bg-muted/30 border border-border/50 rounded px-4 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-foreground">Backup</strong> vs <strong className="text-foreground">Export</strong>: Backups are routine recovery snapshots.
          Use <em>Export Server</em> (from the More menu) to create a portable ZIP of the entire server directory.
        </span>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-card border border-primary/20 rounded p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{progress.message}</p>
          <ProgressBar value={progress.percent} />
          <p className="text-xs text-muted-foreground">{progress.percent}% complete</p>
        </div>
      )}

      {/* Backup list */}
      <div className="bg-card border border-border rounded overflow-hidden">
        {loading ? (
          <LoadingState message="Loading backups…" />
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<Archive className="w-8 h-8" />}
            title="No backups yet"
            description="Click Create Backup to take a snapshot of your server"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Date</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Size</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {backups.map(backup => (
                  <tr key={backup.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Archive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{backup.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(backup.date)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{backup.size ? formatBytes(backup.size) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] uppercase font-medium tracking-wide',
                        backup.type === 'scheduled' ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'
                      )}>
                        {backup.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={STATUS_COLORS[backup.status] ?? 'text-muted-foreground'}>
                        {backup.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => backupService.downloadBackup(id!, backup.id)}>
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => setRestoreTarget(backup)} disabled={backup.status !== 'completed'}>
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 px-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(backup)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore confirm */}
      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={o => { if (!o) setRestoreTarget(null); }}
        title={`Restore from "${restoreTarget?.name ?? ''}"?`}
        description="This will replace your current server files with this backup. This cannot be undone. Stop the server first for best results."
        confirmLabel="Restore Backup"
        destructive
        onConfirm={() => restoreTarget && handleRestore(restoreTarget)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null); }}
        title={`Delete backup "${deleteTarget?.name ?? ''}"?`}
        description="This backup will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}
