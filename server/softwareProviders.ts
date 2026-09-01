import type { InstallableServerSoftware, SoftwareBuild, SoftwareCatalogVersion } from '../src/types/index.js';

export interface DownloadArtifact {
  url: string;
  fileName: string;
  size?: number;
  sha1?: string;
  sha256?: string;
  kind: 'jar' | 'installer';
  installerFamily?: 'forge' | 'neoforge';
  loaderVersion?: string;
}

export interface MetadataReader {
  json<T>(url: string): Promise<T>;
  text(url: string): Promise<string>;
}

export interface SoftwareProvider {
  software: InstallableServerSoftware;
  versions(reader: MetadataReader): Promise<SoftwareCatalogVersion[]>;
  builds(reader: MetadataReader, minecraftVersion: string): Promise<SoftwareBuild[]>;
  artifact(reader: MetadataReader, minecraftVersion: string, build: string): Promise<DownloadArtifact>;
}

const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const PAPER_API = 'https://fill.papermc.io/v3/projects/paper';
const PURPUR_API = 'https://api.purpurmc.org/v2/purpur';
const FABRIC_API = 'https://meta.fabricmc.net/v2/versions';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

function naturalParts(value: string): Array<string | number> {
  return value.split(/([0-9]+)/).filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part.toLowerCase());
}

export function compareVersionsDescending(left: string, right: string): number {
  const a = naturalParts(left); const b = naturalParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = a[index]; const bv = b[index];
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    if (av === bv) continue;
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;
    return String(bv).localeCompare(String(av));
  }
  return 0;
}

function sortedVersions(items: SoftwareCatalogVersion[]): SoftwareCatalogVersion[] {
  return items.sort((a, b) => Number(b.stable) - Number(a.stable) || compareVersionsDescending(a.id, b.id));
}

function requireSelection<T>(items: T[], predicate: (item: T) => boolean, message: string): T {
  const selected = items.find(predicate);
  if (!selected) throw Object.assign(new Error(message), { statusCode: 400 });
  return selected;
}

interface MojangManifest {
  versions: Array<{ id: string; type: string; url: string }>;
}

interface MojangVersionMetadata {
  downloads?: { server?: { url: string; sha1?: string; size?: number } };
}

export function parseMojangVersions(input: MojangManifest): SoftwareCatalogVersion[] {
  return input.versions.filter((item) => item.type === 'release').map((item) => ({ id: item.id, stable: true }));
}

export function parsePaperVersions(input: { versions?: Record<string, string[]> }): SoftwareCatalogVersion[] {
  const versions = Object.values(input.versions ?? {}).flat();
  return sortedVersions([...new Set(versions)].map((id) => ({ id, stable: !/(?:pre|rc|snapshot)/i.test(id) })));
}

interface PaperBuild {
  id: number | string;
  channel?: string;
  downloads?: Record<string, { name?: string; url?: string; size?: number; checksums?: { sha256?: string } }>;
}

export function parsePaperBuilds(input: PaperBuild[]): SoftwareBuild[] {
  return input.map((item) => ({ id: String(item.id), label: `Build ${item.id}`, stable: item.channel === 'STABLE' }));
}

export function parsePurpurVersions(input: { versions?: string[] }): SoftwareCatalogVersion[] {
  return sortedVersions((input.versions ?? []).map((id) => ({ id, stable: true })));
}

interface PurpurBuilds { builds?: { all?: string[]; latest?: string } }

export function parsePurpurBuilds(input: PurpurBuilds): SoftwareBuild[] {
  return [...(input.builds?.all ?? [])].reverse().map((id) => ({ id, label: `Build ${id}`, stable: true }));
}

interface FabricGameVersion { version: string; stable: boolean }
interface FabricLoaderResult { loader?: { version?: string; stable?: boolean } }

export function parseFabricVersions(input: FabricGameVersion[]): SoftwareCatalogVersion[] {
  return input.filter((item) => item.stable).map((item) => ({ id: item.version, stable: true }));
}

export function parseFabricBuilds(input: FabricLoaderResult[]): SoftwareBuild[] {
  return input.flatMap((item) => item.loader?.version ? [{ id: item.loader.version, label: `Loader ${item.loader.version}`, stable: item.loader.stable === true }] : []);
}

export function parseMavenVersions(xml: string): string[] {
  return [...xml.matchAll(/<version>\s*([^<]+?)\s*<\/version>/g)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
}

export function groupForgeVersions(versions: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const full of versions) {
    const match = /^(\d+(?:\.\d+){1,3})-(.+)$/.exec(full);
    if (!match?.[1]) continue;
    grouped.set(match[1], [...(grouped.get(match[1]) ?? []), full]);
  }
  for (const builds of grouped.values()) builds.sort(compareVersionsDescending);
  return grouped;
}

export function neoForgeMinecraftVersion(version: string): string | undefined {
  const numeric = version.replace(/-.+$/, '').split('.');
  if (numeric.length < 3 || numeric.some((part) => !/^\d+$/.test(part))) return undefined;
  const [major, minor, patch] = numeric;
  if (!major || !minor || !patch) return undefined;
  if (Number(major) >= 26 && numeric.length >= 4) return Number(patch) === 0 ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
  return Number(minor) === 0 ? `1.${major}` : `1.${major}.${minor}`;
}

export function groupNeoForgeVersions(versions: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const full of versions) {
    const minecraftVersion = neoForgeMinecraftVersion(full);
    if (!minecraftVersion) continue;
    grouped.set(minecraftVersion, [...(grouped.get(minecraftVersion) ?? []), full]);
  }
  for (const builds of grouped.values()) builds.sort(compareVersionsDescending);
  return grouped;
}

function mavenProvider(
  software: 'Forge' | 'NeoForge',
  metadataUrl: string,
  group: (versions: string[]) => Map<string, string[]>,
  artifactName: (version: string) => string,
): SoftwareProvider {
  const load = async (reader: MetadataReader) => group(parseMavenVersions(await reader.text(`${metadataUrl}/maven-metadata.xml`)));
  return {
    software,
    async versions(reader) { return sortedVersions([...await load(reader)].map(([id]) => ({ id, stable: true }))); },
    async builds(reader, minecraftVersion) {
      return (await load(reader).then((result) => result.get(minecraftVersion) ?? [])).map((id) => ({ id, label: id, stable: !/(?:alpha|beta|snapshot|rc)/i.test(id) }));
    },
    async artifact(reader, minecraftVersion, build) {
      const builds = await load(reader).then((result) => result.get(minecraftVersion) ?? []);
      requireSelection(builds, (item) => item === build, `${software} build is not available for this Minecraft version`);
      const fileName = artifactName(build);
      const url = `${metadataUrl}/${encodeURIComponent(build)}/${fileName}`;
      let sha1: string | undefined;
      try { sha1 = (await reader.text(`${url}.sha1`)).trim().split(/\s+/)[0]; } catch { /* Maven checksum is optional; JAR validation still applies. */ }
      return { url, fileName, sha1, kind: 'installer', installerFamily: software === 'Forge' ? 'forge' : 'neoforge' };
    },
  };
}

const vanilla: SoftwareProvider = {
  software: 'Vanilla',
  async versions(reader) { return parseMojangVersions(await reader.json<MojangManifest>(MOJANG_MANIFEST)); },
  async builds(reader, minecraftVersion) {
    const manifest = await reader.json<MojangManifest>(MOJANG_MANIFEST);
    requireSelection(manifest.versions, (item) => item.id === minecraftVersion && item.type === 'release', 'Vanilla version is not available');
    return [{ id: 'release', label: 'Official release', stable: true }];
  },
  async artifact(reader, minecraftVersion, build) {
    if (build !== 'release') throw Object.assign(new Error('Invalid Vanilla build'), { statusCode: 400 });
    const manifest = await reader.json<MojangManifest>(MOJANG_MANIFEST);
    const version = requireSelection(manifest.versions, (item) => item.id === minecraftVersion && item.type === 'release', 'Vanilla version is not available');
    const metadata = await reader.json<MojangVersionMetadata>(version.url);
    if (!metadata.downloads?.server?.url) throw Object.assign(new Error('This Minecraft release has no dedicated server download'), { statusCode: 502 });
    return { ...metadata.downloads.server, fileName: 'server.jar', kind: 'jar' };
  },
};

const paper: SoftwareProvider = {
  software: 'Paper',
  async versions(reader) { return parsePaperVersions(await reader.json(`${PAPER_API}`)); },
  async builds(reader, minecraftVersion) { return parsePaperBuilds(await reader.json<PaperBuild[]>(`${PAPER_API}/versions/${encodeURIComponent(minecraftVersion)}/builds`)); },
  async artifact(reader, minecraftVersion, build) {
    const builds = await reader.json<PaperBuild[]>(`${PAPER_API}/versions/${encodeURIComponent(minecraftVersion)}/builds`);
    const selected = requireSelection(builds, (item) => String(item.id) === build, 'Paper build is not available');
    const download = selected.downloads?.['server:default'];
    if (!download?.url) throw Object.assign(new Error('Paper did not publish a server download for this build'), { statusCode: 502 });
    return { url: download.url, fileName: 'server.jar', size: download.size, sha256: download.checksums?.sha256, kind: 'jar' };
  },
};

const purpur: SoftwareProvider = {
  software: 'Purpur',
  async versions(reader) { return parsePurpurVersions(await reader.json(PURPUR_API)); },
  async builds(reader, minecraftVersion) { return parsePurpurBuilds(await reader.json<PurpurBuilds>(`${PURPUR_API}/${encodeURIComponent(minecraftVersion)}`)); },
  async artifact(reader, minecraftVersion, build) {
    const builds = parsePurpurBuilds(await reader.json<PurpurBuilds>(`${PURPUR_API}/${encodeURIComponent(minecraftVersion)}`));
    requireSelection(builds, (item) => item.id === build, 'Purpur build is not available');
    return { url: `${PURPUR_API}/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(build)}/download`, fileName: 'server.jar', kind: 'jar' };
  },
};

const fabric: SoftwareProvider = {
  software: 'Fabric',
  async versions(reader) { return parseFabricVersions(await reader.json<FabricGameVersion[]>(`${FABRIC_API}/game`)); },
  async builds(reader, minecraftVersion) { return parseFabricBuilds(await reader.json<FabricLoaderResult[]>(`${FABRIC_API}/loader/${encodeURIComponent(minecraftVersion)}`)); },
  async artifact(reader, minecraftVersion, build) {
    const loaders = parseFabricBuilds(await reader.json<FabricLoaderResult[]>(`${FABRIC_API}/loader/${encodeURIComponent(minecraftVersion)}`));
    requireSelection(loaders, (item) => item.id === build, 'Fabric Loader version is not available for this Minecraft version');
    const installers = await reader.json<Array<{ version: string; stable: boolean }>>(`${FABRIC_API}/installer`);
    const installer = installers.find((item) => item.stable) ?? installers[0];
    if (!installer) throw Object.assign(new Error('Fabric did not publish a compatible installer'), { statusCode: 502 });
    const url = `${FABRIC_API}/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(build)}/${encodeURIComponent(installer.version)}/server/jar`;
    return { url, fileName: 'fabric-server-launch.jar', kind: 'jar', loaderVersion: build };
  },
};

export const SOFTWARE_PROVIDERS: SoftwareProvider[] = [
  vanilla,
  paper,
  purpur,
  fabric,
  mavenProvider('Forge', FORGE_MAVEN, groupForgeVersions, (version) => `forge-${version}-installer.jar`),
  mavenProvider('NeoForge', NEOFORGE_MAVEN, groupNeoForgeVersions, (version) => `neoforge-${version}-installer.jar`),
];

export function providerFor(software: InstallableServerSoftware): SoftwareProvider {
  return requireSelection(SOFTWARE_PROVIDERS, (provider) => provider.software === software, 'Unsupported server software');
}
