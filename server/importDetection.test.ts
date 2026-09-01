import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { totpAt } from './authCrypto.js';
import type { BackendConfig } from './config.js';
import { inspectServerArchive } from './importDetection.js';

const ORIGIN = 'https://darkcraft.projectdarkhope.xyz';
const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function serverJar(mainClass: string, version: string, extraEntries: string[] = [], attributes: Record<string, string> = {}): Buffer {
  const jar = new AdmZip();
  const manifest = { 'Manifest-Version': '1.0', 'Main-Class': mainClass, ...attributes };
  jar.addFile('META-INF/MANIFEST.MF', Buffer.from(`${Object.entries(manifest).map(([key, value]) => `${key}: ${value}`).join('\n')}\n`));
  jar.addFile('version.json', Buffer.from(JSON.stringify({ id: version })));
  for (const entry of extraEntries) jar.addFile(entry, Buffer.alloc(0));
  return jar.toBuffer();
}

function fabricBackup(): AdmZip {
  const archive = new AdmZip();
  const fabricJar = new AdmZip();
  fabricJar.addFile('META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\nImplementation-Title: FabricInstaller\nImplementation-Version: 1.1.2\nMain-Class: net.fabricmc.installer.ServerLauncher\n'));
  fabricJar.addFile('install.properties', Buffer.from('fabric-loader-version=0.19.3\ngame-version=26.2\n'));
  fabricJar.addFile('net/fabricmc/installer/ServerLauncher.class', Buffer.alloc(0));
  archive.addFile('server.properties', Buffer.from('motd=Fabric server\nlevel-name=world\n'));
  archive.addFile('fabric.jar', fabricJar.toBuffer());
  archive.addFile('paper-old.jar', Buffer.from('not an active server jar'));
  archive.addFile('world_Fabric_Original/level.dat', Buffer.from('original-world'));
  archive.addFile('world/level.dat', Buffer.from('active-world'));
  archive.addFile('config/fabric-loader.json', Buffer.from('{}'));
  for (let index = 1; index <= 14; index += 1) archive.addFile(`mods/mod-${index}.jar`, Buffer.from(`mod-${index}`));
  archive.addFile('custom-preserved.txt', Buffer.from('preserve me exactly'));
  return archive;
}

async function config(): Promise<BackendConfig> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-import-'));
  temporary.push(root);
  return {
    host: '127.0.0.1', port: 0, readOnly: false, dataDir: path.join(root, 'data'),
    serversRoot: path.join(root, 'servers'), frontendDist: path.join(root, 'missing-dist'),
    allowedOrigins: [ORIGIN], secureCookies: true,
  };
}

async function authHeaders(context: Awaited<ReturnType<typeof buildApp>>) {
  const setup = await context.auth.service.beginSetup();
  const grant = await context.auth.service.completeSetup({
    setupToken: setup.setupToken,
    password: 'Testing-password-7',
    totpCode: totpAt(setup.manualKey, Date.now()).code,
  });
  return { cookie: `darkcraft_session=${grant.sessionToken}`, origin: ORIGIN, 'x-csrf-token': grant.csrfToken };
}

function multipartZip(filename: string, contents: Buffer, boundary: string): Buffer {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`),
    contents,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

describe('server archive detection', () => {
  it('detects the Crafty Fabric 0.19.3 / Minecraft 26.2 backup with its active world', () => {
    const archive = fabricBackup();
    const buffer = archive.toBuffer();
    const inspection = inspectServerArchive(new AdmZip(buffer), 'Crafty-Fabric.zip', buffer.length);
    expect(inspection).toMatchObject({
      detectedSoftware: 'Fabric', detectedVersion: '26.2', detectedJar: 'fabric.jar',
      activeWorld: 'world', modCount: 14, hasServerProperties: true,
    });
    expect(inspection.worlds).toEqual(expect.arrayContaining(['world_Fabric_Original', 'world']));
    expect(inspection.configFiles).toEqual(expect.arrayContaining(['server.properties', 'config/fabric-loader.json']));
  });

  it.each([
    ['Paper', 'io.papermc.paperclip.Paperclip', ['io/papermc/paper/Main.class']],
    ['Purpur', 'org.purpurmc.purpur.PurpurBootstrap', ['org/purpurmc/purpur/Main.class', 'io/papermc/paper/Main.class']],
    ['Vanilla', 'net.minecraft.server.Main', []],
    ['Forge', 'net.minecraftforge.server.ServerMain', ['net/minecraftforge/server/ServerMain.class']],
    ['NeoForge', 'net.neoforged.server.ServerMain', ['net/neoforged/server/ServerMain.class']],
    ['Spigot', 'org.bukkit.craftbukkit.Main', ['org/spigotmc/SpigotConfig.class']],
  ])('detects %s from JAR structure instead of requiring its filename', (software, mainClass, entries) => {
    const archive = new AdmZip();
    archive.addFile('server.properties', Buffer.from('level-name=world\n'));
    archive.addFile('launcher.jar', serverJar(mainClass, '1.21.4', entries));
    const result = inspectServerArchive(archive, 'server.zip', archive.toBuffer().length);
    expect(result).toMatchObject({ detectedSoftware: software, detectedVersion: '1.21.4', detectedJar: 'launcher.jar' });
  });

  it('does not invent software or version from an unidentified JAR', () => {
    const archive = new AdmZip();
    archive.addFile('mystery.jar', Buffer.from('unknown content'));
    const result = inspectServerArchive(archive, 'unknown.zip', archive.toBuffer().length);
    expect(result.detectedJar).toBe('mystery.jar');
    expect(result.detectedSoftware).toBeUndefined();
    expect(result.detectedVersion).toBeUndefined();
  });

  it('preserves archive contents and creates independent servers using the detected JAR arguments', async () => {
    const cfg = await config(); const context = await buildApp(cfg); const auth = await authHeaders(context);
    const inspect = async () => {
      const archive = fabricBackup().toBuffer(); const boundary = `darkcraft-${Date.now()}`;
      const response = await context.app.inject({
        method: 'POST', url: '/api/v1/imports/inspect',
        headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: multipartZip('Crafty-Fabric.zip', archive, boundary),
      });
      expect(response.statusCode).toBe(200);
      return response.json().data as { inspectionId: string; inspection: { detectedJar: string } };
    };
    const firstInspection = await inspect(); const secondInspection = await inspect();
    const confirm = (inspectionId: string, serverName: string) => context.app.inject({ method: 'POST', url: `/api/v1/imports/${inspectionId}/confirm`, headers: auth, payload: { serverName } });
    const first = await confirm(firstInspection.inspectionId, 'Fabric One');
    const second = await confirm(secondInspection.inspectionId, 'Fabric Two');
    expect(first.statusCode).toBe(201); expect(second.statusCode).toBe(201);
    const firstServer = first.json().data as { id: string; directory: string; software: string; minecraftVersion: string; startupExecutable: string; startupArgs: string[] };
    const secondServer = second.json().data as { id: string; directory: string };
    expect(firstServer).toMatchObject({ software: 'Fabric', minecraftVersion: '26.2', startupExecutable: 'java', startupArgs: ['-Xms512M', '-Xmx4096M', '-jar', 'fabric.jar', 'nogui'] });
    expect(secondServer.id).not.toBe(firstServer.id); expect(secondServer.directory).not.toBe(firstServer.directory);
    expect(await readFile(path.join(firstServer.directory, 'custom-preserved.txt'), 'utf8')).toBe('preserve me exactly');
    expect(await readFile(path.join(secondServer.directory, 'world', 'level.dat'), 'utf8')).toBe('active-world');
    await context.app.close();
  });
});
