'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Loader2, Plus, Trash2, Send, CheckSquare, MessageSquare, History, ListChecks } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { toast } from '@/lib/admin-toast';

type ChecklistItem = { id: string; text: string; done: boolean };
type Comment = { id: string; text: string; createdAt: string; author: { id: string; name: string | null; email: string; image: string | null } };
type Activity = { id: string; action: string; detail: string | null; createdAt: string; actor: { name: string | null } };
type TaskDetail = {
  id: string; title: string; description: string | null; status: string; priority: string;
  department: string | null; dueAt: string | null;
  assignedTo: { id: string; name: string | null; email: string; image: string | null } | null;
  createdBy: { name: string | null } | null;
  checklist: ChecklistItem[]; comments: Comment[]; activities: Activity[];
};

const STATUS_LABEL: Record<string, string> = { todo: 'Yapılacak', in_progress: 'Devam Ediyor', done: 'Bitti' };
const STATUS_STYLE: Record<string, string> = {
  todo: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
};
const PRIORITY_LABEL: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function TaskDetailSheet({ taskId, open, onOpenChange, onChanged }: {
  taskId: string | null; open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/team/tasks/${taskId}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setTask(json.task);
    } catch { toast.error('Görev yüklenemedi'); }
    finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { if (open && taskId) load(); }, [open, taskId, load]);

  const act = async (body: Record<string, unknown>) => {
    if (!taskId) return;
    await fetch(`/api/admin/team/tasks/${taskId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => {});
    load();
    onChanged?.();
  };

  const doneCount = task?.checklist.filter((c) => c.done).length ?? 0;
  const totalCount = task?.checklist.length ?? 0;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !task ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_STYLE[task.status])}>
                  {STATUS_LABEL[task.status]}
                </span>
                <Badge variant="outline">{PRIORITY_LABEL[task.priority]}</Badge>
                {task.department && <Badge variant="secondary">{task.department}</Badge>}
              </div>
              <SheetTitle className="text-xl leading-snug">{task.title}</SheetTitle>
              {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {task.assignedTo ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      {task.assignedTo.image ? <AvatarImage src={task.assignedTo.image} /> : null}
                      <AvatarFallback className="text-[9px]">{getInitials(task.assignedTo.name || task.assignedTo.email)}</AvatarFallback>
                    </Avatar>
                    {task.assignedTo.name || task.assignedTo.email}
                  </span>
                ) : <span>Atanmadı</span>}
                {task.createdBy?.name && <span>· Oluşturan: {task.createdBy.name}</span>}
              </div>
            </SheetHeader>

            {/* Checklist */}
            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4" /> Alt Görevler</h4>
                {totalCount > 0 && <span className="text-xs text-muted-foreground">{doneCount}/{totalCount}</span>}
              </div>
              {totalCount > 0 && <Progress value={pct} className="h-1.5" />}
              <div className="space-y-1">
                {task.checklist.map((item) => (
                  <div key={item.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox checked={item.done} onCheckedChange={(v) => act({ op: 'toggle_checklist', itemId: item.id, done: !!v })} />
                    <span className={cn('flex-1 text-sm', item.done && 'text-muted-foreground line-through')}>{item.text}</span>
                    <button onClick={() => act({ op: 'delete_checklist', itemId: item.id })} className="opacity-0 group-hover:opacity-100" aria-label="Sil">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Alt görev ekle…" value={newItem} onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { act({ op: 'add_checklist', text: newItem }); setNewItem(''); } }} className="h-9" />
                <Button size="sm" variant="outline" onClick={() => { if (newItem.trim()) { act({ op: 'add_checklist', text: newItem }); setNewItem(''); } }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            {/* Yorumlar */}
            <section className="mt-6 space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Yorumlar</h4>
              <div className="space-y-3">
                {task.comments.map((c) => (
                  <div key={c.id} className="group flex gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0">
                      {c.author.image ? <AvatarImage src={c.author.image} /> : null}
                      <AvatarFallback className="text-[10px]">{getInitials(c.author.name || c.author.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{c.author.name || c.author.email}</span>
                        <span className="text-[10px] text-muted-foreground">{fmt(c.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.text}</p>
                    </div>
                    <button onClick={() => act({ op: 'delete_comment', commentId: c.id })} className="opacity-0 group-hover:opacity-100" aria-label="Sil">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
                {task.comments.length === 0 && <p className="text-xs text-muted-foreground/60">Henüz yorum yok</p>}
              </div>
              <div className="flex gap-2">
                <Textarea placeholder="Yorum yaz…" value={newComment} onChange={(e) => setNewComment(e.target.value)} rows={2} className="resize-none" />
                <Button size="sm" onClick={() => { if (newComment.trim()) { act({ op: 'add_comment', text: newComment }); setNewComment(''); } }}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </section>

            {/* Aktivite */}
            <section className="mt-6 space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Aktivite</h4>
              <div className="space-y-1.5">
                {task.activities.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckSquare className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground/80">{a.actor.name || 'Biri'}</span>
                    <span>{a.detail || a.action}</span>
                    <span className="ml-auto shrink-0 opacity-60">{fmt(a.createdAt)}</span>
                  </div>
                ))}
                {task.activities.length === 0 && <p className="text-xs text-muted-foreground/60">Aktivite yok</p>}
              </div>
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
