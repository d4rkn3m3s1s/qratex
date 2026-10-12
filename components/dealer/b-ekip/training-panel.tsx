'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Archive, BookOpen, Check, ListChecks, Loader2, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineConfirm, SectionCard, StatusBadge } from '@/components/ds';
import { EmptyState, ErrorState } from '@/components/states';
import type { ChecklistTemplateDto, TeamHub, TrainingModuleDto } from '@/lib/staff-ops/types';
import type { ChecklistItemDef, ChecklistType } from '@/lib/staff-ops/core';
import { cn } from '@/lib/utils';
import { CollapseItem, CollapseList } from '@/lib/motion';
import { addDays, fmtDateTime, fmtDay, newClientId, sendJson, teamFetch } from './shared';
import { useTeamCopy } from './copy';
import { FormRow, INPUT_CLS, useHubMutation } from './parts';

export function TrainingPanel({ hub }: { hub: TeamHub }) {
  return (
    <div className="space-y-6">
      <ModulesSection hub={hub} />
      <ChecklistsSection hub={hub} />
    </div>
  );
}

// ───────────────────────────── Eğitim ─────────────────────────────

function ModulesSection({ hub }: { hub: TeamHub }) {
  const { copy } = useTeamCopy();
  const c = copy.training;
  const [editing, setEditing] = useState<TrainingModuleDto | 'new' | null>(null);
  const members = useMemo(() => hub.members.filter((x) => x.isActive), [hub.members]);
  const archive = useHubMutation((id: string) => sendJson(`/api/dealer/staff/training/${id}`, 'PATCH', { isActive: false }), { success: c.archived });

  return (
    <SectionCard
      title={c.modulesTitle}
      icon={<BookOpen className="h-4 w-4" aria-hidden />}
      actions={
        <Button size="sm" className="min-h-11" onClick={() => setEditing('new')}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {c.newModule}
        </Button>
      }
    >
      {hub.training.length === 0 ? (
        <EmptyState compact icon={BookOpen} title={c.emptyTitle} description={c.emptyDesc} />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-border">
            <CollapseList>
            {hub.training.map((mod) => {
              const done = mod.completedBy.filter((u) => members.some((x) => x.userId === u)).length;
              return (
                <CollapseItem as="li" key={mod.id}>
                <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-fg">{mod.title}</p>
                    <p className="qx-caption text-fg-muted">
                      {mod.isGlobal ? `${c.global} · ` : ''}
                      {c.completion(done, members.length)}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                      <div className="h-full rounded-full bg-brand" style={{ width: `${members.length ? Math.round((done / members.length) * 100) : 0}%` }} />
                    </div>
                  </div>
                  {!mod.isGlobal && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`${copy.common.edit}: ${mod.title}`} onClick={() => setEditing(mod)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <InlineConfirm
                        size="icon"
                        tone="neutral"
                        confirmLabel={copy.common.archive}
                        aria-label={`${copy.common.archive}: ${mod.title}`}
                        onConfirm={() => archive.mutateAsync(mod.id)}
                      >
                        <Archive className="h-4 w-4" aria-hidden />
                      </InlineConfirm>
                    </div>
                  )}
                </div>
                </CollapseItem>
              );
            })}
            </CollapseList>
          </ul>
          {members.length > 0 && <CompletionMatrix hub={hub} />}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          {editing ? <ModuleForm key={editing === 'new' ? 'new' : editing.id} mod={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function CompletionMatrix({ hub }: { hub: TeamHub }) {
  const { copy } = useTeamCopy();
  const c = copy.training;
  const members = hub.members.filter((x) => x.isActive);
  return (
    <details className="rounded-card border border-subtle">
      <summary className="qx-small min-h-11 cursor-pointer px-4 py-3 font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {c.matrixTitle}
      </summary>
      <div className="overflow-x-auto px-2 pb-3">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">{c.matrixTitle}</caption>
          <thead>
            <tr>
              <th scope="col" className="qx-caption px-2 py-1.5 text-left text-fg-muted">
                {copy.schedule.person}
              </th>
              {hub.training.map((mod) => (
                <th key={mod.id} scope="col" className="qx-caption max-w-[8rem] truncate px-2 py-1.5 text-left text-fg-muted" title={mod.title}>
                  {mod.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((mem) => (
              <tr key={mem.userId} className="border-t border-subtle">
                <th scope="row" className="px-2 py-1.5 text-left font-medium text-fg">
                  {mem.name ?? mem.email}
                </th>
                {hub.training.map((mod) => {
                  const ok = mod.completedBy.includes(mem.userId);
                  return (
                    <td key={mod.id} className="px-2 py-1.5">
                      <span className={cn('inline-flex items-center gap-1', ok ? 'text-success' : 'text-fg-subtle')}>
                        {ok ? <Check className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
                        <span className="sr-only">{ok ? c.matrixDone : c.matrixTodo}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ModuleForm({ mod, onClose }: { mod: TrainingModuleDto | null; onClose: () => void }) {
  const { copy } = useTeamCopy();
  const c = copy.training;
  const detail = useQuery({
    queryKey: ['dealer-team-training', mod?.id],
    queryFn: () => teamFetch<{ title: string; description: string | null; content: string }>(`/api/dealer/staff/training/${mod?.id}`),
    enabled: !!mod,
    staleTime: 30_000,
  });
  if (mod && detail.isLoading) {
    return (
      <div className="grid min-h-40 place-items-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-fg-muted" aria-hidden />
        <span className="sr-only">{copy.common.saving}</span>
      </div>
    );
  }
  if (mod && detail.isError) {
    return <ErrorState description={(detail.error as Error).message} onRetry={() => detail.refetch()} />;
  }
  return <ModuleFormBody mod={mod} initial={detail.data ?? null} onClose={onClose} />;
}

function ModuleFormBody({
  mod,
  initial,
  onClose,
}: {
  mod: TrainingModuleDto | null;
  initial: { title: string; description: string | null; content: string } | null;
  onClose: () => void;
}) {
  const { copy } = useTeamCopy();
  const c = copy.training;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const save = useHubMutation(
    (v: { title: string; description?: string | null; content: string }) =>
      mod ? sendJson(`/api/dealer/staff/training/${mod.id}`, 'PATCH', v) : sendJson('/api/dealer/staff/training', 'POST', { ...v, description: v.description ?? undefined }),
    { success: mod ? c.updated : c.created, onSuccess: onClose }
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;
        save.mutate({ title: title.trim(), description: desc.trim() || null, content: content.trim() });
      }}
    >
      <DialogHeader>
        <DialogTitle>{mod ? `${copy.common.edit}: ${mod.title}` : c.newModule}</DialogTitle>
      </DialogHeader>
      <FormRow label={c.moduleTitle}>
        {({ id }) => <input id={id} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />}
      </FormRow>
      <FormRow label={c.moduleDesc} optional>
        {({ id }) => <input id={id} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} className={INPUT_CLS} />}
      </FormRow>
      <FormRow label={c.content} hint={`${c.contentHint} (${content.length.toLocaleString()}/20.000)`}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            required
            rows={12}
            maxLength={20_000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-describedby={describedBy}
            className={cn(INPUT_CLS, 'py-2 font-mono text-[13px] leading-relaxed')}
          />
        )}
      </FormRow>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
          {copy.common.cancel}
        </Button>
        <Button type="submit" className="min-h-11" disabled={save.isPending || !title.trim() || !content.trim()} aria-busy={save.isPending}>
          {save.isPending ? copy.common.saving : copy.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Kontrol listeleri ─────────────────────────────

function ChecklistsSection({ hub }: { hub: TeamHub }) {
  const { copy, locale } = useTeamCopy();
  const c = copy.training;
  const [editing, setEditing] = useState<ChecklistTemplateDto | 'new' | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(hub.todayYmd, i - 6)), [hub.todayYmd]);
  const archive = useHubMutation((id: string) => sendJson(`/api/dealer/staff/checklists/${id}`, 'PATCH', { isActive: false }), {
    success: c.checklistArchived,
  });

  return (
    <SectionCard
      title={c.checklistsTitle}
      icon={<ListChecks className="h-4 w-4" aria-hidden />}
      actions={
        <Button size="sm" className="min-h-11" onClick={() => setEditing('new')}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {c.newChecklist}
        </Button>
      }
    >
      {hub.checklists.length === 0 ? (
        <EmptyState compact icon={ListChecks} title={c.checklistEmptyTitle} description={c.checklistEmptyDesc} />
      ) : (
        <ul className="divide-y divide-border">
          <CollapseList>
          {hub.checklists.map((t) => {
            const last = t.completions[0];
            return (
              <CollapseItem as="li" key={t.id}>
              <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{t.title}</span>
                    <StatusBadge label={copy.checklistType[t.type]} tone={t.type === 'open' ? 'info' : t.type === 'close' ? 'brand' : 'neutral'} icon={null} size="sm" />
                    <span className="qx-caption text-fg-muted">
                      {t.items.length} · {copy.training.items.toLocaleLowerCase(locale)}
                    </span>
                  </div>
                  <p className="qx-caption text-fg-muted">{last ? c.lastDone(last.name ?? copy.common.unknown, fmtDateTime(last.at, locale)) : c.neverDone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <ol className="flex gap-1" aria-label={c.compliance}>
                    {days.map((d) => {
                      const n = t.completions.filter((x) => x.day === d).length;
                      return (
                        <li key={d} title={c.complianceDay(fmtDay(d, locale), n)}>
                          <span
                            className={cn(
                              'grid h-7 w-7 place-items-center rounded-chip text-[11px] font-semibold',
                              n ? 'bg-success-subtle text-success' : 'bg-surface-muted text-fg-subtle'
                            )}
                          >
                            {n ? <Check className="h-3.5 w-3.5" aria-hidden /> : fmtDay(d, locale, { weekday: 'narrow' })}
                          </span>
                          <span className="sr-only">{c.complianceDay(fmtDay(d, locale), n)}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`${copy.common.edit}: ${t.title}`} onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <InlineConfirm
                      size="icon"
                      tone="neutral"
                      confirmLabel={copy.common.archive}
                      aria-label={`${copy.common.archive}: ${t.title}`}
                      onConfirm={() => archive.mutateAsync(t.id)}
                    >
                      <Archive className="h-4 w-4" aria-hidden />
                    </InlineConfirm>
                  </div>
                </div>
              </div>
              </CollapseItem>
            );
          })}
          </CollapseList>
        </ul>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          {editing ? (
            <ChecklistForm key={editing === 'new' ? 'new' : editing.id} tpl={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function ChecklistForm({ tpl, onClose }: { tpl: ChecklistTemplateDto | null; onClose: () => void }) {
  const { copy } = useTeamCopy();
  const c = copy.training;
  const [title, setTitle] = useState(tpl?.title ?? '');
  const [type, setType] = useState<ChecklistType>(tpl?.type ?? 'open');
  const [items, setItems] = useState<ChecklistItemDef[]>(tpl?.items.length ? tpl.items : [{ id: newClientId('m'), label: '', required: true }]);
  const save = useHubMutation(
    (v: { title: string; type: ChecklistType; items: ChecklistItemDef[] }) =>
      tpl ? sendJson(`/api/dealer/staff/checklists/${tpl.id}`, 'PATCH', v) : sendJson('/api/dealer/staff/checklists', 'POST', v),
    { success: tpl ? c.checklistUpdated : c.checklistCreated, onSuccess: onClose }
  );
  const cleaned = items.map((i) => ({ ...i, label: i.label.trim() })).filter((i) => i.label);
  const move = (idx: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || cleaned.length === 0) return;
        save.mutate({ title: title.trim(), type, items: cleaned.map((i) => ({ ...i, id: i.id.slice(0, 64) })) });
      }}
    >
      <DialogHeader>
        <DialogTitle>{tpl ? `${copy.common.edit}: ${tpl.title}` : c.newChecklist}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <FormRow label={c.moduleTitle}>
          {({ id }) => <input id={id} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />}
        </FormRow>
        <FormRow label={c.type}>
          {({ id }) => (
            <select id={id} value={type} onChange={(e) => setType(e.target.value as ChecklistType)} className={INPUT_CLS}>
              {(['open', 'close', 'custom'] as const).map((tp) => (
                <option key={tp} value={tp}>
                  {copy.checklistType[tp]}
                </option>
              ))}
            </select>
          )}
        </FormRow>
      </div>
      <fieldset className="space-y-2">
        <legend className="qx-small font-medium text-fg">{c.items}</legend>
        <ol className="space-y-2">
          {items.map((it, idx) => (
            <li key={it.id} className="flex items-center gap-1.5">
              <span className="qx-caption qx-num w-5 shrink-0 text-right text-fg-muted">{idx + 1}.</span>
              <input
                aria-label={`${c.items} ${idx + 1}`}
                value={it.label}
                maxLength={200}
                placeholder={c.itemPh}
                onChange={(e) => setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, label: e.target.value } : p)))}
                className={cn(INPUT_CLS, 'flex-1')}
              />
              <label className="qx-caption inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-fg-muted">
                <input
                  type="checkbox"
                  checked={it.required}
                  onChange={(e) => setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, required: e.target.checked } : p)))}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {c.itemRequired}
              </label>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-9" aria-label={`${idx + 1} ↑`} disabled={idx === 0} onClick={() => move(idx, -1)}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-9" aria-label={`${idx + 1} ↓`} disabled={idx === items.length - 1} onClick={() => move(idx, 1)}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-9 text-danger"
                aria-label={`${copy.common.remove}: ${it.label || idx + 1}`}
                disabled={items.length === 1}
                onClick={() => setItems((prev) => prev.filter((p) => p.id !== it.id))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={items.length >= 50}
          onClick={() => setItems((prev) => [...prev, { id: newClientId('m'), label: '', required: true }])}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {c.addItem}
        </Button>
      </fieldset>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
          {copy.common.cancel}
        </Button>
        <Button type="submit" className="min-h-11" disabled={save.isPending || !title.trim() || cleaned.length === 0} aria-busy={save.isPending}>
          {save.isPending ? copy.common.saving : copy.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
