import { randomUUID } from 'node:crypto';
import type { ActivityEvent, ServerStatus } from '../src/types/index.js';
import type { DashboardState } from './types.js';
import type { JsonStore } from './store.js';

// Append inside the same store mutation as the runtime change, so both persist together.
export function appendActivity(state: DashboardState, event: Omit<ActivityEvent, 'id' | 'timestamp'>): void {
  state.activity.unshift({ ...event, id: randomUUID(), timestamp: new Date().toISOString() });
  state.activity = state.activity.slice(0, 1000);
}

export async function recordActivity(store: JsonStore, event: Omit<ActivityEvent, 'id' | 'timestamp'>): Promise<void> {
  await store.update(state => appendActivity(state, event));
}

export function setServerStatus(state: DashboardState, serverId: string, status: ServerStatus, detail?: string): void {
  const server = state.servers.find(item => item.id === serverId);
  if (!server || server.status === status) return;
  server.status = status;
  const descriptions: Partial<Record<ServerStatus, string>> = {
    STARTING: 'Server starting', ONLINE: 'Server started — online',
    STOPPING: 'Server stopping', OFFLINE: 'Server stopped', CRASHED: 'Server crashed',
  };
  appendActivity(state, {
    serverId, serverName: server.name,
    category: status === 'CRASHED' ? 'error' : status === 'STARTING' || status === 'ONLINE' ? 'server-start' : 'server-stop',
    event: detail ?? descriptions[status] ?? `Server status: ${status}`,
  });
}

export function playerPresence(message: string): { username: string; online: boolean } | null {
  const line = message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  // Anchor the entire server message: chat/console commands quoting join text are not evidence.
  const match = /^(?:\[[^\]\r\n]+\]\s*)*(?::\s*)?([A-Za-z0-9_]{1,16}) (joined|left) the game\s*$/.exec(line);
  return match ? { username: match[1]!, online: match[2] === 'joined' } : null;
}
