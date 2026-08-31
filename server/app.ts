import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import AdmZip from 'adm-zip';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type {
  ActivityEvent,
  Backup,
  Bot,
  Player,
  Schedule,
  ServerFile,
  ServerSettings,
} from '../src/types/index.js';
import type { BackendConfig } from './config.js';
import { DashboardEvents } from './events.js';
import { ProcessManager } from './processManager.js';
import { ScheduleRunner } from './scheduleRunner.js';
import {
  assertFileName,
  assertIdentifier,
  assertSafeArchiveEntry,
  assertWritable,
  resolveInside,
  SecurityError,
} from './security.js';
import { JsonStore } from './store.js';
import type { DashboardState, ManagedServer } from './types.js';
import { HostMetricsSampler } from './hostMetrics.js';

interface AppContext {
  app: FastifyInstance;
  store: JsonStore;
  processes: ProcessManager;
  hostMetrics: HostMetricsSampler;
  config: BackendConfig;
}

interface ImportCandidate {
  buffer: Buffer;
  inspection: {
    detectedName: string;
    worlds: string[];
    pluginCount: number;
    modCount: number;
    archiveSize: number;
    hasServerProperties: boolean;
    configFiles: string[];
  };
}

const imports = new Map<string, ImportCandidate>();
const ok = <T>(data: T) => ({ data });

function params(request: { params: unknown }): Record<string, string> {
  return request.params as Record<string, string>;
}

function query(request: { query: unknown }): Record<string, string | undefined> {
  return request.query as Record<string, string | undefined>;
}

function body<T>(request: { body: unknown }): T {
  return request.body as T;
}

function serverById(state: DashboardState, id: string): ManagedServer {
  assertIdentifier(id, 'server identifier');
  const server = state.servers.find((item) => item.id === id);
  if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });
  return server;
}

async function serverPath(context: AppContext, id: string, requested = '/'): Promise<string> {
  const server = serverById(context.store.get(), id);
  const root = await resolveInside(context.config.serversRoot, path.relative(context.config.serversRoot, server.directory) || '/');
  return resolveInside(root, requested);
}

function writable(config: BackendConfig): void {
  assertWritable(config.readOnly);
}

async function recordActivity(store: JsonStore, event: Omit<ActivityEvent, 'id' | 'timestamp'>): Promise<void> {
  await store.update((state) => {
    state.activity.unshift({ ...event, id: randomUUID(), timestamp: new Date().toISOString() });
    state.activity = state.activity.slice(0, 1000);
  });
}

function properties(settings: ServerSettings): string {
  const values: Record<string, string | number | boolean> = {
    'server-port': settings.serverPort,
    'max-players': settings.maxPlayers,
    motd: settings.motd,
    gamemode: settings.gamemode,
    difficulty: settings.difficulty,
    'online-mode': !settings.crackedMode,
    'white-list': settings.whitelist,
    'allow-flight': settings.allowFlight,
    pvp: settings.pvp,
    'enable-command-block': settings.commandBlocks,
    hardcore: settings.hardcore,
    'spawn-animals': settings.spawnAnimals,
    'spawn-monsters': settings.spawnMonsters,
    'spawn-npcs': settings.spawnNpcs,
    'spawn-protection': settings.spawnProtection,
    'view-distance': settings.viewDistance,
    'simulation-distance': settings.simulationDistance,
    ...settings.rawProperties,
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

function defaultServerSettings(serverId: string, serverName: string): ServerSettings {
  return { serverId, serverName, motd: serverName, serverPort: 25565, maxPlayers: 20, gamemode: 'survival', difficulty: 'normal', crackedMode: false, whitelist: false, allowFlight: false, pvp: true, commandBlocks: false, hardcore: false, spawnAnimals: true, spawnMonsters: true, spawnNpcs: true, spawnProtection: 16, viewDistance: 10, simulationDistance: 10, rawProperties: {} };
}

async function listFiles(directory: string, serverRoot: string): Promise<ServerFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return Promise.all(entries.filter((entry) => !entry.isSymbolicLink()).map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    const info = await stat(absolute);
    const relative = `/${path.relative(serverRoot, absolute).split(path.sep).join('/')}`;
    return {
      name: entry.name,
      path: relative,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isFile() ? info.size : undefined,
      modified: info.mtime.toISOString(),
      extension: entry.isFile() ? path.extname(entry.name).slice(1) || undefined : undefined,
    } satisfies ServerFile;
  }));
}

function sendDownload(reply: FastifyReply, filePath: string, name = path.basename(filePath)): FastifyReply {
  reply.header('Content-Disposition', `attachment; filename="${name.replace(/["\r\n]/g, '_')}"`);
  return reply.send(createReadStream(filePath));
}

function addDirectoryToZip(zip: AdmZip, directory: string, archivePath = ''): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new SecurityError('Symbolic links cannot be included in archives');
    const source = path.join(directory, entry.name);
    const destination = path.posix.join(archivePath, entry.name);
    if (entry.isDirectory()) addDirectoryToZip(zip, source, destination);
    else zip.addLocalFile(source, path.posix.dirname(destination) === '.' ? '' : path.posix.dirname(destination));
  }
}

function zipDirectory(directory: string): Buffer {
  const zip = new AdmZip(); addDirectoryToZip(zip, directory); return zip.toBuffer();
}

function validateArchive(zip: AdmZip): void {
  for (const entry of zip.getEntries()) assertSafeArchiveEntry(entry.entryName);
}

async function createBackup(context: AppContext, id: string): Promise<Backup> {
  const root = await serverPath(context, id, '/');
  const backupRoot = await resolveInside(root, '/backups');
  await mkdir(backupRoot, { recursive: true });
  const backup: Backup = {
    id: randomUUID(), serverId: id, name: `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`,
    date: new Date().toISOString(), size: 0, type: 'manual', status: 'running',
  };
  const output = await resolveInside(backupRoot, `/${backup.name}`);
  const zip = new AdmZip();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'backups' || entry.isSymbolicLink()) continue;
    const source = path.join(root, entry.name);
    if (entry.isDirectory()) addDirectoryToZip(zip, source, entry.name);
    else zip.addLocalFile(source);
  }
  await writeFile(output, zip.toBuffer());
  backup.size = (await stat(output)).size;
  backup.status = 'completed';
  await context.store.update((state) => {
    state.backups[id] = [backup, ...(state.backups[id] ?? [])];
  });
  return backup;
}

function registerReadRoutes(context: AppContext): void {
  const { app, store, processes, hostMetrics } = context;
  app.get('/api/v1/health', async () => ok({ status: 'ok', readOnly: context.config.readOnly }));
  app.get('/api/v1/servers', async () => ok(await processes.serverSnapshots()));
  app.get('/api/v1/servers/:id', async (request) => {
    const id = params(request).id ?? '';
    assertIdentifier(id, 'server identifier');
    const server = await processes.serverSnapshot(id);
    if (!server) throw Object.assign(new Error('Server not found'), { statusCode: 404 });
    return ok(server);
  });
  app.get('/api/v1/servers/:id/stats', async (request) => ok(await processes.stats(params(request).id ?? '')));
  app.get('/api/v1/servers/:id/settings', async (request) => ok(store.get().settings[params(request).id ?? ''] ?? null));
  app.get('/api/v1/servers/:id/console', async (request) => ok(processes.getHistory(params(request).id ?? '')));
  app.get('/api/v1/servers/:id/players', async (request) => ok(store.get().players[params(request).id ?? ''] ?? []));
  app.get('/api/v1/servers/:id/banned-ips', async (request) => ok(store.get().bannedIPs[params(request).id ?? ''] ?? []));
  app.get('/api/v1/servers/:id/files', async (request) => {
    const id = params(request).id ?? '';
    const root = await serverPath(context, id, '/');
    return ok(await listFiles(await serverPath(context, id, query(request).path ?? '/'), root));
  });
  app.get('/api/v1/servers/:id/files/content', async (request) => ok(await readFile(await serverPath(context, params(request).id ?? '', query(request).path ?? ''), 'utf8')));
  app.get('/api/v1/servers/:id/files/download', async (request, reply) => sendDownload(reply, await serverPath(context, params(request).id ?? '', query(request).path ?? '')));
  app.get('/api/v1/servers/:id/plugins', async (request) => ok(await jars(context, params(request).id ?? '', '/plugins')));
  app.get('/api/v1/servers/:id/mods', async (request) => ok(await jars(context, params(request).id ?? '', '/mods')));
  app.get('/api/v1/servers/:id/backups', async (request) => ok(store.get().backups[params(request).id ?? ''] ?? []));
  app.get('/api/v1/servers/:id/backups/:backupId/download', async (request, reply) => {
    const p = params(request); const backup = (store.get().backups[p.id ?? ''] ?? []).find((item) => item.id === p.backupId);
    if (!backup) throw Object.assign(new Error('Backup not found'), { statusCode: 404 });
    return sendDownload(reply, await serverPath(context, p.id ?? '', `/backups/${backup.name}`), backup.name);
  });
  app.get('/api/v1/servers/:id/schedules', async (request) => ok(store.get().schedules[params(request).id ?? ''] ?? []));
  app.get('/api/v1/activity', async () => ok(store.get().activity));
  app.get('/api/v1/logs', async () => ok(store.get().logs));
  app.get('/api/v1/notifications', async () => ok(store.get().notifications));
  app.get('/api/v1/bots', async () => ok(store.get().bots));
  app.get('/api/v1/bots/:id', async (request) => ok(store.get().bots.find((item) => item.id === params(request).id) ?? null));
  app.get('/api/v1/settings', async () => ok(store.get().globalSettings));
  app.get('/api/v1/host/stats', async () => {
    const total = os.totalmem(); const free = os.freemem();
    const [disk, network] = await Promise.all([statfs(context.config.serversRoot), hostMetrics.networkRates()]);
    const diskTotal = Number(disk.blocks * disk.bsize) / 1073741824; const diskFree = Number(disk.bavail * disk.bsize) / 1073741824;
    return ok({ uptime: os.uptime(), cpuModel: os.cpus()[0]?.model ?? 'Unknown', cpuUsage: hostMetrics.cpuUsage(), ramTotal: total / 1048576, ramUsed: (total - free) / 1048576, diskTotal, diskUsed: diskTotal - diskFree, ...network });
  });
}

async function jars(context: AppContext, id: string, directory: string) {
  const root = await serverPath(context, id, directory);
  if (!existsSync(root)) return [];
  return (await readdir(root, { withFileTypes: true })).filter((item) => item.isFile() && /\.jar(?:\.disabled)?$/i.test(item.name)).map((item) => ({
    id: item.name, name: item.name.replace(/\.jar(?:\.disabled)?$/i, ''), version: 'unknown', filename: item.name,
    size: 0, status: item.name.endsWith('.disabled') ? 'disabled' : 'enabled',
  }));
}

function registerWriteRoutes(context: AppContext): void {
  const { app, store, processes, config } = context;
  const guard = () => writable(config);
  app.post('/api/v1/servers/:id/start', async (request) => { guard(); await processes.start(params(request).id ?? ''); return ok(null); });
  app.post('/api/v1/servers/:id/stop', async (request) => { guard(); await processes.stop(params(request).id ?? ''); return ok(null); });
  app.post('/api/v1/servers/:id/restart', async (request) => { guard(); await processes.restart(params(request).id ?? ''); return ok(null); });
  app.post('/api/v1/servers/:id/kill', async (request) => { guard(); await processes.kill(params(request).id ?? ''); return ok(null); });
  app.post('/api/v1/servers', async (request, reply) => {
    guard(); const input = body<Record<string, unknown>>(request); const id = randomUUID();
    const name = String(input.serverName ?? 'Minecraft Server').trim(); assertFileName(name);
    const directory = await resolveInside(config.serversRoot, `/${id}`); await mkdir(directory, { recursive: true });
    const ram = Number(input.ram ?? 4096); const port = Number(input.port ?? 25565); const maxPlayers = Number(input.maxPlayers ?? 20);
    const server: ManagedServer = { id, name, status: 'OFFLINE', software: String(input.serverType ?? 'Paper') as ManagedServer['software'], minecraftVersion: String(input.minecraftVersion ?? '1.21.4'), javaVersion: String(input.javaVersion ?? 'Java 21'), ip: '0.0.0.0', port, playerCount: 0, maxPlayers, cpu: 0, ram: 0, ramMax: ram, disk: 0, diskMax: 0, uptime: 0, directory, startupCommand: `java -Xms512M -Xmx${ram}M -jar server.jar nogui`, startupExecutable: 'java', startupArgs: [`-Xms512M`, `-Xmx${ram}M`, '-jar', 'server.jar', 'nogui'], createdAt: new Date().toISOString() };
    const settings: ServerSettings = { serverId: id, serverName: name, motd: name, serverPort: port, maxPlayers, gamemode: String(input.gamemode ?? 'survival') as ServerSettings['gamemode'], difficulty: String(input.difficulty ?? 'normal') as ServerSettings['difficulty'], crackedMode: Boolean(input.crackedMode), whitelist: Boolean(input.whitelist), allowFlight: Boolean(input.allowFlight), pvp: input.pvp !== false, commandBlocks: Boolean(input.commandBlocks), hardcore: false, spawnAnimals: true, spawnMonsters: true, spawnNpcs: true, spawnProtection: 16, viewDistance: Number(input.viewDistance ?? 10), simulationDistance: Number(input.simulationDistance ?? 10), rawProperties: {} };
    await writeFile(path.join(directory, 'server.properties'), properties(settings)); await writeFile(path.join(directory, 'eula.txt'), 'eula=false\n');
    await store.update((state) => { state.servers.push(server); state.settings[id] = settings; state.players[id] = []; state.backups[id] = []; state.schedules[id] = []; });
    reply.code(201); return ok(server);
  });
  app.delete('/api/v1/servers/:id', async (request) => { guard(); const id = params(request).id ?? ''; const server = serverById(store.get(), id); if (body<{ confirmName: string }>(request).confirmName !== server.name) throw Object.assign(new Error('Server name mismatch'), { statusCode: 409 }); await processes.kill(id); await rm(server.directory, { recursive: true, force: true }); await store.update((state) => { state.servers = state.servers.filter((item) => item.id !== id); delete state.settings[id]; delete state.players[id]; delete state.backups[id]; delete state.schedules[id]; }); return ok(null); });
  app.patch('/api/v1/servers/:id/settings', async (request) => { guard(); const id = params(request).id ?? ''; const current = store.get().settings[id]; if (!current) throw Object.assign(new Error('Settings not found'), { statusCode: 404 }); const next = { ...current, ...body<Partial<ServerSettings>>(request), serverId: id }; await writeFile(await serverPath(context, id, '/server.properties'), properties(next)); await store.update((state) => { state.settings[id] = next; }); return ok(null); });
  app.post('/api/v1/servers/:id/console/commands', async (request) => { guard(); processes.sendCommand(params(request).id ?? '', body<{ command: string }>(request).command); return ok(null); });
  app.delete('/api/v1/servers/:id/console', async (request) => { guard(); processes.clearHistory(params(request).id ?? ''); return ok(null); });
  registerPlayerWrites(context); registerFileWrites(context); registerBackupWrites(context); registerScheduleWrites(context); registerGlobalWrites(context);
}

function registerPlayerWrites(context: AppContext): void {
  const { app, store, processes, config } = context;
  const action = (command: (username: string, reason?: string) => string, update: (players: Player[], username: string, reason?: string) => Player[]) => async (request: { params: unknown; body: unknown }) => {
    writable(config); const id = params(request).id ?? ''; const input = body<{ username: string; reason?: string }>(request); assertFileName(input.username); processes.sendCommand(id, command(input.username, input.reason)); await store.update((state) => { state.players[id] = update(state.players[id] ?? [], input.username, input.reason); }); return ok(null);
  };
  app.post('/api/v1/servers/:id/players/kick', action((u, r) => `kick ${u}${r ? ` ${r}` : ''}`, (ps, u) => ps.map((p) => p.username === u ? { ...p, online: false } : p)));
  app.post('/api/v1/servers/:id/players/ban', action((u, r) => `ban ${u}${r ? ` ${r}` : ''}`, (ps, u, r) => ps.map((p) => p.username === u ? { ...p, online: false, isBanned: true, banReason: r } : p)));
  app.post('/api/v1/servers/:id/players/unban', action((u) => `pardon ${u}`, (ps, u) => ps.map((p) => p.username === u ? { ...p, isBanned: false } : p)));
  app.post('/api/v1/servers/:id/players/op', action((u) => `op ${u}`, (ps, u) => ps.map((p) => p.username === u ? { ...p, isOp: true } : p)));
  app.post('/api/v1/servers/:id/players/deop', action((u) => `deop ${u}`, (ps, u) => ps.map((p) => p.username === u ? { ...p, isOp: false } : p)));
  app.post('/api/v1/servers/:id/players/whitelist', action((u) => `whitelist add ${u}`, (ps, u) => ps.map((p) => p.username === u ? { ...p, isWhitelisted: true } : p)));
  app.delete('/api/v1/servers/:id/players/whitelist', action((u) => `whitelist remove ${u}`, (ps, u) => ps.map((p) => p.username === u ? { ...p, isWhitelisted: false } : p)));
  app.post('/api/v1/servers/:id/banned-ips/unban', async (request) => { writable(config); const id = params(request).id ?? ''; const ip = body<{ ip: string }>(request).ip; processes.sendCommand(id, `pardon-ip ${ip}`); await store.update((state) => { state.bannedIPs[id] = (state.bannedIPs[id] ?? []).filter((item) => item.ip !== ip); }); return ok(null); });
}

function registerFileWrites(context: AppContext): void {
  const { app, config } = context; const guard = () => writable(config);
  app.put('/api/v1/servers/:id/files/content', async (request) => { guard(); const q = query(request); await writeFile(await serverPath(context, params(request).id ?? '', q.path ?? ''), body<{ content: string }>(request).content, 'utf8'); return ok(null); });
  app.post('/api/v1/servers/:id/files/upload', async (request) => { guard(); const part = await request.file(); if (!part) throw Object.assign(new Error('File is required'), { statusCode: 400 }); const directory = await serverPath(context, params(request).id ?? '', query(request).path ?? '/'); const target = await resolveInside(directory, `/${assertFileName(part.filename)}`); await pipeline(part.file, (await import('node:fs')).createWriteStream(target, { flags: 'wx' })); return ok(null); });
  app.delete('/api/v1/servers/:id/files', async (request) => { guard(); await rm(await serverPath(context, params(request).id ?? '', query(request).path ?? ''), { recursive: true, force: true }); return ok(null); });
  app.post('/api/v1/servers/:id/files/create', async (request) => { guard(); const input = body<{ path: string; name: string; type: 'file' | 'directory' }>(request); const directory = await serverPath(context, params(request).id ?? '', input.path); const target = await resolveInside(directory, `/${assertFileName(input.name)}`); if (input.type === 'directory') await mkdir(target); else await writeFile(target, '', { flag: 'wx' }); return ok(null); });
  app.post('/api/v1/servers/:id/files/rename', async (request) => { guard(); const input = body<{ path: string; newName: string }>(request); const source = await serverPath(context, params(request).id ?? '', input.path); await rename(source, await resolveInside(path.dirname(source), `/${assertFileName(input.newName)}`)); return ok(null); });
  app.post('/api/v1/servers/:id/files/move', async (request) => { guard(); const input = body<{ src: string; dest: string }>(request); await rename(await serverPath(context, params(request).id ?? '', input.src), await serverPath(context, params(request).id ?? '', input.dest)); return ok(null); });
  app.post('/api/v1/servers/:id/files/copy', async (request) => { guard(); const input = body<{ src: string; dest: string }>(request); const source = await serverPath(context, params(request).id ?? '', input.src); const dest = await serverPath(context, params(request).id ?? '', input.dest); if ((await stat(source)).isDirectory()) await cp(source, dest, { recursive: true, errorOnExist: true }); else await copyFile(source, dest); return ok(null); });
  app.post('/api/v1/servers/:id/files/zip', async (request) => { guard(); const input = body<{ paths: string[] }>(request); const root = await serverPath(context, params(request).id ?? '', '/'); const zip = new AdmZip(); for (const item of input.paths) { const source = await serverPath(context, params(request).id ?? '', item); const name = path.basename(source); if ((await stat(source)).isDirectory()) zip.addLocalFolder(source, name); else zip.addLocalFile(source); } await writeFile(path.join(root, `archive-${Date.now()}.zip`), zip.toBuffer()); return ok(null); });
  app.post('/api/v1/servers/:id/files/extract', async (request) => { guard(); const archive = await serverPath(context, params(request).id ?? '', body<{ path: string }>(request).path); const zip = new AdmZip(archive); validateArchive(zip); const destination = path.dirname(archive); for (const entry of zip.getEntries()) { const output = await resolveInside(destination, `/${assertSafeArchiveEntry(entry.entryName)}`); if (entry.isDirectory) await mkdir(output, { recursive: true }); else { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, entry.getData(), { flag: 'wx' }); } } return ok(null); });
}

function registerBackupWrites(context: AppContext): void {
  const { app, store, config } = context;
  app.post('/api/v1/servers/:id/backups', async (request, reply) => { writable(config); const result = await createBackup(context, params(request).id ?? ''); reply.code(201); return ok(result); });
  app.post('/api/v1/servers/:id/backups/:backupId/restore', async (request) => { writable(config); const p = params(request); const backup = (store.get().backups[p.id ?? ''] ?? []).find((item) => item.id === p.backupId); if (!backup) throw Object.assign(new Error('Backup not found'), { statusCode: 404 }); const root = await serverPath(context, p.id ?? '', '/'); const zip = new AdmZip(await serverPath(context, p.id ?? '', `/backups/${backup.name}`)); validateArchive(zip); for (const entry of zip.getEntries()) { const output = await resolveInside(root, `/${assertSafeArchiveEntry(entry.entryName)}`); if (entry.isDirectory) await mkdir(output, { recursive: true }); else { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, entry.getData()); } } return ok(null); });
  app.delete('/api/v1/servers/:id/backups/:backupId', async (request) => { writable(config); const p = params(request); const backup = (store.get().backups[p.id ?? ''] ?? []).find((item) => item.id === p.backupId); if (backup) await rm(await serverPath(context, p.id ?? '', `/backups/${backup.name}`), { force: true }); await store.update((state) => { state.backups[p.id ?? ''] = (state.backups[p.id ?? ''] ?? []).filter((item) => item.id !== p.backupId); }); return ok(null); });
}

function registerScheduleWrites(context: AppContext): void {
  const { app, store, config } = context;
  app.post('/api/v1/servers/:id/schedules', async (request, reply) => { writable(config); const id = params(request).id ?? ''; const schedule = { ...body<Omit<Schedule, 'id' | 'serverId'>>(request), id: randomUUID(), serverId: id }; await store.update((state) => { state.schedules[id] = [...(state.schedules[id] ?? []), schedule]; }); reply.code(201); return ok(schedule); });
  app.patch('/api/v1/servers/:id/schedules/:scheduleId', async (request) => { writable(config); const p = params(request); await store.update((state) => { state.schedules[p.id ?? ''] = (state.schedules[p.id ?? ''] ?? []).map((item) => item.id === p.scheduleId ? { ...item, ...body<Partial<Schedule>>(request), id: item.id, serverId: item.serverId } : item); }); return ok(null); });
  app.delete('/api/v1/servers/:id/schedules/:scheduleId', async (request) => { writable(config); const p = params(request); await store.update((state) => { state.schedules[p.id ?? ''] = (state.schedules[p.id ?? ''] ?? []).filter((item) => item.id !== p.scheduleId); }); return ok(null); });
  app.post('/api/v1/servers/:id/schedules/:scheduleId/run', async (request) => { writable(config); const p = params(request); const schedule = (store.get().schedules[p.id ?? ''] ?? []).find((item) => item.id === p.scheduleId); if (!schedule) throw Object.assign(new Error('Schedule not found'), { statusCode: 404 }); await runSchedule(context, schedule); return ok(null); });
}

async function runSchedule(context: AppContext, schedule: Schedule): Promise<void> {
  if (schedule.action === 'start-server') await context.processes.start(schedule.serverId);
  else if (schedule.action === 'stop-server') await context.processes.stop(schedule.serverId);
  else if (schedule.action === 'restart-server') await context.processes.restart(schedule.serverId);
  else if (schedule.action === 'create-backup') await createBackup(context, schedule.serverId);
  else if (schedule.action === 'execute-command' && schedule.command) context.processes.sendCommand(schedule.serverId, schedule.command);
  else if (schedule.action === 'send-announcement' && schedule.message) context.processes.sendCommand(schedule.serverId, `say ${schedule.message}`);
  else if (schedule.action === 'save-world') context.processes.sendCommand(schedule.serverId, 'save-all');
}

function registerGlobalWrites(context: AppContext): void {
  const { app, store, config } = context;
  app.post('/api/v1/notifications/:id/read', async (request) => { writable(config); await store.update((state) => { state.notifications = state.notifications.map((item) => item.id === params(request).id ? { ...item, read: true } : item); }); return ok(null); });
  app.post('/api/v1/notifications/read-all', async () => { writable(config); await store.update((state) => { state.notifications = state.notifications.map((item) => ({ ...item, read: true })); }); return ok(null); });
  app.post('/api/v1/bots/:id/start', async (request) => { writable(config); await setBotStatus(store, params(request).id ?? '', 'online'); return ok(null); });
  app.post('/api/v1/bots/:id/stop', async (request) => { writable(config); await setBotStatus(store, params(request).id ?? '', 'offline'); return ok(null); });
  app.patch('/api/v1/settings', async (request) => { writable(config); await store.update((state) => { state.globalSettings = { ...state.globalSettings, ...body(request) }; }); return ok(null); });
}

async function setBotStatus(store: JsonStore, id: string, status: Bot['status']): Promise<void> {
  await store.update((state) => { state.bots = state.bots.map((item) => item.id === id ? { ...item, status } : item); });
}

function registerImportsAndExports(context: AppContext): void {
  const { app, store, config } = context;
  app.post('/api/v1/imports/inspect', async (request) => { writable(config); const part = await request.file(); if (!part) throw Object.assign(new Error('ZIP file is required'), { statusCode: 400 }); const buffer = await part.toBuffer(); const zip = new AdmZip(buffer); validateArchive(zip); const names = zip.getEntries().map((entry) => entry.entryName); const inspection = { detectedName: part.filename.replace(/\.zip$/i, ''), worlds: names.filter((name) => /(^|\/)level\.dat$/i.test(name)).map((name) => path.posix.dirname(name)), pluginCount: names.filter((name) => /(^|\/)plugins\/[^/]+\.jar$/i.test(name)).length, modCount: names.filter((name) => /(^|\/)mods\/[^/]+\.jar$/i.test(name)).length, archiveSize: buffer.length, hasServerProperties: names.some((name) => /(^|\/)server\.properties$/i.test(name)), configFiles: names.filter((name) => /\.(json|ya?ml|properties|toml)$/i.test(name)).slice(0, 100) }; const inspectionId = randomUUID(); imports.set(inspectionId, { buffer, inspection }); return ok({ inspectionId, inspection }); });
  app.post('/api/v1/imports/:inspectionId/confirm', async (request, reply) => { writable(config); const inspectionId = params(request).inspectionId ?? ''; const candidate = imports.get(inspectionId); if (!candidate) throw Object.assign(new Error('Import inspection expired'), { statusCode: 404 }); const name = body<{ serverName: string }>(request).serverName.trim(); assertFileName(name); const id = randomUUID(); const directory = await resolveInside(config.serversRoot, `/${id}`); await mkdir(directory, { recursive: true }); const zip = new AdmZip(candidate.buffer); for (const entry of zip.getEntries()) { const output = await resolveInside(directory, `/${assertSafeArchiveEntry(entry.entryName)}`); if (entry.isDirectory) await mkdir(output, { recursive: true }); else { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, entry.getData(), { flag: 'wx' }); } } const jarsFound = (await readdir(directory)).filter((item) => item.endsWith('.jar')); const jar = jarsFound[0] ?? 'server.jar'; const server: ManagedServer = { id, name, status: 'OFFLINE', software: 'Paper', minecraftVersion: 'unknown', javaVersion: 'Java', ip: '0.0.0.0', port: 25565, playerCount: 0, maxPlayers: 20, cpu: 0, ram: 0, ramMax: 4096, disk: 0, diskMax: 0, uptime: 0, directory, startupCommand: `java -Xms512M -Xmx4096M -jar ${jar} nogui`, startupExecutable: 'java', startupArgs: ['-Xms512M', '-Xmx4096M', '-jar', jar, 'nogui'], createdAt: new Date().toISOString() }; await store.update((state) => { state.servers.push(server); state.settings[id] = defaultServerSettings(id, name); state.players[id] = []; state.backups[id] = []; state.schedules[id] = []; }); imports.delete(inspectionId); reply.code(201); return ok(server); });
  app.get('/api/v1/servers/:id/export', async (request, reply) => { const id = params(request).id ?? ''; const server = serverById(store.get(), id); const buffer = zipDirectory(await serverPath(context, id, '/')); reply.header('Content-Type', 'application/zip'); reply.header('Content-Disposition', `attachment; filename="${server.name.replace(/[^A-Za-z0-9._-]/g, '-')}.zip"`); return reply.send(buffer); });
}

function registerPluginWrites(context: AppContext): void {
  const { app, config } = context;
  for (const type of ['plugins', 'mods'] as const) {
    app.post(`/api/v1/servers/:id/${type}/upload`, async (request) => { writable(config); const part = await request.file(); if (!part || !part.filename.endsWith('.jar')) throw Object.assign(new Error('A JAR file is required'), { statusCode: 400 }); const root = await serverPath(context, params(request).id ?? '', `/${type}`); await mkdir(root, { recursive: true }); await pipeline(part.file, (await import('node:fs')).createWriteStream(await resolveInside(root, `/${assertFileName(part.filename)}`), { flags: 'wx' })); return ok(null); });
  }
  app.delete('/api/v1/servers/:id/plugins/:pluginId', async (request) => { writable(config); const p = params(request); await rm(await serverPath(context, p.id ?? '', `/plugins/${assertFileName(p.pluginId ?? '')}`), { force: true }); return ok(null); });
  app.post('/api/v1/servers/:id/plugins/:pluginId/toggle', async (request) => { writable(config); const p = params(request); const enabled = body<{ enabled: boolean }>(request).enabled; const file = assertFileName(p.pluginId ?? ''); const current = await serverPath(context, p.id ?? '', `/plugins/${file}`); const desired = enabled ? file.replace(/\.disabled$/, '') : file.endsWith('.disabled') ? file : `${file}.disabled`; await rename(current, await serverPath(context, p.id ?? '', `/plugins/${desired}`)); return ok(null); });
}

export async function buildApp(config: BackendConfig): Promise<AppContext> {
  await mkdir(config.dataDir, { recursive: true }); await mkdir(config.serversRoot, { recursive: true });
  const store = new JsonStore(path.join(config.dataDir, 'dashboard.json')); await store.load();
  const events = new DashboardEvents(); const processes = new ProcessManager(store, events); const hostMetrics = new HostMetricsSampler();
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 16 * 1024 * 1024 });
  await app.register(multipart, { limits: { fileSize: 512 * 1024 * 1024, files: 1 } }); await app.register(websocket);
  const context = { app, store, processes, hostMetrics, config };
  app.setErrorHandler((error, _request, reply) => { const issue = error as Error & { statusCode?: number }; const status = Number(issue.statusCode ?? (issue instanceof SecurityError ? 400 : 500)); reply.code(status).send({ error: { code: issue.name, message: issue.message } }); });
  registerReadRoutes(context); registerWriteRoutes(context); registerImportsAndExports(context); registerPluginWrites(context);
  const scheduleRunner = new ScheduleRunner(store, (schedule) => runSchedule(context, schedule)); scheduleRunner.start();
  app.get('/api/v1/servers/:id/console/stream', { websocket: true }, (socket, request) => { const id = params(request).id ?? ''; assertIdentifier(id); const unsubscribe = events.onConsole(id, (entry) => socket.send(JSON.stringify(entry))); socket.on('close', unsubscribe); });
  if (existsSync(config.frontendDist)) { await app.register(fastifyStatic, { root: config.frontendDist, wildcard: false }); app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: { code: 'NotFound', message: 'Endpoint not found' } }) : reply.sendFile('index.html')); }
  app.addHook('onClose', async () => { scheduleRunner.stop(); await processes.shutdown(); });
  await recordActivity(store, { category: 'config-change', event: 'Dashboard backend started' });
  return context;
}
