import type { FastifyInstance } from 'fastify';
import type { ModrinthMatch, ModrinthSearch } from '../src/types/modrinth.js';

const API = 'https://api.modrinth.com/v2';
const PAGE_SIZE = 8;
const TTL = 5 * 60_000;
const MAX_BODY = 2 * 1024 * 1024;
const SERVER_ENVIRONMENTS = new Set([
  'client_and_server', 'server_only', 'server_only_client_optional',
  'dedicated_server_only', 'client_or_server', 'client_or_server_prefers_both',
]);
type RecordValue = Record<string, unknown>;
type Target = { software: string; minecraftVersion: string };
const object = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value);
const text = (value: unknown, limit: number): string => typeof value === 'string' ? value.slice(0, limit) : '';
const problem = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode });

export function modrinthTarget(server: Target): { loader: string | null; minecraftVersion: string } {
  const loader = ['Fabric', 'Forge', 'NeoForge'].includes(server.software) ? server.software.toLowerCase() : null;
  const version = server.minecraftVersion?.trim() ?? '';
  return { loader, minecraftVersion: /^\d[A-Za-z0-9.+_-]{0,63}$/.test(version) ? version : '' };
}

// Prefer release-level environments. Unknown/explicit client-only values must NOT
// fall back to broad project tags. Legacy v2 responses use project server_side.
function serverSupported(version: RecordValue, project: RecordValue): boolean {
  if (version.environment !== undefined) return SERVER_ENVIRONMENTS.has(String(version.environment));
  if (project.environment !== undefined) return SERVER_ENVIRONMENTS.has(String(project.environment));
  return project.server_side === 'required' || project.server_side === 'optional';
}

export function compatibleRelease(raw: unknown, project: RecordValue, target: ReturnType<typeof modrinthTarget>): RecordValue | undefined {
  if (!target.loader || !target.minecraftVersion || !id(project.project_id)) return;
  return list(raw).map(object).filter(version =>
    id(version.id) && version.project_id === project.project_id
    && version.status === 'listed' && version.version_type === 'release'
    && list(version.game_versions).includes(target.minecraftVersion)
    && list(version.loaders).includes(target.loader)
    && serverSupported(version, project)
    && list(version.files).some(file => {
      const entry = object(file);
      return typeof entry.filename === 'string' && /\.jar$/i.test(entry.filename)
        && (entry.file_type == null) && typeof entry.size === 'number' && entry.size > 0;
    })
  ).sort((a, b) => String(b.date_published).localeCompare(String(a.date_published)))[0];
}

export class ModrinthCatalog {
  private cache = new Map<string, { expires: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  private requestTimes: number[] = [];
  private retryAfter = 0;

  constructor(private fetcher: typeof fetch = fetch, private now: () => number = Date.now) {}

  private async json(route: string): Promise<unknown> {
    const cached = this.cache.get(route);
    if (cached && cached.expires > this.now()) return cached.value;
    const existing = this.pending.get(route);
    if (existing) return existing;
    this.requestTimes = this.requestTimes.filter(at => at > this.now() - 60_000);
    if (this.now() < this.retryAfter || this.requestTimes.length >= 120 || this.pending.size >= 8) {
      throw problem('Modrinth is busy or rate limited. Please retry in a minute.', 429);
    }
    this.requestTimes.push(this.now());
    const job = (async () => {
      try {
        const response = await this.fetcher(API + route, {
          headers: { 'User-Agent': 'kumaark7/DarkCraft_Minecraft-DB/1.0 (https://github.com/kumaark7/DarkCraft_Minecraft-DB)', Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000), redirect: 'error',
        });
        if (response.status === 429) {
          const seconds = Number(response.headers.get('x-ratelimit-reset') ?? response.headers.get('retry-after') ?? 60);
          this.retryAfter = this.now() + Math.min(300, Math.max(10, Number.isFinite(seconds) ? seconds : 60)) * 1000;
          throw problem('Modrinth is rate limited. Please retry shortly.', 429);
        }
        if (!response.ok || !response.body) throw problem('Modrinth could not be reached. Please retry.');
        if (Number(response.headers.get('content-length')) > MAX_BODY) {
          await response.body.cancel();
          throw problem('Modrinth returned too much metadata. Narrow the search.');
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY) { await reader.cancel(); throw problem('Modrinth metadata exceeds the safe size limit.'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        for (const [key, entry] of this.cache) if (entry.expires <= this.now()) this.cache.delete(key);
        if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(route, { value, expires: this.now() + TTL });
        return value;
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode) throw error;
        throw problem('Modrinth request failed or timed out. Please retry.');
      }
    })();
    this.pending.set(route, job);
    try { return await job; } finally { this.pending.delete(route); }
  }

  async installVersion(versionId: string): Promise<RecordValue> {
    if (!id(versionId)) throw problem('Invalid Modrinth release ID.', 400);
    const route = '/version/' + versionId;
    this.cache.delete(route);
    const version = object(await this.json(route));
    if (version.id !== versionId || !id(version.project_id)) throw problem('Invalid Modrinth release metadata.');
    return version;
  }

  async installProject(projectId: string): Promise<RecordValue> {
    if (!id(projectId)) throw problem('Invalid Modrinth project ID.', 400);
    const route = '/project/' + projectId;
    this.cache.delete(route);
    const project = object(await this.json(route));
    if (project.id !== projectId || project.project_type !== 'mod') throw problem('This Modrinth project is not a mod.', 400);
    return { ...project, project_id: projectId };
  }

  async installVersions(projectId: string, target: ReturnType<typeof modrinthTarget>): Promise<unknown[]> {
    if (!id(projectId) || !target.loader || !target.minecraftVersion) throw problem('Invalid dependency target.', 400);
    const filters = new URLSearchParams({ loaders: JSON.stringify([target.loader]), game_versions: JSON.stringify([target.minecraftVersion]), include_changelog: 'false' });
    const route = '/project/' + projectId + '/version?' + filters;
    this.cache.delete(route);
    const versions = await this.json(route);
    if (!Array.isArray(versions)) throw problem('Invalid Modrinth dependency metadata.');
    return versions;
  }

  async search(server: Target, search = '', offset = 0): Promise<ModrinthSearch> {
    if (typeof search !== 'string' || search.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10_000) {
      throw problem('Invalid Modrinth search or page.', 400);
    }
    const target = modrinthTarget(server);
    const base = { ...target, matches: [] as ModrinthMatch[], nextOffset: null, checkedAt: new Date(this.now()).toISOString() };
    if (!target.loader || !target.minecraftVersion) {
      return { ...base, supported: false, reason: 'A known Fabric, Forge or NeoForge loader and exact Minecraft version are required. No versions will be guessed.' };
    }
    const query = new URLSearchParams({
      query: search.trim(), offset: String(offset), limit: String(PAGE_SIZE),
      index: search.trim() ? 'relevance' : 'downloads',
      facets: JSON.stringify([['project_type:mod'], ['categories:' + target.loader], ['versions:' + target.minecraftVersion]]),
    });
    const result = object(await this.json('/search?' + query));
    if (!Array.isArray(result.hits) || !Number.isInteger(result.total_hits) || Number(result.total_hits) < 0) {
      throw problem('Modrinth returned invalid search metadata. Please retry.');
    }
    const hits = result.hits.slice(0, PAGE_SIZE).map(object);
    const matches: ModrinthMatch[] = [];
    // Bound fan-out; every candidate needs a release-level check, never just facets.
    for (let start = 0; start < hits.length; start += 4) {
      const batch = await Promise.all(hits.slice(start, start + 4).map(async project => {
        if (!id(project.project_id) || project.project_type !== 'mod') return null;
        const filters = new URLSearchParams({
          loaders: JSON.stringify([target.loader]), game_versions: JSON.stringify([target.minecraftVersion]),
          include_changelog: 'false',
        });
        const versions = await this.json('/project/' + project.project_id + '/version?' + filters);
        if (!Array.isArray(versions)) throw problem('Modrinth returned invalid version metadata. Please retry.');
        const release = compatibleRelease(versions, project, target);
        if (!release) return null;
        const environment = release.environment ?? project.environment;
        return {
          projectId: project.project_id, title: text(project.title, 120) || project.project_id,
          description: text(project.description, 400), versionId: String(release.id),
          versionNumber: text(release.version_number, 120) || String(release.id),
          minecraftVersion: target.minecraftVersion, loader: target.loader!,
          versionUrl: 'https://modrinth.com/mod/' + project.project_id + '/version/' + release.id,
          requiredDependencies: list(release.dependencies).filter(d => object(d).dependency_type === 'required').length,
          clientRequired: environment === 'client_and_server' || (environment === undefined && project.client_side === 'required'),
        } satisfies ModrinthMatch;
      }));
      matches.push(...batch.filter((value): value is ModrinthMatch => value !== null));
    }
    return { ...base, supported: true, matches, nextOffset: hits.length > 0 && offset + hits.length < Number(result.total_hits) ? offset + hits.length : null };
  }
}

export function registerModrinthRoutes(
  app: FastifyInstance, getServer: (id: string) => Target, fetcher?: typeof fetch, now?: () => number,
): void {
  const catalog = new ModrinthCatalog(fetcher, now);
  // Authentication is installed by buildApp before these routes. This endpoint
  // is read-only: it cannot write a JAR or change running server state.
  app.get<{ Params: { id: string }; Querystring: { q?: string; offset?: string } }>(
    '/api/v1/servers/:id/modrinth', async request => {
      const server = getServer(request.params.id);
      const result = await catalog.search(server, request.query.q ?? '', Number(request.query.offset ?? 0));
      // Runtime detection may update the server while the upstream request runs.
      const current = getServer(request.params.id);
      if (current.software !== server.software || current.minecraftVersion !== server.minecraftVersion) {
        throw problem('Server version changed during search. Please search again.', 409);
      }
      return { data: result };
    },
  );
}
