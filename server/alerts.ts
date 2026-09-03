import { randomUUID } from 'node:crypto';
import type { AppNotification, HostStats, ServerStats } from '../src/types/index.js';
import type { DashboardState } from './types.js';
import type { JsonStore } from './store.js';

export const ALERT_COOLDOWN_MS = 30 * 60_000;
type Alert = Omit<AppNotification, 'id' | 'timestamp' | 'read'>;
const key = (alert: Alert) => `${alert.type}:${alert.serverId ?? 'host'}`;
function eligible(state: DashboardState, alert: Alert, now: number): boolean {
  const last = state.alertCooldowns?.[key(alert)];
  return state.globalSettings.notificationPrefs?.[alert.type] !== false &&
    (last === undefined || now - last >= ALERT_COOLDOWN_MS);
}

/** Call inside the existing atomic state mutation for process transitions. */
export function appendAlert(state: DashboardState, alert: Alert, now = Date.now()): boolean {
  if (!eligible(state, alert, now)) return false;
  state.alertCooldowns = Object.fromEntries(Object.entries(state.alertCooldowns ?? {}).filter(([, timestamp]) => now - timestamp < ALERT_COOLDOWN_MS));
  state.alertCooldowns[key(alert)] = now;
  state.notifications.unshift({ ...alert, id: randomUUID(), timestamp: new Date(now).toISOString(), read: false });
  state.notifications = state.notifications.slice(0, 500);
  return true;
}

export async function notify(store: JsonStore, alert: Alert, now = Date.now()): Promise<void> {
  if (!eligible(store.get(), alert, now)) return;
  await store.update(state => { appendAlert(state, alert, now); });
}

const ratio = (used: number | null | undefined, total: number | null | undefined): number | null =>
  typeof used === 'number' && typeof total === 'number' && Number.isFinite(used) && Number.isFinite(total) && total > 0 && used >= 0 ? used / total : null;

export class ResourceAlerts {
  private readonly conditions = new Map<string, { since: number; seen: number }>();
  constructor(private readonly store: JsonStore) {}

  private async sustained(alert: Alert, active: boolean, duration: number, now: number): Promise<void> {
    const id = key(alert);
    if (!active) { this.conditions.delete(id); return; }
    const previous = this.conditions.get(id);
    const condition = previous && now - previous.seen <= 30_000 ? previous : { since: now, seen: now };
    condition.seen = now;
    this.conditions.set(id, condition);
    if (now - condition.since >= duration) await notify(this.store, alert, now);
  }

  async host(stats: HostStats | null, now: number): Promise<void> {
    const ram = ratio(stats?.ramUsed, stats?.ramTotal);
    const disk = ratio(stats?.diskUsed, stats?.diskTotal);
    await this.sustained({ type: 'high-ram', severity: 'warning', title: 'Host RAM usage is high',
      message: `Host RAM has remained at or above 90% for 2 minutes (${ram === null ? 'N/A' : (ram * 100).toFixed(1) + '%'}).` }, ram !== null && ram >= 0.9, 120_000, now);
    await this.sustained({ type: 'low-disk', severity: 'error', title: 'Host disk space is low',
      message: `The Minecraft storage volume has 10% or less available space for 1 minute (${stats && disk !== null ? (stats.diskTotal - stats.diskUsed).toFixed(2) + ' GiB available' : 'N/A'}).` }, disk !== null && disk >= 0.9, 60_000, now);
  }

  async server(id: string, name: string, stats: ServerStats | null, running: boolean, now: number): Promise<void> {
    const ram = running ? ratio(stats?.ram, stats?.ramMax) : null;
    await this.sustained({ type: 'high-ram', severity: 'warning', serverId: id, serverName: name,
      title: `${name}: RAM usage is high`, message: `Process memory has remained at or above 90% of configured RAM for 2 minutes (${ram === null ? 'N/A' : (ram * 100).toFixed(1) + '%'}).` }, ram !== null && ram >= 0.9, 120_000, now);
    // Remove tracking for deleted servers; no unbounded in-memory key accumulation.
    for (const conditionKey of this.conditions.keys()) {
      const condition = this.conditions.get(conditionKey)!;
      if (now - condition.seen > ALERT_COOLDOWN_MS) this.conditions.delete(conditionKey);
    }
  }
}
