const MAX_PATH_LENGTH = 4096;
const SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class UnsafePathError extends Error {
  constructor(message = 'The requested server path is not safe') {
    super(message);
    this.name = 'UnsafePathError';
  }
}

export function assertServerId(serverId: string): string {
  if (!SERVER_ID_PATTERN.test(serverId) || serverId === '.' || serverId === '..') {
    throw new Error('Invalid server identifier');
  }

  return serverId;
}

function decodePath(path: string): string {
  let decoded = path;

  for (let pass = 0; pass < 3; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw new UnsafePathError('The server path contains invalid encoding');
    }

    if (next === decoded) return decoded;
    decoded = next;
  }

  return decoded;
}

export function normalizeServerPath(path: string): string {
  if (!path || path.length > MAX_PATH_LENGTH) {
    throw new UnsafePathError('The server path is empty or too long');
  }

  const decoded = decodePath(path);
  if (decoded.includes('\\') || decoded.includes('\0')) {
    throw new UnsafePathError();
  }

  const segments = decoded.replace(/^\/+/, '').split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new UnsafePathError('Path traversal is not allowed');
  }

  const normalized = segments.filter(Boolean).join('/');
  return normalized ? `/${normalized}` : '/';
}

export function safeServerPath(serverId: string, suffix = ''): string {
  const encodedServerId = encodeURIComponent(assertServerId(serverId));
  return `/servers/${encodedServerId}${suffix}`;
}
