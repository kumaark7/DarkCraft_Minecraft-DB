import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isFloodgateUuid,
  offlineJavaProfile,
  resolveBedrockProfile,
  serverUsesOfflineProfiles,
  updateBedrockWhitelist,
} from './bedrockWhitelist.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function serverDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-bedrock-'));
  temporary.push(directory);
  await mkdir(path.join(directory, 'config', 'floodgate'), { recursive: true });
  await writeFile(path.join(directory, 'config', 'floodgate', 'config.yml'), 'username-prefix: "."\n');
  return directory;
}

describe('Bedrock whitelist bridge', () => {
  it('resolves the configured Floodgate name with exact casing and UUID', async () => {
    const directory = await serverDirectory();
    let requested = '';
    const fetcher = (async (input: string | URL | Request) => {
      requested = String(input);
      return new Response(JSON.stringify({ id: '0000000000000000000901f26d300855', name: '.Nocturne17Dani' }));
    }) as typeof fetch;

    const profile = await resolveBedrockProfile(directory, 'Nocturne17Dani', fetcher);

    expect(requested).toBe('https://api.geysermc.org/v2/utils/uuid/bedrock_or_java/.Nocturne17Dani?prefix=.');
    expect(profile).toEqual({ uuid: '00000000-0000-0000-0009-01f26d300855', name: '.Nocturne17Dani' });
    expect(isFloodgateUuid(profile.uuid)).toBe(true);
  });

  it('preserves unrelated entries and serializes concurrent atomic updates', async () => {
    const directory = await serverDirectory();
    const filename = path.join(directory, 'whitelist.json');
    await writeFile(filename, JSON.stringify([
      { uuid: 'java-uuid', name: 'JavaPlayer', futureProperty: true },
      { uuid: '00000000-0000-0000-0009-01f26d300855', name: '.nocturne17dani' },
    ]));

    await Promise.all([
      updateBedrockWhitelist(directory, 'add', { uuid: '00000000-0000-0000-0009-01f26d300855', name: '.Nocturne17Dani' }),
      updateBedrockWhitelist(directory, 'add', { uuid: '00000000-0000-0000-0009-000000000002', name: '.SecondPlayer' }),
    ]);
    const entries = JSON.parse(await readFile(filename, 'utf8')) as Array<Record<string, unknown>>;
    expect(entries).toEqual([
      { uuid: 'java-uuid', name: 'JavaPlayer', futureProperty: true },
      { uuid: '00000000-0000-0000-0009-01f26d300855', name: '.Nocturne17Dani' },
      { uuid: '00000000-0000-0000-0009-000000000002', name: '.SecondPlayer' },
    ]);
    await updateBedrockWhitelist(directory, 'remove', { uuid: '00000000-0000-0000-0009-01f26d300855', name: '.Nocturne17Dani' });
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual([
      { uuid: 'java-uuid', name: 'JavaPlayer', futureProperty: true },
      { uuid: '00000000-0000-0000-0009-000000000002', name: '.SecondPlayer' },
    ]);
  });

  it('does not overwrite corrupt whitelist data or accept Java redirects', async () => {
    const directory = await serverDirectory();
    const filename = path.join(directory, 'whitelist.json');
    await writeFile(filename, '{broken');
    await expect(updateBedrockWhitelist(directory, 'add', {
      uuid: '00000000-0000-0000-0009-01f26d300855', name: '.Nocturne17Dani',
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(await readFile(filename, 'utf8')).toBe('{broken');

    const redirect = (async () => new Response(null, { status: 302 })) as typeof fetch;
    await expect(resolveBedrockProfile(directory, 'Nocturne17Dani', redirect)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('generates case-sensitive offline Java profiles without a network lookup', async () => {
    const directory = await serverDirectory();
    await writeFile(path.join(directory, 'server.properties'), 'online-mode=false\n');
    expect(await serverUsesOfflineProfiles(directory)).toBe(true);
    expect(offlineJavaProfile('Test123CAPa')).toEqual({
      uuid: 'a64a0144-06a3-322c-b775-7fa28832bf6b',
      name: 'Test123CAPa',
    });
    expect(offlineJavaProfile('test123capa').uuid).not.toBe(offlineJavaProfile('Test123CAPa').uuid);
  });
});
