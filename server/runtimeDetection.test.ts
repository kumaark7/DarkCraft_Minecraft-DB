import { describe, expect, it } from 'vitest';
import { detectRuntime } from './runtimeDetection.js';

describe('Minecraft runtime detection', () => {
  it('detects readiness and the Java process version', () => {
    expect(detectRuntime('[Server thread/INFO]: Done (4.17s)! For help, type "help"').ready).toBe(true);
    expect(detectRuntime('Running Java 25 (OpenJDK 64-Bit Server VM)').javaVersion).toBe('Java 25');
  });

  it.each([
    ['Starting Paper version 26.2-42-master', 'Paper', '26.2'],
    ['Loading Minecraft 1.21.4 with Fabric Loader 0.16.10', 'Fabric', '1.21.4'],
    ['Starting Purpur version 1.21.4-2414', 'Purpur', '1.21.4'],
    ['This server is running CraftBukkit version 4123-Spigot (MC: 1.21.4)', 'Spigot', '1.21.4'],
    ['Forge Mod Loader version 54.0.8 for Minecraft 1.21.4 loading', 'Forge', '1.21.4'],
    ['Loading Minecraft 1.21.4 with NeoForge 21.4.88', 'NeoForge', '1.21.4'],
    ['Starting minecraft server version 1.21.4', 'Vanilla', '1.21.4'],
  ])('detects %s', (line, software, version) => {
    expect(detectRuntime(line)).toMatchObject({ software, minecraftVersion: version });
  });
});
