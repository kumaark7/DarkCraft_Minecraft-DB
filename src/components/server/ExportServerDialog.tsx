import { useState } from 'react';
import { Download, CheckSquare, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { ServerStatusBadge } from './ServerStatusBadge';
import { serverService } from '@/services';
import type { ServerStatus, ExportProgress } from '@/types';

const EXPORT_ITEMS = [
  'Worlds & Dimensions',
  'Mods / Plugins',
  'Config Files',
  'server.properties',
  'Whitelist',
  'Operators',
  'Ban Lists',
  'Datapacks',
  'Resource Packs',
  'Other Files',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  serverName: string;
  serverStatus: ServerStatus;
}

export function ExportServerDialog({ open, onOpenChange, serverId, serverName, serverStatus }: Props) {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const handleExport = async () => {
    setProgress({ stage: 'preparing', percent: 0, message: 'Preparing files...' });
    try {
      const file = await serverService.exportServer(serverId, setProgress);
      setFilename(file);
    } catch {
      setProgress({ stage: 'failed', percent: 0, message: 'Export failed. Please try again.' });
    }
  };

  const handleClose = () => {
    setProgress(null);
    setFilename(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="w-4 h-4 text-primary" />
            Export {serverName}
          </DialogTitle>
        </DialogHeader>

        {!progress ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              The entire server directory will be packaged into a portable ZIP archive.
            </p>

            {/* Contents list */}
            <div className="space-y-1">
              {EXPORT_ITEMS.map(item => (
                <div key={item} className="flex items-center gap-2 text-xs">
                  <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>

            {/* Server status info */}
            <div className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-xs">
              <span className="text-muted-foreground">Server Status</span>
              <ServerStatusBadge status={serverStatus} size="sm" />
            </div>

            <div className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-xs">
              <span className="text-muted-foreground">Estimated Size</span>
              <span className="text-foreground font-medium">~1.2 GB</span>
            </div>

            {serverStatus === 'ONLINE' && (
              <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Stopping the server before exporting provides the safest and most consistent archive.</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleExport} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export as ZIP
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {progress.stage !== 'complete' && progress.stage !== 'failed' && (
              <>
                <p className="text-sm text-foreground font-medium">{progress.message}</p>
                <ProgressBar value={progress.percent} size="md" />
                <p className="text-xs text-muted-foreground">{progress.percent}% complete</p>
              </>
            )}
            {progress.stage === 'complete' && (
              <div className="text-center space-y-3 py-2">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Download className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Export Complete!</p>
                <p className="text-xs text-muted-foreground">Archive: {filename}</p>
                <div className="flex justify-center gap-2">
                  <Button size="sm" onClick={handleClose} variant="secondary">Close</Button>
                  <Button size="sm" className="gap-1.5" onClick={() => { toast.success('Download started'); handleClose(); }}>
                    <Download className="w-3.5 h-3.5" /> Download ZIP
                  </Button>
                </div>
              </div>
            )}
            {progress.stage === 'failed' && (
              <div className="text-center space-y-3 py-2">
                <p className="text-sm text-red-400">{progress.message}</p>
                <Button size="sm" onClick={() => setProgress(null)} variant="secondary">Try Again</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
