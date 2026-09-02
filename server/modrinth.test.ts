import { describe, expect, it, vi } from 'vitest';
import { compatibleRelease, ModrinthCatalog, modrinthTarget } from './modrinth.js';

const target = { software: 'Fabric', minecraftVersion: '26.2' };
const project = { project_id: 'Project1', project_type: 'mod', title: 'Example', server_side: 'required', client_side: 'optional' };
const release = {
  id: 'Version1', project_id: 'Project1', status: 'listed', version_type: 'release', version_number: '1.0',
  game_versions: ['26.2'], loaders: ['fabric'], environment: 'server_only',
  files: [{ filename: 'example.jar', size: 123 }], dependencies: [], date_published: '2026-09-01T00:00:00Z',
};
const response = (value: unknown) => new Response(JSON.stringify(value));
const fetchFixture = (versions: unknown = [release]) => vi.fn(async (input: unknown) =>
  String(input).includes('/search?') ? response({ hits: [project], total_hits: 1 }) : response(versions));

describe('Modrinth exact-release compatibility', () => {
  it('accepts an exact Fabric 26.2 server release and rejects cross-release facet matches', () => {
    expect(compatibleRelease([release], project, modrinthTarget(target))?.id).toBe('Version1');
    expect(compatibleRelease([
      { ...release, game_versions: ['26.1'] },
      { ...release, loaders: ['forge'] },
    ], project, modrinthTarget(target))).toBeUndefined();
  });

  it.each(['client_only', 'client_only_server_optional', 'singleplayer_only', 'unknown'])('rejects %s even when project server_side claims support', environment => {
    expect(compatibleRelease([{ ...release, environment }], project, modrinthTarget(target))).toBeUndefined();
  });

  it('rejects prereleases, unlisted versions, non-JAR files and the wrong project', () => {
    for (const change of [
      { version_type: 'beta' }, { version_type: 'alpha' }, { status: 'unlisted' },
      { project_id: 'Other123' }, { files: [{ filename: 'mod.zip', size: 1 }] },
      { files: [{ filename: 'mod.jar', size: 1, file_type: 'required-resource-pack' }] },
    ]) expect(compatibleRelease([{ ...release, ...change }], project, modrinthTarget(target))).toBeUndefined();
  });

  it('supports legacy metadata conservatively and does not infer unknown environments', () => {
    const legacy = { ...release, environment: undefined };
    expect(compatibleRelease([legacy], project, modrinthTarget(target))).toBeDefined();
    expect(compatibleRelease([legacy], { ...project, server_side: 'unknown' }, modrinthTarget(target))).toBeUndefined();
    expect(compatibleRelease([legacy], { ...project, environment: 'client_only' }, modrinthTarget(target))).toBeUndefined();
  });

  it.each(['Fabric', 'Forge', 'NeoForge'])('requires the exact %s loader without aliases or fallback', software => {
    const compatible = { ...release, loaders: [software.toLowerCase()] };
    expect(compatibleRelease([compatible], project, modrinthTarget({ ...target, software }))).toBeDefined();
    expect(compatibleRelease([compatible], project, modrinthTarget({ ...target, minecraftVersion: '26.2.1', software }))).toBeUndefined();
  });

  it('never requests upstream when the server target is unknown or unsupported', async () => {
    const fetcher = fetchFixture();
    const catalog = new ModrinthCatalog(fetcher as typeof fetch);
    for (const software of ['Unknown', 'Paper', 'Vanilla']) expect((await catalog.search({ ...target, software })).supported).toBe(false);
    expect((await catalog.search({ ...target, minecraftVersion: 'Unknown' })).supported).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses AND facets, rechecks a release, caches requests and refreshes after TTL', async () => {
    let now = 0;
    const fetcher = fetchFixture();
    const catalog = new ModrinthCatalog(fetcher as typeof fetch, () => now);
    const first = await catalog.search(target);
    expect(first.matches[0]).toMatchObject({ minecraftVersion: '26.2', loader: 'fabric', versionId: 'Version1', versionUrl: 'https://modrinth.com/mod/Project1/version/Version1' });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(JSON.parse(url.searchParams.get('facets')!)).toEqual([['project_type:mod'], ['categories:fabric'], ['versions:26.2']]);
    await catalog.search(target);
    expect(fetcher).toHaveBeenCalledTimes(2);
    now = 300_001;
    await catalog.search(target);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await catalog.search({ ...target, minecraftVersion: '26.3' });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('coalesces concurrent searches without duplicating upstream requests', async () => {
    const fetcher = fetchFixture();
    const catalog = new ModrinthCatalog(fetcher as typeof fetch);
    await Promise.all([catalog.search(target), catalog.search(target)]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps pagination based on inspected candidates, not accepted matches', async () => {
    const fetcher = vi.fn(async (input: unknown) => String(input).includes('/search?')
      ? response({ hits: [project], total_hits: 20 }) : response([{ ...release, loaders: ['forge'] }]));
    const result = await new ModrinthCatalog(fetcher as typeof fetch).search(target);
    expect(result.matches).toEqual([]);
    expect(result.nextOffset).toBe(1);
  });

  it('surfaces outages, malformed metadata and 429s without broadening results', async () => {
    for (const makeResponse of [
      () => new Response('unavailable', { status: 503 }),
      () => new Response('slow down', { status: 429 }),
      () => response({ hits: 'invalid' }),
      () => new Response('not json'),
      () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    ]) {
      const catalog = new ModrinthCatalog(vi.fn(async () => makeResponse()) as typeof fetch);
      await expect(catalog.search(target)).rejects.toThrow(/Modrinth/);
    }
  });

  it('respects rate-limit backoff and rejects unbounded or malformed input', async () => {
    let now = 0;
    const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '60' } }));
    const catalog = new ModrinthCatalog(fetcher as typeof fetch, () => now);
    await expect(catalog.search(target)).rejects.toThrow();
    await expect(catalog.search(target, 'different')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 61_000;
    await expect(catalog.search(target)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(catalog.search(target, 'x'.repeat(101))).rejects.toThrow(/Invalid/);
    await expect(catalog.search(target, '', -1)).rejects.toThrow(/Invalid/);
    await expect(catalog.search(target, '', NaN)).rejects.toThrow(/Invalid/);
  });

  it('shows required dependencies and client requirements instead of claiming activation', async () => {
    const fetcher = fetchFixture([{ ...release, environment: 'client_and_server', dependencies: [{ dependency_type: 'required' }, { dependency_type: 'optional' }] }]);
    const result = await new ModrinthCatalog(fetcher as typeof fetch).search(target);
    expect(result.matches[0]).toMatchObject({ requiredDependencies: 1, clientRequired: true });
    expect(result.matches[0]).not.toHaveProperty('status', 'Active');
  });
});
