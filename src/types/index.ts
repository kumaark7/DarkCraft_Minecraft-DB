// ============================================================
// Core domain types — portable, no backend dependency
// ============================================================

export type ServerStatus = 'ONLINE' | 'OFFLINE' | 'STARTING' | 'STOPPING' | 'CRASHED';

export type ServerSoftware =
  | 'Vanilla'
  | 'Paper'
  | 'Purpur'
  | 'Spigot'
  | 'Bukkit'
  | 'Fabric'
  | 'Forge'
  | 'NeoForge';

export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

export interface Server {
  id: string;
  name: string;
  status: ServerStatus;
  software: ServerSoftware;
  minecraftVersion: string;
  javaVersion: string;
  ip: string;
  port: number;
  playerCount: number;
  maxPlayers: number;
  cpu: number; // percentage 0-100
  ram: number; // MB used
  ramMax: number; // MB max
  disk: number; // MB used
  diskMax: number; // MB total
  uptime: number; // seconds
  pid?: number;
  directory: string;
  startupCommand: string;
  iconUrl?: string;
  createdAt: string;
}

export interface ServerStats {
  serverId: string;
  cpu: number;
  ram: number;
  ramMax: number;
  disk: number;
  diskMax: number;
  networkIn: number; // KB/s
  networkOut: number; // KB/s
  players: number;
  maxPlayers: number;
  uptime: number;
  tps: number;
  mspt: number;
  timestamp: number;
}

export interface HostStats {
  uptime: number; // seconds
  cpuModel: string;
  cpuUsage: number;
  ramTotal: number; // MB
  ramUsed: number; // MB
  diskTotal: number; // GB
  diskUsed: number; // GB
  networkIn: number; // KB/s
  networkOut: number; // KB/s
}

export interface ServerSettings {
  serverId: string;
  serverName: string;
  motd: string;
  serverPort: number;
  maxPlayers: number;
  gamemode: GameMode;
  difficulty: Difficulty;
  // online-mode = false means cracked
  crackedMode: boolean; // true = online-mode=false
  whitelist: boolean;
  allowFlight: boolean;
  pvp: boolean;
  commandBlocks: boolean;
  hardcore: boolean;
  spawnAnimals: boolean;
  spawnMonsters: boolean;
  spawnNpcs: boolean;
  spawnProtection: number;
  viewDistance: number;
  simulationDistance: number;
  // Advanced raw properties
  rawProperties: Record<string, string>;
}

// ============================================================
// Player types
// ============================================================

export interface Player {
  username: string;
  uuid: string;
  online: boolean;
  duration?: number; // seconds online
  ping?: number; // ms
  isOp: boolean;
  isWhitelisted: boolean;
  isBanned: boolean;
  banReason?: string;
  banDate?: string;
}

export interface BannedIP {
  ip: string;
  reason: string;
  bannedBy: string;
  date: string;
}

// ============================================================
// Console types
// ============================================================

export type ConsoleSeverity = 'INFO' | 'WARN' | 'ERROR' | 'COMMAND' | 'PLAYER';
export type ConsoleSource = 'LIVE' | 'HISTORY';
export type ConsoleViewMode = 'live' | 'today' | 'yesterday' | 'older';

export interface ConsoleEntry {
  id: string;
  timestamp: string; // ISO
  severity: ConsoleSeverity;
  message: string;
  source: ConsoleSource;
  thread?: string;
}

// ============================================================
// File system types
// ============================================================

export type FileType = 'file' | 'directory';

export interface ServerFile {
  name: string;
  path: string;
  type: FileType;
  size?: number; // bytes
  modified?: string; // ISO
  extension?: string;
}

// ============================================================
// Plugin / Mod types
// ============================================================

export type PluginStatus = 'enabled' | 'disabled';

export interface Plugin {
  id: string;
  name: string;
  version: string;
  filename: string;
  size: number; // bytes
  status: PluginStatus;
  description?: string;
  author?: string;
}

export interface Mod {
  id: string;
  name: string;
  version: string;
  filename: string;
  size: number; // bytes
  description?: string;
  author?: string;
}

// ============================================================
// Backup types
// ============================================================

export type BackupType = 'manual' | 'scheduled' | 'full';
export type BackupStatus = 'completed' | 'running' | 'failed' | 'pending';

export interface Backup {
  id: string;
  serverId: string;
  name: string;
  date: string; // ISO
  size: number; // bytes
  type: BackupType;
  status: BackupStatus;
}

export interface BackupProgress {
  stage: 'preparing' | 'compressing' | 'finalizing' | 'complete' | 'failed';
  percent: number;
  message: string;
}

// ============================================================
// Schedule types
// ============================================================

export type ScheduleAction =
  | 'start-server'
  | 'stop-server'
  | 'restart-server'
  | 'create-backup'
  | 'save-world'
  | 'execute-command'
  | 'send-announcement';

export interface Schedule {
  id: string;
  serverId: string;
  label: string;
  action: ScheduleAction;
  cronExpression: string;
  humanReadable: string;
  enabled: boolean;
  command?: string; // for execute-command action
  message?: string; // for send-announcement action
  lastRun?: string; // ISO
  nextRun?: string; // ISO
}

// ============================================================
// Activity types
// ============================================================

export type ActivityCategory =
  | 'server-start'
  | 'server-stop'
  | 'player-join'
  | 'player-leave'
  | 'config-change'
  | 'backup'
  | 'plugin-upload'
  | 'whitelist-change'
  | 'op-change'
  | 'ban'
  | 'schedule'
  | 'export'
  | 'import'
  | 'error';

export interface ActivityEvent {
  id: string;
  timestamp: string; // ISO
  serverId?: string;
  serverName?: string;
  category: ActivityCategory;
  event: string;
  actor?: string;
}

// ============================================================
// Notification types
// ============================================================

export type NotificationSeverity = 'info' | 'warning' | 'error';
export type NotificationType =
  | 'server-crashed'
  | 'server-stopped-unexpectedly'
  | 'server-started'
  | 'server-restarted'
  | 'high-cpu'
  | 'high-ram'
  | 'low-disk'
  | 'backup-completed'
  | 'backup-failed'
  | 'schedule-failed';

export interface AppNotification {
  id: string;
  timestamp: string; // ISO
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  read: boolean;
  serverId?: string;
  serverName?: string;
}

// ============================================================
// Bot types
// ============================================================

export type BotStatus = 'online' | 'offline' | 'error';

export interface Bot {
  id: string;
  name: string;
  status: BotStatus;
  associatedServerId?: string;
  associatedServerName?: string;
  description?: string;
  activity: string[];
  config: Record<string, string | number | boolean>;
  createdAt: string;
}

// ============================================================
// Global settings
// ============================================================

export interface GlobalSettings {
  dashboardName: string;
  timezone: string;
  theme: 'dark' | 'system';
  // Minecraft defaults
  defaultServerDirectory: string;
  defaultJava: string;
  defaultRam: number; // MB
  defaultPort: number;
  // Backups
  backupDirectory: string;
  backupRetention: number; // count
  // Logging
  consoleRetentionHours: number; // always 72
  // Notification preferences per type
  notificationPrefs: Record<NotificationType, boolean>;
}

// ============================================================
// Import / Export types
// ============================================================

export interface ImportInspection {
  detectedName: string;
  detectedVersion?: string;
  detectedSoftware?: ServerSoftware;
  detectedJar?: string;
  worlds: string[];
  pluginCount: number;
  modCount: number;
  archiveSize: number; // bytes
  hasServerProperties: boolean;
  configFiles: string[];
}

export type ExportProgressStage = 'idle' | 'preparing' | 'compressing' | 'finalizing' | 'complete' | 'failed';

export interface ExportProgress {
  stage: ExportProgressStage;
  percent: number;
  message: string;
}

// ============================================================
// Log entry (global application logs)
// ============================================================

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  source: string;
  serverId?: string;
  serverName?: string;
  message: string;
}
