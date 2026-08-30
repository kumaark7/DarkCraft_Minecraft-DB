import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Server, Cpu, Gamepad2 } from 'lucide-react';
import { Layout } from '@/layouts/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { cn } from '@/utils';
import { serverService } from '@/services';
import { toast } from 'sonner';

const STEPS = [
  { id: 1, label: 'Basic', icon: Server },
  { id: 2, label: 'Runtime', icon: Cpu },
  { id: 3, label: 'Game', icon: Gamepad2 },
  { id: 4, label: 'Review', icon: Check },
];

const SERVER_TYPES = ['Vanilla', 'Paper', 'Purpur', 'Fabric', 'Forge', 'NeoForge'];
const MC_VERSIONS = ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5'];
const JAVA_VERSIONS = ['Java 21 (LTS)', 'Java 17 (LTS)', 'Java 11', 'Java 8'];
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

interface WizardState {
  serverName: string;
  serverType: string;
  minecraftVersion: string;
  javaVersion: string;
  ram: number;
  port: number;
  maxPlayers: number;
  gamemode: string;
  difficulty: string;
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
  minecraftVersion: '1.21.4',
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

  const set = (key: keyof WizardState) => (val: string | number | boolean) =>
    setState(prev => ({ ...prev, [key]: val }));

  const canAdvance = (): boolean => {
    if (step === 1) return state.serverName.trim().length > 0;
    return true;
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await serverService.createServer(state as any);
      toast.success(`Server "${state.serverName}" created successfully`);
      navigate('/servers');
    } catch {
      toast.error('Failed to create server');
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
              <h2 className="text-sm font-semibold text-foreground mb-1">Basic Configuration</h2>
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
                    <Label className="text-xs mb-1.5 block">Server Type</Label>
                    <Select value={state.serverType} onValueChange={set('serverType')}>
                      <SelectTrigger className="bg-input h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Minecraft Version</Label>
                    <Select value={state.minecraftVersion} onValueChange={set('minecraftVersion')}>
                      <SelectTrigger className="bg-input h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MC_VERSIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Available versions provided by backend</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Server Port</Label>
                  <Input
                    type="number"
                    value={state.port}
                    onChange={e => set('port')(Number(e.target.value))}
                    className="bg-input max-w-32"
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
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
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-1">Game Settings</h2>
              <div className="space-y-0">
                <SettingRow label="Max Players">
                  <Input type="number" value={state.maxPlayers} onChange={e => set('maxPlayers')(Number(e.target.value))} className="bg-input h-8 w-20 text-xs" />
                </SettingRow>
                <SettingRow label="Gamemode">
                  <Select value={state.gamemode} onValueChange={set('gamemode')}>
                    <SelectTrigger className="bg-input h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAMEMODES.map(g => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow label="Difficulty">
                  <Select value={state.difficulty} onValueChange={set('difficulty')}>
                    <SelectTrigger className="bg-input h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow label="Cracked Mode" sub="Allows non-premium accounts (online-mode=false)">
                  <ToggleSwitch checked={state.crackedMode} onChange={set('crackedMode') as (v: boolean) => void} />
                </SettingRow>
                <SettingRow label="Whitelist">
                  <ToggleSwitch checked={state.whitelist} onChange={set('whitelist') as (v: boolean) => void} />
                </SettingRow>
                <SettingRow label="PvP">
                  <ToggleSwitch checked={state.pvp} onChange={set('pvp') as (v: boolean) => void} />
                </SettingRow>
                <SettingRow label="Allow Flight">
                  <ToggleSwitch checked={state.allowFlight} onChange={set('allowFlight') as (v: boolean) => void} />
                </SettingRow>
                <SettingRow label="Command Blocks">
                  <ToggleSwitch checked={state.commandBlocks} onChange={set('commandBlocks') as (v: boolean) => void} />
                </SettingRow>
                <SettingRow label="View Distance">
                  <Input type="number" value={state.viewDistance} onChange={e => set('viewDistance')(Number(e.target.value))} className="bg-input h-8 w-16 text-xs" min={2} max={32} />
                </SettingRow>
                <SettingRow label="Simulation Distance">
                  <Input type="number" value={state.simulationDistance} onChange={e => set('simulationDistance')(Number(e.target.value))} className="bg-input h-8 w-16 text-xs" min={2} max={32} />
                </SettingRow>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-3">Configuration Summary</h2>
              <div className="space-y-0 text-sm divide-y divide-border/50">
                {[
                  { label: 'Server Name', value: state.serverName },
                  { label: 'Type', value: state.serverType },
                  { label: 'Minecraft Version', value: state.minecraftVersion },
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
          {step < 4 ? (
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
