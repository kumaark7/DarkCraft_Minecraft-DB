import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  InstallableServerSoftware,
  SoftwareBuild,
  SoftwareCatalog,
} from '../src/types/index.js';
import { providerFor, SOFTWARE_PROVIDERS, type DownloadArtifact, type MetadataReader } from './softwareProviders.js';

interface CacheEntry {
  expiresAt: number;
  kind: 'json' | 'text';
  value: unknown;
}

interface CacheFile { entries: Record<string, CacheEntry> }

const OFFICIAL_METADATA_HOSTS = new Set([
  'piston-meta.mojang.com',
  'piston-data.mojang.com',
  'fill.papermc.io',
  'fill-data.papermc.io',
  'api.purpurmc.org',
  'meta.fabricmc.net',
  'maven.fabricmc.net',
  'maven.minecraftforge.net',
  'maven.neoforged.net',
]);

export const SOFTWARE_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;

function safeUpstreamUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !OFFICIAL_METADATA_HOSTS.has(url.hostname)) {
    throw Object.assign(new Error('Upstream returned an untrusted download location'), { statusCode: 502 });
  }
  return url;
}

function upstreamError(url: URL, status: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Official ${url.hostname} metadata request failed (${status})`), { statusCode: 502 });
}

export class SoftwareCatalogService implements MetadataReader {
  private cache: CacheFile = { entries: {} };
  private loaded = false;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly cachePath: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = SOFTWARE_CATALOG_TTL_MS,
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.cachePath, 'utf8')) as CacheFile;
      if (parsed && typeof parsed.entries === 'object') this.cache = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      await mkdir(path.dirname(this.cachePath), { recursive: true });
      const temporary = `${this.cachePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.cache)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.cachePath);
    });
    await this.saveQueue;
  }

  private async request<T>(value: string, kind: 'json' | 'text'): Promise<T> {
    await this.load();
    const url = safeUpstreamUrl(value);
    const key = createHash('sha256').update(`${kind}:${url.href}`).digest('hex');
    const cached = this.cache.entries[key];
    if (cached && cached.kind === kind && cached.expiresAt > this.now()) return cached.value as T;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetcher(url, {
        headers: { 'User-Agent': 'DarkCraft/1.0 (https://github.com/kumaark7/DarkCraft_Minecraft-DB)' },
        redirect: 'follow', signal: controller.signal,
      });
      if (!response.ok) throw upstreamError(url, response.status);
      if (response.url) safeUpstreamUrl(response.url);
      const declaredSize = Number(response.headers.get('content-length') ?? 0);
      if (declaredSize > MAX_METADATA_BYTES) throw Object.assign(new Error('Official metadata response is unexpectedly large'), { statusCode: 502 });
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_METADATA_BYTES) throw Object.assign(new Error('Official metadata response is unexpectedly large'), { statusCode: 502 });
      let result: T;
      try { result = (kind === 'json' ? JSON.parse(text) : text) as T; }
      catch { throw Object.assign(new Error(`Official ${url.hostname} returned invalid JSON metadata`), { statusCode: 502 }); }
      this.cache.entries[key] = { expiresAt: this.now() + this.ttlMs, kind, value: result };
      await this.save();
      return result;
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw Object.assign(new Error(`Official ${url.hostname} metadata request timed out`), { statusCode: 504 });
      throw error;
    } finally { clearTimeout(timeout); }
  }

  json<T>(url: string): Promise<T> { return this.request<T>(url, 'json'); }
  text(url: string): Promise<string> { return this.request<string>(url, 'text'); }

  async catalog(): Promise<SoftwareCatalog> {
    const providers = await Promise.all(SOFTWARE_PROVIDERS.map(async (provider) => {
      try { return { software: provider.software, versions: await provider.versions(this) }; }
      catch (error) { return { software: provider.software, versions: [], error: (error as Error).message }; }
    }));
    return { refreshedAt: new Date(this.now()).toISOString(), providers };
  }

  builds(software: InstallableServerSoftware, minecraftVersion: string): Promise<SoftwareBuild[]> {
    return providerFor(software).builds(this, minecraftVersion);
  }

  artifact(software: InstallableServerSoftware, minecraftVersion: string, build: string): Promise<DownloadArtifact> {
    return providerFor(software).artifact(this, minecraftVersion, build);
  }

  async refresh(software?: InstallableServerSoftware, minecraftVersion?: string): Promise<SoftwareCatalog> {
    await this.load();
    this.cache = { entries: {} };
    await this.save();
    const catalog = await this.catalog();
    if (software && minecraftVersion) await this.builds(software, minecraftVersion);
    return catalog;
  }
}

export function assertOfficialArtifactUrl(url: string): URL { return safeUpstreamUrl(url); }
