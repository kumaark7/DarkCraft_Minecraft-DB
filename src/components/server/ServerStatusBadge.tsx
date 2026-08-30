import { cn, statusBgColors, statusDotColors } from '@/utils';
import type { ServerStatus } from '@/types';

const STATUS_LABELS: Record<ServerStatus, string> = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  STARTING: 'Starting',
  STOPPING: 'Stopping',
  CRASHED: 'Crashed',
};

interface Props {
  status: ServerStatus;
  size?: 'sm' | 'md';
}

export function ServerStatusBadge({ status, size = 'md' }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded border font-medium uppercase tracking-wide',
      statusBgColors[status],
      size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
    )}>
      <span className={cn(
        'rounded-full shrink-0',
        statusDotColors[status],
        size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
        status === 'ONLINE' && 'pulse-online'
      )} />
      {STATUS_LABELS[status]}
    </span>
  );
}
