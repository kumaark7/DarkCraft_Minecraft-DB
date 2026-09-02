import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar, MobileSidebar } from './Sidebar';

const fixture = vi.hoisted(() => ({ collapsed: false }));
vi.mock('./LayoutContext', () => ({
  useLayout: () => ({ sidebarCollapsed: fixture.collapsed, setSidebarCollapsed: vi.fn(), mobileOpen: true, setMobileOpen: vi.fn() }),
}));
vi.mock('@/hooks/useGlobal', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => children,
  SheetContent: ({ children }: { children: ReactNode }) => children,
}));

describe('Sidebar logout placement', () => {
  it.each(['expanded', 'collapsed', 'mobile'])('keeps logout last with a subtle red treatment in %s navigation', mode => {
    fixture.collapsed = mode === 'collapsed';
    const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(mode === 'mobile' ? MobileSidebar : Sidebar)));
    const logout = html.match(/<button[^>]*aria-label="Log out"[^>]*>/g);
    expect(logout).toHaveLength(1);
    expect(html.indexOf('aria-label="Log out"')).toBeGreaterThan(html.indexOf('href="/settings"'));
    expect(html.indexOf('href="/settings"')).toBeGreaterThan(html.indexOf('href="/notifications"'));
    expect(logout![0]).toContain('type="button"');
    expect(logout![0]).toContain('bg-destructive/10');
    expect(logout![0]).toContain('hover:bg-destructive/20');
    expect(logout![0]).toContain('focus-visible:ring-destructive');
    if (mode === 'collapsed') {
      expect(logout![0]).toContain('title="Log out"');
      expect(logout![0]).toContain('justify-center px-0');
      expect(html).not.toContain('<span>Log out</span>');
    } else {
      expect(html).toContain('<span>Log out</span>');
      expect(html.indexOf('v1.7 Live')).toBeGreaterThan(html.indexOf('aria-label="Log out"'));
    }
  });
});
