'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Send, CheckSquare, MessageSquare, History, ListChecks, Paperclip, FileText, Download, Timer, Link2, Repeat, X, Pencil, Sparkles, SmilePlus } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn, getInitials } from '@/lib/utils';
import { toast } from '@/lib/admin-toast';

export type TeamMember = { id: string; name: string | null; email: string; image: string | null };

/** Yorum metnindeki @isim geçişlerini vurgulu render eder. Üye adlarıyla eşleşenler primary rozet. */
function renderCommentText(text: string, members: TeamMember[]): React.ReactNode {
  // @ + [harf/rakam/nokta/alt-çizgi/boşluk yok] — isim tek kelime varsayımı yerine üye adlarını dene.
  const parts: React.ReactNode[] = [];
  const regex = /@([\p{L}0-9_.]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    const handle = m[1].toLowerCase();
    const matched = members.some((mem) => {
      const nm = (mem.name || mem.email.split('@')[0]).toLowerCase().replace(/\s+/g, '');
      return nm.startsWith(handle) || handle.startsWith(nm.slice(0, handle.length));
    });
    parts.push(
      <span key={key++} className={cn('rounded px-1 font-medium', matched ? 'bg-primary/15 text-primary' : 'text-primary/70')}>
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return parts;
}

type ChecklistItem = { id: string; text: string; done: boolean };
type Reaction = { emoji: string; userId: string };
type Comment = {
  id: string; text: string; createdAt: string; editedAt: string | null;
  parentId: string | null; attachmentPath: string | null; attachmentName: string | null;
  reactions: Reaction[];
  author: { id: string; name: string | null; email: string; image: string | null };
};
const REACTION_EMOJIS = ['👍', '❤️', '🎉', '🚀', '👀'];
type Activity = { id: string; action: string; detail: string | null; createdAt: string; actor: { name: string | null } };
type Attachment = { id: string; filename: string; path: string; mime: string; size: number; createdAt: string; uploadedBy: { name: string | null } };
type TaskDetail = {
  id: string; title: string; description: string | null; status: string; priority: string;
  department: string | null; dueAt: string | null;
  estimateMin: number | null; spentMin: number; recurrence: string | null; blockedById: string | null;
  assignedTo: { id: string; name: string | null; email: string; image: string | null } | null;
  blockedBy: { id: string; title: string; status: string } | null;
  createdBy: { name: string | null } | null;
  checklist: ChecklistItem[]; comments: Comment[]; activities: Activity[]; attachments: Attachment[];
};

function fmtDuration(min: number): string {
  if (min < 60) return `${min}dk`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}s ${m}dk` : `${h}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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

export function TaskDetailSheet({ taskId, open, onOpenChange, onChanged, members = [], allTasks = [], isManager = false }: {
  taskId: string | null; open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void;
  members?: TeamMember[];
  allTasks?: { id: string; title: string }[];
  isManager?: boolean;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');
  // Yorum düzenleme
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Yorum yanıtı (thread) + yoruma dosya
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [commentFile, setCommentFile] = useState<{ path: string; name: string } | null>(null);
  const [uploadingComment, setUploadingComment] = useState(false);
  const { data: sessionData } = useSession();
  const myId = (sessionData?.user as { id?: string } | undefined)?.id ?? '';
  // Zaman takibi girişi
  const [addMin, setAddMin] = useState('');

  // Dosya eki yükleme durumu
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    if (!taskId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/team/tasks/${taskId}/attachments`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Yüklenemedi');
      toast.success('Dosya eklendi');
      load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dosya yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!taskId) return;
    await fetch(`/api/admin/team/tasks/${taskId}/attachments?attachmentId=${attachmentId}`, { method: 'DELETE' }).catch(() => {});
    load();
    onChanged?.();
  };

  // @mention autocomplete durumu
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = kapalı
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => (m.name || m.email).toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members]);

  // Metinden @bahsedilen üye id'lerini çıkar (mail bildirimi için).
  const resolveMentions = useCallback((text: string): string[] => {
    const ids = new Set<string>();
    const regex = /@([\p{L}0-9_.]+)/gu;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const handle = m[1].toLowerCase();
      for (const mem of members) {
        const nm = (mem.name || mem.email.split('@')[0]).toLowerCase().replace(/\s+/g, '');
        if (nm.startsWith(handle) || handle.startsWith(nm)) { ids.add(mem.id); break; }
      }
    }
    return [...ids];
  }, [members]);

  // Textarea değişince @ tetikleyicisini yakala (imlecin solundaki son @kelime).
  const onCommentChange = (val: string) => {
    setNewComment(val);
    const caret = commentRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const match = /(?:^|\s)@([\p{L}0-9_.]*)$/u.exec(before);
    if (match) { setMentionQuery(match[1]); setMentionIndex(0); }
    else setMentionQuery(null);
  };

  // Seçilen üyeyi @isim olarak imlecin konumuna yerleştir.
  const insertMention = (mem: TeamMember) => {
    const el = commentRef.current;
    const handle = (mem.name || mem.email.split('@')[0]).replace(/\s+/g, '');
    const caret = el?.selectionStart ?? newComment.length;
    const before = newComment.slice(0, caret).replace(/@([\p{L}0-9_.]*)$/u, `@${handle} `);
    const after = newComment.slice(caret);
    const next = before + after;
    setNewComment(next);
    setMentionQuery(null);
    requestAnimationFrame(() => { el?.focus(); const pos = before.length; el?.setSelectionRange(pos, pos); });
  };

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

  // Yoruma emoji reaksiyonu ekle/kaldır (toggle).
  const toggleReaction = (commentId: string, emoji: string) => act({ op: 'toggle_reaction', commentId, emoji });

  // Yoruma iliştirilecek dosyayı R2'ye yükle (attachments endpoint'i kullanır, path döner).
  const uploadCommentFile = async (file: File) => {
    if (!taskId) return;
    setUploadingComment(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/team/tasks/${taskId}/attachments`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Yüklenemedi');
      // attachments endpoint eki DB'ye de yazdı; yorumda referans için path/ad kullan.
      setCommentFile({ path: json.attachment.path, name: json.attachment.filename });
      toast.success('Dosya hazır — yorumu gönder');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Yüklenemedi'); }
    finally { setUploadingComment(false); }
  };

  // Yorum gönder (yanıt + dosya + mention dahil).
  const submitComment = () => {
    if (!newComment.trim() && !commentFile) return;
    act({
      op: 'add_comment',
      text: newComment.trim() || (commentFile ? `📎 ${commentFile.name}` : ''),
      mentions: resolveMentions(newComment),
      parentId: replyTo?.id ?? null,
      attachmentPath: commentFile?.path ?? null,
      attachmentName: commentFile?.name ?? null,
    });
    setNewComment(''); setReplyTo(null); setCommentFile(null); setMentionQuery(null);
  };

  // Görev alanı güncelle (zaman takibi, bağımlılık) — tasks PUT.
  const patchTask = async (body: Record<string, unknown>) => {
    if (!taskId) return;
    const res = await fetch(`/api/admin/team/tasks?id=${taskId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    if (res && !res.ok) {
      const j = await res.json().catch(() => null);
      toast.error(j?.error || 'Güncellenemedi');
      return;
    }
    load();
    onChanged?.();
  };

  const logTime = () => {
    const m = Number(addMin);
    if (!m || m <= 0 || !task) { setAddMin(''); return; }
    patchTask({ spentMin: (task.spentMin || 0) + m });
    setAddMin('');
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) { setEditingId(null); return; }
    act({ op: 'edit_comment', commentId: editingId, text: editText.trim() });
    setEditingId(null); setEditText('');
  };

  // AI ile mevcut göreve alt görev önerisi üret + doğrudan ekle.
  const [aiBusy, setAiBusy] = useState(false);
  const suggestChecklistDetail = async () => {
    if (!task) return;
    setAiBusy(true);
    try {
      const res = await fetch('/api/admin/team/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'suggest_checklist', title: task.title, description: task.description ?? '' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      const items: string[] = json.items || [];
      if (items.length === 0) { toast('AI alt görev önermedi'); return; }
      await Promise.all(items.map((text) => act({ op: 'add_checklist', text })));
      toast.success(`${items.length} alt görev eklendi`);
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : 'AI önerisi alınamadı'); }
    finally { setAiBusy(false); }
  };

  const doneCount = task?.checklist.filter((c) => c.done).length ?? 0;
  const totalCount = task?.checklist.length ?? 0;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !task ? (
          <div className="space-y-5 py-4">
            <div className="flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="h-7 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
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

            {/* Zaman takibi + bağımlılık + tekrar */}
            <section className="mt-5 grid gap-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:grid-cols-2">
              {/* Zaman takibi */}
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Timer className="h-3.5 w-3.5" /> Zaman</p>
                <div className="flex items-baseline gap-1.5 text-sm">
                  <span className="font-semibold">{fmtDuration(task.spentMin || 0)}</span>
                  {task.estimateMin != null && <span className="text-xs text-muted-foreground">/ {fmtDuration(task.estimateMin)} tahmini</span>}
                </div>
                {task.estimateMin != null && task.estimateMin > 0 && (
                  <Progress value={Math.min(100, Math.round((task.spentMin / task.estimateMin) * 100))} className="h-1.5" />
                )}
                <div className="flex gap-1.5">
                  <Input type="number" min={0} placeholder="+dk" value={addMin} onChange={(e) => setAddMin(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') logTime(); }} className="h-8 w-20" />
                  <Button size="sm" variant="outline" onClick={logTime} className="h-8">Süre ekle</Button>
                </div>
              </div>

              {/* Bağımlılık */}
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Bağımlılık</p>
                {task.blockedBy ? (
                  <div className="flex items-center gap-1.5">
                    <span className={cn('flex-1 truncate rounded-md px-2 py-1 text-xs',
                      task.blockedBy.status === 'done' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-orange-500/10 text-orange-600 dark:text-orange-400')}>
                      {task.blockedBy.status === 'done' ? '✓ ' : '⏳ '}{task.blockedBy.title}
                    </span>
                    {isManager && (
                      <button onClick={() => patchTask({ blockedById: null })} aria-label="Kaldır">
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                ) : isManager ? (
                  <Select onValueChange={(v) => patchTask({ blockedById: v === 'none' ? null : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Bir göreve bağla…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Bağımsız</SelectItem>
                      {allTasks.filter((t) => t.id !== task.id).slice(0, 50).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : <p className="text-xs text-muted-foreground/60">Bağımsız</p>}
                {task.recurrence && (
                  <p className="flex items-center gap-1 text-[11px] text-violet-500"><Repeat className="h-3 w-3" /> {task.recurrence === 'daily' ? 'Her gün' : task.recurrence === 'weekly' ? 'Her hafta' : 'Her ay'} tekrarlanır</p>
                )}
              </div>
            </section>

            {/* Checklist */}
            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4" /> Alt Görevler</h4>
                <div className="flex items-center gap-2">
                  {isManager && (
                    <button type="button" onClick={suggestChecklistDetail} disabled={aiBusy}
                      className="flex items-center gap-1 text-[11px] font-medium text-violet-500 hover:underline disabled:opacity-50">
                      {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI öner
                    </button>
                  )}
                  {totalCount > 0 && <span className="text-xs text-muted-foreground">{doneCount}/{totalCount}</span>}
                </div>
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

            {/* Ekler (dosya) */}
            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Ekler</h4>
                {task.attachments.length > 0 && <span className="text-xs text-muted-foreground">{task.attachments.length}</span>}
              </div>

              {/* Görsel ekler için önizleme ızgarası */}
              {task.attachments.some((a) => a.mime.startsWith('image/')) && (
                <div className="grid grid-cols-3 gap-2">
                  {task.attachments.filter((a) => a.mime.startsWith('image/')).map((a) => (
                    <a key={a.id} href={a.path} target="_blank" rel="noopener noreferrer"
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.path} alt={a.filename} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      <button
                        onClick={(e) => { e.preventDefault(); deleteAttachment(a.id); }}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Sil"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-white" />
                      </button>
                    </a>
                  ))}
                </div>
              )}

              {/* Görsel olmayan ekler (PDF/belge) liste */}
              <div className="space-y-1.5">
                {task.attachments.filter((a) => !a.mime.startsWith('image/')).map((a) => (
                  <div key={a.id} className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-red-500/10 text-red-500">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.filename}</p>
                      <p className="text-[10px] text-muted-foreground">{formatSize(a.size)} · {a.uploadedBy.name || 'Ekip'}</p>
                    </div>
                    <a href={a.path} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="İndir">
                      <Download className="h-4 w-4" />
                    </a>
                    <button onClick={() => deleteAttachment(a.id)} className="opacity-0 group-hover:opacity-100" aria-label="Sil">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Yükleme alanı — tıkla veya sürükle-bırak */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
              >
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</> : <><Plus className="h-4 w-4" /> Dosya ekle (resim/PDF, max 8MB)</>}
              </button>
            </section>

            {/* Yorumlar */}
            <section className="mt-6 space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Yorumlar</h4>
              <div className="space-y-3">
                {(() => {
                  // Thread: ana yorumlar + altında yanıtları.
                  const roots = task.comments.filter((c) => !c.parentId);
                  const repliesOf = (id: string) => task.comments.filter((c) => c.parentId === id);
                  const renderComment = (c: Comment, isReply = false) => (
                    <div key={c.id} className={cn('group flex gap-2.5', isReply && 'ml-8 mt-2')}>
                      <Avatar className={cn('shrink-0', isReply ? 'h-6 w-6' : 'h-7 w-7')}>
                        {c.author.image ? <AvatarImage src={c.author.image} /> : null}
                        <AvatarFallback className="text-[10px]">{getInitials(c.author.name || c.author.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="rounded-lg bg-muted/50 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{c.author.name || c.author.email}</span>
                            <span className="text-[10px] text-muted-foreground">{fmt(c.createdAt)}{c.editedAt && ' · düzenlendi'}</span>
                          </div>
                          {editingId === c.id ? (
                            <div className="mt-1 space-y-1.5">
                              <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="resize-none text-sm"
                                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(); if (e.key === 'Escape') setEditingId(null); }} />
                              <div className="flex gap-1.5">
                                <Button size="sm" className="h-7" onClick={saveEdit}>Kaydet</Button>
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingId(null)}>İptal</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm">{renderCommentText(c.text, members)}</p>
                              {c.attachmentPath && (
                                <a href={c.attachmentPath} target="_blank" rel="noopener noreferrer"
                                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-primary hover:underline">
                                  <Paperclip className="h-3 w-3" /> {c.attachmentName || 'Dosya'}
                                </a>
                              )}
                            </>
                          )}
                        </div>
                        {/* Reaksiyon barı + aksiyon butonları */}
                        {editingId !== c.id && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {/* Mevcut reaksiyonlar (gruplu) */}
                            {Object.entries(c.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
                              acc[r.emoji] = acc[r.emoji] || { count: 0, mine: false };
                              acc[r.emoji].count++; if (r.userId === myId) acc[r.emoji].mine = true; return acc;
                            }, {})).map(([emoji, info]) => (
                              <button key={emoji} onClick={() => toggleReaction(c.id, emoji)}
                                className={cn('flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
                                  info.mine ? 'border-primary/40 bg-primary/10' : 'border-border/60 hover:bg-muted')}>
                                {emoji} <span className="text-[10px] text-muted-foreground">{info.count}</span>
                              </button>
                            ))}
                            {/* Reaksiyon ekle + yanıtla + düzenle/sil (hover) */}
                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Reaksiyon">
                                    <SmilePlus className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-1"><div className="flex gap-0.5">
                                  {REACTION_EMOJIS.map((e) => (
                                    <button key={e} onClick={() => toggleReaction(c.id, e)} className="rounded-md px-1.5 py-1 text-base transition-transform hover:scale-125">{e}</button>
                                  ))}
                                </div></PopoverContent>
                              </Popover>
                              {!isReply && (
                                <button onClick={() => setReplyTo({ id: c.id, author: c.author.name || c.author.email.split('@')[0] })} className="text-[10px] text-muted-foreground hover:text-foreground" aria-label="Yanıtla">
                                  Yanıtla
                                </button>
                              )}
                              <button onClick={() => { setEditingId(c.id); setEditText(c.text); }} aria-label="Düzenle"><Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
                              <button onClick={() => act({ op: 'delete_comment', commentId: c.id })} aria-label="Sil"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" /></button>
                            </div>
                          </div>
                        )}
                        {/* Yanıtlar */}
                        {repliesOf(c.id).map((r) => renderComment(r, true))}
                      </div>
                    </div>
                  );
                  return roots.length > 0 ? roots.map((c) => renderComment(c)) : <p className="text-xs text-muted-foreground/60">Henüz yorum yok</p>;
                })()}
              </div>
              {/* Yanıt bandı */}
              {replyTo && (
                <div className="flex items-center gap-2 rounded-md bg-primary/5 px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">Yanıtlanıyor: <strong className="text-foreground">{replyTo.author}</strong></span>
                  <button onClick={() => setReplyTo(null)} className="ml-auto"><X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>
                </div>
              )}
              {/* İliştirilen dosya bandı */}
              {commentFile && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                  <Paperclip className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate">{commentFile.name}</span>
                  <button onClick={() => setCommentFile(null)} className="ml-auto"><X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>
                </div>
              )}
              <div className="relative flex gap-2">
                <input ref={commentFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCommentFile(f); e.target.value = ''; }} />
                <button type="button" onClick={() => commentFileRef.current?.click()} disabled={uploadingComment}
                  className="self-end grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50" aria-label="Dosya iliştir">
                  {uploadingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
                <div className="relative flex-1">
                  <Textarea
                    ref={commentRef}
                    placeholder={replyTo ? 'Yanıt yaz…' : 'Yorum yaz… (@ ile birini etiketle)'}
                    value={newComment}
                    onChange={(e) => onCommentChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (mentionQuery !== null && mentionMatches.length > 0) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
                        if (e.key === 'Escape') { setMentionQuery(null); return; }
                      }
                    }}
                    rows={2}
                    className="resize-none"
                  />
                  {/* @mention autocomplete popover */}
                  {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                      {mentionMatches.map((mem, i) => (
                        <button
                          key={mem.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); insertMention(mem); }}
                          onMouseEnter={() => setMentionIndex(i)}
                          className={cn('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors',
                            i === mentionIndex ? 'bg-primary/10' : 'hover:bg-muted/50')}
                        >
                          <Avatar className="h-6 w-6">
                            {mem.image ? <AvatarImage src={mem.image} /> : null}
                            <AvatarFallback className="text-[9px]">{getInitials(mem.name || mem.email)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{mem.name || mem.email.split('@')[0]}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">{mem.email}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" className="self-end" onClick={submitComment} disabled={!newComment.trim() && !commentFile}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </section>

            {/* Aktivite — dikey zaman tüneli (timeline) */}
            <section className="mt-6 space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Aktivite</h4>
              {task.activities.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">Aktivite yok</p>
              ) : (
                <div className="relative space-y-3 pl-1">
                  {/* dikey bağlayıcı çizgi */}
                  <span className="absolute left-[11px] top-1 bottom-1 w-px bg-border" aria-hidden />
                  {task.activities.map((a) => {
                    const Icon = a.action === 'attachment' ? Paperclip
                      : a.action === 'mentioned' || a.action === 'commented' ? MessageSquare
                        : a.action === 'status' ? CheckSquare : CheckSquare;
                    const tone = a.action === 'attachment' ? 'text-sky-500 bg-sky-500/10'
                      : a.action === 'mentioned' ? 'text-violet-500 bg-violet-500/10'
                        : a.action === 'commented' ? 'text-blue-500 bg-blue-500/10'
                          : 'text-emerald-500 bg-emerald-500/10';
                    return (
                      <div key={a.id} className="relative flex gap-3">
                        <span className={cn('z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-4 ring-background', tone)}>
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5 text-xs">
                          <span className="font-medium text-foreground/80">{a.actor.name || 'Biri'}</span>{' '}
                          <span className="text-muted-foreground">{a.detail || a.action}</span>
                          <div className="text-[10px] text-muted-foreground/60">{fmt(a.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
