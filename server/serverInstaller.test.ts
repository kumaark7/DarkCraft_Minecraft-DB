import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import { installServerSoftware } from './serverInstaller.js';
import { SoftwareCatalogService } from './softwareCatalog.js';

const temporary: string[] = [];
const archive = new AdmZip(); archive.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\n'));
const jar = archive.toBuffer();
afterEach(async () => { await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true }))); });

function response(body: BodyInit, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

describe('server download and installation planning', () => {
  it('downloads and verifies a Vanilla server JAR and generates its startup command', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-install-')); temporary.push(root);
    const sha1 = createHash('sha1').update(jar).digest('hex');
    const fetcher = (async (input) => {
      const url = String(input);
      if (url.includes('version_manifest')) return response(JSON.stringify({ versions: [{ id: '26.2', type: 'release', url: 'https://piston-meta.mojang.com/26.2.json' }] }));
      if (url.endsWith('/26.2.json')) return response(JSON.stringify({ downloads: { server: { url: 'https://piston-data.mojang.com/server.jar', sha1, size: jar.length } } }));
      if (url.endsWith('/server.jar')) return response(new Uint8Array(jar), { 'content-length': String(jar.length) });
      return new Response('missing', { status: 404 });
    }) as typeof fetch;
    const catalog = new SoftwareCatalogService(path.join(root, 'cache.json'), fetcher);
    const runtime = await installServerSoftware(catalog, { software: 'Vanilla', minecraftVersion: '26.2', build: 'release', ramMb: 4096 }, root, { fetcher });
    expect(runtime).toMatchObject({ startupExecutable: 'java', startupArgs: ['-Xms512M', '-Xmx4096M', '-jar', 'server.jar', 'nogui'] });
    expect(await readFile(path.join(root, 'server.jar'))).toEqual(jar);
  });

  it.each([
    ['Forge', 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', '1.20.1-47.4.10', 'libraries/net/minecraftforge/forge/1.20.1-47.4.10/win_args.txt'],
    ['NeoForge', 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', '21.4.111-beta', 'libraries/net/neoforged/neoforge/21.4.111-beta/win_args.txt'],
  ] as const)('runs the %s installer and uses its generated argument file', async (software, metadataUrl, build, windowsArgFile) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-install-')); temporary.push(root);
    const sha1 = createHash('sha1').update(jar).digest('hex');
    const fetcher = (async (input) => {
      const url = String(input);
      if (url === metadataUrl) return response(`<metadata><version>${build}</version></metadata>`);
      if (url.endsWith('.sha1')) return response(sha1);
      if (url.endsWith('.jar')) return response(new Uint8Array(jar));
      return new Response('missing', { status: 404 });
    }) as typeof fetch;
    const runner = async (_executable: string, args: string[], cwd: string) => {
      expect(args).toEqual(['-jar', expect.stringMatching(/installer\.jar$/), '--installServer']);
      const argFile = process.platform === 'win32' ? windowsArgFile : windowsArgFile.replace('win_args.txt', 'unix_args.txt');
      await mkdir(path.join(cwd, path.dirname(argFile)), { recursive: true }); await writeFile(path.join(cwd, argFile), 'arguments');
    };
    const catalog = new SoftwareCatalogService(path.join(root, 'cache.json'), fetcher);
    const minecraftVersion = software === 'Forge' ? '1.20.1' : '1.21.4';
    const runtime = await installServerSoftware(catalog, { software, minecraftVersion, build, ramMb: 6144 }, root, { fetcher, runner });
    expect(runtime.startupArgs).toEqual(['@user_jvm_args.txt', expect.stringMatching(/_args\.txt$/), 'nogui']);
    expect(await readFile(path.join(root, 'user_jvm_args.txt'), 'utf8')).toContain('-Xmx6144M');
  });

  it('rejects a corrupt or checksum-mismatched download', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-install-')); temporary.push(root);
    const fetcher = (async (input) => {
      const url = String(input);
      if (url.includes('version_manifest')) return response(JSON.stringify({ versions: [{ id: '26.2', type: 'release', url: 'https://piston-meta.mojang.com/26.2.json' }] }));
      if (url.endsWith('/26.2.json')) return response(JSON.stringify({ downloads: { server: { url: 'https://piston-data.mojang.com/server.jar', sha1: '0'.repeat(40) } } }));
      return response(new Uint8Array(jar));
    }) as typeof fetch;
    const catalog = new SoftwareCatalogService(path.join(root, 'cache.json'), fetcher);
    await expect(installServerSoftware(catalog, { software: 'Vanilla', minecraftVersion: '26.2', build: 'release', ramMb: 1024 }, root, { fetcher }))
      .rejects.toThrow('SHA1 verification');
  });
});
