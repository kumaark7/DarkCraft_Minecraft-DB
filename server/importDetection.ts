import path from 'node:path';
import AdmZip from 'adm-zip';
import type { ImportInspection, ServerSoftware } from '../src/types/index.js';

type ZipEntry = ReturnType<AdmZip['getEntries']>[number];

interface Evidence<T> {
  value: T;
  confidence: number;
}

interface DetectionState {
  software?: Evidence<ServerSoftware>;
  version?: Evidence<string>;
  jar?: Evidence<string>;
  build?: Evidence<string>;
}

const MINECRAFT_VERSION = /\b(1\.\d+(?:\.\d+)?|2\d\.\d+(?:\.\d+)?)\b/;

function applyEvidence<T>(current: Evidence<T> | undefined, value: T | undefined, confidence: number): Evidence<T> | undefined {
  if (!value || current && current.confidence > confidence) return current;
  return { value, confidence };
}

function minecraftVersion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.match(/\b(?:Minecraft|MC)(?: version)?[: /_-]+(1\.\d+(?:\.\d+)?|2\d\.\d+(?:\.\d+)?)/i)?.[1]
    ?? value.match(MINECRAFT_VERSION)?.[1];
}

function text(entry: ZipEntry | undefined, maximumBytes = 1024 * 1024): string | undefined {
  if (!entry || entry.isDirectory || entry.header.size > maximumBytes) return undefined;
  return entry.getData().toString('utf8');
}

function properties(content: string | undefined): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content?.split(/\r?\n/) ?? []) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/[:=]/);
    if (separator < 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function manifest(content: string | undefined): Record<string, string> {
  return properties(content?.replace(/\r?\n[ \t]/g, '')?.replace(/: /g, '=') ?? '');
}

function normalizedArchivePath(value: string): string {
  return value.replace(/^\.\//, '').replace(/\\/g, '/');
}

function directChildOf(entryName: string, directory: string): boolean {
  return path.posix.dirname(entryName) === (directory || '.');
}

function inspectJar(entry: ZipEntry, state: DetectionState): void {
  if (entry.header.size > 256 * 1024 * 1024) return;
  try {
    const jar = new AdmZip(entry.getData());
    const entries = jar.getEntries();
    const byName = new Map(entries.map((item) => [item.entryName.toLowerCase(), item]));
    const names = [...byName.keys()];
    const attributes = manifest(text(byName.get('meta-inf/manifest.mf')));
    const installer = properties(text(byName.get('install.properties')));
    const mainClass = attributes['Main-Class'] ?? '';
    const has = (pattern: RegExp) => names.some((name) => pattern.test(name));
    let software: ServerSoftware | undefined;
    let softwareConfidence = 0;

    if (/fabricmc|FabricServerLauncher/i.test(mainClass) || attributes['Fabric-Loader-Version'] || installer['fabric-loader-version'] || has(/^net\/fabricmc\/loader\//)) {
      software = 'Fabric'; softwareConfidence = installer['fabric-loader-version'] ? 185 : 160;
      state.version = applyEvidence(state.version, minecraftVersion(installer['game-version']), 195);
      state.build = applyEvidence(state.build, installer['fabric-loader-version'] ?? attributes['Fabric-Loader-Version'], 190);
      state.version = applyEvidence(state.version, minecraftVersion(attributes['Fabric-Minecraft-Version']), 180);
    }
    if (/org\/purpurmc|purpur/i.test(mainClass) || has(/^org\/purpurmc\//)) {
      software = 'Purpur'; softwareConfidence = 180;
    } else if (/papermc|paperclip/i.test(mainClass) || has(/^io\/papermc\/paper\//)) {
      software = 'Paper'; softwareConfidence = 170;
    } else if (/neoforged/i.test(mainClass) || has(/^net\/neoforged\//)) {
      software = 'NeoForge'; softwareConfidence = 170;
    } else if (/minecraftforge|forge/i.test(mainClass) || has(/^net\/minecraftforge\//)) {
      software = 'Forge'; softwareConfidence = 160;
    } else if (/craftbukkit|spigotmc/i.test(mainClass) || has(/^org\/spigotmc\//)) {
      software = 'Spigot'; softwareConfidence = 150;
    } else if (/^net\.minecraft\.server\.Main$/i.test(mainClass)) {
      software = 'Vanilla'; softwareConfidence = 130;
    }

    if (software) {
      state.software = applyEvidence(state.software, software, softwareConfidence);
      state.jar = applyEvidence(state.jar, entry.entryName, softwareConfidence);
    }

    const versionJson = text(byName.get('version.json'));
    if (versionJson) {
      try {
        const parsed = JSON.parse(versionJson) as { id?: string; name?: string };
        state.version = applyEvidence(state.version, minecraftVersion(parsed.id ?? parsed.name), 160);
      } catch {
        // A malformed optional metadata file is not reliable evidence.
      }
    }
    if (software && software !== 'Fabric') {
      const declaredVersion = attributes['Minecraft-Version']
        ?? attributes['Implementation-Version']
        ?? attributes['Specification-Version'];
      state.version = applyEvidence(state.version, minecraftVersion(declaredVersion), 130);
    }
  } catch {
    // A root JAR can be corrupt or non-ZIP; weaker archive-level evidence remains available.
  }
}

function inspectArchiveMetadata(entries: ZipEntry[], state: DetectionState): void {
  for (const entry of entries) {
    const name = entry.entryName;
    const lower = name.toLowerCase();
    const intermediary = lower.match(/(?:^|\/)libraries\/net\/fabricmc\/intermediary\/(1\.\d+(?:\.\d+)?|2\d\.\d+(?:\.\d+)?)\//);
    if (intermediary) {
      state.software = applyEvidence(state.software, 'Fabric', 145);
      state.version = applyEvidence(state.version, intermediary[1], 165);
    }
    if (/(?:^|\/)libraries\/net\/fabricmc\/fabric-loader\//.test(lower) || /(?:^|\/)fabric-server-launch\.properties$/.test(lower)) {
      state.software = applyEvidence(state.software, 'Fabric', 140);
      state.build = applyEvidence(state.build, name.match(/(?:^|\/)libraries\/net\/fabricmc\/fabric-loader\/([^/]+)\//i)?.[1], 150);
    }
    if (/(?:^|\/)libraries\/net\/minecraftforge\/forge\//.test(lower)) {
      state.software = applyEvidence(state.software, 'Forge', 140);
      state.build = applyEvidence(state.build, name.match(/(?:^|\/)libraries\/net\/minecraftforge\/forge\/([^/]+)\//i)?.[1], 150);
    }
    if (/(?:^|\/)libraries\/net\/neoforged\/neoforge\//.test(lower)) {
      state.software = applyEvidence(state.software, 'NeoForge', 150);
      state.build = applyEvidence(state.build, name.match(/(?:^|\/)libraries\/net\/neoforged\/neoforge\/([^/]+)\//i)?.[1], 160);
    }

    if (/(?:win|unix)_args\.txt$/i.test(name)) {
      const args = text(entry, 256 * 1024);
      const version = args?.match(/--fml\.mcVersion(?:\r?\n|\s+)(1\.\d+(?:\.\d+)?|2\d\.\d+(?:\.\d+)?)/i)?.[1];
      state.version = applyEvidence(state.version, version, 170);
    }
  }
}

function inspectNamesAndScripts(entries: ZipEntry[], root: string, state: DetectionState): ZipEntry[] {
  const files = entries.filter((entry) => !entry.isDirectory);
  const byLowerName = new Map(files.map((entry) => [entry.entryName.toLowerCase(), entry]));
  const rootJars = files.filter((entry) => /\.jar$/i.test(entry.entryName) && directChildOf(entry.entryName, root));

  for (const entry of files.filter((item) => directChildOf(item.entryName, root) && /\.(?:sh|bat|cmd|ps1)$/i.test(item.entryName))) {
    const command = text(entry, 256 * 1024);
    const match = command?.match(/(?:^|\s)-jar\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    const requested = normalizedArchivePath(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
    if (!requested) continue;
    const resolved = normalizedArchivePath(path.posix.join(root, requested)).toLowerCase();
    const jar = byLowerName.get(resolved);
    if (jar) state.jar = applyEvidence(state.jar, jar.entryName, 190);
  }

  for (const entry of rootJars) {
    const filename = path.posix.basename(entry.entryName);
    const namedSoftware: Array<[RegExp, ServerSoftware, number]> = [
      [/^purpur(?:[-_.].*)?\.jar$/i, 'Purpur', 90],
      [/^paper(?:clip)?(?:[-_.].*)?\.jar$/i, 'Paper', 85],
      [/^fabric(?:[-_.].*)?\.jar$/i, 'Fabric', 80],
      [/^neoforge(?:[-_.].*)?\.jar$/i, 'NeoForge', 85],
      [/^forge(?:[-_.].*)?\.jar$/i, 'Forge', 80],
      [/^(?:spigot|craftbukkit)(?:[-_.].*)?\.jar$/i, 'Spigot', 80],
    ];
    const named = namedSoftware.find(([pattern]) => pattern.test(filename));
    if (named) {
      state.software = applyEvidence(state.software, named[1], named[2]);
      state.jar = applyEvidence(state.jar, entry.entryName, named[2]);
      state.version = applyEvidence(state.version, minecraftVersion(filename), 60);
    }
    inspectJar(entry, state);
  }
  if (rootJars.length === 1) state.jar = applyEvidence(state.jar, rootJars[0]?.entryName, 40);
  return rootJars;
}

export function inspectServerArchive(zip: AdmZip, archiveName: string, archiveSize: number): ImportInspection {
  const entries = zip.getEntries();
  const files = entries.filter((entry) => !entry.isDirectory);
  const propertiesEntries = files
    .filter((entry) => /(^|\/)server\.properties$/i.test(entry.entryName))
    .sort((left, right) => left.entryName.split('/').length - right.entryName.split('/').length);
  const serverProperties = propertiesEntries[0];
  const root = serverProperties ? path.posix.dirname(serverProperties.entryName).replace(/^\.$/, '') : '';
  const serverValues = properties(text(serverProperties));
  const configuredWorldValue = serverValues['level-name']?.trim();
  const configuredWorld = configuredWorldValue && !configuredWorldValue.split(/[\\/]+/).some((segment) => segment === '..')
    ? normalizedArchivePath(configuredWorldValue)
    : undefined;
  const worldPaths = files
    .filter((entry) => /(^|\/)level\.dat$/i.test(entry.entryName))
    .map((entry) => path.posix.dirname(entry.entryName));
  const displayPath = (value: string) => root && value.startsWith(`${root}/`) ? value.slice(root.length + 1) : value;
  const worlds = [...new Set(worldPaths.map(displayPath))];
  const activeWorldPath = configuredWorld ? displayPath(path.posix.join(root, normalizedArchivePath(configuredWorld))) : undefined;
  const activeWorld = activeWorldPath
    ? worlds.find((world) => world.toLowerCase() === activeWorldPath.toLowerCase()) ?? activeWorldPath
    : undefined;

  const state: DetectionState = {};
  inspectArchiveMetadata(entries, state);
  inspectNamesAndScripts(entries, root, state);

  return {
    detectedName: archiveName.replace(/\.zip$/i, ''),
    detectedVersion: state.version?.value,
    detectedSoftware: state.software?.value,
    detectedJar: state.jar?.value,
    detectedBuild: state.build?.value,
    activeWorld,
    worlds,
    pluginCount: files.filter((entry) => /(^|\/)plugins\/[^/]+\.jar$/i.test(entry.entryName)).length,
    modCount: files.filter((entry) => /(^|\/)mods\/[^/]+\.jar$/i.test(entry.entryName)).length,
    archiveSize,
    hasServerProperties: Boolean(serverProperties),
    configFiles: files.filter((entry) => /\.(json|ya?ml|properties|toml)$/i.test(entry.entryName)).map((entry) => entry.entryName).slice(0, 100),
  };
}
