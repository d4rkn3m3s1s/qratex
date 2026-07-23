'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Users2, Loader2, Plus, ChevronLeft, ChevronRight, Trash2, GripVertical, CalendarDays,
  ListChecks, MessageSquare, Paperclip, Search, Filter, X, CheckSquare, Download,
  Sparkles, FileText, Zap, Repeat, Clock, Link2, UserCheck,
} from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { cn, getInitials } from '@/lib/utils';
import { weekKeyOf, shiftWeekKey, weekKeyLabel, mondayFromWeekKey } from '@/lib/team-week';
import { TaskDetailSheet } from '@/components/admin/team/task-detail-sheet';
import { TemplatesDialog } from '@/components/admin/team/templates-dialog';
import { AiSummaryDialog } from '@/components/admin/team/ai-summary-dialog';
import { DonutChart } from '@/components/charts/donut-chart';
import { SimpleBarChart } from '@/components/charts/simple-bar-chart';

type Member = { id: string; name: string | null; email: string; image: string | null; adminDepartment: string | null; adminTeamRole: string | null };
type Department = { id: string; slug: string; name: string; color: string };
type Task = {
  id: string; title: string; description: string | null; status: string; priority: string;
  department: string | null; weekKey: string | null; dueAt: string | null; tags: string | null;
  estimateMin: number | null; spentMin: number; recurrence: string | null; blockedById: string | null;
  assignedTo: { id: string; name: string | null; email: string; image: string | null } | null;
  blockedBy: { id: string; title: string; status: string } | null;
  _count?: { comments: number; attachments: number; checklist: number };
};

const COLUMNS = [
  { key: 'todo', label: 'Yapılacak', emoji: '📋', dot: 'bg-slate-400', ring: 'ring-slate-400/30', head: 'text-slate-600 dark:text-slate-300' },
  { key: 'in_progress', label: 'Devam Ediyor', emoji: '⚡', dot: 'bg-amber-400', ring: 'ring-amber-400/40', head: 'text-amber-600 dark:text-amber-400' },
  { key: 'done', label: 'Bitti', emoji: '✅', dot: 'bg-emerald-400', ring: 'ring-emerald-400/40', head: 'text-emerald-600 dark:text-emerald-400' },
] as const;

// Etiket rozetleri: CSV'yi ayrıştır, isme göre deterministik renk paleti ata.
const TAG_PALETTE = [
  'bg-violet-500/15 text-violet-600 dark:text-violet-300',
  'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  'bg-rose-500/15 text-rose-600 dark:text-rose-300',
  'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'bg-teal-500/15 text-teal-600 dark:text-teal-300',
  'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300',
];
function parseTags(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return [...new Set(csv.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 8);
}
function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};
const PRIORITY_LABEL: Record<string, string> = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

export default function TeamPage() {
  const { data: session } = useSession();
  const teamRole = (session?.user as { adminTeamRole?: string | null } | undefined)?.adminTeamRole ?? null;
  const isManager = teamRole === 'yonetici' || teamRole == null; // rol atanmamışsa tam görünüm (ilk kurulum)

  const [weekKey, setWeekKey] = useState<string>(() => weekKeyOf());
  const [department, setDepartment] = useState<string>('all');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'people' | 'calendar'>('kanban');

  // Arama + gelişmiş filtreler
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fPriority, setFPriority] = useState('all');
  const [fAssignee, setFAssignee] = useState('all');
  const [fTag, setFTag] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  // Toplu seçim modu
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Şablon + AI özet diyalogları
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Yeni görev diyaloğu
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', department: '', assignedToId: '', tags: '', dueAt: '', estimateMin: '', recurrence: '' });
  const [saving, setSaving] = useState(false);

  // Arama debounce (300ms)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Derin bağlantı: ?task=<id> ile detay panelini aç (ilk yüklemede).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('task');
    if (t) setDetailId(t);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/team/departments', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setDepartments(json.departments);
        setMembers(json.members);
      }
    } catch { /* sessiz */ }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ weekKey });
      if (department !== 'all') params.set('department', department);
      if (fStatus !== 'all') params.set('status', fStatus);
      if (fPriority !== 'all') params.set('priority', fPriority);
      if (mineOnly) params.set('mine', '1');
      else if (fAssignee !== 'all') params.set('assignedTo', fAssignee);
      if (fTag) params.set('tag', fTag);
      if (debouncedSearch) params.set('q', debouncedSearch);
      const res = await fetch(`/api/admin/team/tasks?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setTasks(json.tasks);
    } catch {
      toast.error('Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [weekKey, department, fStatus, fPriority, fAssignee, fTag, mineOnly, debouncedSearch]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Detay paneli açık/kapalı durumunu URL'e yansıt (paylaşılabilir derin bağlantı).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (detailId) url.searchParams.set('task', detailId);
    else url.searchParams.delete('task');
    window.history.replaceState(null, '', url.toString());
  }, [detailId]);

  const activeFilterCount =
    (fStatus !== 'all' ? 1 : 0) + (fPriority !== 'all' ? 1 : 0) +
    (fAssignee !== 'all' && !mineOnly ? 1 : 0) + (fTag ? 1 : 0) + (mineOnly ? 1 : 0) + (debouncedSearch ? 1 : 0);
  const clearFilters = () => {
    setSearch(''); setDebouncedSearch(''); setFStatus('all'); setFPriority('all');
    setFAssignee('all'); setFTag(null); setMineOnly(false);
  };

  const tasksByCol = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) (map[t.status] ?? map.todo).push(t);
    return map;
  }, [tasks]);

  // Durum raporu: kolon dağılımı + kişi başı yük + grafik verileri
  const report = useMemo(() => {
    const total = tasks.length;
    const done = tasksByCol.done.length;
    const byMember = new Map<string, { name: string; count: number }>();
    for (const t of tasks) {
      if (!t.assignedTo) continue;
      const cur = byMember.get(t.assignedTo.id) ?? { name: t.assignedTo.name || t.assignedTo.email, count: 0 };
      cur.count += 1;
      byMember.set(t.assignedTo.id, cur);
    }
    const memberList = [...byMember.values()].sort((a, b) => b.count - a.count);
    const statusDonut = [
      { name: 'Yapılacak', value: tasksByCol.todo.length, color: '#94a3b8' },
      { name: 'Devam', value: tasksByCol.in_progress.length, color: '#f59e0b' },
      { name: 'Bitti', value: tasksByCol.done.length, color: '#10b981' },
    ];
    const memberBars = memberList.slice(0, 8).map((m) => ({ name: m.name.split(' ')[0], value: m.count }));
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0, members: memberList, statusDonut, memberBars };
  }, [tasks, tasksByCol]);

  const moveTask = async (taskId: string, newStatus: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    // Optimistik
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      const res = await fetch(`/api/admin/team/tasks?id=${taskId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Taşınamadı');
      loadTasks();
    }
  };

  const createTask = async () => {
    if (!form.title.trim()) { toast.error('Başlık gerekli'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/team/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, description: form.description || null, priority: form.priority,
          department: form.department || null, assignedToId: form.assignedToId || null, weekKey,
          tags: form.tags || null, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          estimateMin: form.estimateMin ? Number(form.estimateMin) : null,
          recurrence: form.recurrence || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error();
      // AI'ın önerdiği alt görevler varsa yeni görevin checklist'ine ekle.
      if (aiChecklist.length > 0 && json.task?.id) {
        await Promise.all(aiChecklist.map((text) =>
          fetch(`/api/admin/team/tasks/${json.task.id}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ op: 'add_checklist', text }),
          }).catch(() => {})
        ));
      }
      toast.success('Görev eklendi');
      setDialogOpen(false);
      setForm({ title: '', description: '', priority: 'medium', department: '', assignedToId: '', tags: '', dueAt: '', estimateMin: '', recurrence: '' });
      setAiChecklist([]);
      loadTasks();
    } catch {
      toast.error('Görev eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/admin/team/tasks?id=${id}`, { method: 'DELETE' }).catch(() => {});
  };

  // ── AI önerileri (yeni görev modalı) ───────────────────────────
  const [aiSuggesting, setAiSuggesting] = useState<null | 'assign' | 'checklist'>(null);
  const [aiChecklist, setAiChecklist] = useState<string[]>([]);
  const suggestAssignment = async () => {
    if (!form.title.trim()) { toast.error('Önce başlık gir'); return; }
    setAiSuggesting('assign');
    try {
      const res = await fetch('/api/admin/team/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'suggest_assignment', title: form.title, description: form.description }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setForm((f) => ({ ...f, department: json.department || f.department, assignedToId: json.assignedToId || f.assignedToId }));
      toast.success(json.reason ? `AI önerisi: ${json.reason}` : 'AI önerisi uygulandı');
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : 'AI önerisi alınamadı'); }
    finally { setAiSuggesting(null); }
  };
  const suggestChecklist = async () => {
    if (!form.title.trim()) { toast.error('Önce başlık gir'); return; }
    setAiSuggesting('checklist');
    try {
      const res = await fetch('/api/admin/team/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'suggest_checklist', title: form.title, description: form.description }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error);
      setAiChecklist(json.items || []);
      if (!json.items?.length) toast('AI alt görev önermedi');
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : 'AI önerisi alınamadı'); }
    finally { setAiSuggesting(null); }
  };

  // ── Toplu seçim ────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const runBulk = async (action: Record<string, unknown>) => {
    if (selected.size === 0) return;
    const ids = [...selected];
    try {
      const res = await fetch('/api/admin/team/tasks/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error();
      toast.success(`${json.affected} görev güncellendi`);
      setSelected(new Set()); setSelectMode(false);
      loadTasks();
    } catch { toast.error('Toplu işlem başarısız'); }
  };

  // ── Otomatik görev üretimi (işletme verisinden) ────────────────
  const [autoBusy, setAutoBusy] = useState(false);
  const generateAutoTasks = async () => {
    setAutoBusy(true);
    try {
      const res = await fetch('/api/admin/team/autotask', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error();
      toast.success(json.total > 0 ? `${json.total} görev üretildi (${json.fromIncidents} olay, ${json.fromActionItems} aksiyon)` : 'Yeni kaynak bulunamadı');
      if (json.total > 0) loadTasks();
    } catch { toast.error('Otomatik görev üretilemedi'); }
    finally { setAutoBusy(false); }
  };

  // ── CSV dışa aktarma (mevcut görünen görevler) ─────────────────
  const exportCsv = async () => {
    const { exportToCSV } = await import('@/lib/export-utils');
    const rows = tasks.map((t) => ({
      baslik: t.title,
      durum: t.status === 'done' ? 'Bitti' : t.status === 'in_progress' ? 'Devam' : 'Yapılacak',
      oncelik: PRIORITY_LABEL[t.priority] ?? t.priority,
      departman: departments.find((d) => d.slug === t.department)?.name ?? t.department ?? '',
      atanan: t.assignedTo?.name || t.assignedTo?.email || '',
      etiketler: t.tags ?? '',
      bitis: t.dueAt ? new Date(t.dueAt).toLocaleDateString('tr-TR') : '',
      tahmini_dk: t.estimateMin ?? '',
      harcanan_dk: t.spentMin ?? 0,
    }));
    if (rows.length === 0) { toast.error('Dışa aktarılacak görev yok'); return; }
    exportToCSV(rows, `ekip-gorevler-${weekKey}`, [
      { key: 'baslik', label: 'Başlık' }, { key: 'durum', label: 'Durum' }, { key: 'oncelik', label: 'Öncelik' },
      { key: 'departman', label: 'Departman' }, { key: 'atanan', label: 'Atanan' }, { key: 'etiketler', label: 'Etiketler' },
      { key: 'bitis', label: 'Bitiş' }, { key: 'tahmini_dk', label: 'Tahmini (dk)' }, { key: 'harcanan_dk', label: 'Harcanan (dk)' },
    ]);
    toast.success('CSV indirildi');
  };

  return (
    <div className="space-y-7 pb-16">
      <AdminPremiumHero
        eyebrow="Ekip Yönetimi"
        title="Haftalık Görev Panosu"
        description={
          teamRole
            ? `Rolün: ${teamRole === 'yonetici' ? 'Yönetici' : 'Üye'}${session?.user && (session.user as { adminDepartment?: string | null }).adminDepartment ? ' · ' + (session.user as { adminDepartment?: string | null }).adminDepartment : ''}`
            : 'Departmanlara görev ata, haftalık ilerlemeyi takip et.'
        }
        icon={<Users2 className="size-7" />}
        tone="auto"
      />

      {/* Kontrol çubuğu: hafta + departman + yeni görev */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/50 p-1">
          <Button variant="ghost" size="sm" onClick={() => setWeekKey((k) => shiftWeekKey(k, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="flex items-center gap-2 px-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {weekKeyLabel(weekKey)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setWeekKey((k) => shiftWeekKey(k, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekKey !== weekKeyOf() && (
            <Button variant="ghost" size="sm" onClick={() => setWeekKey(weekKeyOf())}>Bu hafta</Button>
          )}
        </div>

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Departman" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm departmanlar</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Görünüm modu geçişi */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/50 p-1">
          {([['kanban', 'Pano'], ['list', 'Liste'], ['people', 'Kişiler'], ['calendar', 'Takvim']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSummaryOpen(true)} title="AI haftalık özet">
            <Sparkles className="mr-1.5 h-4 w-4" /> AI Özet
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} title="CSV dışa aktar">
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
          {isManager && (
            <>
              <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)} title="Görev şablonları">
                <FileText className="mr-1.5 h-4 w-4" /> Şablonlar
              </Button>
              <Button variant="outline" size="sm" onClick={generateAutoTasks} disabled={autoBusy} title="İşletme verisinden görev üret">
                {autoBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />} Otomatik
              </Button>
              <Button variant={selectMode ? 'default' : 'outline'} size="sm" onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }} title="Toplu seçim">
                <CheckSquare className="mr-1.5 h-4 w-4" /> Seç
              </Button>
            </>
          )}
          <Button asChild variant="outline" size="sm">
            <a href="/admin/ekip/departmanlar">Departmanlar</a>
          </Button>
          {isManager && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Yeni Görev
            </Button>
          )}
        </div>
      </div>

      {/* Arama + gelişmiş filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Görev ara (başlık, açıklama, etiket)…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
        </div>
        <Button variant={mineOnly ? 'default' : 'outline'} size="sm" onClick={() => { setMineOnly((m) => !m); setFAssignee('all'); }}>
          <UserCheck className="mr-1.5 h-4 w-4" /> Benim Görevlerim
        </Button>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Durum" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm durumlar</SelectItem>
            <SelectItem value="todo">Yapılacak</SelectItem>
            <SelectItem value="in_progress">Devam</SelectItem>
            <SelectItem value="done">Bitti</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fPriority} onValueChange={setFPriority}>
          <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Öncelik" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm öncelik</SelectItem>
            <SelectItem value="high">Yüksek</SelectItem>
            <SelectItem value="medium">Orta</SelectItem>
            <SelectItem value="low">Düşük</SelectItem>
          </SelectContent>
        </Select>
        <Select value={mineOnly ? 'all' : fAssignee} onValueChange={(v) => { setFAssignee(v); if (v !== 'all') setMineOnly(false); }} disabled={mineOnly}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Atanan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Herkes</SelectItem>
            <SelectItem value="unassigned">Atanmamış</SelectItem>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
          </SelectContent>
        </Select>
        {fTag && (
          <button onClick={() => setFTag(null)} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', tagColor(fTag))}>
            #{fTag} <X className="h-3 w-3" />
          </button>
        )}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <Filter className="mr-1 h-3.5 w-3.5" /> Temizle ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Toplu işlem çubuğu (seçim modu aktifse) */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} seçili</span>
          <div className="mx-1 h-4 w-px bg-border" />
          <Select onValueChange={(v) => runBulk({ op: 'status', value: v })}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Durum ata" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">Yapılacak</SelectItem>
              <SelectItem value="in_progress">Devam</SelectItem>
              <SelectItem value="done">Bitti</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => runBulk({ op: 'priority', value: v })}>
            <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Öncelik ata" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Yüksek</SelectItem>
              <SelectItem value="medium">Orta</SelectItem>
              <SelectItem value="low">Düşük</SelectItem>
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => runBulk({ op: 'assign', value: v === 'none' ? null : v })}>
            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Kişiye ata" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Atamayı kaldır</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="destructive" size="sm" onClick={() => runBulk({ op: 'delete' })} disabled={selected.size === 0}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Sil
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="ml-auto">Kapat</Button>
        </div>
      )}

      {/* Durum raporu — grafiklerle */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* KPI'lar */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Bu Hafta</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold">{report.total}</span>
              <span className="mb-1 text-sm text-muted-foreground">görev</span>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tamamlanma</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">%{report.pct}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${report.pct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div><p className="text-lg font-bold text-slate-500">{tasksByCol.todo.length}</p><p className="text-[10px] text-muted-foreground">Yapılacak</p></div>
              <div><p className="text-lg font-bold text-amber-500">{tasksByCol.in_progress.length}</p><p className="text-[10px] text-muted-foreground">Devam</p></div>
              <div><p className="text-lg font-bold text-emerald-500">{tasksByCol.done.length}</p><p className="text-[10px] text-muted-foreground">Bitti</p></div>
            </div>
          </CardContent>
        </Card>

        {/* Durum dağılımı donut */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Durum Dağılımı</CardTitle></CardHeader>
          <CardContent>
            <DonutChart data={report.statusDonut} height={180} />
          </CardContent>
        </Card>

        {/* Kişi başı yük bar */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Kişi Başı Yük</CardTitle></CardHeader>
          <CardContent>
            {report.memberBars.length > 0 ? (
              <SimpleBarChart data={report.memberBars} height={180} color="hsl(var(--primary))" />
            ) : (
              <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">Henüz atama yok</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* İçerik: yükleniyor / kanban / liste / kişiler */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" /> Yükleniyor…
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="grid gap-5 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== col.key) setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => { if (dragId) moveTask(dragId, col.key); setDragId(null); setDragOverCol(null); }}
              className={cn(
                'rounded-2xl border-2 bg-card/40 p-3 transition-all duration-200',
                dragOverCol === col.key && dragId
                  ? cn('border-solid ring-2 scale-[1.01]', col.ring, 'bg-card/70')
                  : 'border-dashed border-border/50'
              )}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className={cn('flex items-center gap-2 text-sm font-bold', col.head)}>
                  <span className="text-base">{col.emoji}</span>
                  {col.label}
                </h3>
                <span className={cn('grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold text-white', col.dot)}>
                  {tasksByCol[col.key].length}
                </span>
              </div>
              <div className="space-y-2.5">
                {tasksByCol[col.key].map((task) => (
                  <div
                    key={task.id}
                    draggable={isManager}
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    className={cn(
                      'group rounded-xl border border-border/60 bg-background p-3.5 shadow-sm transition-all duration-200',
                      isManager && 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg',
                      dragId === task.id && 'rotate-1 opacity-40 shadow-xl'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {selectMode ? (
                        <input
                          type="checkbox"
                          checked={selected.has(task.id)}
                          onChange={() => toggleSelect(task.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          aria-label="Seç"
                        />
                      ) : isManager && <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />}
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (selectMode ? toggleSelect(task.id) : setDetailId(task.id))}>
                        <p className="text-sm font-medium leading-snug">{task.title}</p>
                        {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
                        {task.blockedBy && task.blockedBy.status !== 'done' && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400">
                            <Link2 className="h-3 w-3" /> Bağlı: {task.blockedBy.title}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[task.priority])}>
                            {PRIORITY_LABEL[task.priority]}
                          </span>
                          {task.recurrence && (
                            <span className="flex items-center gap-0.5 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300" title="Tekrarlayan görev">
                              <Repeat className="h-3 w-3" />
                            </span>
                          )}
                          {task.estimateMin != null && (
                            <span className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" title="Tahmini süre">
                              <Clock className="h-3 w-3" />{Math.round(task.estimateMin / 60 * 10) / 10}s
                            </span>
                          )}
                          {task.department && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {departments.find((d) => d.slug === task.department)?.name ?? task.department}
                            </span>
                          )}
                          {task.dueAt && (
                            <span className={cn(
                              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                              new Date(task.dueAt) < new Date() && task.status !== 'done'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                : 'bg-muted text-muted-foreground'
                            )}>
                              <CalendarDays className="h-3 w-3" />
                              {new Date(task.dueAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {task.assignedTo && (
                            <Avatar className="h-5 w-5">
                              {task.assignedTo.image ? <AvatarImage src={task.assignedTo.image} /> : null}
                              <AvatarFallback className="text-[9px]">{getInitials(task.assignedTo.name || task.assignedTo.email)}</AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                        {parseTags(task.tags).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {parseTags(task.tags).map((tag) => (
                              <button
                                key={tag}
                                onClick={(e) => { e.stopPropagation(); setFTag(tag); }}
                                className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-transform hover:scale-105', tagColor(tag))}
                                title={`#${tag} ile filtrele`}
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Meta göstergeleri: alt görev / yorum / ek sayısı */}
                        {task._count && (task._count.checklist > 0 || task._count.comments > 0 || task._count.attachments > 0) && (
                          <div className="mt-2 flex items-center gap-2.5 text-[10px] text-muted-foreground">
                            {task._count.checklist > 0 && <span className="flex items-center gap-0.5"><ListChecks className="h-3 w-3" />{task._count.checklist}</span>}
                            {task._count.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{task._count.comments}</span>}
                            {task._count.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{task._count.attachments}</span>}
                          </div>
                        )}
                      </div>
                      {isManager && (
                        <button onClick={() => deleteTask(task.id)} className="opacity-0 transition-opacity group-hover:opacity-100" aria-label="Sil">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {tasksByCol[col.key].length === 0 && (
                  <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border/40 py-8 text-muted-foreground/50">
                    <span className="text-2xl opacity-40">{col.emoji}</span>
                    <p className="text-xs">Buraya sürükle</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'list' ? (
        /* Liste görünümü */
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {tasks.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Bu hafta görev yok</p>}
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setDetailId(task.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full',
                    task.status === 'done' ? 'bg-emerald-500' : task.status === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400')} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-medium', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {task.department && <span className="text-xs text-muted-foreground">{departments.find((d) => d.slug === task.department)?.name ?? task.department}</span>}
                      {parseTags(task.tags).map((tag) => (
                        <span key={tag} className={cn('rounded px-1 py-0.5 text-[9px] font-medium', tagColor(tag))}>#{tag}</span>
                      ))}
                    </span>
                  </span>
                  {task.dueAt && (
                    <span className={cn('hidden shrink-0 items-center gap-1 text-[11px] sm:flex',
                      new Date(task.dueAt) < new Date() && task.status !== 'done' ? 'text-red-500' : 'text-muted-foreground')}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(task.dueAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[task.priority])}>{PRIORITY_LABEL[task.priority]}</span>
                  {task.assignedTo && (
                    <Avatar className="h-6 w-6">
                      {task.assignedTo.image ? <AvatarImage src={task.assignedTo.image} /> : null}
                      <AvatarFallback className="text-[9px]">{getInitials(task.assignedTo.name || task.assignedTo.email)}</AvatarFallback>
                    </Avatar>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'people' ? (
        /* Kişiler görünümü — kim ne yapıyor */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(() => {
            const byPerson = new Map<string, { member: typeof members[number] | null; tasks: Task[] }>();
            for (const t of tasks) {
              const key = t.assignedTo?.id ?? 'unassigned';
              if (!byPerson.has(key)) {
                byPerson.set(key, { member: members.find((m) => m.id === t.assignedTo?.id) ?? null, tasks: [] });
              }
              byPerson.get(key)!.tasks.push(t);
            }
            return [...byPerson.entries()].map(([key, group]) => (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      {group.member?.image ? <AvatarImage src={group.member.image} /> : null}
                      <AvatarFallback className="text-xs">{key === 'unassigned' ? '?' : getInitials(group.member?.name || group.member?.email || '?')}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm">{key === 'unassigned' ? 'Atanmamış' : (group.member?.name || group.member?.email || 'Bilinmeyen')}</CardTitle>
                      <p className="text-xs text-muted-foreground">{group.tasks.length} görev · {group.tasks.filter((t) => t.status === 'done').length} bitti</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {group.tasks.map((t) => (
                    <button key={t.id} onClick={() => setDetailId(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', t.status === 'done' ? 'bg-emerald-500' : t.status === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400')} />
                      <span className={cn('truncate', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ));
          })()}
          {tasks.length === 0 && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">Bu hafta görev yok</p>}
        </div>
      ) : (
        /* Takvim görünümü — haftanın 7 günü, göreve dueAt bazlı yerleşim */
        <CalendarView
          tasks={tasks}
          weekKey={weekKey}
          departments={departments}
          onOpenTask={setDetailId}
        />
      )}

      {/* Yeni görev diyaloğu — ferah, etiketli, öncelik renk butonlu */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="border-b border-border/50 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
                <Plus className="h-5 w-5" />
              </span>
              Yeni Görev
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">Başlık</label>
                <div className="flex gap-2">
                  <button type="button" onClick={suggestChecklist} disabled={aiSuggesting !== null}
                    className="flex items-center gap-1 text-[11px] font-medium text-violet-500 hover:underline disabled:opacity-50">
                    {aiSuggesting === 'checklist' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI alt görev
                  </button>
                  <button type="button" onClick={suggestAssignment} disabled={aiSuggesting !== null}
                    className="flex items-center gap-1 text-[11px] font-medium text-violet-500 hover:underline disabled:opacity-50">
                    {aiSuggesting === 'assign' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI ata
                  </button>
                </div>
              </div>
              <Input
                placeholder="Ne yapılacak?"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-11 text-base"
                autoFocus
              />
            </div>

            {/* AI önerdiği alt görevler */}
            {aiChecklist.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs font-semibold text-violet-500"><Sparkles className="h-3.5 w-3.5" /> AI alt görev önerileri</span>
                  <button type="button" onClick={() => setAiChecklist([])} className="text-[11px] text-muted-foreground hover:underline">Temizle</button>
                </div>
                <ul className="space-y-1">
                  {aiChecklist.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <ListChecks className="h-3 w-3 shrink-0 text-violet-500" />
                      <span className="flex-1">{item}</span>
                      <button type="button" onClick={() => setAiChecklist((prev) => prev.filter((_, j) => j !== i))} aria-label="Kaldır">
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground">Görev oluşturulunca bu maddeler alt görev olarak eklenir.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Açıklama</label>
              <Textarea
                placeholder="Detay ekle (opsiyonel)…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Öncelik — renkli seçim butonları (dropdown yerine) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Öncelik</label>
              <div className="grid grid-cols-3 gap-2">
                {([['low', 'Düşük', 'slate'], ['medium', 'Orta', 'amber'], ['high', 'Yüksek', 'red']] as const).map(([val, label, c]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm({ ...form, priority: val })}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-medium transition-all',
                      form.priority === val
                        ? c === 'red' ? 'border-red-400 bg-red-500/10 text-red-600 dark:text-red-400'
                          : c === 'amber' ? 'border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-slate-400 bg-slate-500/10 text-slate-600 dark:text-slate-300'
                        : 'border-border/50 text-muted-foreground hover:border-border'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', c === 'red' ? 'bg-red-500' : c === 'amber' ? 'bg-amber-500' : 'bg-slate-400')} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Departman</label>
                <Select value={form.department || 'none'} onValueChange={(v) => setForm({ ...form, department: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Departman" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Genel</SelectItem>
                    {departments.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">Atanan</label>
                  {session?.user?.id && form.assignedToId !== session.user.id && (
                    <button type="button" onClick={() => setForm({ ...form, assignedToId: session.user.id })}
                      className="text-[11px] font-medium text-primary hover:underline">
                      Bana ata
                    </button>
                  )}
                </div>
                <Select value={form.assignedToId || 'none'} onValueChange={(v) => setForm({ ...form, assignedToId: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Kişi seç" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Atanmadı</SelectItem>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Etiketler + bitiş tarihi */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Etiketler</label>
                <Input
                  placeholder="tasarım, acil, v2…"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="h-11"
                />
                {parseTags(form.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {parseTags(form.tags).map((tag) => (
                      <span key={tag} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium', tagColor(tag))}>#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Bitiş Tarihi</label>
                <Input
                  type="date"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>

            {/* Tahmini süre + tekrar */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Tahmini Süre (dk)</label>
                <Input
                  type="number" min={0} placeholder="ör. 120"
                  value={form.estimateMin}
                  onChange={(e) => setForm({ ...form, estimateMin: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Repeat className="h-3.5 w-3.5" /> Tekrar</label>
                <Select value={form.recurrence || 'none'} onValueChange={(v) => setForm({ ...form, recurrence: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Tekrar yok" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tekrar yok</SelectItem>
                    <SelectItem value="daily">Her gün</SelectItem>
                    <SelectItem value="weekly">Her hafta</SelectItem>
                    <SelectItem value="monthly">Her ay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/50 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
            <Button onClick={createTask} disabled={saving || !form.title.trim()} className="gap-1.5">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Ekleniyor…</> : <><Plus className="h-4 w-4" /> Görevi Ekle</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Görev detay paneli (checklist + yorum + aktivite) */}
      <TaskDetailSheet
        taskId={detailId}
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onChanged={loadTasks}
        members={members}
        allTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
        isManager={isManager}
      />

      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} weekKey={weekKey} onApplied={loadTasks} />
      <AiSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} weekKey={weekKey} />
    </div>
  );
}

/* ── Takvim görünümü ─────────────────────────────────────────────
   Haftanın 7 günü sütun olarak; her görev dueAt'ına göre yerleşir.
   Tarihi olmayanlar ayrı "Tarihsiz" bölmesinde toplanır. UTC bazlı,
   hydration-güvenli (sabit gün adları). */
const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function CalendarView({
  tasks, weekKey, departments, onOpenTask,
}: {
  tasks: Task[];
  weekKey: string;
  departments: Department[];
  onOpenTask: (id: string) => void;
}) {
  const days = useMemo(() => {
    const monday = mondayFromWeekKey(weekKey);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      return d;
    });
  }, [weekKey]);

  // Görevleri gün anahtarına (YYYY-MM-DD, UTC) göre grupla + tarihsizler.
  const { byDay, undated } = useMemo(() => {
    const map: Record<string, Task[]> = {};
    const und: Task[] = [];
    for (const t of tasks) {
      if (!t.dueAt) { und.push(t); continue; }
      const d = new Date(t.dueAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      (map[key] ??= []).push(t);
    }
    return { byDay: map, undated: und };
  }, [tasks]);

  const todayKey = (() => {
    const n = new Date();
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
  })();

  const dayKeyOf = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d, i) => {
          const key = dayKeyOf(d);
          const dayTasks = byDay[key] ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-[160px] flex-col rounded-2xl border bg-card/40 p-2.5 transition-colors',
                isToday ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border/50'
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className={cn('text-xs font-bold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                  {DAY_NAMES[i]}
                </span>
                <span className={cn(
                  'grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold',
                  isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}>
                  {d.getUTCDate()}
                </span>
              </div>
              <div className="flex-1 space-y-1.5">
                {dayTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpenTask(t.id)}
                    className={cn(
                      'block w-full rounded-lg border-l-2 bg-background p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                      t.status === 'done' ? 'border-l-emerald-400' : t.status === 'in_progress' ? 'border-l-amber-400' : 'border-l-slate-400'
                    )}
                  >
                    <span className={cn('block truncate text-xs font-medium leading-tight', t.status === 'done' && 'text-muted-foreground line-through')}>
                      {t.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={cn('rounded px-1 py-0.5 text-[9px] font-semibold', PRIORITY_STYLE[t.priority])}>
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                      {t.assignedTo && (
                        <Avatar className="h-4 w-4">
                          {t.assignedTo.image ? <AvatarImage src={t.assignedTo.image} /> : null}
                          <AvatarFallback className="text-[8px]">{getInitials(t.assignedTo.name || t.assignedTo.email)}</AvatarFallback>
                        </Avatar>
                      )}
                    </span>
                  </button>
                ))}
                {dayTasks.length === 0 && (
                  <div className="grid h-full min-h-[80px] place-items-center text-[10px] text-muted-foreground/40">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Tarihsiz görevler ({undated.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', t.status === 'done' ? 'bg-emerald-500' : t.status === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400')} />
                <span className={cn('truncate max-w-[180px]', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
                {t.department && <span className="text-muted-foreground/70">· {departments.find((dep) => dep.slug === t.department)?.name ?? t.department}</span>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
