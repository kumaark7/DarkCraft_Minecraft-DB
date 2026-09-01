import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { InstallableServerSoftware } from '../src/types/index.js';
import { assertOfficialArtifactUrl, type SoftwareCatalogService } from './softwareCatalog.js';

const MAX_SERVER_DOWNLOAD_BYTES = 256 * 1024 * 1024;

export interface InstallSelection {
  software: InstallableServerSoftware;
  minecraftVersion: string;
  build: string;
  ramMb: number;
}

export interface InstalledRuntime {
  startupExecutable: string;
  startupArgs: string[];
  startupCommand: string;
  serverJar?: string;
}

export type InstallerRunner = (executable: string, args: string[], cwd: string) => Promise<void>;

function quoteArgument(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export const runInstaller: InstallerRunner = (executable, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { cwd, shell: false, windowsHide: true });
  let output = '';
  const append = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-32_768); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  const timeout = setTimeout(() => { child.kill(); reject(Object.assign(new Error('Server installer timed out after 10 minutes'), { statusCode: 504 })); }, 10 * 60 * 1000);
  child.once('error', (error) => { clearTimeout(timeout); reject(Object.assign(new Error(`Unable to launch Java installer: ${error.message}`), { statusCode: 500 })); });
  child.once('exit', (code) => {
    clearTimeout(timeout);
    if (code === 0) resolve();
    else reject(Object.assign(new Error(`Server installer failed with exit code ${code}${output.trim() ? `: ${output.trim()}` : ''}`), { statusCode: 502 }));
  });
});

async function validatedDownload(
  urlValue: string,
  destination: string,
  expected: { size?: number; sha1?: string; sha256?: string },
  fetcher: typeof fetch,
): Promise<void> {
  const url = assertOfficialArtifactUrl(urlValue);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  try {
    const response = await fetcher(url, {
      headers: { 'User-Agent': 'DarkCraft/1.0 (https://github.com/kumaark7/DarkCraft_Minecraft-DB)' },
      redirect: 'follow', signal: controller.signal,
    });
    if (!response.ok) throw Object.assign(new Error(`Download from ${url.hostname} failed (${response.status})`), { statusCode: 502 });
    if (response.url) assertOfficialArtifactUrl(response.url);
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_SERVER_DOWNLOAD_BYTES) throw Object.assign(new Error('Server download exceeds the 256 MB safety limit'), { statusCode: 413 });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SERVER_DOWNLOAD_BYTES) throw Object.assign(new Error('Server download exceeds the 256 MB safety limit'), { statusCode: 413 });
    if (expected.size !== undefined && buffer.length !== expected.size) throw Object.assign(new Error('Downloaded file size does not match official metadata'), { statusCode: 502 });
    try {
      if (buffer.length < 4 || new AdmZip(buffer).getEntries().length === 0) throw new Error('empty archive');
    } catch {
      throw Object.assign(new Error('Downloaded server file is not a valid JAR archive'), { statusCode: 502 });
    }
    for (const algorithm of ['sha1', 'sha256'] as const) {
      const wanted = expected[algorithm];
      if (wanted && createHash(algorithm).update(buffer).digest('hex').toLowerCase() !== wanted.toLowerCase()) {
        throw Object.assign(new Error(`Downloaded file failed ${algorithm.toUpperCase()} verification`), { statusCode: 502 });
      }
    }
    await writeFile(destination, buffer, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw Object.assign(new Error('Server download timed out'), { statusCode: 504 });
    throw error;
  } finally { clearTimeout(timeout); }
}

async function findRuntimeArgFile(directory: string, family: 'forge' | 'neoforge', build: string): Promise<string | undefined> {
  const platformFile = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  const relative = path.posix.join('libraries', 'net', family === 'forge' ? 'minecraftforge/forge' : 'neoforged/neoforge', build, platformFile);
  try { await readFile(path.join(directory, ...relative.split('/')), 'utf8'); return relative; } catch { return undefined; }
}

async function findLegacyForgeJar(directory: string, build: string): Promise<string | undefined> {
  const expected = [`forge-${build}.jar`, `forge-${build}-server.jar`];
  const names = await readdir(directory);
  return expected.find((name) => names.includes(name)) ?? names.find((name) => /^forge-.+\.jar$/i.test(name) && !/-installer\.jar$/i.test(name));
}

function jarRuntime(fileName: string, ramMb: number): InstalledRuntime {
  const args = ['-Xms512M', `-Xmx${ramMb}M`, '-jar', fileName, 'nogui'];
  return { startupExecutable: 'java', startupArgs: args, startupCommand: ['java', ...args].map(quoteArgument).join(' '), serverJar: fileName };
}

export async function installServerSoftware(
  catalog: SoftwareCatalogService,
  selection: InstallSelection,
  directory: string,
  options: { fetcher?: typeof fetch; runner?: InstallerRunner } = {},
): Promise<InstalledRuntime> {
  const artifact = await catalog.artifact(selection.software, selection.minecraftVersion, selection.build);
  if (!/^[-A-Za-z0-9._]+\.jar$/.test(artifact.fileName)) throw Object.assign(new Error('Upstream supplied an unsafe file name'), { statusCode: 502 });
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, artifact.fileName);
  await validatedDownload(artifact.url, destination, artifact, options.fetcher ?? fetch);
  if (artifact.kind === 'jar') return jarRuntime(artifact.fileName, selection.ramMb);

  const runner = options.runner ?? runInstaller;
  try {
    await runner('java', ['-jar', artifact.fileName, '--installServer'], directory);
    const family = artifact.installerFamily;
    if (!family) throw new Error('Installer family is missing');
    const argFile = await findRuntimeArgFile(directory, family, selection.build);
    if (argFile) {
      const userJvmArgs = path.join(directory, 'user_jvm_args.txt');
      await writeFile(userJvmArgs, `-Xms512M\n-Xmx${selection.ramMb}M\n`, { encoding: 'utf8' });
      const args = ['@user_jvm_args.txt', `@${argFile}`, 'nogui'];
      return { startupExecutable: 'java', startupArgs: args, startupCommand: ['java', ...args].map(quoteArgument).join(' ') };
    }
    if (family === 'forge') {
      const legacyJar = await findLegacyForgeJar(directory, selection.build);
      if (legacyJar) return jarRuntime(legacyJar, selection.ramMb);
    }
    throw Object.assign(new Error(`${selection.software} installer completed but no supported server runtime was generated`), { statusCode: 502 });
  } finally {
    await rm(destination, { force: true });
  }
}
