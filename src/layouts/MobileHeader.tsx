import { Link, useLocation } from 'react-router-dom';
import { Menu, Bell, Sword } from 'lucide-react';
import { useLayout } from './LayoutContext';
import { useNotifications } from '@/hooks/useGlobal';
import { cn } from '@/utils';

export function MobileHeader() {
  const { setMobileOpen } = useLayout();
  const { unreadCount } = useNotifications();
  const location = useLocation();

  const title = (() => {
    const p = location.pathname;
    if (p === '/') return 'Dashboard';
    if (p.startsWith('/servers') && p.includes('/') && p.split('/').length > 2) return 'Server';
    if (p === '/servers') return 'Servers';
    if (p === '/bots') return 'Bots';
    if (p === '/activity') return 'Activity';
    if (p === '/logs') return 'Logs';
    if (p === '/notifications') return 'Notifications';
    if (p === '/settings') return 'Settings';
    return 'NETHERCRAFT';
  })();

  return (
    <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-border shrink-0">
      <button
        onClick={() => setMobileOpen(true)}
        className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-6 h-6 bg-primary rounded flex items-center justify-center shrink-0">
          <Sword className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm truncate">{title}</span>
      </div>
      <Link
        to="/notifications"
        className={cn('relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground')}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center bg-primary text-primary-foreground text-[9px] font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>
    </header>
  );
}
