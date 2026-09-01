import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SoftwareCatalogService } from './softwareCatalog.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });

function response(body: unknown, contentType = 'application/json'): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': contentType } });
}

function metadataFetcher(counter: { value: number }): typeof fetch {
  return (async (input) => {
    counter.value += 1; const url = String(input);
    if (url.includes('version_manifest')) return response({ versions: [{ id: '26.2', type: 'release', url: 'https://piston-meta.mojang.com/26.2.json' }] });
    if (url === 'https://fill.papermc.io/v3/projects/paper') return response({ versions: { '26.2': ['26.2'] } });
    if (url === 'https://api.purpurmc.org/v2/purpur') return response({ versions: ['26.2'] });
    if (url.endsWith('/versions/game')) return response([{ version: '26.2', stable: true }]);
    if (url.includes('maven.minecraftforge.net')) return response('<metadata><version>26.2-60.0.1</version></metadata>', 'application/xml');
    if (url.includes('maven.neoforged.net')) return response('<metadata><version>26.2.0.1</version></metadata>', 'application/xml');
    return new Response('missing fixture', { status: 404 });
  }) as typeof fetch;
}

describe('software catalog cache and refresh', () => {
  it('uses the persisted cache and refreshes all official provider metadata on demand', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-catalog-')); temporary.push(root);
    const cachePath = path.join(root, 'metadata.json'); const counter = { value: 0 };
    const first = new SoftwareCatalogService(cachePath, metadataFetcher(counter), () => 1_000);
    const catalog = await first.catalog();
    expect(catalog.providers.map((item) => item.software)).toEqual(['Vanilla', 'Paper', 'Purpur', 'Fabric', 'Forge', 'NeoForge']);
    expect(catalog.providers.every((item) => item.versions[0]?.id === '26.2')).toBe(true);
    expect(counter.value).toBe(6);

    const second = new SoftwareCatalogService(cachePath, metadataFetcher(counter), () => 2_000);
    await second.catalog(); expect(counter.value).toBe(6);
    await second.refresh(); expect(counter.value).toBe(12);
  });

  it('isolates a failed provider and returns a useful provider error', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-catalog-')); temporary.push(root);
    const fetcher = metadataFetcher({ value: 0 });
    const failing = (async (input, init) => String(input).includes('purpurmc') ? new Response('down', { status: 503 }) : fetcher(input, init)) as typeof fetch;
    const catalog = await new SoftwareCatalogService(path.join(root, 'metadata.json'), failing).catalog();
    expect(catalog.providers.find((item) => item.software === 'Purpur')).toMatchObject({ versions: [], error: expect.stringContaining('503') });
    expect(catalog.providers.find((item) => item.software === 'Paper')?.versions).toHaveLength(1);
  });
});
