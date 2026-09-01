import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModIssue, ModIssueSeverity } from '../src/types/index.js';

export interface DetectedModIssue {
  modId: string;
  severity: ModIssueSeverity;
  reason: string;
  exception?: string;
  affectedResource?: string;
  sourceLogLines: string[];
}

function severity(line: string): ModIssueSeverity | null {
  if (/\brecommends?\b|mod menu.*(?:recommended|missing)/i.test(line)) return 'Recommendation';
  if (/\b(?:requires?|depends? on|dependency|missing dependency)\b/i.test(line)) return 'Dependency';
  if (/\b(?:incompatible|not compatible|wrong version|version mismatch)\b/i.test(line)) return 'Compatibility';
  if (/\b(?:ERROR|FATAL|Exception|Crash|Failed to|failure)\b/i.test(line)) return 'Error';
  if (/\bWARN(?:ING)?\b/i.test(line)) return 'Warning';
  return null;
}

export function detectModIssue(line: string, knownModIds: ReadonlySet<string>): DetectedModIssue | null {
  const clean = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const issueSeverity = severity(clean);
  if (!issueSeverity) return null;
  const normalizedIds = new Map([...knownModIds].map((id) => [id.toLowerCase(), id]));
  const loggerCandidate = /\[([a-z0-9_.-]+)\/(?:ERROR|WARN(?:ING)?)\]/i.exec(clean)?.[1];
  const fabricDiagnosticCandidate = /\bMod\s+['"][^'"]+['"]\s+\(([a-z0-9_.-]+)\)/i.exec(clean)?.[1];
  const fabricEntrypointCandidate = /(?:provided by|entrypoint[^']*for mod)\s+['"]([a-z0-9_.-]+)['"]/i.exec(clean)?.[1];
  const candidates = [loggerCandidate, fabricDiagnosticCandidate, fabricEntrypointCandidate]
    .filter((value): value is string => Boolean(value));
  let modId = candidates.find((candidate) => normalizedIds.has(candidate.toLowerCase()));
  const validatedFabricDiagnostic = fabricDiagnosticCandidate
    && (['Dependency', 'Compatibility', 'Recommendation'] as ModIssueSeverity[]).includes(issueSeverity)
    ? fabricDiagnosticCandidate
    : undefined;
  if (!modId) modId = validatedFabricDiagnostic ?? fabricEntrypointCandidate;
  if (!modId) {
    modId = [...knownModIds].find((id) => {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:\\bat\\s+${escaped}[.$]|\\b${escaped}:\\S+|[/\\\\]${escaped}[^/\\\\]*\\.jar\\b)`, 'i').test(clean);
    });
  }
  if (!modId || /^(minecraft|fabricloader|fabric-loader|server)$/i.test(modId)) return null;
  const resource = /\b([a-z0-9_.-]+:[a-z0-9_./-]+)/i.exec(clean)?.[1]
    ?? /(?:mods[/\\])([^\s]+\.jar)/i.exec(clean)?.[1];
  const reason = issueSeverity === 'Recommendation'
    ? 'Optional integration is recommended'
    : issueSeverity === 'Dependency'
      ? 'A required or recommended dependency is not satisfied'
      : issueSeverity === 'Compatibility'
        ? 'The mod is incompatible with this runtime'
        : issueSeverity === 'Warning'
          ? 'The mod reported a runtime warning'
          : 'The mod reported a runtime error';
  return {
    modId: normalizedIds.get(modId.toLowerCase()) ?? modId,
    severity: issueSeverity,
    reason,
    exception: /(?:Exception|Error|Failed|failure)/i.test(clean) ? clean : undefined,
    affectedResource: resource,
    sourceLogLines: [clean],
  };
}

interface StoredIssues {
  issues: ModIssue[];
  currentRunId?: string;
}

export class ModIssueStore {
  private readonly queues = new Map<string, Promise<void>>();

  private file(serverDirectory: string): string {
    return path.join(serverDirectory, '.darkcraft', 'diagnostics', 'mod-issues.json');
  }

  private async load(serverDirectory: string): Promise<StoredIssues> {
    try {
      const parsed = JSON.parse(await readFile(this.file(serverDirectory), 'utf8')) as StoredIssues;
      return { issues: Array.isArray(parsed.issues) ? parsed.issues : [], currentRunId: parsed.currentRunId };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { issues: [] };
    }
  }

  private update(serverDirectory: string, change: (state: StoredIssues) => void): Promise<void> {
    const previous = this.queues.get(serverDirectory) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const state = await this.load(serverDirectory);
      change(state);
      const file = this.file(serverDirectory);
      await mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, file);
    });
    this.queues.set(serverDirectory, next);
    const cleanup = () => { if (this.queues.get(serverDirectory) === next) this.queues.delete(serverDirectory); };
    void next.then(cleanup, cleanup);
    return next;
  }

  beginRun(serverDirectory: string, runId: string): Promise<void> {
    return this.update(serverDirectory, (state) => { state.currentRunId = runId; });
  }

  record(serverDirectory: string, detected: DetectedModIssue, runId?: string, now = new Date()): Promise<void> {
    return this.update(serverDirectory, (state) => {
      const key = `${detected.modId.toLowerCase()}|${detected.severity}|${detected.reason}|${detected.affectedResource ?? ''}`;
      const existing = state.issues.find((issue) => issue.fingerprint === key);
      if (existing) {
        existing.lastDetectedAt = now.toISOString();
        existing.occurrenceCount += 1;
        existing.sourceLogLines = [...existing.sourceLogLines, ...detected.sourceLogLines].slice(-10);
        existing.exception = detected.exception ?? existing.exception;
        existing.status = 'active';
        existing.resolvedAt = undefined;
        existing.lastRunId = runId;
      } else {
        state.issues.push({
          id: randomUUID(), fingerprint: key, modId: detected.modId, modName: detected.modId,
          severity: detected.severity, reason: detected.reason, exception: detected.exception,
          affectedResource: detected.affectedResource, firstDetectedAt: now.toISOString(),
          lastDetectedAt: now.toISOString(), occurrenceCount: 1, sourceLogLines: detected.sourceLogLines,
          status: 'active', lastRunId: runId,
        });
      }
    });
  }

  markNotSeenAfterStartup(serverDirectory: string, loadedModIds: ReadonlySet<string>, runId: string): Promise<void> {
    return this.update(serverDirectory, (state) => {
      for (const issue of state.issues) {
        if (issue.status === 'active' && issue.lastRunId !== runId && loadedModIds.has(issue.modId.toLowerCase())) {
          issue.status = 'not-seen';
        }
      }
    });
  }

  async list(serverDirectory: string): Promise<ModIssue[]> {
    await (this.queues.get(serverDirectory) ?? Promise.resolve());
    return (await this.load(serverDirectory)).issues.sort((a, b) => b.lastDetectedAt.localeCompare(a.lastDetectedAt));
  }
}
