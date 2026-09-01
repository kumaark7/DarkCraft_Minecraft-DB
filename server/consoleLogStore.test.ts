import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConsoleEntry } from '../src/types/index.js';
import { ConsoleLogStore } from './consoleLogStore.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function serverDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-console-'));
  temporary.push(directory);
  return directory;
}

function entry(id: string, message = id): ConsoleEntry {
  return {
    id,
    timestamp: new Date().toISOString(),
    severity: 'INFO',
    message,
    source: 'LIVE',
    stream: 'stdout',
  };
}

describe('persistent console logs', () => {
  it('recovers stable console entries after a backend store restart', async () => {
    const directory = await serverDirectory();
    const firstBackend = new ConsoleLogStore();
    await firstBackend.append(directory, entry('one', 'stdout line'));
    await firstBackend.append(directory, { ...entry('two', 'startup failure'), stream: 'stderr', severity: 'ERROR' });
    await firstBackend.flush();

    const restartedBackend = new ConsoleLogStore();
    const recovered = await restartedBackend.read(directory);
    expect(recovered.map(({ id, message, stream, source }) => ({ id, message, stream, source }))).toEqual([
      { id: 'one', message: 'stdout line', stream: 'stdout', source: 'HISTORY' },
      { id: 'two', message: 'startup failure', stream: 'stderr', source: 'HISTORY' },
    ]);
  });

  it('rotates bounded files without truncating history on ordinary writes', async () => {
    const directory = await serverDirectory();
    const logs = new ConsoleLogStore({ maxBytes: 1024, retentionFiles: 2, maxReadEntries: 100 });
    for (let index = 0; index < 18; index += 1) {
      await logs.append(directory, entry(`line-${index}`, `${index}:${'x'.repeat(180)}`));
    }
    await logs.flush();

    const files = (await readdir(path.join(directory, '.darkcraft', 'console'))).sort();
    expect(files).toEqual(['console.1.ndjson', 'console.2.ndjson', 'console.ndjson']);
    const recovered = await logs.read(directory);
    expect(recovered.at(-1)?.id).toBe('line-17');
    expect(recovered.length).toBeGreaterThan(1);
    expect(recovered.length).toBeLessThan(18);
  });

  it('uses Minecraft latest.log when no DarkCraft-managed history exists', async () => {
    const directory = await serverDirectory();
    await mkdir(path.join(directory, 'logs'));
    await writeFile(path.join(directory, 'logs', 'latest.log'), '[12:00:00] [Server thread/INFO]: Done\n');

    const recovered = await new ConsoleLogStore().read(directory);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      message: '[12:00:00] [Server thread/INFO]: Done',
      source: 'HISTORY',
      stream: 'stdout',
    });
  });

  it('clears the visible timeline without deleting persisted files', async () => {
    const directory = await serverDirectory();
    const logs = new ConsoleLogStore();
    await logs.append(directory, entry('before'));
    await logs.markCleared(directory);
    await logs.append(directory, entry('after'));

    expect((await logs.read(directory)).map((value) => value.id)).toEqual(['after']);
    expect(await readdir(path.join(directory, '.darkcraft', 'console'))).toContain('console.ndjson');
  });
});
