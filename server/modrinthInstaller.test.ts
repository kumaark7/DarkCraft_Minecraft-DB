import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModrinthCatalog } from './modrinth.js';
import { jarModIds, ModrinthInstaller, modrinthArtifact, MAX_MOD_DOWNLOAD_BYTES } from './modrinthInstaller.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const target = { software: 'Fabric', minecraftVersion: '26.2' };
const jarFixtures = new Map<string, Buffer>();
function jar(id = 'example_mod', environment = '*') {
  const key = id + ':' + environment;
  const cached = jarFixtures.get(key);
  if (cached) return cached;
  const zip = new AdmZip();
  zip.addFile('fabric.mod.json', Buffer.from(JSON.stringify({ schemaVersion: 1, id, version: '1.0', environment, depends: { minecraft: '26.2' } })));
  const bytes = zip.toBuffer();
  jarFixtures.set(key, bytes);
  return bytes;
}
function version(versionId = 'Release1', projectId = 'Project1', buffer = jar()) {
  return {
    id: versionId, project_id: projectId, status: 'listed', version_type: 'release',
    version_number: '1.0', game_versions: ['26.2'], loaders: ['fabric'], environment: 'server_only',
    dependencies: [] as Record<string, unknown>[],
    files: [{ filename: projectId + '.jar', url: 'https://cdn.modrinth.com/data/' + projectId + '/versions/' + versionId + '/mod.jar',
      size: buffer.length, primary: true, hashes: { sha512: createHash('sha512').update(buffer).digest('hex') } }],
  };
}
async function setup(main = version(), mainBytes = jar(), dependency = version('Dependency1', 'DepProj1', jar('dependency_mod')), depBytes = jar('dependency_mod')) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-mod-install-')); temporary.push(root);
  const fetcher = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === 'https://api.modrinth.com/v2/version/' + main.id) return Response.json(main);
    if (url === 'https://api.modrinth.com/v2/version/' + dependency.id) return Response.json(dependency);
    if (url.startsWith('https://api.modrinth.com/v2/project/') && url.includes('/version?')) return Response.json([dependency]);
    if (url.startsWith('https://api.modrinth.com/v2/project/')) return Response.json({
      id: url.split('/').pop(), project_type: 'mod', server_side: 'required', environment: 'server_only',
    });
    if (url === main.files[0]!.url) return new Response(new Uint8Array(mainBytes));
    if (url === dependency.files[0]!.url) return new Response(new Uint8Array(depBytes));
    return new Response('', { status: 404 });
  });
  const installer = new ModrinthInstaller(new ModrinthCatalog(fetcher as typeof fetch), fetcher as typeof fetch);
  return { root, fetcher, installer, revalidate: vi.fn(async () => {}) };
}

describe('direct Modrinth installation', () => {
  it('reuses an installed compatible dependency even when a newer release exists', async () => {
    const main = version(); main.dependencies = [{ dependency_type: 'required', project_id: 'DepProj1' }];
    const dep = version('Dependency1', 'DepProj1', jar('dependency_mod'));
    const f = await setup(main, jar(), dep);
    await writeFile(path.join(f.root, 'existing-dependency.jar'), jar('dependency_mod'));
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async input => String(input).includes('/project/DepProj1/version?')
      ? Response.json([{ ...dep, id: 'Newest01', date_published: '2099-01-01', files: [{ ...dep.files[0], hashes: { sha512: 'a'.repeat(128) } }] }, dep])
      : original(input));
    const result = await f.installer.install(f.root, target, main.id, f.revalidate);
    expect(result).toEqual({ installed: ['Project1.jar'], alreadyPresent: ['existing-dependency.jar'], restartRequired: true });
  });

  it('rolls back only newly published files when a later filename already exists', async () => {
    const main = version(); main.dependencies = [{ dependency_type: 'required', version_id: 'Dependency1' }];
    const f = await setup(main);
    const existing = jar('unrelated_mod');
    await writeFile(path.join(f.root, 'DepProj1.jar'), existing);
    await expect(f.installer.install(f.root, target, main.id, f.revalidate)).rejects.toThrow(/already exists/);
    expect(await readdir(f.root)).toEqual(['DepProj1.jar']);
    expect(await readFile(path.join(f.root, 'DepProj1.jar'))).toEqual(existing);
  });


  it('installs the exact JAR, identifies repeat installs, and never reports Active', async () => {
    const f = await setup();
    const result = await f.installer.install(f.root, target, 'Release1', f.revalidate);
    expect(result).toEqual({ installed: ['Project1.jar'], alreadyPresent: [], restartRequired: true });
    expect(await readFile(path.join(f.root, 'Project1.jar'))).toEqual(jar());
    expect(await readdir(f.root)).toEqual(['Project1.jar']);
    const again = await f.installer.install(f.root, target, 'Release1', f.revalidate);
    expect(again).toEqual({ installed: [], alreadyPresent: ['Project1.jar'], restartRequired: false });
  });

  it('installs compatible required dependencies, skipping optional dependencies', async () => {
    const main = version();
    main.dependencies = [{ dependency_type: 'required', project_id: 'DepProj1' }, { dependency_type: 'optional', project_id: 'Ignore01' }];
    const f = await setup(main);
    const result = await f.installer.install(f.root, target, main.id, f.revalidate);
    expect(result.installed.sort()).toEqual(['DepProj1.jar', 'Project1.jar']);
    expect(f.fetcher.mock.calls.some(call => String(call[0]).includes('Ignore01'))).toBe(false);
  });

  it('rejects mismatched or missing dependencies before publishing anything', async () => {
    for (const dependencies of [
      [{ dependency_type: 'required', version_id: 'Missing1' }],
      [{ dependency_type: 'required', version_id: 'Dependency1', project_id: 'Wrong123' }],
      [{ dependency_type: 'required', file_name: 'external.jar' }],
      [{ dependency_type: 'incompatible', project_id: 'OtherMod' }],
    ]) {
      const main = version(); main.dependencies = dependencies;
      const f = await setup(main);
      await expect(f.installer.install(f.root, target, main.id, f.revalidate)).rejects.toThrow();
      expect(await readdir(f.root)).toEqual([]);
    }
  });

  it('rejects wrong Minecraft versions, loaders and client-only releases', async () => {
    for (const change of [{ game_versions: ['26.1'] }, { loaders: ['forge'] }, { environment: 'client_only' }, { version_type: 'beta' }]) {
      const f = await setup({ ...version(), ...change });
      await expect(f.installer.install(f.root, target, 'Release1', f.revalidate)).rejects.toThrow(/release/);
      expect(await readdir(f.root)).toEqual([]);
    }
  });

  it('rejects unsafe filenames, URLs, ambiguous JARs, oversized downloads and missing hashes', () => {
    const original = version();
    for (const fields of [
      { filename: '../escape.jar' }, { url: 'https://evil.example/mod.jar' },
      { url: 'http://cdn.modrinth.com/data/mod.jar' }, { url: 'https://cdn.modrinth.com.evil.example/data/mod.jar' },
      { url: 'https://user:password@cdn.modrinth.com/data/mod.jar' },
      { size: MAX_MOD_DOWNLOAD_BYTES + 1 }, { hashes: {} },
    ]) expect(() => modrinthArtifact({ ...original, files: [{ ...original.files[0], ...fields }] })).toThrow();
    expect(() => modrinthArtifact({ files: [{ ...original.files[0], primary: false }, { ...original.files[0], primary: false }] })).toThrow();
  });

  it('does not publish corrupted, truncated or non-JAR downloads', async () => {
    for (const buffer of [Buffer.from('not a jar'), jar('corrupted_mod').subarray(0, 16)]) {
      const f = await setup(version(), buffer);
      await expect(f.installer.install(f.root, target, 'Release1', f.revalidate)).rejects.toThrow();
      expect(await readdir(f.root)).toEqual([]);
    }
    const data = Buffer.from('not a zip'); const f = await setup(version('Release1', 'Project1', data), data);
    await expect(f.installer.install(f.root, target, 'Release1', f.revalidate)).rejects.toThrow();
    expect(await readdir(f.root)).toEqual([]);
  });

  it('never overwrites an existing filename, duplicate mod ID, or disabled mod', async () => {
    for (const [filename, buffer] of [
      ['Project1.jar', jar('different_mod')], ['old-version.jar', jar()], ['Project1.jar.disabled', jar()],
    ] as const) {
      const f = await setup();
      await writeFile(path.join(f.root, filename), buffer);
      if (filename === 'old-version.jar') {
        // Different version bytes, same mod ID: do not install a second copy.
        const zip = new AdmZip(buffer); zip.addFile('extra.txt', Buffer.from('older release'));
        await writeFile(path.join(f.root, filename), zip.toBuffer());
      }
      const original = await readFile(path.join(f.root, filename));
      await expect(f.installer.install(f.root, target, 'Release1', f.revalidate)).rejects.toThrow();
      expect(await readFile(path.join(f.root, filename))).toEqual(original);
      expect(await readdir(f.root)).toEqual([filename]);
    }
  });

  it('rejects symlink inventory entries and leaves their target untouched', async () => {
    const f = await setup();
    const outside = path.join(f.root, 'outside'); await writeFile(outside, jar());
    await symlink(outside, path.join(f.root, 'linked.jar'));
    await expect(f.installer.install(f.root, target, 'Release1', f.revalidate)).rejects.toThrow();
    expect(await readFile(outside)).toEqual(jar());
  });

  it('rejects target changes after downloads and cleans staging files', async () => {
    const f = await setup();
    let count = 0;
    await expect(f.installer.install(f.root, target, 'Release1', async () => {
      count++; if (count === 2) throw new Error('target changed');
    })).rejects.toThrow();
    expect(await readdir(f.root)).toEqual([]);
  });

  it('locks concurrent installs for the same server', async () => {
    const f = await setup();
    const first = f.installer.install(f.root, target, 'Release1', f.revalidate);
    await expect(f.installer.install(f.root, target, 'Release1', f.revalidate)).rejects.toThrow(/progress/);
    await first;
  });

  it('checks Fabric server environment and actual loader metadata', () => {
    expect(() => jarModIds(jar('client_mod', 'client'), 'fabric')).toThrow(/client-only/);
    expect(() => jarModIds(jar(), 'forge')).toThrow(/loader/);
    const zip = new AdmZip(); zip.addFile('META-INF/neoforge.mods.toml', Buffer.from('[[mods]]\nmodId="neo_mod"\n'));
    expect(jarModIds(zip.toBuffer(), 'neoforge')).toEqual(['neo_mod']);
  });
});
