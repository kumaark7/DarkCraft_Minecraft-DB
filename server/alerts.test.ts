import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendAlert, ResourceAlerts } from './alerts.js';
import { setServerStatus } from './activity.js';
import { JsonStore } from './store.js';
import type { ManagedServer } from './types.js';

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))));
async function store() { const root = await mkdtemp(path.join(os.tmpdir(), 'darkcraft-alerts-')); temporary.push(root); const value = new JsonStore(path.join(root, 'dashboard.json')); await value.load(); return value; }
const server: ManagedServer = { id: 'one', name: 'One', status: 'ONLINE', software: 'Fabric', minecraftVersion: '26.2', javaVersion: 'Java 25', ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 20, cpu: null, ram: null, ramMax: 1000, disk: null, diskMax: null, uptime: 1, directory: '/tmp/one', startupCommand: 'java -jar fabric.jar', startupExecutable: 'java', startupArgs: [], createdAt: new Date().toISOString() };

describe('operational alerts', () => {
  it('notifies crashes atomically, honors preferences, and suppresses cooldown spam', async () => {
    const value = await store();
    await value.update(state => { state.servers.push({ ...server }); setServerStatus(state, 'one', 'CRASHED'); });
    expect(value.get().notifications).toEqual([expect.objectContaining({ type: 'server-crashed', serverId: 'one' })]);
    await value.update(state => { expect(appendAlert(state, { type: 'server-crashed', severity: 'error', title: 'Again', message: 'Again', serverId: 'one' })).toBe(false); });
    expect(value.get().notifications).toHaveLength(1);
    await value.update(state => {
      state.globalSettings = { ...state.globalSettings, notificationPrefs: { ...state.globalSettings.notificationPrefs, 'backup-failed': false } };
      expect(appendAlert(state, { type: 'backup-failed', severity: 'error', title: 'Backup', message: 'Failed', serverId: 'one' })).toBe(false);
    });
    expect(value.get().notifications).toHaveLength(1);
  });

  it('requires sustained real RAM/disk readings and cools repeated alerts down', async () => {
    const value = await store(); const alerts = new ResourceAlerts(value); const start = 1_000_000;
    const host = { uptime: 1, cpuModel: 'Test', cpuUsage: 10, ramTotal: 100, ramUsed: 95, diskTotal: 100, diskUsed: 95, networkIn: null, networkOut: null };
    await alerts.host(host, start);
    await alerts.host(host, start + 30_000);
    await alerts.host(host, start + 60_000);
    expect(value.get().notifications.map(item => item.type)).toEqual(['low-disk']);
    await alerts.host(host, start + 90_000);
    await alerts.host(host, start + 120_000);
    expect(value.get().notifications.map(item => item.type).sort()).toEqual(['high-ram', 'low-disk']);
    await alerts.host(host, start + 130_000);
    expect(value.get().notifications).toHaveLength(2);
    await alerts.host(null, start + 140_000);
    expect(value.get().notifications).toHaveLength(2);
  });

  it('tracks each running server independently and ignores unavailable/stopped metrics', async () => {
    const value = await store(); const alerts = new ResourceAlerts(value); const start = 2_000_000;
    await alerts.server('one', 'One', { serverId: 'one', cpu: null, ram: 950, ramMax: 1000, disk: null, diskMax: null, players: 0, maxPlayers: 20, uptime: 1, tps: null, mspt: null, networkIn: null, networkOut: null, timestamp: start }, true, start);
    await alerts.server('two', 'Two', null, true, start + 120_000);
    await alerts.server('one', 'One', null, false, start + 120_000);
    expect(value.get().notifications).toEqual([]);
    await alerts.server('one', 'One', { serverId: 'one', cpu: null, ram: 950, ramMax: 1000, disk: null, diskMax: null, players: 0, maxPlayers: 20, uptime: 1, tps: null, mspt: null, networkIn: null, networkOut: null, timestamp: start + 130_000 }, true, start + 130_000);
    for (const offset of [160_000, 190_000, 220_000, 250_000]) await alerts.server('one', 'One', { serverId: 'one', cpu: null, ram: 950, ramMax: 1000, disk: null, diskMax: null, players: 0, maxPlayers: 20, uptime: 1, tps: null, mspt: null, networkIn: null, networkOut: null, timestamp: start + offset }, true, start + offset);
    expect(value.get().notifications).toEqual([expect.objectContaining({ type: 'high-ram', serverId: 'one' })]);
  });
});
