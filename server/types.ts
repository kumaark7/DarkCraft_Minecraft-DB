import type {
  ActivityEvent,
  AppNotification,
  Backup,
  BannedIP,
  Bot,
  GlobalSettings,
  LogEntry,
  Player,
  Schedule,
  Server,
} from '../src/types/index.js';

export interface ManagedServer extends Server {
  startupExecutable: string;
  startupArgs: string[];
}

export interface DashboardState {
  servers: ManagedServer[];
  players: Record<string, Player[]>;
  bannedIPs: Record<string, BannedIP[]>;
  backups: Record<string, Backup[]>;
  schedules: Record<string, Schedule[]>;
  notifications: AppNotification[];
  alertCooldowns?: Record<string, number>;
  bots: Bot[];
  activity: ActivityEvent[];
  logs: LogEntry[];
  globalSettings: GlobalSettings;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  dashboardName: 'NETHERCRAFT',
  timezone: 'UTC',
  theme: 'dark',
  defaultServerDirectory: 'servers',
  defaultJava: 'java',
  defaultRam: 4096,
  defaultPort: 25565,
  backupDirectory: 'backups',
  backupRetention: 10,
  consoleRetentionHours: 72,
  notificationPrefs: {
    'server-crashed': true,
    'server-stopped-unexpectedly': true,
    'server-started': true,
    'server-restarted': true,
    'high-cpu': true,
    'high-ram': true,
    'low-disk': true,
    'backup-completed': true,
    'backup-failed': true,
    'schedule-failed': true,
  },
};

export function emptyState(): DashboardState {
  return {
    servers: [],
    players: {},
    bannedIPs: {},
    backups: {},
    schedules: {},
    notifications: [],
    bots: [],
    activity: [],
    logs: [],
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
  };
}
