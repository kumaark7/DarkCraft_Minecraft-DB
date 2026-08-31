import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Download, Trash2, RefreshCw, Package, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/shared/States';
import { pluginService } from '@/services';
import { formatBytes } from '@/utils';
import { useServer } from '@/hooks/useServers';
import { toast } from 'sonner';
import type { Plugin, Mod } from '@/types';

export default function ServerPluginsTab() {
  const { id } = useParams<{ id: string }>();
  const { server } = useServer(id!);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Plugin | null>(null);

  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server?.software ?? '');
  const label = isModServer ? 'Mods' : 'Plugins';

  const load = useCallback(async () => {
    setLoading(true);
    if (isModServer) {
      const data = await pluginService.getMods(id!);
      setMods(data);
    } else {
      const data = await pluginService.getPlugins(id!);
      setPlugins(data);
    }
    setLoading(false);
  }, [id, isModServer]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await pluginService.uploadPlugin(id!, file);
    toast.success(`${file.name} uploaded`);
    load();
    e.target.value = '';
  };

  const handleDelete = async (plugin: Plugin) => {
    await pluginService.deletePlugin(id!, plugin.id);
    toast.success(`${plugin.name} deleted`);
    setDeleteTarget(null);
    load();
  };

  const handleToggle = async (plugin: Plugin) => {
    await pluginService.togglePlugin(id!, plugin.id, plugin.status !== 'enabled');
    toast.success(`${plugin.name} ${plugin.status === 'enabled' ? 'disabled' : 'enabled'}`);
    load();
  };

  const items: (Plugin | Mod)[] = isModServer ? mods : plugins;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <p className="text-xs text-muted-foreground">{items.length} {label.toLowerCase()} installed</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 w-8 px-0" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
          <label>
            <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" asChild>
              <span><Upload className="w-3.5 h-3.5" /> Upload {label === 'Plugins' ? 'Plugin' : 'Mod'}</span>
            </Button>
            <input type="file" accept=".jar" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded overflow-hidden">
        {loading ? (
          <LoadingState message={`Loading ${label.toLowerCase()}…`} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title={`No ${label.toLowerCase()} installed`}
            description={`Upload a .jar file to add ${label === 'Plugins' ? 'plugins' : 'mods'} to this server`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Version</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">File</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Size</th>
                  {!isModServer && <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>}
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const p = item as Plugin;
                  return (
                    <tr key={p.id ?? item.filename} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.version}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">{item.filename}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.size ? formatBytes(item.size) : '—'}</td>
                      {!isModServer && (
                        <td className="px-4 py-2.5">
                          <button onClick={() => handleToggle(p)} className="flex items-center gap-1.5">
                            {p.status === 'enabled' ? (
                              <><ToggleRight className="w-5 h-5 text-primary" /><span className="text-primary text-[10px]">Enabled</span></>
                            ) : (
                              <><ToggleLeft className="w-5 h-5 text-muted-foreground" /><span className="text-muted-foreground text-[10px]">Disabled</span></>
                            )}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5">
                          <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => pluginService.downloadPlugin(id!, item.filename)}>
                            <Download className="w-3 h-3" />
                          </Button>
                          {!isModServer && (
                            <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => {}}>
                              <Upload className="w-3 h-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 w-6 px-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Marketplace notice */}
      <div className="bg-muted/30 border border-border rounded p-3 text-xs text-muted-foreground">
        <Package className="w-3.5 h-3.5 inline mr-1.5" />
        Plugin/mod marketplace integration can be connected by replacing the plugin service adapter.
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description="This will permanently remove the file from the server."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}
