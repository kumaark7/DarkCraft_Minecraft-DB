import { useEffect, useState } from 'react';
import { serverService } from '@/services';
import { cn, serverIconFallback } from '@/utils';

export function ServerIcon({ serverId, name, compact, className }: { serverId: string; name: string; compact?: boolean; className?: string }) {
  const [icon, setIcon] = useState<{ serverId: string; url: string | null } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const url = await serverService.getServerIcon(serverId);
        if (!cancelled) setIcon({ serverId, url });
      } catch {
        if (!cancelled) setIcon({ serverId, url: null });
      } finally {
        if (!cancelled) timer = setTimeout(() => void load(), 30_000);
      }
    };
    setFailedUrl(null);
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [serverId]);
  const url = icon?.serverId === serverId ? icon.url : null;
  return (
    <div className={cn('flex items-center justify-center rounded bg-muted text-muted-foreground font-bold shrink-0 text-xs overflow-hidden',
      compact ? 'w-8 h-8' : 'w-10 h-10', className)}>
      {url && url !== failedUrl
        ? <img src={url} alt="" width={compact ? 32 : 40} height={compact ? 32 : 40}
            className="w-full h-full object-contain" onError={() => setFailedUrl(url)} />
        : serverIconFallback(name)}
    </div>
  );
}
