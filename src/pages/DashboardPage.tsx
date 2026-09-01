import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, Users, Cpu, HardDrive, MemoryStick, Activity,
  Clock, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import { Layout } from '@/layouts/Layout';
import { ServerCard } from '@/components/server/ServerCard';
import { StatCard } from '@/components/shared/StatCard';
import { SkeletonCard } from '@/components/shared/States';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { ExportServerDialog } from '@/components/server/ExportServerDialog';
import { useServers } from '@/hooks/useServers';
import { useHostStats, useActivity } from '@/hooks/useGlobal';
import { formatBytes, formatUptime, formatTimeAgo } from '@/utils';
import type { ActivityEvent } from '@/types';

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  'server-start': <CheckCircle2 className="w-3.5 h-3.5 text-primary" />,
  'server-stop': <Info className="w-3.5 h-3.5 text-muted-foreground" />,
  'player-join': <Users className="w-3.5 h-3.5 text-accent" />,
  'player-leave': <Users className="w-3.5 h-3.5 text-muted-foreground" />,
  'config-change': <Info className="w-3.5 h-3.5 text-yellow-400" />,
  'backup': <CheckCircle2 className="w-3.5 h-3.5 text-primary" />,
  'error': <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  'ban': <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { servers, loading: serversLoading, startServer, stopServer, restartServer, killServer, deleteServer } = useServers();
  const hostStats = useHostStats();
  const { activity } = useActivity();
  const [exportServerId, setExportServerId] = useState<string | null>(null);

  const online = servers.filter(s => s.status === 'ONLINE').length;
  const offline = servers.filter(s => s.status === 'OFFLINE' || s.status === 'CRASHED').length;
  const totalPlayers = servers.reduce((a, s) => a + s.playerCount, 0);
  const cpuReadings = servers.filter((server) => server.status === 'ONLINE' && server.cpu !== null).map((server) => server.cpu as number);
  const avgCpu = cpuReadings.length ? cpuReadings.reduce((total, cpu) => total + cpu, 0) / cpuReadings.length : null;

  const recentActivity = activity.slice(0, 8);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 animate-fade-in">
        {/* Page header */}
        <div>
          <h1 className="text-lg font-bold text-foreground">Infrastructure Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Global server and host status</p>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Servers" value={servers.length} icon={<Server className="w-4 h-4" />} />
          <StatCard label="Online" value={online} icon={<Server className="w-4 h-4" />} highlight="green" />
          <StatCard label="Offline" value={offline} icon={<Server className="w-4 h-4" />} />
          <StatCard label="Players Online" value={totalPlayers} icon={<Users className="w-4 h-4" />} highlight="blue" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard
            label="Avg CPU Usage"
            value={avgCpu === null ? 'N/A' : `${avgCpu.toFixed(0)}%`}
            icon={<Cpu className="w-4 h-4" />}
            highlight={avgCpu !== null && avgCpu > 80 ? 'red' : avgCpu !== null && avgCpu > 60 ? 'yellow' : undefined}
          />
          <StatCard
            label="RAM Used (host)"
            value={hostStats ? `${formatBytes(hostStats.ramUsed * 1024 * 1024)} / ${formatBytes(hostStats.ramTotal * 1024 * 1024)}` : '—'}
            icon={<MemoryStick className="w-4 h-4" />}
          />
          <StatCard
            label="Disk Used"
            value={hostStats ? `${hostStats.diskUsed.toFixed(2)} / ${hostStats.diskTotal.toFixed(2)} GB` : '—'}
            icon={<HardDrive className="w-4 h-4" />}
            highlight={hostStats && hostStats.diskUsed / hostStats.diskTotal > 0.85 ? 'red' : undefined}
          />
        </div>

        {/* Host info + activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Host panel */}
          <div className="bg-card border border-border rounded p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Host System</h2>
            {hostStats ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">CPU</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span className="text-foreground text-xs font-medium shrink-0">{hostStats.cpuUsage.toFixed(0)}%</span>
                    <ProgressBar value={hostStats.cpuUsage} className="max-w-24" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">RAM</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span className="text-foreground text-xs font-medium shrink-0">
                      {formatBytes(hostStats.ramUsed * 1024 * 1024)} / {formatBytes(hostStats.ramTotal * 1024 * 1024)}
                    </span>
                    <ProgressBar value={hostStats.ramUsed} max={hostStats.ramTotal} className="max-w-24" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs">Disk</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span className="text-foreground text-xs font-medium shrink-0">
                      {hostStats.diskUsed.toFixed(2)} / {hostStats.diskTotal.toFixed(2)} GB
                    </span>
                    <ProgressBar value={hostStats.diskUsed} max={hostStats.diskTotal} className="max-w-24" />
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Uptime</span>
                  <span className="text-xs font-medium text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatUptime(hostStats.uptime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Network</span>
                  <span className="text-xs font-medium text-foreground flex items-center gap-2">
                    {hostStats.networkIn === null || hostStats.networkOut === null ? (
                      <span className="text-muted-foreground">Unavailable</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-0.5 text-primary"><ArrowDown className="w-3 h-3" />{formatBytes(hostStats.networkIn * 1024)}/s</span>
                        <span className="flex items-center gap-0.5 text-accent"><ArrowUp className="w-3 h-3" />{formatBytes(hostStats.networkOut * 1024)}/s</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">CPU Model</span>
                  <span className="text-xs text-foreground truncate max-w-36">{hostStats.cpuModel}</span>
                </div>
              </div>
            ) : (
              <div className="animate-pulse space-y-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-4 bg-muted rounded" />)}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-card border border-border rounded p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Recent Activity</h2>
            <div className="space-y-2">
              {recentActivity.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No recent activity</p>
              ) : (
                recentActivity.map((event: ActivityEvent) => (
                  <div key={event.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5">{CATEGORY_ICON[event.category] ?? <Activity className="w-3.5 h-3.5 text-muted-foreground" />}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">{event.event}</p>
                      {event.serverName && <p className="text-muted-foreground text-[10px]">{event.serverName}</p>}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-[10px]">{formatTimeAgo(event.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Server cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servers</h2>
            <button
              onClick={() => navigate('/servers')}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              View all →
            </button>
          </div>
          {serversLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {servers.map(server => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onStart={startServer}
                  onStop={stopServer}
                  onRestart={restartServer}
                  onKill={killServer}
                  onDelete={deleteServer}
                  onExport={(id) => setExportServerId(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {exportServerId && (
        <ExportServerDialog
          serverId={exportServerId}
          serverName={servers.find(s => s.id === exportServerId)?.name ?? ''}
          serverStatus={servers.find(s => s.id === exportServerId)?.status ?? 'OFFLINE'}
          open={!!exportServerId}
          onOpenChange={(o) => { if (!o) setExportServerId(null); }}
        />
      )}
    </Layout>
  );
}
