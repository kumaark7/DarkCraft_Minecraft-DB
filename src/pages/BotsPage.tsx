import { useState } from 'react';
import { Layout } from '@/layouts/Layout';
import { useBots } from '@/hooks/useGlobal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/States';
import { formatTimeAgo, cn } from '@/utils';
import { Play, Square, Bot, Server, Activity, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BotsPage() {
  const { bots, loading, start: startBot, stop: stopBot } = useBots();

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Bots</h1>
            <p className="text-xs text-muted-foreground">{bots.filter(b => b.status === 'online').length} online · {bots.length} total</p>
          </div>
        </div>

        {/* Integration notice */}
        <div className="bg-muted/30 border border-border rounded px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
          <Bot className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <span>
            Bot backend integration is connected via the service adapter layer. Replace <code className="font-mono">MockBotAdapter</code> with your existing bot backend API to activate live functionality.
          </span>
        </div>

        {/* Bot cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border border-border rounded p-4 animate-pulse h-40" />
            ))}
          </div>
        ) : bots.length === 0 ? (
          <EmptyState icon={<Bot className="w-8 h-8" />} title="No bots configured" description="Connect your bot backend to manage bots here" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {bots.map(bot => (
              <div key={bot.id} className="bg-card border border-border rounded p-4 flex flex-col gap-3 h-full">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                    bot.status === 'online' ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Bot className={cn('w-5 h-5', bot.status === 'online' ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground truncate">{bot.name}</h3>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide',
                        bot.status === 'online' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        {bot.status}
                      </span>
                    </div>
                    {bot.associatedServerName && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Server className="w-3 h-3" /> {bot.associatedServerName}
                      </p>
                    )}
                  </div>
                </div>

                {/* Activity */}
                {bot.activity && bot.activity.length > 0 && (
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Recent Activity
                    </p>
                    {bot.activity.slice(0, 3).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-muted-foreground shrink-0 mt-0.5">·</span>
                        <span className="text-foreground/80 flex-1 truncate">{a}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-auto">
                  {bot.status === 'offline' ? (
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { startBot(bot.id); toast.success(`${bot.name} starting…`); }}>
                      <Play className="w-3 h-3" /> Start
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => { stopBot(bot.id); toast.success(`${bot.name} stopped`); }}>
                      <Square className="w-3 h-3" /> Stop
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={() => toast.info(`${bot.name} settings — coming soon`)}>
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
