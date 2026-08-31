import { useState, useEffect, useCallback } from 'react';
import { serverService } from '@/services';
import type { Server, ServerStats } from '@/types';

export function useServers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const data = await serverService.getServers();
      setServers(data);
    } catch {
      setError('Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const tid = setInterval(() => { void load(false); }, 2000);
    return () => clearInterval(tid);
  }, [load]);

  const startServer = useCallback(async (id: string) => {
    await serverService.startServer(id);
    setTimeout(load, 500);
    setTimeout(load, 3500);
  }, [load]);

  const stopServer = useCallback(async (id: string) => {
    await serverService.stopServer(id);
    setTimeout(load, 500);
    setTimeout(load, 3000);
  }, [load]);

  const restartServer = useCallback(async (id: string) => {
    await serverService.restartServer(id);
    setTimeout(load, 500);
    setTimeout(load, 7500);
  }, [load]);

  const killServer = useCallback(async (id: string) => {
    await serverService.killServer(id);
    await load();
  }, [load]);

  const deleteServer = useCallback(async (id: string, confirmName: string) => {
    await serverService.deleteServer(id, confirmName);
    await load();
  }, [load]);

  return { servers, loading, error, reload: load, startServer, stopServer, restartServer, killServer, deleteServer };
}

export function useServer(id: string) {
  const [server, setServer] = useState<Server | null>(null);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [srv, st] = await Promise.all([
      serverService.getServer(id),
      serverService.getServerStats(id),
    ]);
    setServer(srv);
    setStats(st);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const tid = setInterval(load, 2000);
    return () => clearInterval(tid);
  }, [load]);

  return { server, stats, loading, reload: load };
}

export function useServerSettings(id: string) {
  const [settings, setSettings] = useState<import('@/types').ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    serverService.getServerSettings(id).then(s => { setSettings(s); setLoading(false); });
  }, [id]);

  const save = useCallback(async (data: Partial<import('@/types').ServerSettings>) => {
    setSaving(true);
    await serverService.updateServerSettings(id, data);
    setSettings(prev => prev ? { ...prev, ...data } : null);
    setSaving(false);
  }, [id]);

  return { settings, loading, saving, save };
}
