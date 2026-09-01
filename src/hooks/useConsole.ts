import { useState, useEffect, useCallback, useRef } from 'react';
import { consoleService } from '@/services';
import type { ConsoleEntry, ConsoleViewMode, ConsoleSeverity } from '@/types';
import { mergeConsoleEntries } from './consoleEntries';

export function useConsole(serverId: string) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ConsoleViewMode>('live');
  const [filter, setFilter] = useState<ConsoleSeverity | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const pausedRef = useRef(false);
  const pausedEntriesRef = useRef<ConsoleEntry[]>([]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pausedEntriesRef.current.length > 0) {
      setEntries((previous) => mergeConsoleEntries(previous, pausedEntriesRef.current));
      pausedEntriesRef.current = [];
    }
  }, [paused]);

  const load = useCallback(async (m: ConsoleViewMode) => {
    setLoading(true);
    try {
      const data = await consoleService.getConsoleHistory(serverId, m);
      setEntries((current) => mergeConsoleEntries(data, current));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    setEntries([]);
    pausedEntriesRef.current = [];
    if (mode === 'live') {
      unsubRef.current = consoleService.subscribeToLive(serverId, (entry) => {
        if (pausedRef.current) pausedEntriesRef.current = mergeConsoleEntries(pausedEntriesRef.current, [entry]);
        else setEntries((previous) => mergeConsoleEntries(previous, [entry]));
      });
    }
    void load(mode);
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [serverId, mode, load]);

  const sendCommand = useCallback(async (command: string) => {
    await consoleService.sendCommand(serverId, command);
  }, [serverId]);

  const clear = useCallback(async () => {
    await consoleService.clearConsole(serverId);
    setEntries([]);
  }, [serverId]);

  const filtered = entries.filter(e => {
    if (filter !== 'ALL' && e.severity !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return { entries: filtered, allEntries: entries, loading, mode, setMode, filter, setFilter, search, setSearch, paused, setPaused, sendCommand, clear };
}
