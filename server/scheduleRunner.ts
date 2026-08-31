import { Cron } from 'croner';
import type { Schedule } from '../src/types/index.js';
import type { JsonStore } from './store.js';

export class ScheduleRunner {
  private readonly jobs = new Map<string, { fingerprint: string; cron: Cron }>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: JsonStore,
    private readonly execute: (schedule: Schedule) => Promise<void>,
  ) {}

  start(): void {
    this.sync();
    this.timer = setInterval(() => this.sync(), 30_000);
  }

  private sync(): void {
    const schedules = Object.values(this.store.get().schedules).flat();
    const activeIds = new Set(schedules.map((schedule) => schedule.id));
    for (const [id, job] of this.jobs) {
      if (!activeIds.has(id)) { job.cron.stop(); this.jobs.delete(id); }
    }
    for (const schedule of schedules) {
      const fingerprint = `${schedule.cronExpression}:${schedule.enabled}`;
      if (this.jobs.get(schedule.id)?.fingerprint === fingerprint) continue;
      this.jobs.get(schedule.id)?.cron.stop();
      if (!schedule.enabled) { this.jobs.delete(schedule.id); continue; }
      try {
        const cron = new Cron(schedule.cronExpression, () => { void this.execute(schedule); });
        this.jobs.set(schedule.id, { fingerprint, cron });
      } catch {
        this.jobs.delete(schedule.id);
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    for (const job of this.jobs.values()) job.cron.stop();
    this.jobs.clear();
  }
}
