import { useParams } from 'react-router-dom';
import {
  Cpu, MemoryStick, HardDrive, Activity, Users, Clock,
  Zap, Network, Info, Terminal
} from 'lucide-react';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { useServer } from '@/hooks/useServers';
import { useActivity } from '@/hooks/useGlobal';
import { formatBytes, formatUptime, formatTimeAgo, cn } from '@/utils';

function StatTile({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('text-muted-foreground', color)}>{icon}</span>
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-bold text-foreground', color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0 text-xs">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-foreground font-mono break-all">{value}</span>
    </div>
  );
}

export default function ServerOverviewTab() {
  const { id } = useParams<{ id: string }>();
  const { server, stats } = useServer(id!);
  const { activity } = useActivity();
  const serverActivity = activity.filter(e => e.serverId === id).slice(0, 5);

  if (!server) return null;
  const isOnline = server.status === 'ONLINE';

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Live stats */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Live Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="CPU"
            value={isOnline && stats ? `${stats.cpu.toFixed(0)}%` : '—'}
            sub={isOnline && stats ? undefined : 'Server offline'}
            icon={<Cpu className="w-4 h-4" />}
            color={stats && stats.cpu > 80 ? 'text-red-400' : stats && stats.cpu > 60 ? 'text-yellow-400' : undefined}
          />
          <StatTile
            label="RAM"
            value={isOnline && stats ? formatBytes(stats.ram * 1024 * 1024) : '—'}
            sub={isOnline && stats ? `/ ${formatBytes(stats.ramMax * 1024 * 1024)}` : undefined}
            icon={<MemoryStick className="w-4 h-4" />}
          />
          <StatTile
            label="Players"
            value={isOnline ? `${server.playerCount}/${server.maxPlayers}` : '—'}
            icon={<Users className="w-4 h-4" />}
            color={server.playerCount > 0 ? 'text-primary' : undefined}
          />
          <StatTile
            label="Uptime"
            value={isOnline ? formatUptime(server.uptime) : '—'}
            icon={<Clock className="w-4 h-4" />}
          />
        </div>
        {isOnline && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <StatTile
              label="TPS"
              value={stats.tps.toFixed(1)}
              sub="target: 20"
              icon={<Zap className="w-4 h-4" />}
              color={stats.tps < 18 ? 'text-yellow-400' : stats.tps < 15 ? 'text-red-400' : 'text-primary'}
            />
            <StatTile
              label="MSPT"
              value={`${stats.mspt.toFixed(1)}ms`}
              sub="target: <50ms"
              icon={<Activity className="w-4 h-4" />}
            />
            <StatTile
              label="Net In"
              value={formatBytes(stats.networkIn * 1024) + '/s'}
              icon={<Network className="w-4 h-4" />}
            />
            <StatTile
              label="Disk"
              value={formatBytes(server.disk * 1024 * 1024)}
              sub={`/ ${formatBytes(server.diskMax * 1024 * 1024)}`}
              icon={<HardDrive className="w-4 h-4" />}
            />
          </div>
        )}
        {isOnline && stats && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Cpu className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-8 shrink-0">CPU</span>
              <ProgressBar value={stats.cpu} className="flex-1" />
              <span className="text-foreground w-10 text-right">{stats.cpu.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <MemoryStick className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-8 shrink-0">RAM</span>
              <ProgressBar value={stats.ram} max={stats.ramMax} className="flex-1" />
              <span className="text-foreground w-10 text-right">{((stats.ram / stats.ramMax) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <HardDrive className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-8 shrink-0">Disk</span>
              <ProgressBar value={server.disk} max={server.diskMax} className="flex-1" />
              <span className="text-foreground w-10 text-right">{((server.disk / server.diskMax) * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Info panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Server information */}
        <div className="bg-card border border-border rounded p-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Server Information
          </h2>
          <div>
            <InfoRow label="Server Name" value={server.name} />
            <InfoRow label="Address" value={`${server.ip}:${server.port}`} />
            <InfoRow label="Minecraft Version" value={server.minecraftVersion} />
            <InfoRow label="Server Software" value={server.software} />
            <InfoRow label="Java Version" value={server.javaVersion} />
            <InfoRow label="Process Status" value={server.status} />
            {server.pid && <InfoRow label="PID" value={String(server.pid)} />}
          </div>
        </div>

        {/* System details */}
        <div className="bg-card border border-border rounded p-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" /> System Details
          </h2>
          <div>
            <InfoRow label="Server Directory" value={server.directory} />
            <InfoRow label="Startup Command" value={server.startupCommand} />
          </div>

          {/* Recent activity */}
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Recent Activity
          </h2>
          {serverActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent activity</p>
          ) : (
            <div className="space-y-1.5">
              {serverActivity.map(e => (
                <div key={e.id} className="flex items-start gap-2 text-xs">
                  <span className="text-primary mt-0.5">·</span>
                  <span className="text-foreground flex-1">{e.event}</span>
                  <span className="text-muted-foreground text-[10px] shrink-0">{formatTimeAgo(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
