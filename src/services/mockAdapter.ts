// ============================================================
// Mock adapter — implements all service interfaces using mock data
// Replace this file with a real API adapter without touching UI
// ============================================================
import type {
  Server, ServerStats, ServerSettings, Player, BannedIP,
  ConsoleEntry,
  ServerFile, Plugin, Mod, Backup,
  Schedule, AppNotification,
  Bot, GlobalSettings, ImportInspection, InstallableServerSoftware, SoftwareCatalog,
} from '@/types';
import type {
  IServerService, IConsoleService, IPlayerService, IFileService,
  IPluginService, IBackupService, IScheduleService, IGlobalService, ISoftwareCatalogService,
} from './interfaces';
import {
  MOCK_SERVERS, MOCK_SERVER_STATS, MOCK_SERVER_SETTINGS,
  MOCK_PLAYERS, MOCK_BANNED_IPS,
  MOCK_CONSOLE_HISTORY, MOCK_LIVE_ENTRIES,
  MOCK_BACKUPS,
  MOCK_PLUGINS, MOCK_MODS,
  MOCK_SCHEDULES,
  MOCK_ACTIVITY, MOCK_NOTIFICATIONS, MOCK_HOST_STATS, MOCK_LOGS, MOCK_BOTS,
  MOCK_FILES, MOCK_FILE_CONTENTS,
} from '@/mocks';

// In-memory mutable state (isolated per session)
let _servers = [...MOCK_SERVERS];
const _settings: Record<string, ServerSettings> = { ...MOCK_SERVER_SETTINGS };
const _stats: Record<string, ServerStats> = { ...MOCK_SERVER_STATS };
const _players: Record<string, Player[]> = JSON.parse(JSON.stringify(MOCK_PLAYERS));
const _bannedIPs: Record<string, BannedIP[]> = JSON.parse(JSON.stringify(MOCK_BANNED_IPS));
const _consoleHistory: Record<string, ConsoleEntry[]> = JSON.parse(JSON.stringify(MOCK_CONSOLE_HISTORY));
const _backups: Record<string, Backup[]> = JSON.parse(JSON.stringify(MOCK_BACKUPS));
const _plugins: Record<string, Plugin[]> = JSON.parse(JSON.stringify(MOCK_PLUGINS));
const _mods: Record<string, Mod[]> = JSON.parse(JSON.stringify(MOCK_MODS));
const _schedules: Record<string, Schedule[]> = JSON.parse(JSON.stringify(MOCK_SCHEDULES));
const _files: Record<string, Record<string, ServerFile[]>> = JSON.parse(JSON.stringify(MOCK_FILES));
const _fileContents: Record<string, string> = { ...MOCK_FILE_CONTENTS };
let _notifications: AppNotification[] = JSON.parse(JSON.stringify(MOCK_NOTIFICATIONS));
let _bots: Bot[] = JSON.parse(JSON.stringify(MOCK_BOTS));
let _globalSettings: GlobalSettings = {
  dashboardName: 'NETHERCRAFT',
  timezone: 'UTC',
  theme: 'dark',
  defaultServerDirectory: '/opt/minecraft',
  defaultJava: 'Java 21',
  defaultRam: 4096,
  defaultPort: 25565,
  backupDirectory: '/opt/minecraft/backups',
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

const delay = (ms = 400) => new Promise<void>((res) => setTimeout(res, ms));

// Simulate live stats drift
setInterval(() => {
  for (const id of Object.keys(_stats)) {
    const s = _stats[id];
    _stats[id] = {
      ...s,
      cpu: Math.max(5, Math.min(95, (s.cpu ?? 0) + (Math.random() - 0.5) * 8)),
      ram: Math.max(512, Math.min(s.ramMax - 256, (s.ram ?? 0) + (Math.random() - 0.5) * 200)),
      networkIn: null,
      networkOut: null,
      tps: null,
      mspt: null,
      uptime: s.uptime + 2,
      timestamp: Date.now(),
    };
  }
}, 2000);

// ============================================================
// Server Service
// ============================================================
export const serverService: IServerService = {
  async getServerIcon(id) { return _servers.find(server => server.id === id)?.iconUrl ?? null; },
  async getServers() { await delay(300); return [..._servers]; },
  async getServer(id) { await delay(200); return _servers.find(s => s.id === id) ?? null; },
  async getServerStats(id) { await delay(100); return _stats[id] ?? null; },
  async getServerMetricHistory(id) {
    await delay(100);
    const stats = _stats[id];
    return stats ? [{ timestamp: Date.now(), cpu: stats.cpu, ram: stats.ram, ramMax: stats.ramMax, players: stats.players, maxPlayers: stats.maxPlayers, tps: null, mspt: null, networkIn: null, networkOut: null }] : [];
  },
  async startServer(id) {
    await delay(600);
    _servers = _servers.map(s => s.id === id ? { ...s, status: 'STARTING' } : s);
    setTimeout(() => {
      _servers = _servers.map(s => s.id === id ? { ...s, status: 'ONLINE', uptime: 0 } : s);
      if (!_stats[id]) {
        const srv = _servers.find(x => x.id === id);
        if (srv) _stats[id] = { serverId: id, cpu: 12, ram: 1024, ramMax: srv.ramMax, disk: srv.disk, diskMax: srv.diskMax, networkIn: null, networkOut: null, players: 0, maxPlayers: srv.maxPlayers, uptime: 0, tps: null, mspt: null, timestamp: Date.now() };
      }
    }, 3000);
  },
  async stopServer(id) {
    await delay(600);
    _servers = _servers.map(s => s.id === id ? { ...s, status: 'STOPPING' } : s);
    setTimeout(() => {
      _servers = _servers.map(s => s.id === id ? { ...s, status: 'OFFLINE', playerCount: 0, cpu: 0, ram: 0, uptime: 0 } : s);
      delete _stats[id];
    }, 2500);
  },
  async restartServer(id) {
    await serverService.stopServer(id);
    setTimeout(() => { serverService.startServer(id); }, 3500);
  },
  async killServer(id) {
    await delay(200);
    _servers = _servers.map(s => s.id === id ? { ...s, status: 'OFFLINE', playerCount: 0, cpu: 0, ram: 0, uptime: 0 } : s);
    delete _stats[id];
  },
  async createServer(config) {
    await delay(1500);
    const newServer: Server = {
      id: `server-${Date.now()}`,
      name: config.serverName ?? 'New Server',
      status: 'OFFLINE',
      software: config.serverType,
      minecraftVersion: config.minecraftVersion,
      javaVersion: 'Java 21',
      ip: '0.0.0.0',
      port: config.port,
      playerCount: 0,
      maxPlayers: config.maxPlayers ?? 20,
      cpu: 0,
      ram: 0,
      ramMax: config.ram,
      disk: 0,
      diskMax: 50000,
      uptime: 0,
      directory: `/opt/minecraft/${(config.serverName ?? 'new-server').toLowerCase().replace(/\s+/g, '-')}`,
      startupCommand: 'java -Xms1G -Xmx4G -jar server.jar --nogui',
      createdAt: new Date().toISOString(),
      softwareBuild: config.softwareBuild,
    };
    _servers = [..._servers, newServer];
    return newServer;
  },
  async deleteServer(id, confirmName) {
    await delay(300);
    const srv = _servers.find(s => s.id === id);
    if (!srv || srv.name !== confirmName) throw new Error('Server name mismatch');
    _servers = _servers.filter(s => s.id !== id);
  },
  async importServer(file) {
    await delay(2000);
    const inspectionId = `import-${Date.now()}`;
    const inspection: ImportInspection = {
      detectedName: file.name.replace('.zip', '').replace(/-/g, ' ').toUpperCase(),
      detectedVersion: '1.21.1',
      detectedSoftware: 'Paper',
      detectedJar: 'paper-1.21.1-196.jar',
      activeWorld: 'world',
      worlds: ['world', 'world_nether', 'world_the_end'],
      pluginCount: 8,
      modCount: 0,
      archiveSize: file.size,
      hasServerProperties: true,
      configFiles: ['server.properties', 'whitelist.json', 'ops.json'],
    };
    return { inspectionId, inspection };
  },
  async confirmImport(_inspectionId, serverName) {
    await delay(3000);
    const newServer: Server = {
      id: `server-${Date.now()}`,
      name: serverName,
      status: 'OFFLINE',
      software: 'Paper',
      minecraftVersion: '1.21.1',
      javaVersion: 'Java 21',
      ip: '0.0.0.0',
      port: 25570,
      playerCount: 0,
      maxPlayers: 20,
      cpu: 0,
      ram: 0,
      ramMax: 8192,
      disk: 500000,
      diskMax: 100000,
      uptime: 0,
      directory: `/opt/minecraft/${serverName.toLowerCase().replace(/\s+/g, '-')}`,
      startupCommand: 'java -Xms1G -Xmx8G -jar server.jar --nogui',
      createdAt: new Date().toISOString(),
    };
    _servers = [..._servers, newServer];
    return newServer;
  },
  async exportServer(id, onProgress) {
    onProgress({ stage: 'preparing', percent: 0, message: 'Preparing files...' });
    await delay(800);
    for (let i = 10; i <= 80; i += 10) {
      onProgress({ stage: 'compressing', percent: i, message: `Compressing... ${i}%` });
      await delay(400);
    }
    onProgress({ stage: 'finalizing', percent: 90, message: 'Finalizing archive...' });
    await delay(600);
    onProgress({ stage: 'complete', percent: 100, message: 'Export complete!' });
    return `${id}-export-${Date.now()}.zip`;
  },
  async getServerSettings(id) { await delay(200); return _settings[id] ?? null; },
  async updateServerSettings(id, settings) {
    await delay(400);
    _settings[id] = { ..._settings[id], ...settings } as ServerSettings;
  },
};

// ============================================================
// Console Service
// ============================================================
export const consoleService: IConsoleService = {
  async getConsoleHistory(id, mode) {
    await delay(300);
    const hist = _consoleHistory[id] ?? [];
    if (mode === 'live') return hist.slice(-100);
    if (mode === 'today') return hist.filter(e => new Date(e.timestamp).toDateString() === new Date().toDateString());
    if (mode === 'yesterday') {
      const y = new Date(); y.setDate(y.getDate() - 1);
      return hist.filter(e => new Date(e.timestamp).toDateString() === y.toDateString());
    }
    return hist;
  },
  async sendCommand(id, command) {
    await delay(100);
    const entry: ConsoleEntry = {
      id: `cmd-${Date.now()}`,
      timestamp: new Date().toISOString(),
      severity: 'COMMAND',
      message: `[${new Date().toTimeString().slice(0, 8)} INFO]: KeerDubi issued server command: /${command}`,
      source: 'LIVE',
    };
    if (!_consoleHistory[id]) _consoleHistory[id] = [];
    _consoleHistory[id].push(entry);
  },
  async clearConsole(id) {
    _consoleHistory[id] = [];
  },
  subscribeToLive(id, onEntry) {
    let idx = 0;
    const entries = MOCK_LIVE_ENTRIES;
    const tid = setInterval(() => {
      const entry: ConsoleEntry = {
        ...entries[idx % entries.length],
        id: `live-${Date.now()}-${idx}`,
        timestamp: new Date().toISOString(),
        message: entries[idx % entries.length].message.replace(/\d{2}:\d{2}:\d{2}/, new Date().toTimeString().slice(0, 8)),
      };
      if (!_consoleHistory[id]) _consoleHistory[id] = [];
      _consoleHistory[id].push(entry);
      onEntry(entry);
      idx++;
    }, 3500);
    return () => clearInterval(tid);
  },
};

// ============================================================
// Player Service
// ============================================================
export const playerService: IPlayerService = {
  async getPlayers(id) { await delay(300); return _players[id] ?? []; },
  async kickPlayer(id, username) {
    await delay(300);
    _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, online: false } : p);
  },
  async banPlayer(id, username, reason) {
    await delay(300);
    _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, online: false, isBanned: true, banReason: reason ?? 'Banned by administrator', banDate: new Date().toISOString() } : p);
  },
  async unbanPlayer(id, username) {
    await delay(300);
    _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, isBanned: false, banReason: undefined } : p);
  },
  async opPlayer(id, username) {
    await delay(300);
    const exists = (_players[id] ?? []).some(p => p.username === username);
    if (!exists) {
      _players[id] = [...(_players[id] ?? []), { username, uuid: `generated-${Date.now()}`, online: false, isOp: true, isWhitelisted: false, isBanned: false }];
    } else {
      _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, isOp: true } : p);
    }
  },
  async deopPlayer(id, username) {
    await delay(300);
    _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, isOp: false } : p);
  },
  async getWhitelist(id) { await delay(200); return (_players[id] ?? []).filter(p => p.isWhitelisted); },
  async addWhitelistPlayer(id, username) {
    await delay(300);
    const exists = (_players[id] ?? []).some(p => p.username === username);
    if (!exists) {
      _players[id] = [...(_players[id] ?? []), { username, uuid: `generated-${Date.now()}`, online: false, isOp: false, isWhitelisted: true, isBanned: false }];
    } else {
      _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, isWhitelisted: true } : p);
    }
  },
  async removeWhitelistPlayer(id, username) {
    await delay(300);
    _players[id] = (_players[id] ?? []).map(p => p.username === username ? { ...p, isWhitelisted: false } : p);
  },
  async getOperators(id) { await delay(200); return (_players[id] ?? []).filter(p => p.isOp); },
  async getBannedPlayers(id) { await delay(200); return (_players[id] ?? []).filter(p => p.isBanned); },
  async getBannedIPs(id) { await delay(200); return _bannedIPs[id] ?? []; },
  async unbanIP(id, ip) {
    await delay(300);
    _bannedIPs[id] = (_bannedIPs[id] ?? []).filter(b => b.ip !== ip);
  },
};

// ============================================================
// File Service
// ============================================================
export const fileService: IFileService = {
  async getFiles(id, path) { await delay(300); return _files[id]?.[path] ?? []; },
  async getFileContent(_id, path) { await delay(200); return _fileContents[path] ?? `# File: ${path}\n# Content not available in demo\n`; },
  async saveFile(_id, path, content) { await delay(400); _fileContents[path] = content; },
  async uploadFile() { await delay(1000); },
  async downloadFile() { await delay(300); },
  async deleteFile(id, path) {
    await delay(300);
    for (const dir of Object.keys(_files[id] ?? {})) {
      _files[id][dir] = (_files[id][dir] ?? []).filter(f => f.path !== path);
    }
  },
  async renameFile(id, path, newName) {
    await delay(300);
    for (const dir of Object.keys(_files[id] ?? {})) {
      _files[id][dir] = (_files[id][dir] ?? []).map(f => f.path === path ? { ...f, name: newName } : f);
    }
  },
  async createFile(id, path, name) {
    await delay(300);
    if (!_files[id]) _files[id] = {};
    if (!_files[id][path]) _files[id][path] = [];
    _files[id][path].push({ name, path: `${path}/${name}`, type: 'file', size: 0, modified: new Date().toISOString(), extension: name.split('.').pop() });
  },
  async createFolder(id, path, name) {
    await delay(300);
    if (!_files[id]) _files[id] = {};
    if (!_files[id][path]) _files[id][path] = [];
    _files[id][path].push({ name, path: `${path}/${name}`, type: 'directory', modified: new Date().toISOString() });
  },
  async moveFile() { await delay(300); },
  async copyFile() { await delay(300); },
  async zipFiles() { await delay(1000); },
  async extractZip() { await delay(1500); },
};

// ============================================================
// Plugin Service
// ============================================================
export const pluginService: IPluginService = {
  async installModrinth() { throw new Error('Installing Modrinth mods requires the real backend.'); },
  async searchModrinth() { throw new Error('Modrinth browsing requires the real backend. Mock mode does not suggest real downloads.'); },
  async getPlugins(id) { await delay(300); return _plugins[id] ?? []; },
  async getMods(id) { await delay(300); return _mods[id] ?? []; },
  async getModIssues() { await delay(100); return []; },
  async uploadPlugin(id, file) {
    await delay(1200);
    if (!_plugins[id]) _plugins[id] = [];
    _plugins[id].push({ id: `pl-${Date.now()}`, name: file.name.replace('.jar', ''), version: 'unknown', filename: file.name, size: file.size, status: 'enabled' });
  },
  async uploadMod(id, file) {
    await delay(1200);
    if (!_mods[id]) _mods[id] = [];
    _mods[id].push({ id: `md-${Date.now()}`, name: file.name.replace('.jar', ''), version: 'Unknown', filename: file.name, size: file.size, status: 'Unknown' });
  },
  async downloadPlugin() { await delay(300); },
  async downloadMod() { await delay(300); },
  async deletePlugin(id, pluginId) {
    await delay(300);
    _plugins[id] = (_plugins[id] ?? []).filter(p => p.id !== pluginId);
  },
  async deleteMod(id, modId) {
    await delay(300);
    _mods[id] = (_mods[id] ?? []).filter(mod => mod.id !== modId && mod.filename !== modId);
  },
  async togglePlugin(id, pluginId, enabled) {
    await delay(200);
    _plugins[id] = (_plugins[id] ?? []).map(p => p.id === pluginId ? { ...p, status: enabled ? 'enabled' : 'disabled' } : p);
  },
  async toggleMod(id, modId, enabled) {
    await delay(200);
    _mods[id] = (_mods[id] ?? []).map(mod => mod.filename === modId ? { ...mod, filename: enabled ? mod.filename.replace(/\.disabled$/, '') : `${mod.filename}.disabled`, status: enabled ? 'Unknown' : 'Disabled' } : mod);
  },
};

// ============================================================
// Backup Service
// ============================================================
export const backupService: IBackupService = {
  async getBackups(id) { await delay(300); return _backups[id] ?? []; },
  async createBackup(id, onProgress) {
    onProgress({ stage: 'preparing', percent: 0, message: 'Preparing backup...' });
    await delay(500);
    onProgress({ stage: 'compressing', percent: 30, message: 'Compressing world...' });
    await delay(800);
    onProgress({ stage: 'compressing', percent: 65, message: 'Compressing world... 65%' });
    await delay(600);
    onProgress({ stage: 'compressing', percent: 85, message: 'Finishing compression...' });
    await delay(400);
    onProgress({ stage: 'finalizing', percent: 95, message: 'Finalizing...' });
    await delay(400);
    const backup: Backup = {
      id: `bk-${Date.now()}`,
      serverId: id,
      name: `manual-backup-${new Date().toISOString().slice(0, 10)}`,
      date: new Date().toISOString(),
      size: 524288000,
      type: 'manual',
      status: 'completed',
    };
    if (!_backups[id]) _backups[id] = [];
    _backups[id] = [backup, ..._backups[id]];
    onProgress({ stage: 'complete', percent: 100, message: 'Backup complete!' });
    return backup;
  },
  async restoreBackup() { await delay(2000); },
  async deleteBackup(id, backupId) {
    await delay(300);
    _backups[id] = (_backups[id] ?? []).filter(b => b.id !== backupId);
  },
  async downloadBackup() { await delay(300); },
};

// ============================================================
// Schedule Service
// ============================================================
export const scheduleService: IScheduleService = {
  async getSchedules(id) { await delay(300); return _schedules[id] ?? []; },
  async createSchedule(id, data) {
    await delay(300);
    const sc: Schedule = { ...data, id: `sc-${Date.now()}`, serverId: id };
    if (!_schedules[id]) _schedules[id] = [];
    _schedules[id] = [..._schedules[id], sc];
    return sc;
  },
  async updateSchedule(id, scheduleId, data) {
    await delay(300);
    _schedules[id] = (_schedules[id] ?? []).map(s => s.id === scheduleId ? { ...s, ...data } : s);
  },
  async deleteSchedule(id, scheduleId) {
    await delay(300);
    _schedules[id] = (_schedules[id] ?? []).filter(s => s.id !== scheduleId);
  },
  async runScheduleNow() { await delay(500); },
};

// ============================================================
// Global Service
// ============================================================
export const globalService: IGlobalService = {
  async getActivity(filters) {
    await delay(300);
    let events = [...MOCK_ACTIVITY];
    if (filters?.serverId) events = events.filter(e => e.serverId === filters.serverId);
    if (filters?.category) events = events.filter(e => e.category === filters.category);
    return events;
  },
  async getLogs() { await delay(300); return [...MOCK_LOGS]; },
  async getHostStats() { await delay(200); return { ...MOCK_HOST_STATS, cpuUsage: Math.max(10, Math.min(90, MOCK_HOST_STATS.cpuUsage + (Math.random() - 0.5) * 10)) }; },
  async getHostHistory() { return []; },
  async getNotifications() { await delay(200); return [..._notifications]; },
  async markNotificationRead(id) {
    await delay(100);
    _notifications = _notifications.map(n => n.id === id ? { ...n, read: true } : n);
  },
  async markAllNotificationsRead() {
    await delay(100);
    _notifications = _notifications.map(n => ({ ...n, read: true }));
  },
  async getBots() { await delay(300); return [..._bots]; },
  async getBot(id) { await delay(200); return _bots.find(b => b.id === id) ?? null; },
  async startBot(id) {
    await delay(800);
    _bots = _bots.map(b => b.id === id ? { ...b, status: 'online' } : b);
  },
  async stopBot(id) {
    await delay(500);
    _bots = _bots.map(b => b.id === id ? { ...b, status: 'offline' } : b);
  },
  async getGlobalSettings() { await delay(200); return { ..._globalSettings }; },
  async updateGlobalSettings(settings) {
    await delay(400);
    _globalSettings = { ..._globalSettings, ...settings };
  },
};

const MOCK_SOFTWARE: InstallableServerSoftware[] = ['Vanilla', 'Paper', 'Purpur', 'Fabric', 'Forge', 'NeoForge'];

export const softwareCatalogService: ISoftwareCatalogService = {
  async getCatalog() {
    await delay(200);
    const versions = [...new Set(MOCK_SERVERS.map((server) => server.minecraftVersion))].map((id) => ({ id, stable: true }));
    return { refreshedAt: new Date().toISOString(), providers: MOCK_SOFTWARE.map((software) => ({ software, versions })) } satisfies SoftwareCatalog;
  },
  async getBuilds() { await delay(100); return [{ id: 'mock-latest', label: 'Latest', stable: true }]; },
  async refresh() { return this.getCatalog(); },
};
