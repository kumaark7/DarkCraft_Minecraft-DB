import type { ServerSoftware } from '../src/types/index.js';

export interface RuntimeDetection {
  ready?: boolean;
  software?: ServerSoftware;
  minecraftVersion?: string;
  javaVersion?: string;
  softwareConfidence?: number;
}

const VERSION = '(\\d+(?:\\.\\d+){1,2})';

function clean(line: string): string {
  return line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function matchVersion(line: string, expression: RegExp): string | undefined {
  return line.match(expression)?.[1];
}

export function detectRuntime(lineWithFormatting: string): RuntimeDetection {
  const line = clean(lineWithFormatting);
  const detection: RuntimeDetection = {};

  if (/\bDone \([^)]*\)! For help, type ["']?help["']?/i.test(line)) detection.ready = true;

  detection.javaVersion = matchVersion(line, /\bRunning Java (\d+(?:\.\d+)*)\b/i)
    ?? matchVersion(line, /\bJava version:\s*["']?(\d+(?:\.\d+)*)/i)
    ?? matchVersion(line, /\bjava version ["'](\d+(?:\.\d+)*)/i);
  if (detection.javaVersion) detection.javaVersion = `Java ${detection.javaVersion}`;

  const explicitSoftware: Array<{ software: ServerSoftware; pattern: RegExp; confidence: number }> = [
    { software: 'NeoForge', pattern: /\b(?:Loading .* with NeoForge|Loading NeoForge|NeoForge(?: version)?\s+\d)/i, confidence: 130 },
    { software: 'Fabric', pattern: /\b(?:Loading Minecraft .* with Fabric Loader|Fabric Loader version)/i, confidence: 130 },
    { software: 'Purpur', pattern: /\b(?:Starting|running) Purpur(?: version)?\b/i, confidence: 140 },
    { software: 'Paper', pattern: /\b(?:Starting|running) Paper(?: version)?\b/i, confidence: 130 },
    { software: 'Spigot', pattern: /\b(?:(?:Starting|running) Spigot(?: version)?|server is running CraftBukkit version)\b/i, confidence: 100 },
    { software: 'Forge', pattern: /\b(?:MinecraftForge v|Forge Mod Loader version|Starting Forge version)\b/i, confidence: 130 },
  ];
  const identified = explicitSoftware.find(({ pattern }) => pattern.test(line));
  if (identified) {
    detection.software = identified.software;
    detection.softwareConfidence = identified.confidence;
    detection.minecraftVersion =
      matchVersion(line, new RegExp(`(?:Minecraft|MC)[:\\s]+${VERSION}`, 'i'))
      ?? matchVersion(line, new RegExp(`(?:Starting|running|Loading)\\s+(?:Minecraft\\s+)?(?:Paper|Purpur|Spigot|NeoForge)?(?:\\s+version)?\\s+${VERSION}`, 'i'))
      ?? (identified.software === 'Fabric'
        ? matchVersion(line, new RegExp(`Loading Minecraft ${VERSION}`, 'i'))
        : undefined);
    return detection;
  }

  const vanillaVersion = matchVersion(line, new RegExp(`Starting minecraft server version ${VERSION}`, 'i'));
  if (vanillaVersion) {
    detection.software = 'Vanilla';
    detection.minecraftVersion = vanillaVersion;
    detection.softwareConfidence = 10;
  }

  return detection;
}
