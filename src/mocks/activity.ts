import type { ActivityEvent, AppNotification, LogEntry, HostStats, Bot } from '@/types';

export const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: 'ae-1', timestamp: '2026-08-30T20:13:01Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'player-join', event: 'KeerDubi joined DARK CRAFT', actor: undefined },
  { id: 'ae-2', timestamp: '2026-08-30T20:05:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'backup', event: 'Backup completed (524 MB)', actor: 'Scheduler' },
  { id: 'ae-3', timestamp: '2026-08-30T19:58:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'config-change', event: 'Server configuration updated', actor: 'KeerDubi' },
  { id: 'ae-4', timestamp: '2026-08-30T18:30:00Z', serverId: 'server-4', serverName: 'FORGE FACTORY', category: 'server-start', event: 'FORGE FACTORY started', actor: 'KeerDubi' },
  { id: 'ae-5', timestamp: '2026-08-30T17:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'player-join', event: 'Raj joined DARK CRAFT' },
  { id: 'ae-6', timestamp: '2026-08-30T16:45:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'op-change', event: 'OP granted to KeerDubi', actor: 'KeerDubi' },
  { id: 'ae-7', timestamp: '2026-08-30T16:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'whitelist-change', event: 'Priya added to whitelist', actor: 'KeerDubi' },
  { id: 'ae-8', timestamp: '2026-08-30T15:30:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'plugin-upload', event: 'Plugin WorldGuard-7.0.9.jar uploaded', actor: 'KeerDubi' },
  { id: 'ae-9', timestamp: '2026-08-30T15:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'player-leave', event: 'Kesavan left DARK CRAFT' },
  { id: 'ae-10', timestamp: '2026-08-30T14:00:00Z', serverId: 'server-3', serverName: 'MODDED REALM', category: 'server-start', event: 'MODDED REALM starting...', actor: 'KeerDubi' },
  { id: 'ae-11', timestamp: '2026-08-30T04:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'server-start', event: 'DARK CRAFT restarted (scheduled)', actor: 'Scheduler' },
  { id: 'ae-12', timestamp: '2026-08-30T03:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'backup', event: 'Scheduled backup created', actor: 'Scheduler' },
  { id: 'ae-13', timestamp: '2026-08-29T20:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'ban', event: 'BannedPlayer1 banned for griefing', actor: 'KeerDubi' },
  { id: 'ae-14', timestamp: '2026-08-29T12:00:00Z', serverId: 'server-1', serverName: 'DARK CRAFT', category: 'export', event: 'Server export initiated', actor: 'KeerDubi' },
  { id: 'ae-15', timestamp: '2026-08-29T11:00:00Z', serverId: 'server-2', serverName: 'SURVIVAL WARS', category: 'server-stop', event: 'SURVIVAL WARS stopped', actor: 'KeerDubi' },
];

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: 'n-1', timestamp: '2026-08-30T20:15:00Z', type: 'backup-completed', severity: 'info', title: 'Backup Completed', message: 'DARK CRAFT backup completed successfully (524 MB)', read: false, serverId: 'server-1', serverName: 'DARK CRAFT' },
  { id: 'n-2', timestamp: '2026-08-30T18:35:00Z', type: 'server-started', severity: 'info', title: 'Server Started', message: 'FORGE FACTORY is now online', read: false, serverId: 'server-4', serverName: 'FORGE FACTORY' },
  { id: 'n-3', timestamp: '2026-08-30T14:02:00Z', type: 'high-cpu', severity: 'warning', title: 'High CPU Usage', message: 'FORGE FACTORY CPU usage reached 89% for 5 minutes', read: false, serverId: 'server-4', serverName: 'FORGE FACTORY' },
  { id: 'n-4', timestamp: '2026-08-30T04:05:00Z', type: 'server-restarted', severity: 'info', title: 'Server Restarted', message: 'DARK CRAFT restarted via scheduled task', read: true, serverId: 'server-1', serverName: 'DARK CRAFT' },
  { id: 'n-5', timestamp: '2026-08-29T03:05:00Z', type: 'backup-failed', severity: 'error', title: 'Backup Failed', message: 'DARK CRAFT scheduled backup failed: disk full', read: true, serverId: 'server-1', serverName: 'DARK CRAFT' },
  { id: 'n-6', timestamp: '2026-08-28T22:00:00Z', type: 'low-disk', severity: 'warning', title: 'Low Disk Space', message: 'System disk usage is at 87% — consider cleanup', read: true },
];

export const MOCK_HOST_STATS: HostStats = {
  uptime: 86400 * 14 + 3600 * 7,
  cpuModel: 'AMD EPYC 7302 (16 cores)',
  cpuUsage: 42,
  ramTotal: 32768,
  ramUsed: 16400,
  diskTotal: 500,
  diskUsed: 215,
  networkIn: 1842,
  networkOut: 1124,
};

export const MOCK_LOGS: LogEntry[] = [
  { id: 'lg-1', timestamp: '2026-08-30T20:15:05Z', severity: 'INFO', source: 'BackupService', serverId: 'server-1', serverName: 'DARK CRAFT', message: 'Backup job completed successfully in 45 seconds' },
  { id: 'lg-2', timestamp: '2026-08-30T18:30:12Z', severity: 'INFO', source: 'ServerManager', serverId: 'server-4', serverName: 'FORGE FACTORY', message: 'Server process started (PID 54321)' },
  { id: 'lg-3', timestamp: '2026-08-30T14:02:05Z', severity: 'WARN', source: 'MonitorService', serverId: 'server-4', serverName: 'FORGE FACTORY', message: 'CPU usage exceeded threshold: 89%' },
  { id: 'lg-4', timestamp: '2026-08-30T14:00:01Z', severity: 'INFO', source: 'SchedulerService', serverId: 'server-3', serverName: 'MODDED REALM', message: 'Triggered schedule: start-server' },
  { id: 'lg-5', timestamp: '2026-08-30T04:00:02Z', severity: 'INFO', source: 'SchedulerService', serverId: 'server-1', serverName: 'DARK CRAFT', message: 'Triggered schedule: restart-server' },
  { id: 'lg-6', timestamp: '2026-08-30T03:00:01Z', severity: 'INFO', source: 'SchedulerService', serverId: 'server-1', serverName: 'DARK CRAFT', message: 'Triggered schedule: create-backup' },
  { id: 'lg-7', timestamp: '2026-08-29T03:05:14Z', severity: 'ERROR', source: 'BackupService', serverId: 'server-1', serverName: 'DARK CRAFT', message: 'Backup job failed: IOException - no space left on device' },
  { id: 'lg-8', timestamp: '2026-08-28T22:01:00Z', severity: 'WARN', source: 'MonitorService', message: 'Disk usage threshold exceeded: 87%' },
  { id: 'lg-9', timestamp: '2026-08-27T14:32:00Z', severity: 'INFO', source: 'FileService', serverId: 'server-1', serverName: 'DARK CRAFT', message: 'Manual backup created: manual-backup-2026-08-27' },
];

export const MOCK_BOTS: Bot[] = [
  {
    id: 'bot-1',
    name: 'ServerGuard',
    status: 'online',
    associatedServerId: 'server-1',
    associatedServerName: 'DARK CRAFT',
    description: 'Anti-cheat and moderation bot',
    activity: [
      'Kicked xHacker99 for suspicious movement',
      'Sent welcome message to Raj',
      'Monitored 7 active players',
    ],
    config: { prefix: '!', autoKickHackers: true, welcomeMessage: 'Welcome to DARK CRAFT!' },
    createdAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'bot-2',
    name: 'DiscordBridge',
    status: 'online',
    associatedServerId: 'server-1',
    associatedServerName: 'DARK CRAFT',
    description: 'Bridges Minecraft chat to Discord',
    activity: [
      'Relayed 24 chat messages to Discord',
      'Sent join notification: KeerDubi',
    ],
    config: { channelId: '1234567890', relayChat: true, relayJoins: true },
    createdAt: '2024-02-01T08:00:00Z',
  },
  {
    id: 'bot-3',
    name: 'BackupBot',
    status: 'offline',
    associatedServerId: 'server-4',
    associatedServerName: 'FORGE FACTORY',
    description: 'Automated backup coordination bot',
    activity: ['Idle — server offline'],
    config: { backupInterval: 3600, retainCount: 10 },
    createdAt: '2024-03-15T12:00:00Z',
  },
];
