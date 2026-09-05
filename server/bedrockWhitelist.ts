import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface BedrockProfile {
  uuid: string;
  name: string;
}

type WhitelistEntry = Record<string, unknown> & { uuid?: unknown; name?: unknown };
const pendingWrites = new Map<string, Promise<unknown>>();
const FLOODGATE_UUID = /^00000000-0000-0000-0009-[0-9a-f]{12}$/i;

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

export function isFloodgateUuid(value: unknown): value is string {
  return typeof value === 'string' && FLOODGATE_UUID.test(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function serverUsesOfflineProfiles(serverDirectory: string): Promise<boolean> {
  try {
    const properties = await readFile(path.join(serverDirectory, 'server.properties'), 'utf8');
    const line = properties.split(/\r?\n/).find((entry) => /^\s*online-mode\s*=/.test(entry));
    return line?.slice(line.indexOf('=') + 1).trim().toLowerCase() === 'false';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function offlineJavaProfile(suppliedName: string): BedrockProfile {
  const name = suppliedName.trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw httpError(400, 'Invalid offline Java username');
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x30;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const compact = bytes.toString('hex');
  return {
    uuid: `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`,
    name,
  };
}

export async function readFloodgatePrefix(serverDirectory: string): Promise<string> {
  let config: string;
  try {
    config = await readFile(path.join(serverDirectory, 'config', 'floodgate', 'config.yml'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw httpError(409, 'Floodgate configuration was not found for this server');
    }
    throw error;
  }
  const match = /^\s*username-prefix\s*:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/m.exec(config);
  if (!match?.[1] || /[\r\n\u0000]/.test(match[1])) {
    throw httpError(409, 'Floodgate username prefix could not be determined');
  }
  return match[1];
}

function formatUuid(compact: string): string {
  const normalized = compact.toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw httpError(502, 'Invalid profile returned by Geyser');
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

export async function resolveBedrockProfile(
  serverDirectory: string,
  suppliedName: string,
  fetcher: typeof fetch = fetch,
): Promise<BedrockProfile> {
  const username = suppliedName.trim();
  if (!username || username.length > 128 || /[\r\n\u0000]/.test(username)) {
    throw httpError(400, 'Invalid Bedrock username');
  }
  const prefix = await readFloodgatePrefix(serverDirectory);
  const lookupName = username.startsWith(prefix) ? username : `${prefix}${username}`;
  let response: Response;
  try {
    const url = new URL(`https://api.geysermc.org/v2/utils/uuid/bedrock_or_java/${encodeURIComponent(lookupName)}`);
    url.searchParams.set('prefix', prefix);
    response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DarkCraft/1.7' },
      redirect: 'manual',
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    throw httpError(502, 'Bedrock profile service is unavailable');
  }
  if (response.status === 302 || response.status === 404) {
    throw httpError(404, 'Bedrock player profile was not found');
  }
  if (!response.ok) throw httpError(502, 'Bedrock profile service is unavailable');
  const payload = await response.json() as { id?: unknown; name?: unknown };
  if (typeof payload.id !== 'string' || typeof payload.name !== 'string') {
    throw httpError(502, 'Invalid profile returned by Geyser');
  }
  const profile = { uuid: formatUuid(payload.id), name: payload.name };
  if (!isFloodgateUuid(profile.uuid) || !profile.name.startsWith(prefix)) {
    throw httpError(502, 'Profile returned by Geyser is not a Floodgate player');
  }
  return profile;
}

async function readWhitelist(filename: string): Promise<WhitelistEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(filename, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Whitelist data is not an array');
    return parsed as WhitelistEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw httpError(409, 'Existing whitelist.json could not be read safely');
  }
}

async function editWhitelist(filename: string, action: 'add' | 'remove', profile: BedrockProfile): Promise<void> {
  const entries = await readWhitelist(filename);
  const matches = (entry: WhitelistEntry) =>
    (typeof entry.uuid === 'string' && entry.uuid.toLowerCase() === profile.uuid.toLowerCase()) ||
    (typeof entry.name === 'string' && entry.name.toLowerCase() === profile.name.toLowerCase());
  const next = entries.filter((entry) => !matches(entry));
  if (action === 'add') next.push({ uuid: profile.uuid, name: profile.name });
  const temporary = `${filename}.darkcraft-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filename);
}

export async function updateBedrockWhitelist(
  serverDirectory: string,
  action: 'add' | 'remove',
  profile: BedrockProfile,
): Promise<void> {
  const filename = path.join(serverDirectory, 'whitelist.json');
  const previous = pendingWrites.get(filename) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => editWhitelist(filename, action, profile));
  pendingWrites.set(filename, current);
  try {
    await current;
  } finally {
    if (pendingWrites.get(filename) === current) pendingWrites.delete(filename);
  }
}
