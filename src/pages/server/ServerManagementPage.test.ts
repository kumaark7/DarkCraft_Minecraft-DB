import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ServerManagementPage from './ServerManagementPage';

const fixture = vi.hoisted(() => ({ id: 'server-1', name: 'Dark_Craft', status: 'ONLINE' }));
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
  useParams: () => ({ id: fixture.id }),
}));
vi.mock('@/layouts/Layout', () => ({ Layout: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/hooks/useServers', () => ({
  useServer: () => ({ server: { ...fixture, software: 'Fabric', minecraftVersion: '26.2' }, loading: false, reload: vi.fn() }),
}));
vi.mock('@/components/server/ExportServerDialog', () => ({ ExportServerDialog: () => null }));
vi.mock('@/components/shared/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/server/ServerIcon', () => ({
  ServerIcon: ({ serverId, name, className }: { serverId: string; name: string; className?: string }) =>
    createElement('img', { 'data-server-icon': serverId, 'data-server-name': name, className, src: '/test-icon.png', alt: '' }),
}));

describe('Server management header identity', () => {
  it.each([
    { id: 'server-1', name: 'Dark_Craft', status: 'ONLINE', action: 'Stop' },
    { id: 'server-2', name: 'Other_Server', status: 'OFFLINE', action: 'Start' },
  ])('uses the shared file-based icon for $id while retaining the header and tabs', server => {
    Object.assign(fixture, server);
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: `/servers/${server.id}` }, createElement(ServerManagementPage)));
    expect(html).toContain(`data-server-icon="${server.id}"`);
    expect(html).toContain(`data-server-name="${server.name}"`);
    expect(html).toContain('class="text-sm"');
    expect(html).toContain(server.name);
    expect(html).toContain(server.action);
    for (const tab of ['Overview', 'Console', 'Players', 'Files', 'Plugins', 'Backups', 'Schedules', 'Settings']) {
      expect(html).toContain(tab);
    }
    expect(html).toContain(`href="/servers/${server.id}/console"`);
  });
});
