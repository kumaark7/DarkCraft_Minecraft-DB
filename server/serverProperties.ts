import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { ServerSettings } from '../src/types/index.js';

type PropertyValue = string | number | boolean;

const SETTING_PROPERTIES = {
  motd: 'motd',
  serverPort: 'server-port',
  maxPlayers: 'max-players',
  gamemode: 'gamemode',
  difficulty: 'difficulty',
  whitelist: 'white-list',
  allowFlight: 'allow-flight',
  pvp: 'pvp',
  commandBlocks: 'enable-command-block',
  hardcore: 'hardcore',
  spawnAnimals: 'spawn-animals',
  spawnMonsters: 'spawn-monsters',
  spawnNpcs: 'spawn-npcs',
  spawnProtection: 'spawn-protection',
  viewDistance: 'view-distance',
  simulationDistance: 'simulation-distance',
} as const satisfies Partial<Record<keyof ServerSettings, string>>;

interface ParsedLine {
  key: string;
  value: string;
}

function parseLine(line: string): ParsedLine | null {
  const value = line.trimStart();
  if (!value || value.startsWith('#') || value.startsWith('!')) return null;
  const match = /^([^\s:=]+)(?:\s*[=:]\s*|\s+)(.*)$/.exec(value);
  return match?.[1] === undefined ? { key: value, value: '' } : { key: match[1], value: match[2] ?? '' };
}

export function readRawProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const property = parseLine(line);
    if (property) result[property.key] = property.value;
  }
  return result;
}

function stringValue(properties: Record<string, string>, key: string, fallback: string): string {
  return properties[key] ?? fallback;
}

function booleanValue(properties: Record<string, string>, key: string, fallback: boolean): boolean {
  const value = properties[key]?.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function integerValue(properties: Record<string, string>, key: string, fallback: number): number {
  const raw = properties[key];
  if (raw === undefined || !raw.trim()) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : fallback;
}

function gamemodeValue(value: string): ServerSettings['gamemode'] {
  return ['survival', 'creative', 'adventure', 'spectator'].includes(value)
    ? value as ServerSettings['gamemode']
    : 'survival';
}

function difficultyValue(value: string): ServerSettings['difficulty'] {
  return ['peaceful', 'easy', 'normal', 'hard'].includes(value)
    ? value as ServerSettings['difficulty']
    : 'easy';
}

export function parseServerProperties(
  content: string,
  server: Pick<ServerSettings, 'serverId' | 'serverName'>,
): ServerSettings {
  const rawProperties = readRawProperties(content);
  return {
    ...server,
    motd: stringValue(rawProperties, 'motd', server.serverName),
    serverPort: integerValue(rawProperties, 'server-port', 25565),
    maxPlayers: integerValue(rawProperties, 'max-players', 20),
    gamemode: gamemodeValue(stringValue(rawProperties, 'gamemode', 'survival')),
    difficulty: difficultyValue(stringValue(rawProperties, 'difficulty', 'easy')),
    crackedMode: !booleanValue(rawProperties, 'online-mode', true),
    whitelist: booleanValue(rawProperties, 'white-list', false),
    allowFlight: booleanValue(rawProperties, 'allow-flight', false),
    pvp: booleanValue(rawProperties, 'pvp', true),
    commandBlocks: booleanValue(rawProperties, 'enable-command-block', false),
    hardcore: booleanValue(rawProperties, 'hardcore', false),
    spawnAnimals: booleanValue(rawProperties, 'spawn-animals', true),
    spawnMonsters: booleanValue(rawProperties, 'spawn-monsters', true),
    spawnNpcs: booleanValue(rawProperties, 'spawn-npcs', true),
    spawnProtection: integerValue(rawProperties, 'spawn-protection', 16),
    viewDistance: integerValue(rawProperties, 'view-distance', 10),
    simulationDistance: integerValue(rawProperties, 'simulation-distance', 10),
    rawProperties,
  };
}

function safeProperty(key: string, value: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(key) || /[\r\n]/.test(value)) {
    throw Object.assign(new Error('Invalid server property'), { statusCode: 400 });
  }
}

function propertyUpdates(patch: Partial<ServerSettings>): Record<string, string> {
  const result: Record<string, string> = {};
  if (patch.rawProperties !== undefined) {
    for (const [key, value] of Object.entries(patch.rawProperties)) {
      safeProperty(key, value);
      result[key] = value;
    }
  }
  for (const [field, key] of Object.entries(SETTING_PROPERTIES) as [keyof typeof SETTING_PROPERTIES, string][]) {
    if (!Object.hasOwn(patch, field)) continue;
    const value = patch[field] as PropertyValue | undefined;
    if (value === undefined) continue;
    const text = String(value);
    safeProperty(key, text);
    result[key] = text;
  }
  if (Object.hasOwn(patch, 'crackedMode') && patch.crackedMode !== undefined) {
    result['online-mode'] = String(!patch.crackedMode);
  }
  return result;
}

export function patchServerProperties(content: string, patch: Partial<ServerSettings>): string {
  const updates = propertyUpdates(patch);
  if (Object.keys(updates).length === 0) return content;

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /\r?\n$/.test(content);
  const lines = content ? content.split(/\r?\n/) : [];
  if (trailingNewline) lines.pop();

  const lastLineByKey = new Map<string, number>();
  lines.forEach((line, index) => {
    const property = parseLine(line);
    if (property) lastLineByKey.set(property.key, index);
  });

  for (const [key, value] of Object.entries(updates)) {
    const index = lastLineByKey.get(key);
    if (index === undefined) lines.push(`${key}=${value}`);
    else lines[index] = `${key}=${value}`;
  }
  return `${lines.join(newline)}${trailingNewline ? newline : ''}`;
}

export function initialServerProperties(settings: ServerSettings): string {
  const content = patchServerProperties('', settings);
  return content.endsWith('\n') ? content : `${content}\n`;
}

const updateQueues = new Map<string, Promise<ServerSettings>>();

export async function updateServerPropertiesFile(
  filePath: string,
  server: Pick<ServerSettings, 'serverId' | 'serverName'>,
  patch: Partial<ServerSettings>,
): Promise<ServerSettings> {
  const previous = updateQueues.get(filePath);
  const current = (previous?.catch(() => undefined) ?? Promise.resolve()).then(async () => {
    const original = await readFile(filePath, 'utf8');
    const updated = patchServerProperties(original, patch);
    if (updated !== original) {
      const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, updated, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, filePath);
    }
    return parseServerProperties(updated, server);
  });
  updateQueues.set(filePath, current);
  try {
    return await current;
  } finally {
    if (updateQueues.get(filePath) === current) updateQueues.delete(filePath);
  }
}
