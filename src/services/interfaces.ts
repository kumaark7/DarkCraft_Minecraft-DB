// ============================================================
// Service interfaces — replace mock adapter with real API
// ============================================================
import type {
  Server,
  ServerStats,
  ServerSettings,
  Player,
  BannedIP,
  ConsoleEntry,
  ConsoleViewMode,
  ServerFile,
  Plugin,
  Mod,
  Backup,
  BackupProgress,
  Schedule,
  ScheduleAction,
  ActivityEvent,
  AppNotification,
  LogEntry,
  HostStats,
  Bot,
  GlobalSettings,
  ImportInspection,
  ExportProgress,
  CreateServerConfig,
  InstallableServerSoftware,
  SoftwareBuild,
  SoftwareCatalog,
  MetricHistoryRange,
  ServerMetricSample,
  ModIssue,
} from '@/types';

// Server service
export interface IServerService {
  getServers(): Promise<Server[]>;
  getServer(id: string): Promise<Server | null>;
  getServerStats(id: string): Promise<ServerStats | null>;
  getServerMetricHistory(id: string, range: MetricHistoryRange): Promise<ServerMetricSample[]>;
  startServer(id: string): Promise<void>;
  stopServer(id: string): Promise<void>;
  restartServer(id: string): Promise<void>;
  killServer(id: string): Promise<void>;
  createServer(config: CreateServerConfig): Promise<Server>;
  deleteServer(id: string, confirmName: string): Promise<void>;
  importServer(file: File): Promise<{ inspectionId: string; inspection: ImportInspection }>;
  confirmImport(inspectionId: string, serverName: string): Promise<Server>;
  exportServer(id: string, onProgress: (p: ExportProgress) => void): Promise<string>;
  getServerSettings(id: string): Promise<ServerSettings | null>;
  updateServerSettings(id: string, settings: Partial<ServerSettings>): Promise<void>;
}

export interface ISoftwareCatalogService {
  getCatalog(): Promise<SoftwareCatalog>;
  getBuilds(software: InstallableServerSoftware, minecraftVersion: string): Promise<SoftwareBuild[]>;
  refresh(software?: InstallableServerSoftware, minecraftVersion?: string): Promise<SoftwareCatalog>;
}

// Console service
export interface IConsoleService {
  getConsoleHistory(id: string, mode: ConsoleViewMode, date?: string): Promise<ConsoleEntry[]>;
  sendCommand(id: string, command: string): Promise<void>;
  clearConsole(id: string): Promise<void>;
  subscribeToLive(id: string, onEntry: (entry: ConsoleEntry) => void): () => void;
}

// Player service
export interface IPlayerService {
  getPlayers(id: string): Promise<Player[]>;
  kickPlayer(id: string, username: string, reason?: string): Promise<void>;
  banPlayer(id: string, username: string, reason?: string): Promise<void>;
  unbanPlayer(id: string, username: string): Promise<void>;
  opPlayer(id: string, username: string): Promise<void>;
  deopPlayer(id: string, username: string): Promise<void>;
  getWhitelist(id: string): Promise<Player[]>;
  addWhitelistPlayer(id: string, username: string): Promise<void>;
  removeWhitelistPlayer(id: string, username: string): Promise<void>;
  getOperators(id: string): Promise<Player[]>;
  getBannedPlayers(id: string): Promise<Player[]>;
  getBannedIPs(id: string): Promise<BannedIP[]>;
  unbanIP(id: string, ip: string): Promise<void>;
}

// File service
export interface IFileService {
  getFiles(id: string, path: string): Promise<ServerFile[]>;
  getFileContent(id: string, path: string): Promise<string>;
  saveFile(id: string, path: string, content: string): Promise<void>;
  uploadFile(id: string, path: string, file: File): Promise<void>;
  downloadFile(id: string, path: string): Promise<void>;
  deleteFile(id: string, path: string): Promise<void>;
  renameFile(id: string, path: string, newName: string): Promise<void>;
  createFile(id: string, path: string, name: string): Promise<void>;
  createFolder(id: string, path: string, name: string): Promise<void>;
  moveFile(id: string, src: string, dest: string): Promise<void>;
  copyFile(id: string, src: string, dest: string): Promise<void>;
  zipFiles(id: string, paths: string[]): Promise<void>;
  extractZip(id: string, path: string): Promise<void>;
}

// Plugin/Mod service
export interface IPluginService {
  getPlugins(id: string): Promise<Plugin[]>;
  getMods(id: string): Promise<Mod[]>;
  getModIssues(id: string): Promise<ModIssue[]>;
  uploadPlugin(id: string, file: File): Promise<void>;
  uploadMod(id: string, file: File): Promise<void>;
  downloadPlugin(id: string, filename: string): Promise<void>;
  downloadMod(id: string, filename: string): Promise<void>;
  deletePlugin(id: string, pluginId: string): Promise<void>;
  deleteMod(id: string, modId: string): Promise<void>;
  togglePlugin(id: string, pluginId: string, enabled: boolean): Promise<void>;
  toggleMod(id: string, modId: string, enabled: boolean): Promise<void>;
}

// Backup service
export interface IBackupService {
  getBackups(id: string): Promise<Backup[]>;
  createBackup(id: string, onProgress: (p: BackupProgress) => void): Promise<Backup>;
  restoreBackup(id: string, backupId: string): Promise<void>;
  deleteBackup(id: string, backupId: string): Promise<void>;
  downloadBackup(id: string, backupId: string): Promise<void>;
}

// Schedule service
export interface IScheduleService {
  getSchedules(id: string): Promise<Schedule[]>;
  createSchedule(id: string, schedule: Omit<Schedule, 'id' | 'serverId'>): Promise<Schedule>;
  updateSchedule(id: string, scheduleId: string, data: Partial<Schedule>): Promise<void>;
  deleteSchedule(id: string, scheduleId: string): Promise<void>;
  runScheduleNow(id: string, scheduleId: string): Promise<void>;
}

// Global services
export interface IGlobalService {
  getActivity(filters?: { serverId?: string; category?: string }): Promise<ActivityEvent[]>;
  getLogs(filters?: { serverId?: string; severity?: string }): Promise<LogEntry[]>;
  getHostStats(): Promise<HostStats>;
  getNotifications(): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getBots(): Promise<Bot[]>;
  getBot(id: string): Promise<Bot | null>;
  startBot(id: string): Promise<void>;
  stopBot(id: string): Promise<void>;
  getGlobalSettings(): Promise<GlobalSettings>;
  updateGlobalSettings(settings: Partial<GlobalSettings>): Promise<void>;
}

// Action label helper
export const SCHEDULE_ACTION_LABELS: Record<ScheduleAction, string> = {
  'start-server': 'Start Server',
  'stop-server': 'Stop Server',
  'restart-server': 'Restart Server',
  'create-backup': 'Create Backup',
  'save-world': 'Save World',
  'execute-command': 'Execute Command',
  'send-announcement': 'Send Announcement',
};
