import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, Bot, Activity, ScrollText,
  Bell, Settings, ChevronLeft, ChevronRight, X, LogOut
} from 'lucide-react';
import { cn } from '@/utils';
import { useLayout } from './LayoutContext';
import { useNotifications } from '@/hooks/useGlobal';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { label: 'Servers', href: '/servers', icon: Server },
      { label: 'Bots', href: '/bots', icon: Bot },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      { label: 'Activity', href: '/activity', icon: Activity },
      { label: 'Logs', href: '/logs', icon: ScrollText },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

function SidebarContent({ collapsed, onItemClick }: { collapsed: boolean; onItemClick?: () => void }) {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const { logout } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn('flex items-center gap-2 px-4 py-4 border-b border-border', collapsed && 'justify-center px-2')}>
        <img src="/nethercraft-icon.png" alt={collapsed ? 'NETHERCRAFT' : ''} width={28} height={28} className="w-7 h-7 rounded shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="text-sm font-bold tracking-widest text-foreground">NETHERCRAFT</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Control Panel</p>
          </div>
        )}
      </div>

      <div className="px-2 pb-2">
        <button type="button" onClick={() => { void logout(); onItemClick?.(); }} className={cn('w-full flex items-center gap-2.5 px-2 py-2 rounded text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', collapsed && 'justify-center px-0')} aria-label="Log out">
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {section.label && !collapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase px-2 mb-1">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const isNotif = item.href === '/notifications';
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={onItemClick}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-2 rounded text-sm transition-colors relative group',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      collapsed && 'justify-center px-0'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {isNotif && unreadCount > 0 && (
                      <span className={cn(
                        'flex items-center justify-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground',
                        collapsed ? 'absolute -top-1 -right-1 w-4 h-4' : 'w-5 h-5 shrink-0'
                      )}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-popover border border-border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Version footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground">v1.0.0 — Demo Mode</p>
        </div>
      )}
    </nav>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useLayout();

  return (
    <aside className={cn(
      'hidden md:flex flex-col shrink-0 bg-sidebar border-r border-sidebar-border relative transition-all duration-200',
      sidebarCollapsed ? 'w-14' : 'w-56'
    )}>
      <SidebarContent collapsed={sidebarCollapsed} />
      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3 top-16 w-6 h-6 flex items-center justify-center bg-sidebar border border-sidebar-border rounded-full text-muted-foreground hover:text-foreground transition-colors z-10"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
}

export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useLayout();

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-56 p-0 bg-sidebar border-sidebar-border">
        <SidebarContent collapsed={false} onItemClick={() => setMobileOpen(false)} />
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </SheetContent>
    </Sheet>
  );
}
