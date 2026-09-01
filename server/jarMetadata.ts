import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Mod, Plugin, ServerSoftware } from '../src/types/index.js';

interface Metadata {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  loader?: string;
  minecraftCompatibility?: string;
  modId?: string;
}

export const MAX_JAR_METADATA_BYTES = 128 * 1024 * 1024;

function entryText(zip: AdmZip, name: string): string | undefined {
  const entry = zip.getEntries().find((item) => item.entryName.toLowerCase() === name.toLowerCase());
  return entry?.getData().toString('utf8');
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

function author(value: unknown): string | undefined {
  if (!Array.isArray(value)) return text(value);
  const names = value.map((item) => text(typeof item === 'object' && item !== null ? (item as { name?: unknown }).name : item)).filter(Boolean);
  return names.length ? names.join(', ') : undefined;
}

function fabricMetadata(content: string): Metadata | null {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    const depends = typeof data.depends === 'object' && data.depends !== null ? data.depends as Record<string, unknown> : {};
    const minecraft = depends.minecraft;
    const compatibility = Array.isArray(minecraft) ? minecraft.map(text).filter(Boolean).join(' || ') : text(minecraft);
    return {
      name: text(data.name) ?? text(data.id),
      modId: text(data.id),
      version: text(data.version),
      description: text(data.description),
      author: author(data.authors),
      loader: 'Fabric',
      minecraftCompatibility: compatibility,
    };
  } catch {
    return null;
  }
}

function tomlValue(content: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'im').exec(content);
  return match?.[1]?.trim();
}

function forgeMetadata(content: string, loader: 'Forge' | 'NeoForge'): Metadata {
  const displayName = tomlValue(content, 'displayName');
  const modId = tomlValue(content, 'modId');
  const minecraftBlock = content.match(/\[\[dependencies\.[^\]]+\]\][\s\S]*?modId\s*=\s*["']minecraft["'][\s\S]*?(?=\[\[dependencies\.|$)/i)?.[0];
  return {
    name: displayName ?? modId,
    modId,
    version: tomlValue(content, 'version'),
    description: tomlValue(content, 'description'),
    author: tomlValue(content, 'authors'),
    loader,
    minecraftCompatibility: minecraftBlock ? tomlValue(minecraftBlock, 'versionRange') : undefined,
  };
}

function pluginMetadata(content: string): Metadata {
  const value = (key: string) => new RegExp(`^${key}:\\s*["']?([^\\r\\n"']+)["']?`, 'im').exec(content)?.[1]?.trim();
  return {
    name: value('name'),
    version: value('version'),
    description: value('description'),
    author: value('author') ?? value('authors'),
    minecraftCompatibility: value('api-version'),
    loader: 'Bukkit',
  };
}

function manifestValue(content: string | undefined, key: string): string | undefined {
  if (!content) return undefined;
  return new RegExp(`^${key}:\\s*(.+)$`, 'im').exec(content)?.[1]?.trim();
}

function numericVersion(value: string): number[] | null {
  const match = /\d+(?:\.\d+)*/.exec(value);
  return match ? match[0].split('.').map(Number) : null;
}

function compareVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function compatibleWithRange(version: string, range: string | undefined): boolean | null {
  if (!range) return null;
  if (range === '*' || range.toLowerCase() === 'any') return true;
  const actual = numericVersion(version);
  if (!actual) return null;
  const forgeBounds = (range.startsWith('[') || range.startsWith('(')) && (range.endsWith(']') || range.endsWith(')'))
    ? range.slice(1, -1).split(',').map((part) => part.trim())
    : null;
  if (forgeBounds?.length === 2) {
    const minimum = forgeBounds[0] ? numericVersion(forgeBounds[0]) : null;
    const maximum = forgeBounds[1] ? numericVersion(forgeBounds[1]) : null;
    if (minimum) {
      const comparison = compareVersions(actual, minimum);
      if (comparison < 0 || (comparison === 0 && range.startsWith('('))) return false;
    }
    if (maximum) {
      const comparison = compareVersions(actual, maximum);
      if (comparison > 0 || (comparison === 0 && range.endsWith(')'))) return false;
    }
    return true;
  }
  const conditions = [...range.matchAll(/(>=|<=|>|<|=|~|\^)?\s*(\d+(?:\.\d+)*(?:\.[xX*])?)/g)];
  if (!conditions.length) return null;
  return conditions.every((condition) => {
    const operator = condition[1] ?? '=';
    const expectedText = condition[2] ?? '';
    const wildcard = /[xX*]$/.test(expectedText);
    const expected = numericVersion(expectedText);
    if (!expected) return true;
    if (wildcard) return actual.slice(0, expected.length).every((part, index) => part === expected[index]);
    const comparison = compareVersions(actual, expected);
    if (operator === '>=') return comparison >= 0;
    if (operator === '<=') return comparison <= 0;
    if (operator === '>') return comparison > 0;
    if (operator === '<') return comparison < 0;
    if (operator === '~') return comparison >= 0 && actual[0] === expected[0] && actual[1] === expected[1];
    if (operator === '^') return comparison >= 0 && actual[0] === expected[0];
    return comparison === 0;
  });
}

function expectedLoader(software: ServerSoftware): string | undefined {
  if (software === 'Fabric' || software === 'Forge' || software === 'NeoForge') return software;
  return undefined;
}

export async function inspectModJar(
  filePath: string,
  software: ServerSoftware,
  minecraftVersion: string,
  loadedModEvidence: ReadonlySet<string> = new Set(),
  maximumBytes = MAX_JAR_METADATA_BYTES,
): Promise<Mod> {
  const filename = path.basename(filePath);
  const disabled = filename.toLowerCase().endsWith('.disabled');
  const fallbackName = filename.replace(/\.jar(?:\.disabled)?$/i, '');
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return { id: filename, name: fallbackName, version: 'Unknown', filename, size: 0, status: disabled ? 'Disabled' : 'Invalid JAR', inspectionError: 'JAR could not be read' };
  }
  if (info.size > maximumBytes) {
    return {
      id: filename,
      name: fallbackName,
      version: 'Unknown',
      filename,
      size: info.size,
      status: disabled ? 'Disabled' : 'Unknown',
      inspectionError: `Metadata inspection is limited to ${maximumBytes} bytes`,
    };
  }
  let zip: AdmZip;
  try {
    zip = new AdmZip(await readFile(filePath));
    zip.getEntries();
  } catch {
    return { id: filename, name: fallbackName, version: 'Unknown', filename, size: info.size, status: disabled ? 'Disabled' : 'Invalid JAR', inspectionError: 'JAR is invalid or unreadable' };
  }

  let metadata: Metadata | null = null;
  try {
    const fabric = entryText(zip, 'fabric.mod.json');
    const neoForge = entryText(zip, 'META-INF/neoforge.mods.toml');
    const forge = entryText(zip, 'META-INF/mods.toml');
    const quilt = entryText(zip, 'quilt.mod.json');
    if (fabric) metadata = fabricMetadata(fabric);
    else if (neoForge) metadata = forgeMetadata(neoForge, 'NeoForge');
    else if (forge) metadata = forgeMetadata(forge, 'Forge');
    else if (quilt) metadata = { loader: 'Quilt' };
    if (metadata?.version?.includes('${')) {
      const manifest = entryText(zip, 'META-INF/MANIFEST.MF');
      metadata.version = manifestValue(manifest, 'Implementation-Version') ?? manifestValue(manifest, 'Specification-Version');
    }
  } catch {
    return { id: filename, name: fallbackName, version: 'Unknown', filename, size: info.size, status: disabled ? 'Disabled' : 'Invalid JAR', inspectionError: 'JAR metadata is invalid or unreadable' };
  }

  if (!metadata) return { id: filename, name: fallbackName, version: 'Unknown', filename, size: info.size, status: disabled ? 'Disabled' : 'Unknown' };
  const loader = metadata.loader;
  const correctLoader = expectedLoader(software);
  const compatibility = compatibleWithRange(minecraftVersion, metadata.minecraftCompatibility);
  const normalizedEvidence = new Set([...loadedModEvidence].map((value) => value.toLowerCase()));
  const loaded = [metadata.modId, metadata.name]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizedEvidence.has(value.toLowerCase()));
  const status: Mod['status'] = disabled
    ? 'Disabled'
    : !correctLoader || loader !== correctLoader
      ? 'Wrong Loader'
      : compatibility === false
        ? 'Version Issue'
        : compatibility === null
          ? 'Unknown'
          : loaded
          ? 'Active'
          : 'Unknown';
  return {
    id: metadata.modId ?? filename,
    name: metadata.name ?? metadata.modId ?? fallbackName,
    version: metadata.version ?? 'Unknown',
    filename,
    size: info.size,
    status,
    loader,
    minecraftCompatibility: metadata.minecraftCompatibility,
    description: metadata.description,
    author: metadata.author,
  };
}

export async function inspectPluginJar(filePath: string, maximumBytes = MAX_JAR_METADATA_BYTES): Promise<Plugin> {
  const filename = path.basename(filePath);
  const disabled = filename.toLowerCase().endsWith('.disabled');
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return { id: filename, name: filename.replace(/\.jar(?:\.disabled)?$/i, ''), version: 'Unknown', filename, size: 0, status: disabled ? 'disabled' : 'enabled', description: 'JAR could not be read' };
  }
  if (info.size > maximumBytes) {
    return { id: filename, name: filename.replace(/\.jar(?:\.disabled)?$/i, ''), version: 'Unknown', filename, size: info.size, status: disabled ? 'disabled' : 'enabled', description: `Metadata inspection is limited to ${maximumBytes} bytes` };
  }
  let metadata: Metadata = {};
  try {
    const zip = new AdmZip(await readFile(filePath));
    const plugin = entryText(zip, 'plugin.yml') ?? entryText(zip, 'paper-plugin.yml');
    if (plugin) metadata = pluginMetadata(plugin);
  } catch {
    // Plugin status remains filename-based because the existing plugin contract has no invalid state.
  }
  return {
    id: filename,
    name: metadata.name ?? filename.replace(/\.jar(?:\.disabled)?$/i, ''),
    version: metadata.version ?? 'Unknown',
    filename,
    size: info.size,
    status: disabled ? 'disabled' : 'enabled',
    description: metadata.description,
    author: metadata.author,
  };
}
