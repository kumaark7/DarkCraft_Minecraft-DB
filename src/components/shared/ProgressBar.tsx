import { cn } from '@/utils';

interface Props {
  value: number; // 0-100
  max?: number;
  colorClass?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, max = 100, colorClass, className, size = 'md' }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = colorClass ?? (pct > 85 ? 'bg-red-400' : pct > 65 ? 'bg-yellow-400' : 'bg-primary');

  return (
    <div className={cn('w-full rounded-full bg-muted overflow-hidden', size === 'sm' ? 'h-1' : 'h-1.5', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
