import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export function parseJavaVersion(output: string): string | null {
  const legacy = /\b(?:java|openjdk) version ["']1\.(\d+)/i.exec(output)?.[1];
  if (legacy) return `Java ${legacy}`;
  const current = /\b(?:java|openjdk) version ["']?(\d+)/i.exec(output)?.[1]
    ?? /\bversion ["']?(\d+)(?:\.\d+)*["']?\s+(?:LTS\s+)?OpenJDK/i.exec(output)?.[1];
  return current ? `Java ${current}` : null;
}

export async function readJavaVersion(executable: string): Promise<string | null> {
  const result = await execute(executable, ['-version'], { timeout: 5000, windowsHide: true });
  return parseJavaVersion(`${result.stdout}\n${result.stderr}`);
}
