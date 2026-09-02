import { useParams } from 'react-router-dom';
import {
  Cpu, MemoryStick, HardDrive, Activity, Users, Clock,
  Zap, Network, Info, Terminal
} from 'lucide-react';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { useServer } from '@/hooks/useServers';
import { useActivity } from '@/hooks/useGlobal';
import { formatBytes, formatUptime, formatTimeAgo, cn } from '@/utils';
import { useMetricHistory } from '@/hooks/useMetricHistory';
import { PerformanceHistoryGraph } from '@/components/server/PerformanceHistoryGraph';

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
  const metricHistory = useMetricHistory(id!);
  const serverActivity = activity.filter(e => e.serverId === id).slice(0, 5);

  if (!server) return null;
  const isOnline = server.status === 'ONLINE';
  const disk = stats?.disk ?? server.disk;
  const diskMax = stats?.diskMax ?? server.diskMax;

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Live stats */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Live Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="CPU"
            value={isOnline && stats?.cpu !== null && stats?.cpu !== undefined ? `${stats.cpu.toFixed(0)}%` : 'N/A'}
            sub={!isOnline ? 'Server offline' : stats?.cpu === null ? 'Unavailable' : undefined}
            icon={<Cpu className="w-4 h-4" />}
            color={stats?.cpu !== null && stats?.cpu !== undefined && stats.cpu > 80 ? 'text-red-400' : stats?.cpu !== null && stats?.cpu !== undefined && stats.cpu > 60 ? 'text-yellow-400' : undefined}
          />
          <StatTile
            label="RAM"
            value={isOnline && stats?.ram !== null && stats?.ram !== undefined ? formatBytes(stats.ram * 1024 * 1024) : 'N/A'}
            sub={isOnline && stats?.ram !== null && stats?.ram !== undefined ? `/ ${formatBytes(stats.ramMax * 1024 * 1024)}` : undefined}
            icon={<MemoryStick className="w-4 h-4" />}
          />
          <StatTile
            label="Players"
            value={isOnline ? `${server.playerCount}/${server.maxPlayers}` : 'N/A'}
            icon={<Users className="w-4 h-4" />}
            color={server.playerCount > 0 ? 'text-primary' : undefined}
          />
          <StatTile
            label="Uptime"
            value={isOnline ? formatUptime(server.uptime) : 'N/A'}
            icon={<Clock className="w-4 h-4" />}
          />
        </div>
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <StatTile
              label="TPS"
              value={stats.tps === null ? 'N/A' : stats.tps.toFixed(1)}
              sub={stats.tps === null ? 'Unavailable' : stats.tpsSource === 'spark-5s' ? 'Spark · last 5s' : 'target: 20'}
              icon={<Zap className="w-4 h-4" />}
              color={stats.tps !== null && stats.tps < 15 ? 'text-red-400' : stats.tps !== null && stats.tps < 18 ? 'text-yellow-400' : stats.tps !== null ? 'text-primary' : undefined}
            />
            <StatTile
              label="MSPT"
              value={stats.mspt === null ? 'N/A' : `${stats.mspt.toFixed(1)}ms`}
              sub={stats.mspt === null ? 'Unavailable' : stats.msptSource === 'spark-median-10s' ? 'Spark · median, last 10s' : 'target: <50ms'}
              icon={<Activity className="w-4 h-4" />}
            />
            <StatTile
              label="Net In"
              value={stats.networkIn === null ? 'N/A' : `${formatBytes(stats.networkIn * 1024)}/s`}
              sub={stats.networkSource === 'linux-tcp-sockets' ? 'Java TCP · sampled sockets' : 'Unavailable'}
              icon={<Network className="w-4 h-4" />}
            />
            <StatTile
              label="Disk"
              value={disk === null ? 'N/A' : formatBytes(disk * 1024 * 1024)}
              sub={diskMax === null ? 'Capacity unavailable' : `/ ${formatBytes(diskMax * 1024 * 1024)}`}
              icon={<HardDrive className="w-4 h-4" />}
            />
          </div>
        )}
        {stats && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Cpu className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-8 shrink-0">CPU</span>
              {stats.cpu === null ? <span className="flex-1 text-muted-foreground">N/A</span> : <ProgressBar value={stats.cpu} className="flex-1" />}
              <span className="text-foreground w-10 text-right">{stats.cpu === null ? 'N/A' : `${stats.cpu.toFixed(0)}%`}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <MemoryStick className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-8 shrink-0">RAM</span>
              {stats.ram === null ? <span className="flex-1 text-muted-foreground">N/A</span> : <ProgressBar value={stats.ram} max={stats.ramMax} className="flex-1" />}
              <span className="text-foreground w-10 text-right">{stats.ram === null ? 'N/A' : `${((stats.ram / stats.ramMax) * 100).toFixed(0)}%`}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <HardDrive className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-8 shrink-0">Disk</span>
              {disk === null || diskMax === null || diskMax <= 0 ? <span className="flex-1 text-muted-foreground">N/A</span> : <ProgressBar value={disk} max={diskMax} className="flex-1" />}
              <span className="text-foreground w-10 text-right">{disk === null || diskMax === null || diskMax <= 0 ? 'N/A' : `${((disk / diskMax) * 100).toFixed(0)}%`}</span>
            </div>
          </div>
        )}
      </div>

      <PerformanceHistoryGraph samples={metricHistory.samples} range={metricHistory.range} onRangeChange={metricHistory.setRange} loading={metricHistory.loading} />

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
            <InfoRow label="Java Version" value={server.javaVersion || 'N/A'} />
            <InfoRow label="Process Status" value={server.status} />
            <InfoRow label="PID" value={server.pid ? String(server.pid) : 'N/A'} />
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
