'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowRightLeft, Copy, ExternalLink, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ds/a11y';
import { ConfirmAction } from '@/components/states';
import { STATUS_META, type TaskStatus } from '@/lib/team/constants';
import { moveTargetsFor } from '@/lib/team/permissions';
import { useWorkspace } from '../workspace-context';
import { useTaskActions } from '../lib/use-task-actions';
import { NoteDialog } from '../note-dialog';
import { STATUS_ICON } from '../shared';
import type { TaskDto } from '../lib/types';

/**
 * Kart menüsü — her ekranda ve klavyeyle erişilir ("Taşı" artık yalnız mobilde değil; denetim
 * Y7/Bulgu 14: kopyala/arşivle/sil yalnız hover ile görünüyordu, masaüstünde klavye taşıması yoktu).
 */
export function TaskMenu({ task, onProofRequired }: { task: TaskDto; onProofRequired?: (id: string) => void }) {
  const { teamViewer, can, openTask, weekKey } = useWorkspace();
  const actions = useTaskActions({ onProofRequired, weekKey });
  const [reopenOpen, setReopenOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const targets = moveTargetsFor(teamViewer, task).filter((s) => !(task.status === 'done' && s !== 'done'));
  const archived = !!task.archivedAt;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label={`${task.title} için işlemler`} icon={<MoreHorizontal />} size="sm" data-row-click-ignore onClick={(e) => e.stopPropagation()} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="truncate">{task.title}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => openTask(task.id)}>
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden /> Aç
          </DropdownMenuItem>
          {!archived && targets.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden /> Taşı
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {targets.map((s) => {
                  const Icon = STATUS_ICON[s];
                  return (
                    <DropdownMenuItem
                      key={s}
                      onSelect={() => {
                        if (task.status === 'review' && s === 'in_progress' && can.approve) setRejectOpen(true);
                        else void actions.move(task, s as TaskStatus);
                      }}
                    >
                      <Icon className="mr-2 h-4 w-4" aria-hidden /> {STATUS_META[s].label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {!archived && task.status === 'done' && can.approve && (
            <DropdownMenuItem onSelect={() => setReopenOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Yeniden aç…
            </DropdownMenuItem>
          )}
          {can.editAnyTask && (
            <>
              <DropdownMenuSeparator />
              {!archived && (
                <DropdownMenuItem onSelect={() => void actions.duplicate(task)}>
                  <Copy className="mr-2 h-4 w-4" aria-hidden /> Kopyala
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void actions.archive(task, !archived)}>
                {archived ? <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden /> : <Archive className="mr-2 h-4 w-4" aria-hidden />}
                {archived ? 'Arşivden çıkar' : 'Arşivle'}
              </DropdownMenuItem>
              {archived && can.hardDelete && (
                <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Kalıcı olarak sil…
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NoteDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Revizyon iste"
        description={`"${task.title}" görevi düzeltme için üyeye geri döner.`}
        label="Ne düzeltilmeli?"
        quickNotes={['Kanıt yetersiz', 'Eksik alt görev var', 'Açıklamadaki kapsam karşılanmadı']}
        confirmLabel="Revizyona gönder"
        onConfirm={(note) => actions.move(task, 'in_progress', note)}
      />
      <NoteDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Görevi yeniden aç"
        description="Onaylanmış görev Devam ediyor durumuna döner ve onay damgası kaldırılır."
        label="Gerekçe"
        required
        confirmLabel="Yeniden aç"
        onConfirm={(note) => actions.move(task, 'in_progress', note)}
      />
      <ConfirmAction
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Görev kalıcı olarak silinsin mi?"
        description="Yorumlar, alt görevler, dosyalar ve geçmiş de silinir."
        impact={[
          { label: 'Yorum', value: task._count.comments },
          { label: 'Dosya', value: task._count.attachments, emphasis: task._count.attachments > 0 },
          { label: 'Alt görev', value: task._count.checklist },
        ]}
        confirmLabel="Kalıcı olarak sil"
        onConfirm={() => actions.hardDelete(task)}
      />
    </>
  );
}
