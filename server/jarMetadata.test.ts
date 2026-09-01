import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectModJar, inspectPluginJar } from './jarMetadata.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function jar(name: string, entries: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-mod-'));
  temporary.push(directory);
  const archive = new AdmZip();
  for (const [entry, content] of Object.entries(entries)) archive.addFile(entry, Buffer.from(content));
  const file = path.join(directory, name);
  await writeFile(file, archive.toBuffer());
  return file;
}

describe('JAR metadata inspection', () => {
  it('reads Fabric identity, loader, version and Minecraft compatibility', async () => {
    const file = await jar('example.jar', {
      'fabric.mod.json': JSON.stringify({
        id: 'dark-example', name: 'Dark Example', version: '2.4.1', description: 'Example mod',
        authors: [{ name: 'DarkCraft' }], depends: { minecraft: '>=26.2 <27' },
      }),
    });
    const mod = await inspectModJar(file, 'Fabric', '26.2', new Set(['dark-example']));
    expect(mod).toMatchObject({
      id: 'dark-example', name: 'Dark Example', version: '2.4.1', loader: 'Fabric',
      minecraftCompatibility: '>=26.2 <27', status: 'Active', author: 'DarkCraft',
    });
    expect(mod.size).toBeGreaterThan(0);
    expect((await inspectModJar(file, 'Fabric', '26.2')).status).toBe('Unknown');
    expect((await inspectModJar(file, 'Fabric', '26.2', new Set(), mod.size - 1))).toMatchObject({
      status: 'Unknown',
      size: mod.size,
      inspectionError: expect.stringContaining('limited'),
    });
  });

  it('distinguishes version issues, wrong loaders, disabled files, invalid JARs and unknown metadata', async () => {
    const forge = await jar('forge-example.jar', {
      'META-INF/mods.toml': 'modId="forgeexample"\nversion="1.0"\ndisplayName="Forge Example"\n[[dependencies.forgeexample]]\nmodId="minecraft"\nversionRange="[1.20,1.21)"\n',
    });
    expect((await inspectModJar(forge, 'Forge', '1.21.4', new Set(['forgeexample']))).status).toBe('Version Issue');
    expect((await inspectModJar(forge, 'Fabric', '1.20.1', new Set(['forgeexample']))).status).toBe('Wrong Loader');

    const disabled = await jar('disabled.jar.disabled', { 'fabric.mod.json': JSON.stringify({ id: 'disabled', version: '1', depends: { minecraft: '*' } }) });
    expect((await inspectModJar(disabled, 'Fabric', '26.2')).status).toBe('Disabled');

    const unknown = await jar('unknown.jar', { 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n' });
    expect((await inspectModJar(unknown, 'Fabric', '26.2')).status).toBe('Unknown');

    const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-invalid-'));
    temporary.push(directory);
    const invalid = path.join(directory, 'invalid.jar');
    await writeFile(invalid, 'not a zip');
    expect((await inspectModJar(invalid, 'Fabric', '26.2')).status).toBe('Invalid JAR');
    expect(await inspectModJar(path.join(directory, 'missing.jar'), 'Fabric', '26.2')).toMatchObject({ status: 'Invalid JAR', inspectionError: 'JAR could not be read' });
  });

  it('reads Bukkit plugin metadata and real file size', async () => {
    const file = await jar('plugin.jar', { 'plugin.yml': 'name: Real Plugin\nversion: 4.2.0\nauthor: Developer\ndescription: Real metadata\n' });
    const plugin = await inspectPluginJar(file);
    expect(plugin).toMatchObject({ name: 'Real Plugin', version: '4.2.0', author: 'Developer', status: 'enabled' });
    expect(plugin.size).toBeGreaterThan(0);
  });
});
