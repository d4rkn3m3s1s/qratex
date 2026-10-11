'use client';

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Timeline } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { useTaskDetail } from '../lib/queries';
import { useTaskActions } from '../lib/use-task-actions';
import { useWorkspace } from '../workspace-context';
import { ReviewStrip } from './review-strip';
import { TaskProperties } from './properties';
import { TaskChecklist } from './checklist';
import { TaskFiles } from './files';
import { TaskComments } from './comments';
import type { TaskDetailPayload } from '../lib/types';
import { useTeamCopy } from '../copy';

/** Detay çekmecesi başlığı (önbellekteki veriden; yüklenirken nötr metin). */
export function TaskDetailTitle({ id }: { id: string }) {
  const tu = useTeamCopy().ui;
  const q = useTaskDetail(id);
  return <>{q.data?.task.title ?? (q.isError ? tu.gorevAcilamadi : tu.gorev)}</>;
}

/**
 * Görev detayı. Geçersiz/erişilemeyen `?task=` artık sonsuz iskelette asılı kalmaz
 * (denetim O7/#60): 404/403 için açıklamalı boş durum gösterilir.
 */
export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const tu = useTeamCopy().ui;
  const q = useTaskDetail(id);
  return (
    <QueryState
      query={q}
      skeleton="detail"
      error={{
        title: tu.gorevAcilamadi,
        description: tu.gorevSilinmisArsivdenKaldirilmis,
        action: (
          <Button variant="outline" onClick={onClose}>
            {tu.panoyaDon}
          </Button>
        ),
      }}
    >
      {(data) => <TaskDetailBody data={data} />}
    </QueryState>
  );
}

function TaskDetailBody({ data }: { data: TaskDetailPayload }) {
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { task, can } = data;
  const { weekKey } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setDesc(task.description ?? ''), [task.description]);
  const editable = can.editFields && !task.archivedAt;

  return (
    <div className="space-y-5">
      {task.archivedAt && (
        <div className="qx-small flex flex-wrap items-center justify-between gap-2 rounded-card border border-subtle bg-surface-2 p-3 text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Archive className="h-4 w-4" aria-hidden /> {tu.buGorevArsivde}
          </span>
          {can.archive && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void actions.archive(task, false)}>
              <ArchiveRestore className="h-4 w-4" aria-hidden /> {tu.arsivdenCikar}
            </Button>
          )}
        </div>
      )}

      {editable && (
        <div>
          <label htmlFor={`t-${task.id}`} className="sr-only">
            {tu.gorevBasligi2}
          </label>
          <Input
            id={`t-${task.id}`}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const v = title.trim();
              if (v && v !== task.title) void actions.update(task.id, { title: v });
              else setTitle(task.title);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setTitle(task.title);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="qx-body h-11 font-semibold"
          />
        </div>
      )}

      <ReviewStrip data={data} />

      <section aria-label={tu.aciklama}>
        {editable && editingDesc ? (
          <div className="space-y-2">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={6} maxLength={8000} aria-label={tu.aciklama} autoFocus />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-9"
                onClick={async () => {
                  if (await actions.update(task.id, { description: desc.trim() || null })) setEditingDesc(false);
                }}
              >
                Kaydet
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setDesc(task.description ?? '');
                  setEditingDesc(false);
                }}
              >
                {tu.vazgec}
              </Button>
            </div>
          </div>
        ) : task.description ? (
          <div className="group relative">
            <p className="qx-body whitespace-pre-wrap break-words text-fg">{task.description}</p>
            {editable && (
              <Button size="sm" variant="ghost" className="mt-1 h-9" onClick={() => setEditingDesc(true)}>
                {tu.aciklamayiDuzenle}
              </Button>
            )}
          </div>
        ) : editable ? (
          <Button size="sm" variant="outline" className="h-9" onClick={() => setEditingDesc(true)}>
            {tu.aciklamaEkle}
          </Button>
        ) : (
          <p className="qx-small text-fg-muted">{tx.noDescription}</p>
        )}
      </section>

      <TaskProperties data={data} />
      <TaskChecklist data={data} />
      <TaskFiles data={data} />

      <details className="group rounded-card border border-subtle">
        <summary className="qx-small flex min-h-11 cursor-pointer items-center justify-between px-3 font-semibold text-fg">
          Geçmiş <span className="qx-caption qx-num font-normal text-fg-muted">{task.activities.length}</span>
        </summary>
        <div className="border-t border-subtle px-3 py-2">
          <Timeline
            dense
            groupByDay
            ariaLabel={tu.gorevGecmisi}
            emptyLabel={tu.kayitYok}
            events={task.activities.map((a) => ({
              id: a.id,
              at: a.createdAt,
              title: a.detail ?? a.action,
              actor: a.actorName,
              tone: a.action.startsWith('system_') ? 'warning' : a.action === 'automation' ? 'info' : a.action === 'status' ? 'brand' : 'neutral',
            }))}
          />
        </div>
      </details>

      <TaskComments data={data} />
    </div>
  );
}
