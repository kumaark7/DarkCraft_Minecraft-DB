import { describe, expect, it } from 'vitest';
import {
  groupForgeVersions,
  groupNeoForgeVersions,
  neoForgeMinecraftVersion,
  parseFabricBuilds,
  parseFabricVersions,
  parseMavenVersions,
  parseMojangVersions,
  parsePaperBuilds,
  parsePaperVersions,
  parsePurpurBuilds,
  parsePurpurVersions,
} from './softwareProviders.js';

describe('official software metadata parsers', () => {
  it('parses release-only Vanilla versions without a hardcoded version list', () => {
    expect(parseMojangVersions({ versions: [
      { id: '26.2', type: 'release', url: 'https://example.test/release' },
      { id: '26.3-snapshot-1', type: 'snapshot', url: 'https://example.test/snapshot' },
    ] })).toEqual([{ id: '26.2', stable: true }]);
  });

  it('parses Paper and Purpur version/build metadata', () => {
    expect(parsePaperVersions({ versions: { '26.2': ['26.2', '26.2-rc-2'], '1.21': ['1.21.11'] } }).map((item) => item.id))
      .toEqual(['26.2', '1.21.11', '26.2-rc-2']);
    expect(parsePaperBuilds([{ id: 17, channel: 'STABLE' }, { id: 16, channel: 'EXPERIMENTAL' }]))
      .toEqual([{ id: '17', label: 'Build 17', stable: true }, { id: '16', label: 'Build 16', stable: false }]);
    expect(parsePurpurVersions({ versions: ['1.21.11', '26.2'] })[0]?.id).toBe('26.2');
    expect(parsePurpurBuilds({ builds: { all: ['100', '101'], latest: '101' } })[0])
      .toEqual({ id: '101', label: 'Build 101', stable: true });
  });

  it('parses Fabric game and loader metadata', () => {
    expect(parseFabricVersions([{ version: '26.2', stable: true }, { version: '26.3-snapshot-1', stable: false }]))
      .toEqual([{ id: '26.2', stable: true }]);
    expect(parseFabricBuilds([{ loader: { version: '0.19.3', stable: true } }]))
      .toEqual([{ id: '0.19.3', label: 'Loader 0.19.3', stable: true }]);
  });

  it('groups Forge and NeoForge Maven versions by their compatible Minecraft version', () => {
    const xml = '<metadata><versioning><versions><version>1.20.1-47.4.10</version><version>1.21.4-54.1.0</version></versions></versioning></metadata>';
    expect(groupForgeVersions(parseMavenVersions(xml)).get('1.21.4')).toEqual(['1.21.4-54.1.0']);
    expect(neoForgeMinecraftVersion('21.0.143')).toBe('1.21');
    expect(neoForgeMinecraftVersion('21.4.111-beta')).toBe('1.21.4');
    expect(neoForgeMinecraftVersion('26.1.0.10-beta')).toBe('26.1');
    expect(groupNeoForgeVersions(['21.4.111-beta', '26.1.0.10-beta']).get('26.1')).toEqual(['26.1.0.10-beta']);
  });
});
