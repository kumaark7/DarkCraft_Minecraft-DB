import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NAME_PATTERN = /^[^<>:"/\\|?*\u0000-\u001F]{1,128}$/;

export class SecurityError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class ReadOnlyError extends Error {
  readonly statusCode = 403;

  constructor() {
    super('The backend is running in read-only mode');
    this.name = 'ReadOnlyError';
  }
}

export function assertIdentifier(value: string, label = 'identifier'): string {
  if (!ID_PATTERN.test(value) || value === '.' || value === '..') throw new SecurityError(`Invalid ${label}`);
  return value;
}

export function assertFileName(value: string): string {
  if (!NAME_PATTERN.test(value) || value === '.' || value === '..') throw new SecurityError('Invalid file name');
  return value;
}

export function normalizeRelativePath(input: string): string {
  if (!input || input.length > 4096 || input.includes('\\') || input.includes('\0')) {
    throw new SecurityError('Invalid server-relative path');
  }

  let decoded = input;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new SecurityError('Invalid path encoding');
    }
  }

  const segments = decoded.replace(/^\/+/, '').split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new SecurityError('Path traversal is not allowed');
  }
  return segments.filter(Boolean).join('/');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function rejectSymlinkComponents(root: string, relativePath: string): Promise<void> {
  const parts = relativePath.split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new SecurityError('Symbolic links are not allowed in server paths');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function ensureRoot(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const resolved = await realpath(root);
  if (resolved.startsWith('\\\\?\\UNC\\')) return `\\\\${resolved.slice(8)}`;
  if (resolved.startsWith('\\\\?\\')) return resolved.slice(4);
  return resolved;
}

export async function resolveInside(root: string, requestedPath: string): Promise<string> {
  const rootReal = await ensureRoot(root);
  const normalized = normalizeRelativePath(requestedPath || '/');
  const candidate = path.resolve(rootReal, normalized);
  if (!isInside(rootReal, candidate)) throw new SecurityError('Path escapes the configured server root');
  await rejectSymlinkComponents(rootReal, path.relative(rootReal, candidate));
  return candidate;
}

export function assertWritable(readOnly: boolean): void {
  if (readOnly) throw new ReadOnlyError();
}

export function assertSafeArchiveEntry(entryName: string): string {
  const normalized = normalizeRelativePath(`/${entryName}`);
  if (!normalized) throw new SecurityError('Archive contains an empty entry name');
  return normalized;
}
