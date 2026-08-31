import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, ArrowLeft, FileArchive, Folder, CheckCircle2,
  Package, Globe, Settings
} from 'lucide-react';
import { Layout } from '@/layouts/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { serverService } from '@/services';
import { formatBytes, cn } from '@/utils';
import { toast } from 'sonner';
import type { ImportInspection } from '@/types';

type Stage = 'upload' | 'inspecting' | 'review' | 'importing' | 'done';

export default function ImportServerPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('upload');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [serverName, setServerName] = useState('');
  const [importProgress, setImportProgress] = useState(0);

  const handleFile = async (f: File) => {
    if (!f.name.endsWith('.zip')) { toast.error('Only ZIP archives are supported'); return; }
    setFile(f);
    setStage('inspecting');
    try {
      const result = await serverService.importServer(f);
      setInspectId(result.inspectionId);
      setInspection(result.inspection);
      setServerName(result.inspection.detectedName);
      setStage('review');
    } catch {
      toast.error('Failed to inspect archive');
      setStage('upload');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    if (!inspectId || !serverName.trim()) return;
    setStage('importing');
    let prog = 0;
    const tick = setInterval(() => {
      prog = Math.min(95, prog + Math.random() * 12);
      setImportProgress(Math.floor(prog));
    }, 400);
    try {
      await serverService.confirmImport(inspectId, serverName);
      clearInterval(tick);
      setImportProgress(100);
      setStage('done');
      toast.success(`Server "${serverName}" imported successfully`);
    } catch {
      clearInterval(tick);
      toast.error('Import failed');
      setStage('review');
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-xl mx-auto space-y-6 animate-fade-in">
        <button onClick={() => navigate('/servers/new')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div>
          <h1 className="text-lg font-bold text-foreground">Import Existing Server</h1>
          <p className="text-xs text-muted-foreground">Upload a ZIP archive of your Minecraft server</p>
        </div>

        {/* Upload stage */}
        {stage === 'upload' && (
          <div className="space-y-4">
            {/* Drag zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <FileArchive className={cn('w-10 h-10 mx-auto mb-3', dragging ? 'text-primary' : 'text-muted-foreground')} />
              <p className="text-sm font-medium text-foreground mb-1">Drop your server ZIP here</p>
              <p className="text-xs text-muted-foreground mb-3">or click to browse files</p>
              <Button variant="secondary" size="sm" type="button" onClick={() => inputRef.current?.click()}>Browse Files</Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {/* Directory option (placeholder) */}
            <div className="bg-muted/30 border border-border rounded p-4 flex items-start gap-3 opacity-60 cursor-not-allowed">
              <Folder className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Import from Directory</p>
                <p className="text-xs text-muted-foreground">Point to an existing server directory on the host. Available when backend is connected.</p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              The ZIP may contain worlds, plugins, mods, configs, server.properties, whitelist, ops, ban lists, datapacks, resource packs, and all other server files.
            </p>
          </div>
        )}

        {/* Inspecting */}
        {stage === 'inspecting' && (
          <div className="bg-card border border-border rounded p-6 text-center space-y-3">
            <FileArchive className="w-8 h-8 mx-auto text-primary animate-pulse" />
            <p className="text-sm font-medium text-foreground">Inspecting archive…</p>
            <p className="text-xs text-muted-foreground">{file?.name}</p>
            <ProgressBar value={60} />
          </div>
        )}

        {/* Review */}
        {stage === 'review' && inspection && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detected Configuration</h2>
              <div className="space-y-0 divide-y divide-border/50">
                {[
                  { label: 'Server Software', value: inspection.detectedSoftware, icon: <Settings className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Minecraft Version', value: inspection.detectedVersion, icon: <Globe className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Server JAR', value: inspection.detectedJar, icon: <Package className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Worlds', value: inspection.worlds.join(', '), icon: <Globe className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Plugins', value: `${inspection.pluginCount} detected`, icon: <Package className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Mods', value: inspection.modCount > 0 ? `${inspection.modCount} detected` : 'None', icon: <Package className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Archive Size', value: formatBytes(inspection.archiveSize), icon: <FileArchive className="w-3.5 h-3.5 text-muted-foreground" /> },
                  { label: 'Config Files', value: inspection.configFiles.join(', '), icon: <Settings className="w-3.5 h-3.5 text-muted-foreground" /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex items-center gap-3 py-2 text-xs">
                    <span className="shrink-0">{icon}</span>
                    <span className="text-muted-foreground w-28 shrink-0">{label}</span>
                    <span className="text-foreground font-medium truncate">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Server name */}
            <div>
              <Label className="text-xs mb-1.5 block">Server Name</Label>
              <Input
                value={serverName}
                onChange={e => setServerName(e.target.value)}
                placeholder="Enter a name for this server"
                className="bg-input"
              />
              <p className="text-[11px] text-muted-foreground mt-1">This server will always be imported as a new instance — existing servers are never overwritten.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setStage('upload')}>Cancel</Button>
              <Button onClick={handleImport} disabled={!serverName.trim()}>
                Import as New Server
              </Button>
            </div>
          </div>
        )}

        {/* Importing */}
        {stage === 'importing' && (
          <div className="bg-card border border-border rounded p-6 text-center space-y-4">
            <Upload className="w-8 h-8 mx-auto text-primary animate-pulse" />
            <p className="text-sm font-medium text-foreground">Importing "{serverName}"…</p>
            <ProgressBar value={importProgress} />
            <p className="text-xs text-muted-foreground">{importProgress}% complete</p>
          </div>
        )}

        {/* Done */}
        {stage === 'done' && (
          <div className="bg-card border border-border rounded p-8 text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
            <p className="text-sm font-medium text-foreground">Import Complete!</p>
            <p className="text-xs text-muted-foreground">"{serverName}" has been imported and is ready to start.</p>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/servers')}>View Servers</Button>
              <Button onClick={() => navigate('/servers')}>Manage Server</Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
