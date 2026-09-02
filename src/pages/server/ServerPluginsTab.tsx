import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Download, Trash2, RefreshCw, Package, ToggleLeft, ToggleRight, AlertTriangle, Eye, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/shared/States';
import { pluginService } from '@/services';
import { ModrinthBrowser } from '@/components/server/ModrinthBrowser';
import { cn, formatBytes } from '@/utils';
import { useServer } from '@/hooks/useServers';
import { toast } from 'sonner';
import type { Plugin, Mod, ModIssue } from '@/types';

function modStatusColor(status: Mod['status']): string {
  if (status === 'Active') return 'text-primary';
  if (status === 'Disabled' || status === 'Unknown') return 'text-muted-foreground';
  return 'text-yellow-400';
}

export default function ServerPluginsTab() {
  const { id } = useParams<{ id: string }>();
  const { server } = useServer(id!);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Plugin | null>(null);
  const [issues, setIssues] = useState<ModIssue[]>([]);
  const [visibleIssue, setVisibleIssue] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<{ issue: ModIssue; mod: Mod } | null>(null);

  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server?.software ?? '');
  const label = isModServer ? 'Mods' : 'Plugins';

  const load = useCallback(async () => {
    setLoading(true);
    if (isModServer) {
      const [data, detectedIssues] = await Promise.all([pluginService.getMods(id!), pluginService.getModIssues(id!)]);
      setMods(data);
      setIssues(detectedIssues);
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
    if (isModServer) await pluginService.uploadMod(id!, file);
    else await pluginService.uploadPlugin(id!, file);
    toast.success(`${file.name} uploaded${isModServer ? '; restart the server to activate it' : ''}`);
    load();
    e.target.value = '';
  };

  const handleDelete = async (plugin: Plugin) => {
    if (isModServer) await pluginService.deleteMod(id!, plugin.filename);
    else await pluginService.deletePlugin(id!, plugin.id);
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
  const modForIssue = (issue: ModIssue) => mods.find((mod) => mod.id.toLowerCase() === issue.modId.toLowerCase()
    || mod.name.toLowerCase() === issue.modId.toLowerCase());

  const disableMod = async () => {
    if (!disableTarget) return;
    await pluginService.toggleMod(id!, disableTarget.mod.filename, false);
    toast.success(`${disableTarget.mod.name} disabled; restart the server to apply the change`);
    setDisableTarget(null);
    await load();
  };

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
                  {isModServer && <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Loader</th>}
                  {isModServer && <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Minecraft</th>}
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">File</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Size</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const p = item as Plugin;
                  const mod = item as Mod;
                  return (
                    <tr key={p.id ?? item.filename} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.version}</td>
                      {isModServer && <td className="px-4 py-2.5 text-muted-foreground">{mod.loader ?? 'Unknown'}</td>}
                      {isModServer && <td className="px-4 py-2.5 text-muted-foreground font-mono">{mod.minecraftCompatibility ?? 'Unknown'}</td>}
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">{item.filename}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.size ? formatBytes(item.size) : '—'}</td>
                      <td className="px-4 py-2.5">
                        {isModServer ? (
                          <span title={mod.inspectionError} className={cn('text-[10px] font-medium', modStatusColor(mod.status))}>{mod.status}</span>
                        ) : (
                          <button onClick={() => handleToggle(p)} className="flex items-center gap-1.5">
                            {p.status === 'enabled' ? (
                              <><ToggleRight className="w-5 h-5 text-primary" /><span className="text-primary text-[10px]">Enabled</span></>
                            ) : (
                              <><ToggleLeft className="w-5 h-5 text-muted-foreground" /><span className="text-muted-foreground text-[10px]">Disabled</span></>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5">
                          <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => isModServer ? pluginService.downloadMod(id!, item.filename) : pluginService.downloadPlugin(id!, item.filename)}>
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

      {isModServer && (
        <section className="bg-card border border-border rounded overflow-hidden" aria-labelledby="mod-issues-title">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 id="mod-issues-title" className="text-xs font-semibold text-foreground flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-yellow-400" /> Mod Issues</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Runtime diagnostics associated only when the log provides strong mod evidence</p>
            </div>
            <span className="text-[10px] text-muted-foreground">{issues.filter((issue) => issue.status === 'active').length} active</span>
          </div>
          {issues.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No mod-specific runtime issues detected.</p> : (
            <div className="divide-y divide-border/50">
              {issues.map((issue) => {
                const mod = modForIssue(issue);
                const expanded = visibleIssue === issue.id;
                return <div key={issue.id} className="p-3 md:p-4 text-xs">
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{mod?.name ?? issue.modName} <span className="font-mono text-muted-foreground">({issue.modId})</span></span>
                        <span className={cn('text-[10px] font-medium', issue.severity === 'Error' ? 'text-red-400' : issue.severity === 'Recommendation' ? 'text-blue-400' : 'text-yellow-400')}>{issue.severity}</span>
                        {issue.status === 'resolved' && <span className="text-[10px] text-primary">Resolved</span>}
                        {issue.status === 'not-seen' && <span className="text-[10px] text-muted-foreground">Historical · not seen this startup</span>}
                      </div>
                      <p className="text-muted-foreground mt-1">{issue.reason}</p>
                      {issue.affectedResource && <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all">Resource: {issue.affectedResource}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">First: {new Date(issue.firstDetectedAt).toLocaleString()} · Last: {new Date(issue.lastDetectedAt).toLocaleString()} · Occurrences: {issue.occurrenceCount}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => setVisibleIssue(expanded ? null : issue.id)}><Eye className="w-3 h-3" /> View Log</Button>
                      {mod && mod.status !== 'Disabled' && <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={() => setDisableTarget({ issue, mod })}><Power className="w-3 h-3" /> Disable Mod</Button>}
                    </div>
                  </div>
                  {expanded && <div className="mt-3 bg-background border border-border rounded p-2 overflow-x-auto">
                    {issue.exception && <p className="text-red-300 font-mono whitespace-pre-wrap break-words mb-2">{issue.exception}</p>}
                    {issue.sourceLogLines.map((line, index) => <pre key={`${issue.id}-${index}`} className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words">{line}</pre>)}
                  </div>}
                </div>;
              })}
            </div>
          )}
        </section>
      )}

      {server && <ModrinthBrowser key={server.id + ':' + server.software + ':' + server.minecraftVersion} serverId={id!} software={server.software} minecraftVersion={server.minecraftVersion} onInstalled={load} />}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description="This will permanently remove the file from the server."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
      <ConfirmDialog
        open={!!disableTarget}
        onOpenChange={open => { if (!open) setDisableTarget(null); }}
        title={`Disable ${disableTarget?.mod.name ?? 'mod'}?`}
        description="This renames the mod JAR to .disabled. Restart the Minecraft server to apply the change. The mod is not deleted."
        confirmLabel="Disable Mod"
        destructive
        onConfirm={disableMod}
      />
    </div>
  );
}
