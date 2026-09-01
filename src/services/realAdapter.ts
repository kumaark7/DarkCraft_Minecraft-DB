import type {
  ActivityEvent, AppNotification, Backup, BannedIP, Bot, ConsoleEntry, GlobalSettings, HostStats,
  ImportInspection, InstallableServerSoftware, LogEntry, Mod, Player, Plugin, Schedule, Server, ServerFile,
  ServerSettings, ServerStats, SoftwareBuild, SoftwareCatalog,
} from '@/types';
import type { ApiClient } from './apiClient';
import { AUTH_UNAUTHORIZED_EVENT, createApiClient } from './apiClient';
import { resolveServiceConfig } from './config';
import type { IBackupService, IConsoleService, IFileService, IGlobalService, IPlayerService, IPluginService, IScheduleService, IServerService, ISoftwareCatalogService } from './interfaces';
import { assertServerId, normalizeServerPath, safeServerPath } from './security';

export function createRealServices(client: ApiClient) {
  const serverService: IServerService = {
    getServers: () => client.get<Server[]>('/servers'),
    getServer: (id) => client.get<Server | null>(safeServerPath(id)),
    getServerStats: (id) => client.get<ServerStats | null>(safeServerPath(id, '/stats')),
    startServer: (id) => client.post(safeServerPath(id, '/start')),
    stopServer: (id) => client.post(safeServerPath(id, '/stop')),
    restartServer: (id) => client.post(safeServerPath(id, '/restart')),
    killServer: (id) => client.post(safeServerPath(id, '/kill')),
    createServer: (config) => client.post<Server>('/servers', config),
    deleteServer: (id, confirmName) => client.delete(safeServerPath(id), { confirmName }),
    importServer: (file) => client.upload<{ inspectionId: string; inspection: ImportInspection }>('/imports/inspect', file),
    confirmImport: (inspectionId, serverName) => client.post<Server>(`/imports/${encodeURIComponent(assertServerId(inspectionId))}/confirm`, { serverName }),
    async exportServer(id, onProgress) { onProgress({ stage: 'preparing', percent: 10, message: 'Preparing export…' }); await client.download(safeServerPath(id, '/export'), `${id}.zip`); onProgress({ stage: 'complete', percent: 100, message: 'Export complete' }); return `${id}.zip`; },
    getServerSettings: (id) => client.get<ServerSettings | null>(safeServerPath(id, '/settings')),
    updateServerSettings: (id, settings) => client.patch(safeServerPath(id, '/settings'), settings),
  };
  const consoleService: IConsoleService = {
    getConsoleHistory: (id, mode, date) => client.get<ConsoleEntry[]>(safeServerPath(id, '/console'), { mode, date }),
    sendCommand: (id, command) => client.post(safeServerPath(id, '/console/commands'), { command }),
    clearConsole: (id) => client.delete(safeServerPath(id, '/console')),
    subscribeToLive(id, onEntry) { const socket = new WebSocket(client.websocketUrl(safeServerPath(id, '/console/stream'))); socket.onmessage = (event) => onEntry(JSON.parse(event.data) as ConsoleEntry); socket.onclose = (event) => { if (event.code === 4401) window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT)); }; return () => socket.close(); },
  };
  const playerAction = (id: string, action: string, username: string, reason?: string) => client.post(safeServerPath(id, `/players/${action}`), { username, reason });
  const playerService: IPlayerService = {
    getPlayers: (id) => client.get<Player[]>(safeServerPath(id, '/players')),
    kickPlayer: (id, username, reason) => playerAction(id, 'kick', username, reason), banPlayer: (id, username, reason) => playerAction(id, 'ban', username, reason), unbanPlayer: (id, username) => playerAction(id, 'unban', username), opPlayer: (id, username) => playerAction(id, 'op', username), deopPlayer: (id, username) => playerAction(id, 'deop', username),
    getWhitelist: async (id) => (await client.get<Player[]>(safeServerPath(id, '/players'))).filter((p) => p.isWhitelisted),
    addWhitelistPlayer: (id, username) => client.post(safeServerPath(id, '/players/whitelist'), { username }),
    removeWhitelistPlayer: (id, username) => client.delete(safeServerPath(id, '/players/whitelist'), { username }),
    getOperators: async (id) => (await client.get<Player[]>(safeServerPath(id, '/players'))).filter((p) => p.isOp),
    getBannedPlayers: async (id) => (await client.get<Player[]>(safeServerPath(id, '/players'))).filter((p) => p.isBanned),
    getBannedIPs: (id) => client.get<BannedIP[]>(safeServerPath(id, '/banned-ips')),
    unbanIP: (id, ip) => client.post(safeServerPath(id, '/banned-ips/unban'), { ip }),
  };
  const fileService: IFileService = {
    getFiles: (id, path) => client.get<ServerFile[]>(safeServerPath(id, '/files'), { path: normalizeServerPath(path) }),
    getFileContent: (id, path) => client.get<string>(safeServerPath(id, '/files/content'), { path: normalizeServerPath(path) }),
    saveFile: (id, path, content) => client.put(safeServerPath(id, '/files/content'), { content }, { path: normalizeServerPath(path) }),
    uploadFile: (id, path, file) => client.upload(safeServerPath(id, '/files/upload'), file, { path: normalizeServerPath(path) }),
    downloadFile: (id, path) => client.download(safeServerPath(id, '/files/download'), undefined, { path: normalizeServerPath(path) }),
    deleteFile: (id, path) => client.delete(safeServerPath(id, '/files'), undefined, { path: normalizeServerPath(path) }),
    renameFile: (id, path, newName) => client.post(safeServerPath(id, '/files/rename'), { path: normalizeServerPath(path), newName }),
    createFile: (id, path, name) => client.post(safeServerPath(id, '/files/create'), { path: normalizeServerPath(path), name, type: 'file' }),
    createFolder: (id, path, name) => client.post(safeServerPath(id, '/files/create'), { path: normalizeServerPath(path), name, type: 'directory' }),
    moveFile: (id, src, dest) => client.post(safeServerPath(id, '/files/move'), { src: normalizeServerPath(src), dest: normalizeServerPath(dest) }),
    copyFile: (id, src, dest) => client.post(safeServerPath(id, '/files/copy'), { src: normalizeServerPath(src), dest: normalizeServerPath(dest) }),
    zipFiles: (id, paths) => client.post(safeServerPath(id, '/files/zip'), { paths: paths.map(normalizeServerPath) }),
    extractZip: (id, path) => client.post(safeServerPath(id, '/files/extract'), { path: normalizeServerPath(path) }),
  };
  const pluginService: IPluginService = {
    getPlugins: (id) => client.get<Plugin[]>(safeServerPath(id, '/plugins')), getMods: (id) => client.get<Mod[]>(safeServerPath(id, '/mods')),
    uploadPlugin: (id, file) => client.upload(safeServerPath(id, '/plugins/upload'), file),
    uploadMod: (id, file) => client.upload(safeServerPath(id, '/mods/upload'), file),
    downloadPlugin: (id, filename) => client.download(safeServerPath(id, '/files/download'), filename, { path: normalizeServerPath(`/plugins/${filename}`) }),
    downloadMod: (id, filename) => client.download(safeServerPath(id, '/files/download'), filename, { path: normalizeServerPath(`/mods/${filename}`) }),
    deletePlugin: (id, pluginId) => client.delete(safeServerPath(id, `/plugins/${encodeURIComponent(pluginId)}`)),
    deleteMod: (id, modId) => client.delete(safeServerPath(id, `/mods/${encodeURIComponent(modId)}`)),
    togglePlugin: (id, pluginId, enabled) => client.post(safeServerPath(id, `/plugins/${encodeURIComponent(pluginId)}/toggle`), { enabled }),
  };
  const backupService: IBackupService = {
    getBackups: (id) => client.get<Backup[]>(safeServerPath(id, '/backups')),
    async createBackup(id, onProgress) { onProgress({ stage: 'preparing', percent: 10, message: 'Preparing backup…' }); const backup = await client.post<Backup>(safeServerPath(id, '/backups')); onProgress({ stage: 'complete', percent: 100, message: 'Backup complete' }); return backup; },
    restoreBackup: (id, backupId) => client.post(safeServerPath(id, `/backups/${encodeURIComponent(backupId)}/restore`)), deleteBackup: (id, backupId) => client.delete(safeServerPath(id, `/backups/${encodeURIComponent(backupId)}`)), downloadBackup: (id, backupId) => client.download(safeServerPath(id, `/backups/${encodeURIComponent(backupId)}/download`), `${backupId}.zip`),
  };
  const scheduleService: IScheduleService = {
    getSchedules: (id) => client.get<Schedule[]>(safeServerPath(id, '/schedules')), createSchedule: (id, schedule) => client.post<Schedule>(safeServerPath(id, '/schedules'), schedule), updateSchedule: (id, scheduleId, data) => client.patch(safeServerPath(id, `/schedules/${encodeURIComponent(scheduleId)}`), data), deleteSchedule: (id, scheduleId) => client.delete(safeServerPath(id, `/schedules/${encodeURIComponent(scheduleId)}`)), runScheduleNow: (id, scheduleId) => client.post(safeServerPath(id, `/schedules/${encodeURIComponent(scheduleId)}/run`)),
  };
  const globalService: IGlobalService = {
    getActivity: (filters) => client.get<ActivityEvent[]>('/activity', filters), getLogs: (filters) => client.get<LogEntry[]>('/logs', filters), getHostStats: () => client.get<HostStats>('/host/stats'), getNotifications: () => client.get<AppNotification[]>('/notifications'), markNotificationRead: (id) => client.post(`/notifications/${encodeURIComponent(assertServerId(id))}/read`), markAllNotificationsRead: () => client.post('/notifications/read-all'), getBots: () => client.get<Bot[]>('/bots'), getBot: (id) => client.get<Bot | null>(`/bots/${encodeURIComponent(assertServerId(id))}`), startBot: (id) => client.post(`/bots/${encodeURIComponent(assertServerId(id))}/start`), stopBot: (id) => client.post(`/bots/${encodeURIComponent(assertServerId(id))}/stop`), getGlobalSettings: () => client.get<GlobalSettings>('/settings'), updateGlobalSettings: (settings) => client.patch('/settings', settings),
  };
  const softwareCatalogService: ISoftwareCatalogService = {
    getCatalog: () => client.get<SoftwareCatalog>('/software/catalog'),
    getBuilds: (software, minecraftVersion) => client.get<SoftwareBuild[]>(`/software/catalog/${encodeURIComponent(software)}/${encodeURIComponent(minecraftVersion)}/builds`),
    refresh: (software?: InstallableServerSoftware, minecraftVersion?: string) => client.post<SoftwareCatalog>('/software/catalog/refresh', { software, minecraftVersion }),
  };
  return { serverService, consoleService, playerService, fileService, pluginService, backupService, scheduleService, globalService, softwareCatalogService };
}

const config = resolveServiceConfig();
export const realServices = createRealServices(createApiClient(config.apiBaseUrl));
