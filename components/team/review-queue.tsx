'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Paperclip, MessageSquare, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { relativeTeamTime } from '@/lib/team/dates';
import { useTasks } from './lib/queries';
import { useTaskActions } from './lib/use-task-actions';
import { useWorkspace } from './workspace-context';
import { NoteDialog } from './note-dialog';
import { DueBadge, MemberAvatar, displayName } from './shared';
import { TaskDetail } from './task-detail/task-detail';
import type { TaskDto } from './lib/types';
import { useTeamCopy } from './copy';

/**
 * Onay kuyruğu (yönetici) — tüm haftalardan "Onayda" bekleyenler, en eski gönderim önce
 * (denetim vizyonu "Onay kuyruğu", eksik özellik "Onay kuyruğu ve SLA"). Masaüstünde sol liste
 * + sağda kanıtla birlikte detay; klavye: J/K gez, A onayla, R revizyon iste.
 */
export function ReviewQueue() {
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const { openTask, weekKey } = useWorkspace();
  const q = useTasks({ view: 'review' });
  const actions = useTaskActions({ onProofRequired: openTask, weekKey });
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<TaskDto | null>(null);
  const active = items.find((t) => t.id === activeId) ?? items[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('[role="dialog"]'))) return;
      const idx = items.findIndex((t) => t.id === active.id);
      if (e.key === 'j' || e.key === 'J') setActiveId(items[Math.min(items.length - 1, idx + 1)]?.id ?? null);
      else if (e.key === 'k' || e.key === 'K') setActiveId(items[Math.max(0, idx - 1)]?.id ?? null);
      else if (e.key === 'a' || e.key === 'A') void actions.move(active, 'done');
      else if (e.key === 'r' || e.key === 'R') setRejecting(active);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, items, actions]);

  return (
    <QueryState
      query={q}
      skeleton="list"
      isEmpty={(d) => d.items.length === 0}
      empty={{ variant: 'default', title: tu.onayBekleyenGorevYok, description: tu.uyelerBirGoreviOnaya }}
    >
      {() => (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <p className="qx-caption text-fg-muted">
              {tf.reviewWaiting(items.length)} <kbd className="rounded border border-subtle px-1">J</kbd>/<kbd className="rounded border border-subtle px-1">K</kbd> {tf.kbNav}{' '}
              <kbd className="rounded border border-subtle px-1">A</kbd> {tf.kbApprove} <kbd className="rounded border border-subtle px-1">R</kbd> {tf.kbRevise}
            </p>
            <ul className="space-y-2" aria-label={tu.onayKuyrugu}>
              {items.map((t) => {
                const selected = active?.id === t.id;
                return (
                  <li key={t.id}>
                    <div
                      className={cn(
                        'rounded-card border bg-surface-1 p-3 transition-colors duration-fast',
                        selected ? 'border-brand ring-1 ring-brand' : 'border-subtle hover:border-strong'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveId(t.id)}
                        aria-current={selected ? 'true' : undefined}
                        className="w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="qx-small line-clamp-2 font-semibold text-fg">{t.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <MemberAvatar user={t.assignedTo} size="xs" />
                          <span className="qx-caption text-fg-muted">{displayName(t.assignedTo)}</span>
                          {t.submittedForReviewAt && <span className="qx-caption text-fg-muted">· {relativeTeamTime(t.submittedForReviewAt)}</span>}
                        </span>
                        <span className="qx-caption mt-1 flex items-center gap-2 text-fg-muted">
                          <span className="inline-flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" aria-hidden /> {t._count.comments} not
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <Paperclip className="h-3 w-3" aria-hidden /> {t._count.attachments} dosya
                          </span>
                          <DueBadge dueAt={t.dueAt} done={false} />
                        </span>
                      </button>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" className="h-9 gap-1.5" onClick={() => void actions.move(t, 'done')}>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Onayla
                        </Button>
                        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setRejecting(t)}>
                          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Revizyon
                        </Button>
                        <Button size="sm" variant="ghost" className="h-9 gap-1.5 lg:hidden" onClick={() => openTask(t.id)}>
                          <Eye className="h-3.5 w-3.5" aria-hidden /> {tu.incele}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="hidden min-w-0 rounded-card border border-subtle bg-surface-1 p-card lg:block">
            {active ? <TaskDetail key={active.id} id={active.id} onClose={() => setActiveId(null)} /> : null}
          </div>
          <NoteDialog
            open={!!rejecting}
            onOpenChange={(o) => !o && setRejecting(null)}
            title={tu.revizyonIste}
            description={rejecting ? tf.sendBackGeneric(rejecting.title) : undefined}
            label={tu.neDuzeltilmeli}
            quickNotes={[tu.kanitYetersiz, tu.eksikAltGorevVar, tu.aciklamadakiKapsamKarsilanmadi]}
            confirmLabel={tu.revizyonaGonder}
            onConfirm={async (note) => {
              if (rejecting) await actions.move(rejecting, 'in_progress', note);
            }}
          />
        </div>
      )}
    </QueryState>
  );
}
