'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { SectionTabs } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, QueryState } from '@/components/states';
import { PRESET_CATEGORY_META, TEAM_TASK_PRESETS } from '@/lib/team-task-presets';
import { TASK_PRIORITIES, type TaskPriority } from '@/lib/team/constants';
import { formatMinutes } from '@/lib/team/dates';
import { weekKeyLabel } from '@/lib/team-week';
import { errorMessage, teamFetch } from '../lib/api';
import { API, invalidateTasks } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { PriorityBadge, displayName } from '../shared';
import { useTeamCopy, useTeamLabels } from '../copy';

type Template = {
  id: string;
  name: string;
  title: string;
  description: string | null;
  priority: string;
  department: string | null;
  tags: string | null;
  estimateMin: number | null;
  checklist: string | null;
  createdBy: { name: string | null } | null;
};

/**
 * Şablonlar (yönetici). Hazır galeri tek istekte görev üretir (eski akış geçici şablon
 * POST → PUT → DELETE zinciriydi, atomik değildi; denetim #14). Üretilen görev aktivite,
 * denetim kaydı ve atama bildirimi alır.
 */
export default function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tm = useTeamLabels();
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { weekKey, members, departments } = useWorkspace();
  const qc = useQueryClient();
  const [tab, setTab] = useState('gallery');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [draft, setDraft] = useState({ name: '', title: '', description: '', priority: 'medium' as TaskPriority, department: '', tags: '', estimateMin: '', checklist: '' });
  const list = useQuery({
    queryKey: ['team', 'templates'],
    queryFn: () => teamFetch<{ items: Template[] }>(`${API}/templates`),
    enabled: open,
  });

  const apply = async (body: { templateId?: string; presetKey?: string }, key: string) => {
    setBusyKey(key);
    try {
      await teamFetch(`${API}/templates`, { method: 'PUT', json: { ...body, weekKey, assignedToId: assignee || null, dueDate: due || null } });
      toast.success(tu.sablondanGorevOlusturuldu);
      invalidateTasks(qc);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  };

  const save = async () => {
    try {
      await teamFetch(`${API}/templates`, {
        method: 'POST',
        json: {
          name: draft.name.trim(),
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          priority: draft.priority,
          department: draft.department || null,
          tags: draft.tags.trim() || null,
          estimateMin: draft.estimateMin ? Number(draft.estimateMin) : null,
          checklist: draft.checklist.trim() || null,
        },
      });
      toast.success(tu.sablonKaydedildi);
      setDraft({ name: '', title: '', description: '', priority: 'medium', department: '', tags: '', estimateMin: '', checklist: '' });
      void list.refetch();
      setTab('mine');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const assignBar = (
    <div className="grid gap-2 rounded-card border border-subtle bg-surface-2 p-2 sm:grid-cols-2">
      <Select value={assignee || '__none'} onValueChange={(v) => setAssignee(v === '__none' ? '' : v)}>
        <SelectTrigger className="h-10" aria-label={tu.uretilecekGorevinAtanacagiKisi}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{tx.unassigned}</SelectItem>
          {members
            .filter((m) => m.inTeam || m.isAdmin)
            .map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {displayName(m)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={tu.bitisGunuIstegeBagli} className="h-10" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tx.templates}</DialogTitle>
          <DialogDescription>{tf.addedToWeek(weekKeyLabel(weekKey))}</DialogDescription>
        </DialogHeader>
        <SectionTabs
          value={tab}
          onValueChange={setTab}
          variant="pill"
          ariaLabel={tu.sablonBolumleri}
          tabs={[
            { value: 'gallery', label: tu.hazirGaleri, count: TEAM_TASK_PRESETS.length },
            { value: 'mine', label: tu.sablonlarim, count: list.data?.items.length },
            { value: 'new', label: tu.yeniSablon },
          ]}
        >
          {(active) =>
            active === 'gallery' ? (
              <div className="space-y-3">
                {assignBar}
                <ul className="grid gap-2 sm:grid-cols-2">
                  {TEAM_TASK_PRESETS.map((p) => (
                    <li key={p.key} className="flex flex-col gap-2 rounded-card border border-subtle bg-surface-1 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="qx-small font-semibold text-fg">
                          <span aria-hidden>{p.emoji}</span> {p.name}
                        </span>
                        <StatusBadge label={PRESET_CATEGORY_META[p.category].label} tone="neutral" icon={null} size="sm" />
                      </div>
                      <p className="qx-caption line-clamp-2 text-fg-muted">{p.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={p.priority} />
                        <span className="qx-caption text-fg-muted">
                          {tf.subtaskCount(p.checklist.length)} · {formatMinutes(p.estimateMin)}
                        </span>
                      </div>
                      <Button size="sm" className="mt-auto h-9" disabled={!!busyKey} onClick={() => void apply({ presetKey: p.key }, p.key)}>
                        {busyKey === p.key ? tu.olusturuluyor : tu.gorevOlustur}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : active === 'mine' ? (
              <div className="space-y-3">
                {assignBar}
                <QueryState
                  query={list}
                  skeleton="list"
                  isEmpty={(d) => d.items.length === 0}
                  empty={{ title: tu.kayitliSablonYok, description: tu.sikYinelenenGorevlerIcin }}
                >
                  {(d) => (
                    <ul className="space-y-2">
                      {d.items.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-card border border-subtle p-3">
                          <div className="min-w-0 flex-1">
                            <p className="qx-small font-semibold text-fg">{t.name}</p>
                            <p className="qx-caption truncate text-fg-muted">
                              {t.title} · {tf.subtaskCount((t.checklist ?? '').split('\n').filter(Boolean).length)}
                              {t.department ? ` · ${departments.find((x) => x.slug === t.department)?.name ?? tf.removedDept}` : ''}
                            </p>
                          </div>
                          <Button size="sm" className="h-9" disabled={!!busyKey} onClick={() => void apply({ templateId: t.id }, t.id)}>
                            {busyKey === t.id ? tu.olusturuluyor : 'Uygula'}
                          </Button>
                          <IconButton aria-label={tf.deleteTemplate(t.name)} icon={<Trash2 />} size="sm" onClick={() => setDeleting(t)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </QueryState>
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tu.sablonAdi} aria-label={tu.sablonAdi2} maxLength={120} required />
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={tu.gorevBasligi} aria-label={tu.gorevBasligi2} maxLength={200} required />
                </div>
                <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={tu.aciklama} aria-label={tu.aciklama} rows={3} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as TaskPriority })}>
                    <SelectTrigger className="h-10" aria-label={tu.oncelik}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {tm.PRIORITY_META[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={draft.department || '__none'} onValueChange={(v) => setDraft({ ...draft, department: v === '__none' ? '' : v })}>
                    <SelectTrigger className="h-10" aria-label={tu.departman}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{tx.noDepartment}</SelectItem>
                      {departments
                        .filter((d) => d.isActive)
                        .map((d) => (
                          <SelectItem key={d.slug} value={d.slug}>
                            {d.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="numeric"
                    value={draft.estimateMin}
                    onChange={(e) => setDraft({ ...draft, estimateMin: e.target.value.replace(/[^0-9]/g, '').slice(0, 6) })}
                    placeholder={tu.tahminiDk}
                    aria-label={tu.tahminiSureDakika}
                    className="h-10"
                  />
                </div>
                <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder={tu.etiketlerVirgulle} aria-label={tu.etiketler} />
                <Textarea
                  value={draft.checklist}
                  onChange={(e) => setDraft({ ...draft, checklist: e.target.value })}
                  placeholder={tu.altGorevlerHerSatira}
                  aria-label={tu.altGorevlerHerSatira2}
                  rows={4}
                />
                <Button type="submit" className="gap-1.5" disabled={!draft.name.trim() || !draft.title.trim()}>
                  <Plus className="h-4 w-4" aria-hidden /> {tu.sablonuKaydet}
                </Button>
              </form>
            )
          }
        </SectionTabs>
        <ConfirmAction
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={tu.sablonSilinsinMi}
          description={tu.buSablondanUretilmisGorevler}
          tone="warning"
          confirmLabel={tu.sil}
          onConfirm={async () => {
            if (!deleting) return;
            await teamFetch(`${API}/templates?id=${encodeURIComponent(deleting.id)}`, { method: 'DELETE' });
            toast.success(tu.sablonSilindi);
            setDeleting(null);
            void list.refetch();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
