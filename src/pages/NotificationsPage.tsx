import { Layout } from '@/layouts/Layout';
import { useNotifications } from '@/hooks/useGlobal';
import { formatTimeAgo, cn } from '@/utils';
import { Button } from '@/components/ui/button';
import {
  Bell, BellOff, CheckCheck, Server, Cpu, MemoryStick, HardDrive,
  Archive, Calendar, AlertTriangle, Info, CheckCircle2
} from 'lucide-react';
import { EmptyState } from '@/components/shared/States';
import type { AppNotification } from '@/types';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'server-crashed': <AlertTriangle className="w-4 h-4 text-red-400" />,
  'server-stop': <Server className="w-4 h-4 text-red-400" />,
  'server-start': <CheckCircle2 className="w-4 h-4 text-primary" />,
  'server-restart': <CheckCircle2 className="w-4 h-4 text-primary" />,
  'high-cpu': <Cpu className="w-4 h-4 text-yellow-400" />,
  'high-ram': <MemoryStick className="w-4 h-4 text-yellow-400" />,
  'low-disk': <HardDrive className="w-4 h-4 text-red-400" />,
  'backup-complete': <Archive className="w-4 h-4 text-primary" />,
  'backup-failed': <Archive className="w-4 h-4 text-red-400" />,
  'schedule-failed': <Calendar className="w-4 h-4 text-red-400" />,
};

const SEV_BORDER: Record<string, string> = {
  error: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-accent',
  success: 'border-l-primary',
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs h-8" onClick={markAllRead}>
              <CheckCheck className="w-3.5 h-3.5" /> Mark All Read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="space-y-2">
          {notifications.length === 0 ? (
            <EmptyState icon={<BellOff className="w-8 h-8" />} title="No notifications" description="You're all caught up" />
          ) : (
            notifications.map((n: AppNotification) => (
              <div
                key={n.id}
                className={cn(
                  'bg-card border border-border rounded border-l-4 px-4 py-3 flex items-start gap-3 transition-opacity cursor-pointer hover:bg-muted/20',
                  SEV_BORDER[n.severity] ?? 'border-l-border',
                  n.read && 'opacity-60'
                )}
                onClick={() => !n.read && markRead(n.id)}
              >
                <span className="mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? <Bell className="w-4 h-4 text-muted-foreground" />}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn('text-sm font-medium', n.read ? 'text-muted-foreground' : 'text-foreground')}>{n.title}</p>
                    {!n.read && <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatTimeAgo(n.timestamp)}</span>
              </div>
            ))
          )}
        </div>

        {/* Notification preferences */}
        <div className="bg-card border border-border rounded p-4 space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notification Preferences</h2>
          <p className="text-xs text-muted-foreground">External notification services (Telegram, Discord, etc.) will be connected via your backend.</p>
          {[
            'Server Crashed', 'Server Started', 'Server Restarted',
            'High CPU Usage', 'High RAM Usage', 'Low Disk Space',
            'Backup Completed', 'Backup Failed', 'Scheduled Task Failed'
          ].map(cat => (
            <div key={cat} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
              <span className="text-sm text-foreground">{cat}</span>
              <button className="w-8 h-4 bg-primary rounded-full relative" aria-label="toggle">
                <span className="absolute top-0 left-0 w-4 h-4 bg-white rounded-full translate-x-4 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
