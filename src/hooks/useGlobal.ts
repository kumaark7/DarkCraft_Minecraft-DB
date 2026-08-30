import { useState, useEffect, useCallback } from 'react';
import { globalService } from '@/services';
import type { AppNotification, HostStats, ActivityEvent, LogEntry, Bot } from '@/types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await globalService.getNotifications();
    setNotifications(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    await globalService.markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    await globalService.markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  return {
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    loading,
    markRead,
    markAllRead,
  };
}

export function useHostStats() {
  const [stats, setStats] = useState<HostStats | null>(null);

  useEffect(() => {
    globalService.getHostStats().then(setStats);
    const tid = setInterval(() => globalService.getHostStats().then(setStats), 5000);
    return () => clearInterval(tid);
  }, []);

  return stats;
}

export function useActivity() {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    globalService.getActivity().then(data => { setActivity(data); setLoading(false); });
  }, []);

  return { activity, loading };
}

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    globalService.getLogs().then(data => { setLogs(data); setLoading(false); });
  }, []);

  return { logs, loading };
}

export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await globalService.getBots();
    setBots(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const start = useCallback(async (id: string) => {
    await globalService.startBot(id);
    await load();
  }, [load]);

  const stop = useCallback(async (id: string) => {
    await globalService.stopBot(id);
    await load();
  }, [load]);

  return { bots, loading, start, stop };
}
