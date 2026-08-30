import { cn } from '@/utils';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: 'green' | 'yellow' | 'red' | 'blue';
  className?: string;
}

export function StatCard({ label, value, sub, icon, highlight, className }: Props) {
  const colorMap: Record<string, string> = {
    green: 'text-primary',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    blue: 'text-accent',
  };
  const valueColor = highlight ? (colorMap[highlight] ?? 'text-foreground') : 'text-foreground';

  return (
    <div className={cn('bg-card border border-border rounded p-3 flex items-start gap-3', className)}>
      {icon && (
        <div className="w-8 h-8 flex items-center justify-center rounded bg-muted text-muted-foreground shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn('text-xl font-bold leading-tight mt-0.5', valueColor)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
