import type { Server } from '@/types';

// A wildcard bind host means "all interfaces", never a player connection address.
function normalizeHost(value: string): string | null {
  const host = value.trim().replace(/^\[([^\]]+)\]$/, '$1');
  if (!host || /[\s/@?#\\]/.test(host)) return null;
  try {
    const url = new URL(host.includes(':') ? `http://[${host}]/` : `http://${host}/`);
    if (url.port || url.username || url.password) return null;
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

function wildcard(host: string): boolean {
  return host === '0.0.0.0' || host === '::';
}

/** Format a player-facing endpoint without modifying the stored Minecraft binding. */
export function formatServerAddress(
  server: Pick<Server, 'ip' | 'port'>,
  publicHost = import.meta.env.VITE_MINECRAFT_PUBLIC_HOST ?? '',
): string {
  let host = normalizeHost(server.ip);
  if (!server.ip.trim() || (host && wildcard(host))) host = normalizeHost(publicHost);
  if (!host || wildcard(host) || !Number.isInteger(server.port) || server.port < 1 || server.port > 65535) return 'N/A';
  return `${host.includes(':') ? `[${host}]` : host}:${server.port}`;
}
