import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ConsoleEntry, ConsoleViewMode } from '../src/types/index.js';

interface PersistedEntry {
  kind: 'entry';
  entry: ConsoleEntry;
}

interface ClearMarker {
  kind: 'clear';
  timestamp: string;
}

type PersistedRecord = PersistedEntry | ClearMarker;

export interface ConsoleLogStoreOptions {
  maxBytes?: number;
  retentionFiles?: number;
  maxReadEntries?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_RETENTION_FILES = 5;
const DEFAULT_MAX_READ_ENTRIES = 5000;

function isConsoleEntry(value: unknown): value is ConsoleEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ConsoleEntry>;
  return typeof entry.id === 'string'
    && typeof entry.timestamp === 'string'
    && typeof entry.message === 'string'
    && typeof entry.severity === 'string';
}

function modeIncludes(timestamp: string, mode: ConsoleViewMode, now: Date): boolean {
  if (mode === 'live') return true;
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return mode === 'older';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  if (mode === 'today') return value.getTime() >= startToday;
  if (mode === 'yesterday') return value.getTime() >= startYesterday && value.getTime() < startToday;
  return value.getTime() < startYesterday;
}

export class ConsoleLogStore {
  private readonly maxBytes: number;
  private readonly retentionFiles: number;
  private readonly maxReadEntries: number;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: ConsoleLogStoreOptions = {}) {
    this.maxBytes = Math.max(1024, options.maxBytes ?? DEFAULT_MAX_BYTES);
    this.retentionFiles = Math.max(1, Math.floor(options.retentionFiles ?? DEFAULT_RETENTION_FILES));
    this.maxReadEntries = Math.max(1, Math.floor(options.maxReadEntries ?? DEFAULT_MAX_READ_ENTRIES));
  }

  private directory(serverDirectory: string): string {
    return path.join(serverDirectory, '.darkcraft', 'console');
  }

  private activeFile(serverDirectory: string): string {
    return path.join(this.directory(serverDirectory), 'console.ndjson');
  }

  private enqueue(serverDirectory: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(serverDirectory) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    this.queues.set(serverDirectory, next);
    const cleanup = () => {
      if (this.queues.get(serverDirectory) === next) this.queues.delete(serverDirectory);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  private async rotateIfNeeded(serverDirectory: string, incomingBytes: number): Promise<void> {
    const active = this.activeFile(serverDirectory);
    const size = await stat(active).then((info) => info.size).catch(() => 0);
    if (size === 0 || size + incomingBytes <= this.maxBytes) return;
    const directory = this.directory(serverDirectory);
    await rm(path.join(directory, `console.${this.retentionFiles}.ndjson`), { force: true });
    for (let index = this.retentionFiles - 1; index >= 1; index -= 1) {
      await rename(
        path.join(directory, `console.${index}.ndjson`),
        path.join(directory, `console.${index + 1}.ndjson`),
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    await rename(active, path.join(directory, 'console.1.ndjson'));
  }

  private appendRecord(serverDirectory: string, record: PersistedRecord): Promise<void> {
    const line = `${JSON.stringify(record)}\n`;
    return this.enqueue(serverDirectory, async () => {
      await mkdir(this.directory(serverDirectory), { recursive: true });
      await this.rotateIfNeeded(serverDirectory, Buffer.byteLength(line));
      await appendFile(this.activeFile(serverDirectory), line, 'utf8');
    });
  }

  append(serverDirectory: string, entry: ConsoleEntry): Promise<void> {
    return this.appendRecord(serverDirectory, { kind: 'entry', entry });
  }

  markCleared(serverDirectory: string): Promise<void> {
    return this.appendRecord(serverDirectory, { kind: 'clear', timestamp: new Date().toISOString() });
  }

  async flush(serverDirectory?: string): Promise<void> {
    if (serverDirectory) await (this.queues.get(serverDirectory) ?? Promise.resolve());
    else await Promise.all([...this.queues.values()]);
  }

  private async managedRecords(serverDirectory: string): Promise<PersistedRecord[]> {
    await this.flush(serverDirectory);
    const directory = this.directory(serverDirectory);
    const files = [
      ...Array.from({ length: this.retentionFiles }, (_, offset) => path.join(directory, `console.${this.retentionFiles - offset}.ndjson`)),
      this.activeFile(serverDirectory),
    ];
    const records: PersistedRecord[] = [];
    for (const file of files) {
      const content = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      for (const line of content.split(/\r?\n/)) {
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as PersistedRecord | ConsoleEntry;
          if (isConsoleEntry(parsed)) records.push({ kind: 'entry', entry: parsed });
          else if (parsed.kind === 'entry' && isConsoleEntry(parsed.entry)) records.push(parsed);
          else if (parsed.kind === 'clear' && typeof parsed.timestamp === 'string') records.push(parsed);
        } catch {
          // A partial final line can remain after an abrupt host shutdown. Ignore it.
        }
      }
    }
    return records;
  }

  private async minecraftHistory(serverDirectory: string): Promise<ConsoleEntry[]> {
    const logFile = path.join(serverDirectory, 'logs', 'latest.log');
    const [content, info] = await Promise.all([
      readFile(logFile, 'utf8').catch(() => ''),
      stat(logFile).catch(() => null),
    ]);
    if (!content || !info) return [];
    const day = info.mtime.toISOString().slice(0, 10);
    return content.split(/\r?\n/).filter(Boolean).map((message, index) => {
      const clock = /^\[(\d{2}:\d{2}:\d{2})\]/.exec(message)?.[1];
      const timestamp = clock ? new Date(`${day}T${clock}`).toISOString() : info.mtime.toISOString();
      const id = `minecraft-${createHash('sha256').update(`${logFile}\0${index}\0${message}`).digest('hex').slice(0, 24)}`;
      return { id, timestamp, severity: 'INFO', message, source: 'HISTORY', stream: 'stdout' };
    });
  }

  async read(serverDirectory: string, mode: ConsoleViewMode = 'live', now = new Date()): Promise<ConsoleEntry[]> {
    const records = await this.managedRecords(serverDirectory);
    let entries: ConsoleEntry[] = [];
    for (const record of records) {
      if (record.kind === 'clear') entries = [];
      else entries.push({ ...record.entry, source: 'HISTORY' });
    }
    if (entries.length === 0 && records.length === 0) entries = await this.minecraftHistory(serverDirectory);
    return entries.filter((entry) => modeIncludes(entry.timestamp, mode, now)).slice(-this.maxReadEntries);
  }
}
