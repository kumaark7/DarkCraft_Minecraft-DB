import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Save, RotateCcw, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { LoadingState } from '@/components/shared/States';
import { serverService } from '@/services';
import { cn } from '@/utils';
import { toast } from 'sonner';
import type { ServerSettings } from '@/types';

const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-card border border-border rounded">
      <button
        className={cn('w-full flex items-center justify-between px-4 py-3 border-b border-border', !open && 'border-0')}
        onClick={() => collapsible && setOpen(o => !o)}
        disabled={!collapsible}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-primary' : 'bg-muted', disabled && 'opacity-50 cursor-not-allowed')}
    >
      <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

function SettingRow({ label, sub, restart, children }: { label: string; sub?: string; restart?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        {restart && (
          <p className="text-[10px] text-yellow-400 flex items-center gap-0.5 mt-0.5">
            <AlertTriangle className="w-3 h-3" /> Requires restart
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function ServerSettingsTab() {
  const { id } = useParams<{ id: string }>();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawProps, setRawProps] = useState('');
  const [rawDirty, setRawDirty] = useState(false);

  useEffect(() => {
    serverService.getServerSettings(id!).then(s => {
      if (s) {
        setSettings(s);
        setRawProps(buildRawProps(s));
      }
      setLoading(false);
    });
  }, [id]);

  const buildRawProps = (s: ServerSettings) => [
    `server-name=${s.serverName}`,
    `motd=${s.motd}`,
    `server-port=${s.serverPort}`,
    `max-players=${s.maxPlayers}`,
    `online-mode=${!s.crackedMode}`,
    `white-list=${s.whitelist}`,
    `pvp=${s.pvp}`,
    `enable-command-block=${s.commandBlocks}`,
    `allow-flight=${s.allowFlight}`,
    `gamemode=${s.gamemode}`,
    `difficulty=${s.difficulty}`,
    `hardcore=${s.hardcore ?? false}`,
    `spawn-animals=${s.spawnAnimals ?? true}`,
    `spawn-monsters=${s.spawnMonsters ?? true}`,
    `spawn-npcs=${s.spawnNpcs ?? true}`,
    `spawn-protection=${s.spawnProtection ?? 16}`,
    `view-distance=${s.viewDistance}`,
    `simulation-distance=${s.simulationDistance}`,
  ].join('\n');

  const set = (key: keyof ServerSettings) => (val: string | number | boolean) => {
    setSettings(prev => prev ? { ...prev, [key]: val } : null);
    setDirty(true);
  };

  const handleSave = async (restart = false) => {
    if (!settings) return;
    setSaving(true);
    await serverService.updateServerSettings(id!, settings);
    toast.success(restart ? 'Settings saved. Server is restarting…' : 'Settings saved');
    setDirty(false);
    setSaving(false);
  };

  const handleRawSave = () => {
    toast.success('Raw properties saved');
    setRawDirty(false);
  };

  if (loading) return <LoadingState message="Loading settings…" />;
  if (!settings) return <div className="p-4 text-muted-foreground">Failed to load settings</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* General */}
      <Section title="General">
        <SettingRow label="Server Name" restart>
          <Input value={settings.serverName} onChange={e => set('serverName')(e.target.value)} className="bg-input h-8 text-xs w-48 md:w-64" />
        </SettingRow>
        <SettingRow label="MOTD" sub="Message shown in server list">
          <Input value={settings.motd} onChange={e => set('motd')(e.target.value)} className="bg-input h-8 text-xs w-48 md:w-64" />
        </SettingRow>
        <SettingRow label="Server Port" restart>
          <Input type="number" value={settings.serverPort} onChange={e => set('serverPort')(Number(e.target.value))} className="bg-input h-8 text-xs w-24" />
        </SettingRow>
        <SettingRow label="Max Players">
          <Input type="number" value={settings.maxPlayers} onChange={e => set('maxPlayers')(Number(e.target.value))} className="bg-input h-8 text-xs w-20" min={1} max={1000} />
        </SettingRow>
      </Section>

      {/* Cracked mode */}
      <Section title="Access & Authentication">
        <div className="space-y-1">
          <SettingRow
            label="Cracked Mode"
            sub="Allows non-premium (offline/cracked) accounts to join"
          >
            <ToggleSwitch checked={settings.crackedMode} onChange={set('crackedMode') as (v: boolean) => void} />
          </SettingRow>
          {settings.crackedMode && (
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded p-3 text-xs text-yellow-400 mt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Security Warning</p>
                <p className="text-yellow-400/80">Cracked Mode sets <code className="font-mono">online-mode=false</code>. Player identities are NOT verified by Mojang. Anyone can join with any username. Use a whitelist or auth plugin for access control.</p>
              </div>
            </div>
          )}
        </div>
        <SettingRow label="Whitelist" sub="Only whitelisted players can join">
          <ToggleSwitch checked={settings.whitelist} onChange={set('whitelist') as (v: boolean) => void} />
        </SettingRow>
      </Section>

      {/* Gameplay */}
      <Section title="Gameplay">
        <SettingRow label="Gamemode" restart>
          <Select value={settings.gamemode} onValueChange={set('gamemode')}>
            <SelectTrigger className="bg-input h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{GAMEMODES.map(g => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}</SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="Difficulty">
          <Select value={settings.difficulty} onValueChange={set('difficulty')}>
            <SelectTrigger className="bg-input h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="PvP">
          <ToggleSwitch checked={settings.pvp} onChange={set('pvp') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Allow Flight">
          <ToggleSwitch checked={settings.allowFlight} onChange={set('allowFlight') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Command Blocks" restart>
          <ToggleSwitch checked={settings.commandBlocks} onChange={set('commandBlocks') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Hardcore" restart>
          <ToggleSwitch checked={settings.hardcore ?? false} onChange={set('hardcore') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Spawn Animals">
          <ToggleSwitch checked={settings.spawnAnimals ?? true} onChange={set('spawnAnimals') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Spawn Monsters">
          <ToggleSwitch checked={settings.spawnMonsters ?? true} onChange={set('spawnMonsters') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Spawn NPCs">
          <ToggleSwitch checked={settings.spawnNpcs ?? true} onChange={set('spawnNpcs') as (v: boolean) => void} />
        </SettingRow>
        <SettingRow label="Spawn Protection" sub="Block radius around spawn that non-ops cannot modify">
          <Input type="number" value={settings.spawnProtection ?? 16} onChange={e => set('spawnProtection')(Number(e.target.value))} className="bg-input h-8 text-xs w-16" min={0} max={100} />
        </SettingRow>
        <SettingRow label="View Distance (chunks)" restart>
          <Input type="number" value={settings.viewDistance} onChange={e => set('viewDistance')(Number(e.target.value))} className="bg-input h-8 text-xs w-16" min={2} max={32} />
        </SettingRow>
        <SettingRow label="Simulation Distance (chunks)" restart>
          <Input type="number" value={settings.simulationDistance} onChange={e => set('simulationDistance')(Number(e.target.value))} className="bg-input h-8 text-xs w-16" min={2} max={32} />
        </SettingRow>
      </Section>

      {/* Save controls */}
      {dirty && (
        <div className="bg-card border border-primary/20 rounded p-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" /> You have unsaved changes
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setDirty(false); }} className="h-8 text-xs">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Discard
            </Button>
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save Only
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={() => handleSave(true)} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save & Restart
            </Button>
          </div>
        </div>
      )}

      {/* Raw properties */}
      <Section title="Advanced / Raw Properties" collapsible>
        <p className="text-xs text-muted-foreground mb-2">
          Direct access to <code className="font-mono">server.properties</code>. Reflects the same settings as the GUI above.
        </p>
        <div className="relative">
          <Textarea
            value={rawProps}
            onChange={e => { setRawProps(e.target.value); setRawDirty(true); }}
            rows={20}
            className="font-mono text-xs bg-input resize-none"
            spellCheck={false}
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleRawSave} disabled={!rawDirty}>
            <Save className="w-3.5 h-3.5" /> Save Properties
          </Button>
        </div>
      </Section>
    </div>
  );
}
