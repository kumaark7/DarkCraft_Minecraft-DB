import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { FastifyInstance } from 'fastify';
import { compatibleRelease, ModrinthCatalog, modrinthTarget } from './modrinth.js';
import { assertFileName, assertWritable, resolveInside } from './security.js';
import type { ModrinthInstallResult } from '../src/types/modrinth.js';

type Target = { software: string; minecraftVersion: string };
type RecordValue = Record<string, unknown>;
const obj = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const items = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const MAX_MOD_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const MAX_BATCH_BYTES = 512 * 1024 * 1024;
const sha = (bytes: Uint8Array) => createHash('sha512').update(bytes).digest('hex');

interface Artifact { filename: string; url: string; size: number; hash: string }
interface Installed { filename: string; hash: string; ids: string[]; disabled: boolean }

export function modrinthArtifact(version: RecordValue): Artifact {
  const candidates = items(version.files).map(obj).filter(file =>
    typeof file.filename === 'string' && /\.jar$/i.test(file.filename) && file.file_type == null);
  const primary = candidates.filter(file => file.primary === true);
  const file = primary.length === 1 ? primary[0] : candidates.length === 1 ? candidates[0] : undefined;
  if (!file) throw fail('Modrinth did not identify one unambiguous server JAR.');
  const filename = assertFileName(String(file.filename));
  if (filename.startsWith('.') || /[%.]/.test(filename.slice(-1)) || filename.includes('%')) throw fail('Unsafe mod file name.');
  let url: URL;
  try { url = new URL(String(file.url)); } catch { throw fail('Invalid Modrinth download URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com' || url.port || url.username || url.password
    || url.search || url.hash || !url.pathname.startsWith('/data/')) throw fail('Untrusted Modrinth download location.');
  if (!Number.isSafeInteger(file.size) || Number(file.size) <= 0 || Number(file.size) > MAX_MOD_DOWNLOAD_BYTES) {
    throw fail('Mod JAR exceeds the 128 MiB safe download limit.');
  }
  const hash = obj(file.hashes).sha512;
  if (typeof hash !== 'string' || !/^[a-f0-9]{128}$/i.test(hash)) throw fail('Modrinth did not supply a valid SHA-512 checksum.');
  return { filename, url: url.href, size: Number(file.size), hash: hash.toLowerCase() };
}

// Never extract an archive or execute downloaded code. Bound inflated metadata
// before reading it, including existing files inspected for duplicate mod IDs.
export function jarModIds(bytes: Buffer, requiredLoader?: string): string[] {
  let zip: AdmZip;
  try { zip = new AdmZip(bytes); } catch { throw fail('Downloaded file is not a valid JAR.'); }
  const entries = zip.getEntries();
  if (entries.length > 50_000) throw fail('JAR has too many entries.');
  const metadata = (name: string) => {
    const matches = entries.filter(entry => entry.entryName.toLowerCase() === name.toLowerCase());
    if (matches.length > 1) throw fail('JAR contains duplicate metadata.');
    const entry = matches[0];
    if (!entry) return undefined;
    if (entry.header.size > 256 * 1024) throw fail('JAR metadata exceeds the safe size limit.');
    return entry.getData().toString('utf8');
  };
  const ids = new Set<string>();
  const fabric = metadata('fabric.mod.json');
  const forge = metadata('META-INF/mods.toml');
  const neo = metadata('META-INF/neoforge.mods.toml');
  if (requiredLoader === 'fabric' && !fabric || requiredLoader === 'forge' && !forge || requiredLoader === 'neoforge' && !neo) {
    throw fail('Downloaded JAR does not contain metadata for this server loader.');
  }
  if (fabric) {
    let data: RecordValue;
    try { data = obj(JSON.parse(fabric)); } catch { throw fail('Invalid Fabric JAR metadata.'); }
    if (typeof data.id !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/.test(data.id)) throw fail('Fabric JAR has no valid mod ID.');
    if (requiredLoader === 'fabric' && data.environment === 'client') throw fail('The downloaded JAR is client-only.');
    ids.add(data.id.toLowerCase());
  }
  for (const toml of [forge, neo]) {
    if (!toml) continue;
    // Only [[mods]] declarations, never IDs from dependency blocks.
    for (const block of toml.split(/\[\[mods\]\]/i).slice(1)) {
      const match = /^\s*modId\s*=\s*["']([A-Za-z0-9_-]+)["']/m.exec(block.split(/\n\s*\[/)[0] ?? '');
      if (match?.[1]) ids.add(match[1].toLowerCase());
    }
  }
  if (!ids.size) throw fail('Cannot establish mod IDs from this JAR; installation was not attempted.');
  return [...ids].sort();
}

async function inventory(root: string): Promise<Installed[]> {
  const files = (await readdir(root, { withFileTypes: true })).filter(file => /\.jar(?:\.disabled)?$/i.test(file.name));
  if (files.length > 1000) throw fail('Too many installed mods to safely check for conflicts.');
  const result: Installed[] = [];
  let total = 0;
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = await resolveInside(root, '/' + assertFileName(file.name));
    const info = await lstat(filename);
    total += info.size;
    if (!info.isFile() || info.size > MAX_MOD_DOWNLOAD_BYTES || total > MAX_BATCH_BYTES) {
      throw fail('Installed mod inventory exceeds safe inspection limits: ' + file.name);
    }
    const buffer = await readFile(filename);
    if (buffer.length > MAX_MOD_DOWNLOAD_BYTES) throw fail('Installed mod changed during inspection.');
    try { result.push({ filename: file.name, hash: sha(buffer), ids: jarModIds(buffer), disabled: /\.disabled$/i.test(file.name) }); }
    catch { throw fail('Cannot safely inspect installed mod ' + file.name + '. Resolve that file before installing another mod.', 409); }
  }
  return result;
}

export class ModrinthInstaller {
  private busy = new Set<string>();
  constructor(private catalog: ModrinthCatalog, private fetcher: typeof fetch = fetch) {}

  private async download(artifact: Artifact, destination: string, deadline: number): Promise<void> {
    const response = await this.fetcher(artifact.url, {
      headers: { 'User-Agent': 'kumaark7/DarkCraft_Minecraft-DB/1.0 (https://github.com/kumaark7/DarkCraft_Minecraft-DB)' },
      redirect: 'error', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    if (!response.ok || !response.body) throw fail('Mod download failed. Please retry.', 502);
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) !== artifact.size) {
      await response.body.cancel(); throw fail('Mod download size differs from Modrinth metadata.', 502);
    }
    const file = await open(destination, 'wx', 0o600);
    const reader = response.body.getReader();
    const hash = createHash('sha512');
    let count = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        count += value.byteLength;
        if (count > artifact.size || count > MAX_MOD_DOWNLOAD_BYTES) throw fail('Mod download exceeds the safe size limit.', 502);
        hash.update(value);
        // FileHandle.write may be partial; writeFile consumes the complete chunk.
        await file.writeFile(value);
      }
      if (count !== artifact.size || hash.digest('hex') !== artifact.hash) throw fail('Mod checksum or size verification failed.', 502);
      await file.sync();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); await file.close(); }
  }

  async install(root: string, server: Target, versionId: string, revalidate: () => Promise<void>): Promise<ModrinthInstallResult> {
    if (this.busy.has(root) || this.busy.size >= 2) throw fail('Another mod installation is in progress. Please retry.', 409);
    this.busy.add(root);
    let staging: string | undefined;
    const published: string[] = [];
    const deadline = Date.now() + 45_000;
    const checkDeadline = () => { if (Date.now() >= deadline) throw fail('Installation timed out. Please retry with a smaller batch.', 504); };
    try {
      const target = modrinthTarget(server);
      if (!target.loader || !target.minecraftVersion) throw fail('An exact supported server loader and Minecraft version are required.');
      await revalidate();
      await mkdir(root, { recursive: true });
      const original = await inventory(root);
      const planned = new Map<string, { version: RecordValue; file: Artifact }>();
      let total = 0;
      const visit = async (version: RecordValue): Promise<void> => {
        checkDeadline();
        const project = await this.catalog.installProject(String(version.project_id));
        checkDeadline();
        if (!compatibleRelease([version], project, target)) throw fail('This mod or dependency has no stable server release for ' + server.software + ' ' + server.minecraftVersion + '.', 409);
        const projectId = String(version.project_id);
        const previous = planned.get(projectId);
        if (previous) {
          if (previous.version.id !== version.id) throw fail('Required dependencies demand conflicting versions. Nothing was installed.', 409);
          return;
        }
        if (planned.size >= 16) throw fail('Dependency graph exceeds the 16-mod installation limit.');
        const file = modrinthArtifact(version);
        total += file.size;
        if (total > MAX_BATCH_BYTES) throw fail('Mod installation exceeds the 512 MiB batch limit.');
        planned.set(projectId, { version, file });
        for (const raw of items(version.dependencies)) {
          checkDeadline();
          const dependency = obj(raw);
          if (dependency.dependency_type === 'incompatible') throw fail('This release declares incompatible mods. Review the conflict manually before installation.', 409);
          if (dependency.dependency_type !== 'required') continue;
          let required: RecordValue;
          if (typeof dependency.version_id === 'string') {
            required = await this.catalog.installVersion(dependency.version_id);
            if (dependency.project_id != null && required.project_id !== dependency.project_id) throw fail('Dependency metadata disagrees about its project.');
          } else if (typeof dependency.project_id === 'string') {
            const depProject = await this.catalog.installProject(dependency.project_id);
            const versions = await this.catalog.installVersions(dependency.project_id, target);
            const installedVersions = versions.filter(value => items(obj(value).files).some(file =>
              original.some(existing => !existing.disabled && existing.hash === obj(obj(file).hashes).sha512)));
            const match = compatibleRelease(installedVersions, depProject, target) ?? compatibleRelease(versions, depProject, target);
            if (!match) throw fail('A required dependency has no compatible stable server release.', 409);
            required = match;
          } else { throw fail('A required external dependency cannot be safely resolved.', 409); }
          await visit(required);
        }
      };
      await visit(await this.catalog.installVersion(versionId));
      await revalidate();
      staging = await mkdtemp(path.join(root, '.darkcraft-install-'));
      const names = new Set<string>();
      const modIds = new Set<string>();
      const alreadyPresent: string[] = [];
      const staged: { source: string; file: Artifact }[] = [];
      for (const { file } of planned.values()) {
        if (names.has(file.filename.toLowerCase())) throw fail('Two mods have the same filename.', 409);
        names.add(file.filename.toLowerCase());
        const existing = original.find(item => item.hash === file.hash);
        if (existing) {
          if (existing.disabled) throw fail(existing.filename + ' is disabled. It will not be enabled automatically.', 409);
          alreadyPresent.push(existing.filename);
          for (const modId of existing.ids) modIds.add(modId);
          continue;
        }
        const source = path.join(staging, file.filename);
        checkDeadline();
        await this.download(file, source, deadline);
        const ids = jarModIds(await readFile(source), target.loader);
        for (const modId of ids) {
          const conflict = original.find(item => item.ids.includes(modId));
          if (conflict || modIds.has(modId)) throw fail('Mod ID ' + modId + ' already exists' + (conflict ? ' in ' + conflict.filename : ' in this batch') + '. Existing versions are never replaced automatically.', 409);
          modIds.add(modId);
        }
        staged.push({ source, file });
      }
      await revalidate();
      if (JSON.stringify(original) !== JSON.stringify(await inventory(root))) throw fail('Installed mods changed during the download. Please retry.', 409);
      checkDeadline();
      for (const item of staged) {
        const destination = await resolveInside(root, '/' + item.file.filename);
        // Hard link is an atomic no-clobber publication on the same filesystem.
        // All checks/downloads finish before any JAR appears in mods/.
        await link(item.source, destination);
        published.push(destination);
      }
      return { installed: staged.map(item => item.file.filename), alreadyPresent, restartRequired: staged.length > 0 };
    } catch (error) {
      for (const filename of published) await rm(filename, { force: true });
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw fail('A file with this name already exists. Nothing was overwritten.', 409);
      if ((error as { statusCode?: number }).statusCode) throw error;
      throw fail('Mod installation failed. No existing mod files were changed.', 502);
    } finally {
      try { if (staging) await rm(staging, { recursive: true, force: true }); }
      finally { this.busy.delete(root); }
    }
  }
}

export function registerModrinthInstallRoute(app: FastifyInstance, options: {
  getServer: (id: string) => Target;
  getModsRoot: (id: string) => Promise<string>;
  readOnly: () => boolean;
  fetcher?: typeof fetch;
}): void {
  const installer = new ModrinthInstaller(new ModrinthCatalog(options.fetcher), options.fetcher);
  app.post<{ Params: { id: string }; Body: { versionId?: unknown } }>('/api/v1/servers/:id/modrinth/install', async request => {
    assertWritable(options.readOnly());
    const id = request.params.id;
    const server = { ...options.getServer(id) };
    const versionId = request.body?.versionId;
    if (typeof versionId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(versionId)) throw fail('A valid Modrinth release ID is required.');
    const root = await options.getModsRoot(id);
    const revalidate = async () => {
      assertWritable(options.readOnly());
      const current = options.getServer(id);
      if (current.software !== server.software || current.minecraftVersion !== server.minecraftVersion || await options.getModsRoot(id) !== root) {
        throw fail('The server target changed during installation. Nothing was installed.', 409);
      }
    };
    return { data: await installer.install(root, server, versionId, revalidate) };
  });
}
