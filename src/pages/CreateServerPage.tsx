import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Server, Cpu, Gamepad2, RefreshCw, Package } from 'lucide-react';
import { Layout } from '@/layouts/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { cn } from '@/utils';
import { serverService, softwareCatalogService } from '@/services';
import { toast } from 'sonner';
import type { Difficulty, GameMode, InstallableServerSoftware, SoftwareBuild, SoftwareCatalog } from '@/types';

const STEPS = [
  { id: 1, label: 'Software', icon: Server },
  { id: 2, label: 'Minecraft', icon: Gamepad2 },
  { id: 3, label: 'Build', icon: Package },
  { id: 4, label: 'Runtime', icon: Cpu },
  { id: 5, label: 'Review', icon: Check },
];

const JAVA_VERSIONS = ['Java 21 (LTS)', 'Java 17 (LTS)', 'Java 11', 'Java 8'];
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

interface WizardState {
  serverName: string;
  serverType: InstallableServerSoftware;
  minecraftVersion: string;
  softwareBuild: string;
  javaVersion: string;
  ram: number;
  port: number;
  maxPlayers: number;
  gamemode: GameMode;
  difficulty: Difficulty;
  crackedMode: boolean;
  whitelist: boolean;
  allowFlight: boolean;
  pvp: boolean;
  commandBlocks: boolean;
  viewDistance: number;
  simulationDistance: number;
}

const DEFAULTS: WizardState = {
  serverName: '',
  serverType: 'Paper',
  minecraftVersion: '',
  softwareBuild: '',
  javaVersion: 'Java 21 (LTS)',
  ram: 4096,
  port: 25565,
  maxPlayers: 20,
  gamemode: 'survival',
  difficulty: 'normal',
  crackedMode: false,
  whitelist: false,
  allowFlight: false,
  pvp: true,
  commandBlocks: false,
  viewDistance: 10,
  simulationDistance: 10,
};

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-10 h-5 rounded-full transition-colors shrink-0',
        checked ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
        checked && 'translate-x-5'
      )} />
    </button>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function CreateServerPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(DEFAULTS);
  const [creating, setCreating] = useState(false);
  const [catalog, setCatalog] = useState<SoftwareCatalog | null>(null);
  const [builds, setBuilds] = useState<SoftwareBuild[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [buildsLoading, setBuildsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const provider = useMemo(() => catalog?.providers.find((item) => item.software === state.serverType), [catalog, state.serverType]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    softwareCatalogService.getCatalog().then((next) => {
      if (!active) return;
      setCatalog(next); setCatalogError('');
    }).catch((error: Error) => { if (active) setCatalogError(error.message || 'Version catalog could not be loaded'); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const firstVersion = provider?.versions[0]?.id ?? '';
    if (!provider || provider.versions.some((version) => version.id === state.minecraftVersion)) return;
    setState((previous) => ({ ...previous, minecraftVersion: firstVersion, softwareBuild: '' }));
  }, [provider, state.minecraftVersion]);

  useEffect(() => {
    if (!state.minecraftVersion) { setBuilds([]); return; }
    let active = true;
    setBuildsLoading(true); setBuilds([]);
    softwareCatalogService.getBuilds(state.serverType, state.minecraftVersion).then((next) => {
      if (!active) return;
      setBuilds(next);
      const preferred = next.find((build) => build.stable) ?? next[0];
      setState((previous) => ({ ...previous, softwareBuild: preferred?.id ?? '' }));
    }).catch((error: Error) => {
      if (active) { setBuilds([]); setState((previous) => ({ ...previous, softwareBuild: '' })); setCatalogError(error.message || 'Builds could not be loaded'); }
    }).finally(() => { if (active) setBuildsLoading(false); });
    return () => { active = false; };
  }, [state.serverType, state.minecraftVersion]);

  const set = (key: keyof WizardState) => (val: string | number | boolean) =>
    setState(prev => ({ ...prev, [key]: val }));

  const canAdvance = (): boolean => {
    if (step === 1) return state.serverName.trim().length > 0 && Boolean(provider?.versions.length);
    if (step === 2) return Boolean(state.minecraftVersion);
    if (step === 3) return Boolean(state.softwareBuild) && !buildsLoading;
    if (step === 4) return state.ram >= 512 && state.port >= 1 && state.port <= 65535;
    return true;
  };

  const handleRefresh = async () => {
    setCatalogLoading(true); setCatalogError('');
    try {
      const next = await softwareCatalogService.refresh(state.serverType, state.minecraftVersion || undefined);
      setCatalog(next);
      if (state.minecraftVersion) {
        const nextBuilds = await softwareCatalogService.getBuilds(state.serverType, state.minecraftVersion);
        setBuilds(nextBuilds);
        setState((previous) => ({ ...previous, softwareBuild: nextBuilds.find((build) => build.stable)?.id ?? nextBuilds[0]?.id ?? '' }));
      }
      toast.success('Server versions refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Version catalog could not be refreshed';
      setCatalogError(message); toast.error(message);
    } finally { setCatalogLoading(false); }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await serverService.createServer(state);
      toast.success(`Server "${state.serverName}" created successfully`);
      navigate('/servers');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create server');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => navigate('/servers/new')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div>
          <h1 className="text-lg font-bold text-foreground">Create New Server</h1>
          <p className="text-xs text-muted-foreground">Configure your Minecraft server</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground' :
                  done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {done ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                  <span className="hidden md:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('flex-1 h-px w-4', done ? 'bg-primary/40' : 'bg-border')} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-card border border-border rounded p-5 space-y-4">
          {step === 1 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-1">Software</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Server Name *</Label>
                  <Input
                    placeholder="e.g. DARK CRAFT"
                    value={state.serverName}
                    onChange={e => set('serverName')(e.target.value)}
                    className="bg-input"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Server Software</Label>
                    <Select value={state.serverType} onValueChange={(value) => set('serverType')(value as InstallableServerSoftware)} disabled={catalogLoading}>
                      <SelectTrigger className="bg-input h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalog?.providers ?? []).map((item) => <SelectItem key={item.software} value={item.software}>{item.software}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="secondary" onClick={handleRefresh} disabled={catalogLoading} className="h-9 w-full">
                      <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', catalogLoading && 'animate-spin')} /> Refresh Versions
                    </Button>
                  </div>
                </div>
                {catalogError && <p role="alert" className="text-xs text-destructive">{catalogError}</p>}
                {provider?.error && <p role="alert" className="text-xs text-destructive">{provider.error}</p>}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-1">Minecraft Version</h2>
              <div>
                    <Label className="text-xs mb-1.5 block">Minecraft Version</Label>
                    <Select value={state.minecraftVersion} onValueChange={set('minecraftVersion')}>
                      <SelectTrigger className="bg-input h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(provider?.versions ?? []).map((version) => <SelectItem key={version.id} value={version.id}>{version.id}{version.stable ? '' : ' (unstable)'}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Available versions from the official {state.serverType} metadata service</p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-1">Build / Loader Version</h2>
              <div>
                <Label className="text-xs mb-1.5 block">{state.serverType === 'Fabric' ? 'Fabric Loader' : state.serverType === 'Vanilla' ? 'Release' : 'Software Build'}</Label>
                <Select value={state.softwareBuild} onValueChange={set('softwareBuild')} disabled={buildsLoading || builds.length === 0}>
                  <SelectTrigger className="bg-input h-9"><SelectValue placeholder={buildsLoading ? 'Loading builds…' : 'Select a build'} /></SelectTrigger>
                  <SelectContent>{builds.map((build) => <SelectItem key={build.id} value={build.id}>{build.label}{build.stable ? '' : ' (unstable)'}</SelectItem>)}</SelectContent>
                </Select>
                {!buildsLoading && builds.length === 0 && <p role="alert" className="text-xs text-destructive mt-1">No compatible build was reported for this Minecraft version.</p>}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-1">Runtime & Resources</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Java Version</Label>
                  <Select value={state.javaVersion} onValueChange={set('javaVersion')}>
                    <SelectTrigger className="bg-input h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JAVA_VERSIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">RAM Allocation (MB)</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={state.ram}
                      onChange={e => set('ram')(Number(e.target.value))}
                      step={512}
                      min={512}
                      max={65536}
                      className="bg-input max-w-36"
                    />
                    <span className="text-xs text-muted-foreground">= {(state.ram / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[1024, 2048, 4096, 8192].map(v => (
                      <button
                        key={v}
                        onClick={() => set('ram')(v)}
                        className={cn(
                          'px-2 py-0.5 rounded text-xs border transition-colors',
                          state.ram === v ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-border/80'
                        )}
                      >
                        {v / 1024}GB
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Server Port</Label>
                  <Input type="number" value={state.port} onChange={e => set('port')(Number(e.target.value))} min={1} max={65535} className="bg-input max-w-32" />
                </div>
                <div className="pt-2 border-t border-border/50">
                  <h3 className="text-xs font-semibold text-foreground mb-1">Game Settings</h3>
                  <div className="space-y-0">
                    <SettingRow label="Max Players"><Input type="number" value={state.maxPlayers} onChange={e => set('maxPlayers')(Number(e.target.value))} className="bg-input h-8 w-20 text-xs" /></SettingRow>
                    <SettingRow label="Gamemode"><Select value={state.gamemode} onValueChange={(value) => set('gamemode')(value as GameMode)}><SelectTrigger className="bg-input h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{GAMEMODES.map(g => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}</SelectContent></Select></SettingRow>
                    <SettingRow label="Difficulty"><Select value={state.difficulty} onValueChange={(value) => set('difficulty')(value as Difficulty)}><SelectTrigger className="bg-input h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent></Select></SettingRow>
                    <SettingRow label="Cracked Mode" sub="Allows non-premium accounts (online-mode=false)"><ToggleSwitch checked={state.crackedMode} onChange={set('crackedMode') as (v: boolean) => void} /></SettingRow>
                    <SettingRow label="Whitelist"><ToggleSwitch checked={state.whitelist} onChange={set('whitelist') as (v: boolean) => void} /></SettingRow>
                    <SettingRow label="PvP"><ToggleSwitch checked={state.pvp} onChange={set('pvp') as (v: boolean) => void} /></SettingRow>
                    <SettingRow label="Allow Flight"><ToggleSwitch checked={state.allowFlight} onChange={set('allowFlight') as (v: boolean) => void} /></SettingRow>
                    <SettingRow label="Command Blocks"><ToggleSwitch checked={state.commandBlocks} onChange={set('commandBlocks') as (v: boolean) => void} /></SettingRow>
                    <SettingRow label="View Distance"><Input type="number" value={state.viewDistance} onChange={e => set('viewDistance')(Number(e.target.value))} className="bg-input h-8 w-16 text-xs" min={2} max={32} /></SettingRow>
                    <SettingRow label="Simulation Distance"><Input type="number" value={state.simulationDistance} onChange={e => set('simulationDistance')(Number(e.target.value))} className="bg-input h-8 w-16 text-xs" min={2} max={32} /></SettingRow>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-3">Configuration Summary</h2>
              <div className="space-y-0 text-sm divide-y divide-border/50">
                {[
                  { label: 'Server Name', value: state.serverName },
                  { label: 'Type', value: state.serverType },
                  { label: 'Minecraft Version', value: state.minecraftVersion },
                  { label: state.serverType === 'Fabric' ? 'Loader' : 'Build', value: state.softwareBuild },
                  { label: 'Java', value: state.javaVersion },
                  { label: 'RAM', value: `${state.ram} MB (${(state.ram / 1024).toFixed(1)} GB)` },
                  { label: 'Port', value: state.port },
                  { label: 'Max Players', value: state.maxPlayers },
                  { label: 'Gamemode', value: state.gamemode },
                  { label: 'Difficulty', value: state.difficulty },
                  { label: 'Cracked Mode', value: state.crackedMode ? 'Enabled (online-mode=false)' : 'Disabled' },
                  { label: 'Whitelist', value: state.whitelist ? 'Enabled' : 'Disabled' },
                  { label: 'PvP', value: state.pvp ? 'Enabled' : 'Disabled' },
                  { label: 'Allow Flight', value: state.allowFlight ? 'Enabled' : 'Disabled' },
                  { label: 'Command Blocks', value: state.commandBlocks ? 'Enabled' : 'Disabled' },
                  { label: 'View Distance', value: `${state.viewDistance} chunks` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1.5 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
            </Button>
          ) : <div />}
          {step < 5 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>
              Next <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Server'}
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
