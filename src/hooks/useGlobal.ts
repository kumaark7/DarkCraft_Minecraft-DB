import { useState, useEffect, useCallback } from 'react';
import { globalService } from '@/services';
import type { AppNotification, HostStats, ActivityEvent, LogEntry, Bot, MetricHistoryRange } from '@/types';
import { pollHostHistory, pollHostStats, type HostSample } from '@/utils/hostHistory';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await globalService.getNotifications();
        if (!cancelled) setNotifications(data);
      } catch { /* Retain the feed during transient failures; shared 401 handling applies. */ }
      finally {
        if (!cancelled) { setLoading(false); timer = setTimeout(() => void load(), 10_000); }
      }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

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

export function useHostMonitor(range: MetricHistoryRange = '1h') {
  const [stats, setStats] = useState<HostStats | null>(null);
  const [snapshot, setSnapshot] = useState<{ range: MetricHistoryRange; samples: HostSample[]; error: boolean; loading: boolean }>({ range, samples: [], error: false, loading: true });

  useEffect(() => pollHostStats(() => globalService.getHostStats(), setStats), []);
  useEffect(() => {
    setSnapshot({ range, samples: [], error: false, loading: true });
    return pollHostHistory(() => globalService.getHostHistory(range), samples => {
      setSnapshot(previous => ({ range, samples: samples ?? previous.samples, error: samples === null, loading: false }));
    });
  }, [range]);

  return { stats, history: snapshot.range === range ? snapshot.samples : [], historyError: snapshot.range === range && snapshot.error, historyLoading: snapshot.range !== range || snapshot.loading };
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
