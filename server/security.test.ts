import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertWritable, normalizeRelativePath, ReadOnlyError, resolveInside } from './security.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe('backend filesystem policy', () => {
  it.each(['../secret', '/world/../secret', '/%2e%2e/secret', '/%252e%252e/secret', '..\\secret'])('rejects traversal %s', (input) => {
    expect(() => normalizeRelativePath(input)).toThrow();
  });

  it('resolves safe paths below the configured root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-security-')); temporary.push(root);
    const resolved = await resolveInside(root, '/world/region');
    expect(path.relative(await realpath(root), resolved)).toBe(path.join('world', 'region'));
    expect(await readdir(root)).toEqual([]);
  });

  it('fails closed in read-only mode', () => expect(() => assertWritable(true)).toThrow(ReadOnlyError));
});
