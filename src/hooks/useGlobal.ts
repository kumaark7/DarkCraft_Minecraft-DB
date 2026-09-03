import { useState, useEffect, useCallback } from 'react';
import { globalService } from '@/services';
import type { AppNotification, HostStats, ActivityEvent, LogEntry, Bot } from '@/types';
import { appendHostSample, hostSample, pollHostStats, type HostSample } from '@/utils/hostHistory';

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

export function useHostMonitor() {
  const [stats, setStats] = useState<HostStats | null>(null);
  const [history, setHistory] = useState<HostSample[]>([]);

  useEffect(() => {
    return pollHostStats(() => globalService.getHostStats(), data => {
      setStats(data);
      const sample = hostSample(data, Date.now());
      setHistory(previous => appendHostSample(previous, sample));
    });
  }, []);

  return { stats, history };
}

export function useHostStats() {
  return useHostMonitor().stats;
}

export function useActivity() {
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await globalService.getActivity();
        if (!cancelled) setActivity(data);
      } catch {
        // Keep the last successful feed during a transient outage; API 401 handling remains shared.
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(() => void load(), 5000);
        }
      }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
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
