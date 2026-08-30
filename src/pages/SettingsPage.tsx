import { useState } from 'react';
import { Layout } from '@/layouts/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Save, Settings2, Cpu, Archive, FileText, Bell } from 'lucide-react';
import { toast } from 'sonner';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function SettingField({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-border/40 last:border-0">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const TIMEZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney'];

export default function SettingsPage() {
  const [dashName, setDashName] = useState('NETHERCRAFT');
  const [timezone, setTimezone] = useState('UTC');
  const [defaultDir, setDefaultDir] = useState('/servers');
  const [defaultJava, setDefaultJava] = useState('Java 21 (LTS)');
  const [defaultRam, setDefaultRam] = useState('4096');
  const [defaultPort, setDefaultPort] = useState('25565');
  const [backupDir, setBackupDir] = useState('/backups');
  const [retention, setRetention] = useState('10');

  const handleSave = () => {
    toast.success('Settings saved');
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 animate-fade-in">
        <div>
          <h1 className="text-lg font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">Dashboard-wide configuration</p>
        </div>

        <div className="space-y-4 max-w-2xl">
          {/* General */}
          <Section icon={<Settings2 className="w-4 h-4" />} title="General">
            <SettingField label="Dashboard Name">
              <Input value={dashName} onChange={e => setDashName(e.target.value)} className="bg-input h-8 text-xs w-40" />
            </SettingField>
            <SettingField label="Timezone">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="bg-input h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </SettingField>
          </Section>

          {/* Minecraft defaults */}
          <Section icon={<Cpu className="w-4 h-4" />} title="Minecraft Defaults">
            <SettingField label="Default Server Directory" sub="Where new servers are created">
              <Input value={defaultDir} onChange={e => setDefaultDir(e.target.value)} className="bg-input h-8 text-xs w-40 font-mono" />
            </SettingField>
            <SettingField label="Default Java Version">
              <Input value={defaultJava} onChange={e => setDefaultJava(e.target.value)} className="bg-input h-8 text-xs w-40" />
            </SettingField>
            <SettingField label="Default RAM (MB)">
              <Input type="number" value={defaultRam} onChange={e => setDefaultRam(e.target.value)} className="bg-input h-8 text-xs w-24" step={512} />
            </SettingField>
            <SettingField label="Default Port">
              <Input type="number" value={defaultPort} onChange={e => setDefaultPort(e.target.value)} className="bg-input h-8 text-xs w-24" />
            </SettingField>
          </Section>

          {/* Backups */}
          <Section icon={<Archive className="w-4 h-4" />} title="Backups">
            <SettingField label="Backup Directory">
              <Input value={backupDir} onChange={e => setBackupDir(e.target.value)} className="bg-input h-8 text-xs w-40 font-mono" />
            </SettingField>
            <SettingField label="Default Retention" sub="Keep this many backups per server">
              <Select value={retention} onValueChange={setRetention}>
                <SelectTrigger className="bg-input h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 backups</SelectItem>
                  <SelectItem value="10">10 backups</SelectItem>
                  <SelectItem value="20">20 backups</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </SettingField>
          </Section>

          {/* Logging */}
          <Section icon={<FileText className="w-4 h-4" />} title="Logging">
            <SettingField label="Dashboard Console Retention" sub="How long the dashboard retains console history per server">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary">3 Days</span>
                <span className="text-xs text-muted-foreground">(72 hours)</span>
              </div>
            </SettingField>
            <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2.5">
              The dashboard retains up to 72 hours of console history per server. Older history is automatically removed.
              Individual Minecraft server logs remain in <code className="font-mono text-xs">server/logs/</code> and are managed by Minecraft directly.
            </p>
          </Section>

          {/* Notifications */}
          <Section icon={<Bell className="w-4 h-4" />} title="Notification Categories">
            <p className="text-xs text-muted-foreground mb-2">External integrations (Telegram, Discord, webhooks) are configured via your backend.</p>
            {['Server Crashes', 'Server Starts/Stops', 'High Resource Usage', 'Low Disk Space', 'Backup Events', 'Scheduled Task Failures'].map(cat => (
              <SettingField key={cat} label={cat}>
                <button className="w-8 h-4 bg-primary rounded-full relative" aria-label={`toggle ${cat}`}>
                  <span className="absolute top-0 left-0 w-4 h-4 bg-white rounded-full translate-x-4 transition-transform" />
                </button>
              </SettingField>
            ))}
          </Section>

          <div className="flex justify-end">
            <Button className="gap-1.5" onClick={handleSave}>
              <Save className="w-4 h-4" /> Save Settings
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
