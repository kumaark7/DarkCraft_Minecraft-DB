import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ServerCard } from './ServerCard';
import type { Server } from '@/types';

vi.mock('@/services', () => ({ serverService: { getServerIcon: vi.fn(async () => null) } }));

describe('server card navigation', () => {
  it('links the server name to Overview and retains fallback dimensions and existing actions', () => {
    const server: Server = {
      id: 'server-1', name: 'Test Server', status: 'ONLINE', software: 'Fabric', minecraftVersion: '26.2',
      javaVersion: 'Java 25', ip: '127.0.0.1', port: 25565, playerCount: 0, maxPlayers: 20,
      cpu: null, ram: null, ramMax: 1024, disk: null, diskMax: null, uptime: 0,
      directory: '/server', startupCommand: 'java', createdAt: '2026-09-03T00:00:00Z',
    };
    const props = { server, onStart: vi.fn(), onStop: vi.fn(), onRestart: vi.fn(), onKill: vi.fn(), onDelete: vi.fn(), onExport: vi.fn() };
    const full = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(ServerCard, props)));
    expect(full).toContain('aria-label="Open Test Server overview"');
    expect(full).toMatch(/<a[^>]*href="\/servers\/server-1"[^>]*>Test Server<\/a>/);
    expect(full).toContain('w-10 h-10');
    expect(full).toContain('Stop');
    expect(full).toContain('Restart');
    expect(full).toContain('/servers/server-1/console');
    const compact = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(ServerCard, { ...props, compact: true })));
    expect(compact).toContain('w-8 h-8');
    expect(compact).toContain('aria-label="Open Test Server overview"');
  });
});
