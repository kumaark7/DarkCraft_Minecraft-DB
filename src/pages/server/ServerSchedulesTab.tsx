import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Play, ToggleLeft, ToggleRight, Calendar, RefreshCw, X, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/shared/States';
import { scheduleService } from '@/services';
import { cn } from '@/utils';
import { toast } from 'sonner';


import type { Schedule, ScheduleAction } from '@/types';

const ACTIONS: { value: ScheduleAction; label: string }[] = [
  { value: 'start-server', label: 'Start Server' },
  { value: 'stop-server', label: 'Stop Server' },
  { value: 'restart-server', label: 'Restart Server' },
  { value: 'create-backup', label: 'Create Backup' },
  { value: 'save-world', label: 'Save World' },
  { value: 'execute-command', label: 'Execute Console Command' },
  { value: 'send-announcement', label: 'Send Server Announcement' },
];

interface ScheduleFormState {
  id?: string;
  action: ScheduleAction;
  label: string;
  cronExpression: string;
  humanReadable: string;
  enabled: boolean;
  command?: string;
  message?: string;
}

const BLANK: ScheduleFormState = { action: 'restart-server', label: '', cronExpression: '0 4 * * *', humanReadable: '04:00 Daily', enabled: true };

export default function ServerSchedulesTab() {
  const { id } = useParams<{ id: string }>();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<ScheduleFormState>(BLANK);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await scheduleService.getSchedules(id!);
    setSchedules(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(BLANK); setEditorOpen(true); };
  const openEdit = (s: Schedule) => { setForm({ id: s.id, action: s.action, label: s.label, cronExpression: s.cronExpression, humanReadable: s.humanReadable, enabled: s.enabled, command: s.command, message: s.message }); setEditorOpen(true); };

  const handleSave = async () => {
    if (!form.label.trim() || !form.cronExpression.trim()) return;
    if (form.id) {
      await scheduleService.updateSchedule(id!, form.id, form as Partial<Schedule>);
      toast.success('Schedule updated');
    } else {
      const { id: _id, ...createData } = form;
      await scheduleService.createSchedule(id!, createData as Omit<Schedule, 'id' | 'serverId'>);
      toast.success('Schedule created');
    }
    setEditorOpen(false);
    load();
  };

  const handleToggle = async (s: Schedule) => {
    await scheduleService.updateSchedule(id!, s.id, { enabled: !s.enabled });
    toast.success(`Schedule ${s.enabled ? 'disabled' : 'enabled'}`);
    load();
  };

  const handleRunNow = async (s: Schedule) => {
    toast.success(`Running "${s.label}" now…`);
  };

  const handleDelete = async (s: Schedule) => {
    await scheduleService.deleteSchedule(id!, s.id);
    toast.success('Schedule deleted');
    setDeleteTarget(null);
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Schedules</h2>
          <p className="text-xs text-muted-foreground">{schedules.length} scheduled task{schedules.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 w-8 px-0" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openNew}>
            <Plus className="w-3.5 h-3.5" /> Add Schedule
          </Button>
        </div>
      </div>

      {/* Schedule list */}
      <div className="space-y-2">
        {loading ? (
          <LoadingState message="Loading schedules…" />
        ) : schedules.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-8 h-8" />}
            title="No scheduled tasks"
            description="Create a schedule to automate server operations"
          />
        ) : (
          schedules.map(s => (
            <div key={s.id} className="bg-card border border-border rounded px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="shrink-0">
                {s.enabled ? (
                  <button onClick={() => handleToggle(s)}><ToggleRight className="w-7 h-7 text-primary" /></button>
                ) : (
                  <button onClick={() => handleToggle(s)}><ToggleLeft className="w-7 h-7 text-muted-foreground" /></button>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', s.enabled ? 'text-foreground' : 'text-muted-foreground line-through')}>
                  {s.label}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <span className="font-mono">{s.cronExpression}</span>
                  <span className="font-medium text-foreground">{ACTIONS.find(a => a.value === s.action)?.label ?? s.action}</span>
                  {s.action === 'execute-command' && s.command && <span className="font-mono">/{s.command}</span>}
                  {s.action === 'send-announcement' && s.message && <span className="italic text-foreground/70">"{s.message}"</span>}
                  {s.nextRun && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Next: {new Date(s.nextRun).toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => handleRunNow(s)}>
                  <Play className="w-3 h-3" /><span className="sr-only md:not-sr-only">Run Now</span>
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={() => openEdit(s)}>
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 px-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">Label</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Daily Restart" className="bg-input" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Action</Label>
              <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v as ScheduleAction }))}>
                <SelectTrigger className="bg-input h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(form.action === 'execute-command' || form.action === 'send-announcement') && (
              <div>
                <Label className="text-xs mb-1.5 block">{form.action === 'execute-command' ? 'Command' : 'Message'}</Label>
                <Input
                  value={form.action === 'execute-command' ? (form.command ?? '') : (form.message ?? '')}
                  onChange={e => setForm(f => form.action === 'execute-command' ? { ...f, command: e.target.value } : { ...f, message: e.target.value })}
                  placeholder={form.action === 'execute-command' ? 'say Server restarting soon!' : 'Server maintenance in 5 minutes'}
                  className="bg-input font-mono"
                />
              </div>
            )}
            <div>
              <Label className="text-xs mb-1.5 block">Cron Expression</Label>
              <Input value={form.cronExpression} onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))} placeholder="0 4 * * *" className="bg-input font-mono" />
              <div className="flex gap-2 mt-2 flex-wrap">
                {[
                  { label: 'Daily 3am', cron: '0 3 * * *' },
                  { label: 'Daily 4am', cron: '0 4 * * *' },
                  { label: 'Every 6h', cron: '0 */6 * * *' },
                  { label: 'Weekly Sun 2am', cron: '0 2 * * 0' },
                ].map(p => (
                  <button
                    key={p.cron}
                    onClick={() => setForm(f => ({ ...f, cronExpression: p.cron }))}
                    className={cn(
                      'px-2 py-0.5 rounded text-xs border transition-colors',
                      form.cronExpression === p.cron ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditorOpen(false)}><X className="w-3.5 h-3.5 mr-1.5" />Cancel</Button>
              <Button onClick={handleSave} disabled={!form.label.trim() || !form.cronExpression.trim()}>
                <Check className="w-3.5 h-3.5 mr-1.5" />Save Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null); }}
        title={`Delete "${deleteTarget?.label ?? ''}"?`}
        description="This scheduled task will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}
