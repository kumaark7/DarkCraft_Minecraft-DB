import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  UserX, Ban, Shield, ShieldOff, UserPlus, Minus, Plus,
  ToggleLeft, ToggleRight, Users, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/States';
import { usePlayers } from '@/hooks/usePlayers';
import { cn } from '@/utils';
import { toast } from 'sonner';
import type { Player } from '@/types';

type PlayerTab = 'online' | 'whitelist' | 'operators' | 'banned' | 'bannedips';

const TABS: { value: PlayerTab; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'whitelist', label: 'Whitelist' },
  { value: 'operators', label: 'Operators' },
  { value: 'banned', label: 'Banned' },
  { value: 'bannedips', label: 'Banned IPs' },
];

function PlayerAvatar({ username, size = 8 }: { username: string; size?: number }) {
  return (
    <div className={cn(`w-${size} h-${size} rounded overflow-hidden bg-muted shrink-0`)}>
      <img
        src={`https://crafatar.com/avatars/${username}?size=32&overlay`}
        alt={username}
        className="w-full h-full object-cover"
        onError={e => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.textContent = username.slice(0, 2).toUpperCase();
        }}
      />
    </div>
  );
}

function PlayerRow({ player, actions }: { player: Player; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
      <PlayerAvatar username={player.username} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{player.username}</p>
        {player.online && (
          <p className="text-[10px] text-muted-foreground">
            {player.ping !== undefined && `${player.ping}ms · `}
            {player.duration ? `Connected ${Math.floor(player.duration / 60)}m` : 'Online'}
          </p>
        )}
        {player.uuid && !player.online && (
          <p className="text-[10px] text-muted-foreground font-mono truncate">{player.uuid}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}

export default function ServerPlayersTab() {
  const { id } = useParams<{ id: string }>();
  const { online, whitelist, operators, banned, bannedIPs, loading,
    kick, ban, unban, op, deop, addWhitelist, removeWhitelist, unbanIP } = usePlayers(id!);

  const [tab, setTab] = useState<PlayerTab>('online');
  const [addOpOpen, setAddOpOpen] = useState(false);
  const [addWlOpen, setAddWlOpen] = useState(false);
  const [inputName, setInputName] = useState('');
  const [whitelistEnabled, setWhitelistEnabled] = useState(true);
  const [confirmKick, setConfirmKick] = useState<Player | null>(null);
  const [confirmBan, setConfirmBan] = useState<Player | null>(null);
  const [banReason, setBanReason] = useState('');

  const handleOp = async () => {
    if (!inputName.trim()) return;
    await op(inputName.trim());
    toast.success(`${inputName} added as operator`);
    setInputName(''); setAddOpOpen(false);
  };
  const handleAddWl = async () => {
    if (!inputName.trim()) return;
    await addWhitelist(inputName.trim());
    toast.success(`${inputName} added to whitelist`);
    setInputName(''); setAddWlOpen(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* Sub-tabs */}
      <div className="flex border-b border-border overflow-x-auto whitespace-nowrap">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === t.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.value === 'online' && ` (${online.length})`}
            {t.value === 'whitelist' && ` (${whitelist.length})`}
            {t.value === 'operators' && ` (${operators.length})`}
            {t.value === 'banned' && ` (${banned.length})`}
            {t.value === 'bannedips' && ` (${bannedIPs.length})`}
          </button>
        ))}
      </div>

      {/* Online */}
      {tab === 'online' && (
        <div className="bg-card border border-border rounded p-4">
          {online.length === 0 ? (
            <EmptyState icon={<Users className="w-8 h-8" />} title="No players online" />
          ) : (
            online.map(p => (
              <PlayerRow
                key={p.username}
                player={p}
                actions={
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setConfirmKick(p)}>
                      <UserX className="w-3 h-3" /> Kick
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-destructive" onClick={() => { setBanReason(''); setConfirmBan(p); }}>
                      <Ban className="w-3 h-3" /> Ban
                    </Button>
                    {!p.isOp ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => { op(p.username); toast.success(`${p.username} is now an operator`); }}>
                        <Shield className="w-3 h-3" /> OP
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => { deop(p.username); toast.success(`${p.username} de-opped`); }}>
                        <ShieldOff className="w-3 h-3" /> De-OP
                      </Button>
                    )}
                  </>
                }
              />
            ))
          )}
        </div>
      )}

      {/* Whitelist */}
      {tab === 'whitelist' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-card border border-border rounded px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Whitelist</p>
              <p className="text-xs text-muted-foreground">Only whitelisted players can join</p>
            </div>
            <button
              onClick={() => setWhitelistEnabled(!whitelistEnabled)}
              className="flex items-center gap-2 text-xs"
            >
              {whitelistEnabled ? (
                <><ToggleRight className="w-8 h-8 text-primary" /><span className="text-primary font-medium">ON</span></>
              ) : (
                <><ToggleLeft className="w-8 h-8 text-muted-foreground" /><span className="text-muted-foreground">OFF</span></>
              )}
            </button>
          </div>

          <div className="bg-card border border-border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members ({whitelist.length})</p>
              <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => { setInputName(''); setAddWlOpen(true); }}>
                <Plus className="w-3 h-3" /> Add Player
              </Button>
            </div>
            {whitelist.length === 0 ? (
              <EmptyState icon={<Users className="w-6 h-6" />} title="No whitelisted players" />
            ) : (
              whitelist.map(p => (
                <PlayerRow
                  key={p.username}
                  player={p}
                  actions={
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-destructive" onClick={() => { removeWhitelist(p.username); toast.success(`${p.username} removed from whitelist`); }}>
                      <Minus className="w-3 h-3" /> Remove
                    </Button>
                  }
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Operators */}
      {tab === 'operators' && (
        <div className="bg-card border border-border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operators ({operators.length})</p>
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => { setInputName(''); setAddOpOpen(true); }}>
              <Plus className="w-3 h-3" /> Add OP
            </Button>
          </div>
          {operators.length === 0 ? (
            <EmptyState icon={<Shield className="w-6 h-6" />} title="No operators" description="Add players as operators to grant them admin permissions" />
          ) : (
            operators.map(p => (
              <PlayerRow
                key={p.username}
                player={p}
                actions={
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-destructive" onClick={() => { deop(p.username); toast.success(`${p.username} de-opped`); }}>
                    <ShieldOff className="w-3 h-3" /> Remove OP
                  </Button>
                }
              />
            ))
          )}
        </div>
      )}

      {/* Banned players */}
      {tab === 'banned' && (
        <div className="bg-card border border-border rounded p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Banned Players ({banned.length})</p>
          {banned.length === 0 ? (
            <EmptyState icon={<Ban className="w-6 h-6" />} title="No banned players" />
          ) : (
            banned.map(p => (
              <PlayerRow
                key={p.username}
                player={p}
                actions={
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => { unban(p.username); toast.success(`${p.username} unbanned`); }}>
                    <UserPlus className="w-3 h-3" /> Unban
                  </Button>
                }
              />
            ))
          )}
        </div>
      )}

      {/* Banned IPs */}
      {tab === 'bannedips' && (
        <div className="bg-card border border-border rounded p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Banned IPs ({bannedIPs.length})</p>
          {bannedIPs.length === 0 ? (
            <EmptyState icon={<Globe className="w-6 h-6" />} title="No banned IPs" />
          ) : (
            bannedIPs.map(b => (
              <div key={b.ip} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-foreground">{b.ip}</p>
                  {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 shrink-0" onClick={() => { unbanIP(b.ip); toast.success(`${b.ip} unbanned`); }}>
                  <UserPlus className="w-3 h-3" /> Unban
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add OP dialog */}
      <Dialog open={addOpOpen} onOpenChange={setAddOpOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle>Add Operator</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Minecraft Username</label>
              <Input autoFocus value={inputName} onChange={e => setInputName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOp()} placeholder="e.g. KeerDubi" className="bg-input" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddOpOpen(false)}>Cancel</Button>
              <Button onClick={handleOp} disabled={!inputName.trim()}>Add OP</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Whitelist dialog */}
      <Dialog open={addWlOpen} onOpenChange={setAddWlOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle>Add to Whitelist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input autoFocus value={inputName} onChange={e => setInputName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddWl()} placeholder="Minecraft username" className="bg-input" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddWlOpen(false)}>Cancel</Button>
              <Button onClick={handleAddWl} disabled={!inputName.trim()}>Add Player</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kick confirm */}
      <ConfirmDialog
        open={!!confirmKick}
        onOpenChange={o => { if (!o) setConfirmKick(null); }}
        title={`Kick ${confirmKick?.username ?? ''}?`}
        description="The player will be disconnected from the server."
        confirmLabel="Kick Player"
        onConfirm={() => { if (confirmKick) { kick(confirmKick.username); toast.success(`${confirmKick.username} kicked`); setConfirmKick(null); } }}
      />

      {/* Ban confirm */}
      <ConfirmDialog
        open={!!confirmBan}
        onOpenChange={o => { if (!o) setConfirmBan(null); }}
        title={`Ban ${confirmBan?.username ?? ''}?`}
        description="The player will be permanently banned from the server."
        confirmLabel="Ban Player"
        destructive
        onConfirm={() => { if (confirmBan) { ban(confirmBan.username, banReason || undefined); toast.success(`${confirmBan.username} banned`); setConfirmBan(null); } }}
      >
        <div className="mt-3">
          <label className="text-xs text-muted-foreground block mb-1">Reason (optional)</label>
          <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Reason for ban" className="bg-input" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
