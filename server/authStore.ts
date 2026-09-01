import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface AuthCredentials {
  version: 1;
  username: 'admin';
  passwordHash: string;
  totpSecret: string;
  lastTotpCounter: number;
  createdAt: number;
}

export interface StoredSession {
  tokenHash: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
}

export interface PendingSetup {
  tokenHash: string;
  totpSecret: string;
  expiresAt: number;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file);
}

export class AuthStore {
  private credentials: AuthCredentials | null = null;
  private sessions: StoredSession[] = [];
  private pendingSetup: PendingSetup | null = null;
  private saveQueue = Promise.resolve();

  constructor(private readonly directory: string) {}

  private file(name: string): string {
    return path.join(this.directory, name);
  }

  async load(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    this.credentials = await readJson<AuthCredentials>(this.file('credentials.json'));
    this.sessions = (await readJson<StoredSession[]>(this.file('sessions.json'))) ?? [];
    this.pendingSetup = await readJson<PendingSetup>(this.file('setup.json'));
  }

  isConfigured(): boolean {
    return this.credentials !== null;
  }

  getCredentials(): AuthCredentials | null {
    return this.credentials ? { ...this.credentials } : null;
  }

  getPendingSetup(): PendingSetup | null {
    return this.pendingSetup ? { ...this.pendingSetup } : null;
  }

  getSessions(): StoredSession[] {
    return this.sessions.map((session) => ({ ...session }));
  }

  private async queued(operation: () => Promise<void>): Promise<void> {
    this.saveQueue = this.saveQueue.then(operation);
    await this.saveQueue;
  }

  async saveCredentials(credentials: AuthCredentials): Promise<void> {
    this.credentials = credentials;
    await this.queued(() => writeJson(this.file('credentials.json'), credentials));
  }

  async saveSessions(sessions: StoredSession[]): Promise<void> {
    this.sessions = sessions;
    await this.queued(() => writeJson(this.file('sessions.json'), sessions));
  }

  async savePendingSetup(setup: PendingSetup): Promise<void> {
    this.pendingSetup = setup;
    await this.queued(() => writeJson(this.file('setup.json'), setup));
  }

  async clearPendingSetup(): Promise<void> {
    this.pendingSetup = null;
    await this.queued(() => rm(this.file('setup.json'), { force: true }));
  }
}
