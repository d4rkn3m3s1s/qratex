'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, UserCheck, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChoiceChips, IconButton } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { PRIORITY_META, TASK_PRIORITIES, type TaskPriority } from '@/lib/team/constants';
import { weekKeyLabel, shiftWeekKey } from '@/lib/team-week';
import { errorMessage, qs, teamFetch } from './lib/api';
import { API, invalidateTasks } from './lib/queries';
import { useWorkspace } from './workspace-context';
import { displayName } from './shared';
import type { TaskList } from './lib/types';

const EMPTY = {
  title: '',
  description: '',
  priority: 'medium' as TaskPriority,
  department: '',
  assignedToId: '',
  tags: '',
  dueDate: '',
  estimateMin: '',
  recurrence: '',
  blockedById: '',
  blockedTitle: '',
};

/**
 * Yeni görev (yönetici). Bitiş günü İstanbul gün sonu olarak kaydedilir; alt görevler (elle ya
 * da AI önerisi) görevle TEK istekte ve sıralı oluşur; oluştururken bağımlılık seçilebilir
 * (denetim #83). "Bana ata" ADMIN'in ekip rolü olmasa da çalışır (denetim #76).
 */
export default function NewTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { departments, members, tags, viewer, weekKey, currentWeekKey, can } = useWorkspace();
  const qc = useQueryClient();
  const ids = { title: useId(), desc: useId(), tags: useId(), due: useId(), est: useId() };
  const [form, setForm] = useState({ ...EMPTY, department: viewer.primaryDepartment ?? '' });
  const [week, setWeek] = useState(weekKey);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<null | 'assign' | 'checklist'>(null);
  const [depQ, setDepQ] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, department: '' });
      setWeek(weekKey);
      setChecklist([]);
      setError(null);
      setDepQ('');
    }
  }, [open, weekKey]);

  const depSearch = useQuery({
    queryKey: ['team', 'dep-search', depQ.trim()],
    queryFn: () => teamFetch<TaskList>(`${API}/tasks${qs({ view: 'search', q: depQ.trim() })}`),
    enabled: open && depQ.trim().length >= 2,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const assignable = members.filter((m) => m.inTeam || m.isAdmin);
  const weeks = [0, 1, 2, 3, 4].map((o) => shiftWeekKey(currentWeekKey, o));
  if (!weeks.includes(week)) weeks.unshift(week);

  const suggest = async (op: 'suggest_assignment' | 'suggest_checklist') => {
    if (!form.title.trim()) {
      setError('Önce başlık yaz.');
      return;
    }
    setAi(op === 'suggest_assignment' ? 'assign' : 'checklist');
    setError(null);
    try {
      if (op === 'suggest_assignment') {
        const r = await teamFetch<{ department: string | null; assignedToId: string | null; reason: string | null }>(`${API}/ai`, {
          method: 'POST',
          json: { op, title: form.title, description: form.description },
        });
        setForm((f) => ({ ...f, department: r.department ?? f.department, assignedToId: r.assignedToId ?? f.assignedToId }));
        toast(r.reason ? `AI önerisi: ${r.reason}` : 'AI önerisi uygulandı');
      } else {
        const r = await teamFetch<{ items: string[] }>(`${API}/ai`, { method: 'POST', json: { op, title: form.title, description: form.description } });
        if (r.items.length === 0) toast('AI alt görev önermedi.');
        setChecklist((c) => [...c, ...r.items].slice(0, 30));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAi(null);
    }
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setError('Başlık gerekli.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await teamFetch(`${API}/tasks`, {
        method: 'POST',
        json: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          priority: form.priority,
          department: form.department || null,
          assignedToId: form.assignedToId || null,
          weekKey: week,
          tags: form.tags.trim() || null,
          dueDate: form.dueDate || null,
          estimateMin: form.estimateMin ? Number(form.estimateMin) : null,
          recurrence: form.recurrence || null,
          blockedById: form.blockedById || null,
          checklist,
        },
      });
      toast.success('Görev oluşturuldu', { description: form.title.trim() });
      invalidateTasks(qc);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Yeni görev</DialogTitle>
          <DialogDescription>{weekKeyLabel(week)} haftasına eklenir. Atanan kişiye e-posta ve bildirim gider.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor={ids.title} className="qx-small font-medium text-fg">
              Başlık <span className="text-danger">*</span>
            </label>
            <Input id={ids.title} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} autoFocus required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.desc} className="qx-small font-medium text-fg">
              Açıklama
            </label>
            <Textarea id={ids.desc} value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={8000} />
          </div>
          <div className="space-y-1.5">
            <span id={`${ids.title}-p`} className="qx-small font-medium text-fg">
              Öncelik
            </span>
            <ChoiceChips
              aria-labelledby={`${ids.title}-p`}
              options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
              value={form.priority}
              onChange={(v) => v && set('priority', v as TaskPriority)}
              size="sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="qx-small font-medium text-fg">Atanan</span>
              <div className="flex gap-2">
                <Select value={form.assignedToId || '__none'} onValueChange={(v) => set('assignedToId', v === '__none' ? '' : v)}>
                  <SelectTrigger className="h-10" aria-label="Atanan kişi">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Atanmamış</SelectItem>
                    {assignable.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {displayName(m)}
                        {m.isSelf ? ' (sen)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5" onClick={() => set('assignedToId', viewer.userId)}>
                  <UserCheck className="h-4 w-4" aria-hidden /> Bana
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="qx-small font-medium text-fg">Departman</span>
              <Select value={form.department || '__none'} onValueChange={(v) => set('department', v === '__none' ? '' : v)}>
                <SelectTrigger className="h-10" aria-label="Departman">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Departmansız (genel)</SelectItem>
                  {departments
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <SelectItem key={d.slug} value={d.slug}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.due} className="qx-small font-medium text-fg">
                Bitiş günü
              </label>
              <Input id={ids.due} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <span className="qx-small font-medium text-fg">Hafta</span>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger className="h-10" aria-label="Hafta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem key={w} value={w}>
                      {weekKeyLabel(w)}
                      {w === currentWeekKey ? ' (bu hafta)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.est} className="qx-small font-medium text-fg">
                Tahmini süre (dk)
              </label>
              <Input
                id={ids.est}
                inputMode="numeric"
                value={form.estimateMin}
                onChange={(e) => set('estimateMin', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <span className="qx-small font-medium text-fg">Tekrar</span>
              <Select value={form.recurrence || '__none'} onValueChange={(v) => set('recurrence', v === '__none' ? '' : v)}>
                <SelectTrigger className="h-10" aria-label="Tekrar">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Tekrarlanmaz</SelectItem>
                  <SelectItem value="weekly">Her hafta (onaylanınca sonraki haftaya)</SelectItem>
                  <SelectItem value="monthly">Her ay (onaylanınca sonraki aya)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.tags} className="qx-small font-medium text-fg">
              Etiketler
            </label>
            <Input id={ids.tags} list={`${ids.tags}-pool`} value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="virgülle ayır: tasarım, acil" />
            <datalist id={`${ids.tags}-pool`}>
              {tags.map((t) => (
                <option key={t.slug} value={t.label} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <span className="qx-small font-medium text-fg">Bağlı olduğu görev</span>
            {form.blockedById ? (
              <div className="qx-small flex items-center gap-2 rounded-control border border-subtle px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{form.blockedTitle}</span>
                <IconButton aria-label="Bağımlılığı kaldır" icon={<X />} size="sm" onClick={() => setForm((f) => ({ ...f, blockedById: '', blockedTitle: '' }))} />
              </div>
            ) : (
              <div className="space-y-1">
                <Input value={depQ} onChange={(e) => setDepQ(e.target.value)} placeholder="Ara (isteğe bağlı, en az 2 harf)" aria-label="Bağlanacak görevi ara" />
                {depQ.trim().length >= 2 && (
                  <ul className="max-h-40 overflow-y-auto rounded-control border border-subtle" aria-live="polite">
                    {(depSearch.data?.items ?? []).map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="qx-small w-full truncate px-2 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setForm((f) => ({ ...f, blockedById: t.id, blockedTitle: t.title }))}
                        >
                          {t.title}
                        </button>
                      </li>
                    ))}
                    {depSearch.isFetched && (depSearch.data?.items.length ?? 0) === 0 && <li className="qx-caption px-2 py-2 text-fg-muted">Sonuç yok.</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="space-y-2 rounded-card border border-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="qx-small font-semibold text-fg">Alt görevler {checklist.length > 0 && <span className="qx-num font-normal text-fg-muted">{checklist.length}</span>}</span>
              {can.aiAssist && (
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="ghost" className="h-9 gap-1.5" disabled={!!ai} onClick={() => void suggest('suggest_checklist')}>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden /> {ai === 'checklist' ? 'Öneriliyor…' : 'AI alt görev'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-9 gap-1.5" disabled={!!ai} onClick={() => void suggest('suggest_assignment')}>
                    <Wand2 className="h-3.5 w-3.5" aria-hidden /> {ai === 'assign' ? 'Öneriliyor…' : 'AI ata'}
                  </Button>
                </div>
              )}
            </div>
            {checklist.length > 0 && (
              <ul className="space-y-1">
                {checklist.map((c, i) => (
                  <li key={`${c}-${i}`} className="qx-small flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-words">{c}</span>
                    <IconButton aria-label={`"${c}" alt görevini çıkar`} icon={<X />} size="sm" onClick={() => setChecklist((l) => l.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newItem.trim()) {
                      setChecklist((l) => [...l, newItem.trim()].slice(0, 30));
                      setNewItem('');
                    }
                  }
                }}
                placeholder="Alt görev ekle"
                aria-label="Alt görev ekle"
                maxLength={300}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5"
                disabled={!newItem.trim()}
                onClick={() => {
                  setChecklist((l) => [...l, newItem.trim()].slice(0, 30));
                  setNewItem('');
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Ekle
              </Button>
            </div>
          </div>
          {error && <InlineError variant="banner">{error}</InlineError>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Oluşturuluyor…' : 'Görevi oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
