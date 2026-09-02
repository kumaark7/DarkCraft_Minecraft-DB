import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ServersPage from './ServersPage';
import type { Server } from '@/types';

const fixture = vi.hoisted(() => ({ view: 'card', servers: [] as Server[] }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === 'card' ? fixture.view : initial) };
});
vi.mock('@/layouts/Layout', () => ({ Layout: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/hooks/useServers', () => ({
  useServers: () => ({ servers: fixture.servers, loading: false, startServer: vi.fn(), stopServer: vi.fn(),
    restartServer: vi.fn(), killServer: vi.fn(), deleteServer: vi.fn() }),
}));
vi.mock('@/components/server/ServerIcon', () => ({
  ServerIcon: ({ serverId, className }: { serverId: string; className?: string }) =>
    createElement('img', { 'data-server-icon': serverId, className, src: '/test-icon.png', alt: '' }),
}));

describe('Servers page identity in both layouts', () => {
  it.each(['card', 'list'])('links names to Overview and uses the shared file-based icon in %s view', view => {
    fixture.view = view;
    fixture.servers = [{
      id: 'server-1', name: 'Dark_Craft', status: 'ONLINE', software: 'Fabric', minecraftVersion: '26.2',
      javaVersion: 'Java 25', ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 15,
      cpu: null, ram: null, ramMax: 1024, disk: null, diskMax: null, uptime: 60,
      directory: '/server', startupCommand: 'java', createdAt: '2026-09-03T00:00:00Z',
    }];
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/servers' }, createElement(ServersPage)));
    expect(html).toMatch(/<a[^>]*href="\/servers\/server-1"[^>]*>Dark_Craft<\/a>/);
    expect(html).toContain('aria-label="Open Dark_Craft overview"');
    expect(html).toContain('data-server-icon="server-1"');
    expect(html).toContain('Stop');
    expect(html).toContain('Restart');
    expect(html).toContain('Console');
    expect(html).toContain('Manage');
    if (view === 'list') {
      expect(html).toContain('<table');
      expect(html).toContain('w-7 h-7 text-[10px]');
    } else expect(html).not.toContain('<table');
  });
});
