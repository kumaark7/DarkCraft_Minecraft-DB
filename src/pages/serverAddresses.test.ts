import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerCard } from '@/components/server/ServerCard';
import ServersPage from './ServersPage';
import ServerOverviewTab from './server/ServerOverviewTab';
import type { Server } from '@/types';

const fixture = vi.hoisted(() => ({ view: 'card', server: {
  id: 'server-1', name: 'Test Server', status: 'ONLINE', software: 'Fabric', minecraftVersion: '26.2',
  javaVersion: 'Java 25', ip: '0.0.0.0', port: 25565, playerCount: 0, maxPlayers: 20,
  cpu: null, ram: null, ramMax: 1024, disk: null, diskMax: null, uptime: 0,
  directory: '/server', startupCommand: 'java', createdAt: '2026-09-03T00:00:00Z',
} as Server }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === 'card' ? fixture.view : initial) };
});
vi.mock('@/layouts/Layout', () => ({ Layout: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/hooks/useServers', () => ({
  useServer: () => ({ server: fixture.server, stats: null }),
  useServers: () => ({ servers: [fixture.server], loading: false, startServer: vi.fn(), stopServer: vi.fn(),
    restartServer: vi.fn(), killServer: vi.fn(), deleteServer: vi.fn() }),
}));
vi.mock('@/hooks/useGlobal', () => ({ useActivity: () => ({ activity: [] }) }));
vi.mock('@/hooks/useMetricHistory', () => ({ useMetricHistory: () => ({ range: '1h', setRange: vi.fn(), samples: [], loading: false }) }));
vi.mock('@/components/server/PerformanceHistoryGraph', () => ({ PerformanceHistoryGraph: () => null }));
vi.mock('@/services', () => ({ serverService: { getServerIcon: vi.fn(async () => null) } }));
afterEach(() => vi.unstubAllEnvs());

describe('consistent server addresses across the UI', () => {
  it.each(['dashboard', 'compact dashboard', 'servers card', 'servers list', 'overview'])('formats existing address displays without changing the %s layout', view => {
    vi.stubEnv('VITE_MINECRAFT_PUBLIC_HOST', '203.0.113.42');
    fixture.view = view === 'servers list' ? 'list' : 'card';
    const element = view.includes('dashboard')
      ? createElement(ServerCard, { server: fixture.server, compact: view === 'compact dashboard',
          onStart: vi.fn(), onStop: vi.fn(), onRestart: vi.fn(), onKill: vi.fn(), onDelete: vi.fn(), onExport: vi.fn() })
      : view === 'overview' ? createElement(ServerOverviewTab) : createElement(ServersPage);
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/servers/server-1' }, element));
    // Compact cards intentionally omit the address row; preserve that layout.
    if (view === 'compact dashboard') expect(html).not.toContain('203.0.113.42:25565');
    else expect(html).toContain('203.0.113.42:25565');
    expect(html).not.toContain('0.0.0.0:25565');
  });
});
