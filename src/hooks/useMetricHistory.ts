import { useCallback, useEffect, useState } from 'react';
import { serverService } from '@/services';
import type { MetricHistoryRange, ServerMetricSample } from '@/types';

export function useMetricHistory(serverId: string) {
  const [range, setRange] = useState<MetricHistoryRange>('1h');
  const [samples, setSamples] = useState<ServerMetricSample[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setSamples(await serverService.getServerMetricHistory(serverId, range)); }
    finally { setLoading(false); }
  }, [serverId, range]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return { range, setRange, samples, loading };
}
