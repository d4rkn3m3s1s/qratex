'use client';

import { useState } from 'react';
import { CheckCircle2, Clock3, Play, RotateCcw, Send, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import { formatTeamDateTime, relativeTeamTime } from '@/lib/team/dates';
import { useTaskActions } from '../lib/use-task-actions';
import { NoteDialog } from '../note-dialog';
import { useWorkspace } from '../workspace-context';
import type { TaskDetailPayload } from '../lib/types';
import { useTeamCopy } from '../copy';

/**
 * Onay durumu şeridi + birincil aksiyon (denetim O6/Bulgu 16/#73/#74): red notu ve onay geçmişi
 * hiçbir yerde görünmüyordu; kanıt eksikse açılan panelde "Onaya gönder" yoktu. Kanıt canlı
 * gösterilir ("1 not · 0 dosya").
 */
export function ReviewStrip({ data }: { data: TaskDetailPayload }) {
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { task, proof, can } = data;
  const { weekKey } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const archived = !!task.archivedAt;
  const proofText = `${proof.notes} not · ${proof.files} dosya`;

  let tone: 'info' | 'warning' | 'success' | 'neutral' = 'neutral';
  let icon = <Clock3 className="h-4 w-4" aria-hidden />;
  let title = '';
  let body: React.ReactNode = null;
  let actionsNode: React.ReactNode = null;

  if (task.status === 'review') {
    tone = 'info';
    title = `Onay bekliyor${task.submittedForReviewAt ? ` · ${relativeTeamTime(task.submittedForReviewAt)}` : ''}`;
    body = <span className="qx-small">{tf.proof} {proofText}</span>;
    if (can.approve && !archived) {
      actionsNode = (
        <>
          <Button size="sm" className="h-9 gap-1.5" disabled={busy || !proof.ok} onClick={() => run(() => actions.move(task, 'done'))}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Onayla
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => setRejectOpen(true)}>
            <Undo2 className="h-4 w-4" aria-hidden /> Revizyon iste
          </Button>
        </>
      );
    } else if (can.move && !archived) {
      actionsNode = (
        <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => run(() => actions.move(task, 'in_progress'))}>
          <Undo2 className="h-4 w-4" aria-hidden /> {tu.onaydanGeriCek}
        </Button>
      );
    }
  } else if (task.status === 'done') {
    tone = 'success';
    icon = <CheckCircle2 className="h-4 w-4" aria-hidden />;
    title = task.approvedAt
      ? tf.approvedLine(task.approvedBy?.name ?? tf.approvedBySystem, formatTeamDateTime(task.approvedAt))
      : tu.tamamlandi;
    body = task.reviewNote ? <span className="qx-small">Not: {task.reviewNote}</span> : null;
    if (can.approve && !archived) {
      actionsNode = (
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setReopenOpen(true)}>
          <RotateCcw className="h-4 w-4" aria-hidden /> {tu.yenidenAc2}
        </Button>
      );
    }
  } else {
    const revision = !!task.reviewNote && !task.submittedForReviewAt && !task.approvedAt;
    if (revision) {
      tone = 'warning';
      icon = <Undo2 className="h-4 w-4" aria-hidden />;
      title = 'Revizyon istendi';
      body = <span className="qx-small whitespace-pre-wrap">{task.reviewNote}</span>;
    } else if (can.move) {
      title = task.status === 'todo' ? tu.henuzBaslanmadi : 'Devam ediyor';
      body = <span className="qx-small">{tf.proofNeeded} {proofText}</span>;
    }
    if (can.move && !archived) {
      actionsNode = (
        <>
          {task.status === 'todo' && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={busy} onClick={() => run(() => actions.move(task, 'in_progress'))}>
              <Play className="h-4 w-4" aria-hidden /> {tu.basla}
            </Button>
          )}
          <Button
            size="sm"
            className="h-9 gap-1.5"
            disabled={busy || !proof.ok}
            title={proof.ok ? undefined : tu.onceAsagiyaNeYaptigini}
            onClick={() => run(() => actions.move(task, 'review'))}
          >
            <Send className="h-4 w-4" aria-hidden /> {revision ? tu.duzelttimOnayaGonder : tu.onayaGonder}
          </Button>
        </>
      );
    }
  }

  if (!title && !actionsNode) return null;

  return (
    <section aria-label={tu.onayDurumu} className={cn('rounded-card border p-3', TONE_CALLOUT[tone])}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 space-y-1">
          {title && <p className="qx-small font-semibold">{title}</p>}
          {body}
          {!proof.ok && (task.status === 'todo' || task.status === 'in_progress') && can.move && (
            <p className="qx-caption text-fg-muted">{tx.reviewHint}</p>
          )}
        </div>
      </div>
      {actionsNode && <div className="mt-2 flex flex-wrap gap-2 pl-6">{actionsNode}</div>}
      <NoteDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={tu.revizyonIste}
        description={tu.gorevDuzeltmeIcinAtanan}
        label={tu.neDuzeltilmeli}
        quickNotes={[tu.kanitYetersiz, tu.eksikAltGorevVar, tu.aciklamadakiKapsamKarsilanmadi]}
        confirmLabel={tu.revizyonaGonder}
        onConfirm={(note) => actions.move(task, 'in_progress', note)}
      />
      <NoteDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={tu.goreviYenidenAc}
        description={tu.onayDamgasiKaldirilirVe}
        label={tu.gerekce}
        required
        confirmLabel={tu.yenidenAc2}
        onConfirm={(note) => actions.move(task, 'in_progress', note)}
      />
    </section>
  );
}
