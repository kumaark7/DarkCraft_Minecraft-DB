import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DashboardState } from './types.js';
import { emptyState } from './types.js';

export class JsonStore {
  private state: DashboardState = emptyState();
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<DashboardState>;
      this.state = { ...emptyState(), ...parsed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  get(): DashboardState {
    return this.state;
  }

  async update(mutator: (state: DashboardState) => void): Promise<void> {
    mutator(this.state);
    await this.save();
  }

  async save(): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      const temp = `${this.filePath}.tmp`;
      await writeFile(temp, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temp, this.filePath);
    });
    await this.saveQueue;
  }
}
