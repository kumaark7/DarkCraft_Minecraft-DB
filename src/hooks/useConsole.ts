import { useState, useEffect, useCallback, useRef } from 'react';
import { consoleService } from '@/services';
import type { ConsoleEntry, ConsoleViewMode, ConsoleSeverity } from '@/types';

export function useConsole(serverId: string) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ConsoleViewMode>('live');
  const [filter, setFilter] = useState<ConsoleSeverity | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const load = useCallback(async (m: ConsoleViewMode) => {
    setLoading(true);
    const data = await consoleService.getConsoleHistory(serverId, m);
    setEntries(data);
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    load(mode);
    if (mode === 'live') {
      unsubRef.current = consoleService.subscribeToLive(serverId, (entry) => {
        if (!paused) setEntries(prev => [...prev.slice(-499), entry]);
      });
    }
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [serverId, mode, load, paused]);

  const sendCommand = useCallback(async (command: string) => {
    await consoleService.sendCommand(serverId, command);
    const entry: ConsoleEntry = {
      id: `sent-${Date.now()}`,
      timestamp: new Date().toISOString(),
      severity: 'COMMAND',
      message: `[${new Date().toTimeString().slice(0, 8)} INFO]: Issued server command: /${command}`,
      source: 'LIVE',
    };
    setEntries(prev => [...prev, entry]);
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
