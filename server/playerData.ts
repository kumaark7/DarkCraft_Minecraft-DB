import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BannedIP, Player } from '../src/types/index.js';

interface NamedEntry {
  uuid?: string;
  name?: string;
}

interface BanEntry extends NamedEntry {
  created?: string;
  source?: string;
  reason?: string;
}

interface BannedIpEntry {
  ip?: string;
  created?: string;
  source?: string;
  reason?: string;
}

async function jsonArray<T>(directory: string, filename: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await readFile(path.join(directory, filename), 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return [];
    throw error;
  }
}

function playerKey(entry: NamedEntry): string | undefined {
  if (entry.uuid?.trim()) return `uuid:${entry.uuid.toLowerCase()}`;
  if (entry.name?.trim()) return `name:${entry.name.toLowerCase()}`;
  return undefined;
}

export async function readPlayers(directory: string, onlinePlayers: Player[] = []): Promise<Player[]> {
  const [cache, operators, whitelist, banned] = await Promise.all([
    jsonArray<NamedEntry>(directory, 'usercache.json'),
    jsonArray<NamedEntry>(directory, 'ops.json'),
    jsonArray<NamedEntry>(directory, 'whitelist.json'),
    jsonArray<BanEntry>(directory, 'banned-players.json'),
  ]);
  const players = new Map<string, Player>();

  const ensure = (entry: NamedEntry): Player | undefined => {
    const key = playerKey(entry);
    if (!key || !entry.name) return undefined;
    const byName = [...players.values()].find((player) => player.username.toLowerCase() === entry.name?.toLowerCase());
    const existing = players.get(key) ?? byName;
    if (existing) {
      existing.username = entry.name;
      if (entry.uuid) existing.uuid = entry.uuid;
      if (!players.has(key)) players.set(key, existing);
      return existing;
    }
    const player: Player = {
      username: entry.name,
      uuid: entry.uuid ?? `unknown-${entry.name}`,
      online: false,
      isOp: false,
      isWhitelisted: false,
      isBanned: false,
    };
    players.set(key, player);
    return player;
  };

  for (const entry of cache) ensure(entry);
  for (const entry of operators) {
    const player = ensure(entry);
    if (player) player.isOp = true;
  }
  for (const entry of whitelist) {
    const player = ensure(entry);
    if (player) player.isWhitelisted = true;
  }
  for (const entry of banned) {
    const player = ensure(entry);
    if (player) {
      player.isBanned = true;
      player.banReason = entry.reason;
      player.banDate = entry.created;
    }
  }
  for (const live of onlinePlayers) {
    const player = ensure({ uuid: live.uuid.startsWith('observed-') ? undefined : live.uuid, name: live.username });
    if (player) {
      player.online = true;
      player.duration = live.duration;
      player.ping = live.ping;
    }
  }
  return [...new Set(players.values())].sort((left, right) => left.username.localeCompare(right.username));
}

export async function readBannedIps(directory: string): Promise<BannedIP[]> {
  const entries = await jsonArray<BannedIpEntry>(directory, 'banned-ips.json');
  return entries.filter((entry): entry is BannedIpEntry & { ip: string } => Boolean(entry.ip)).map((entry) => ({
    ip: entry.ip,
    reason: entry.reason ?? 'Banned',
    bannedBy: entry.source ?? 'Server',
    date: entry.created ?? '',
  }));
}
