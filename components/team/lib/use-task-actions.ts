'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { announce } from '@/components/ds/a11y';
import { STATUS_META, isTaskStatus, type TaskStatus } from '@/lib/team/constants';
import { TeamApiError, errorMessage, teamFetch } from './api';
import { API, invalidateTasks, teamKeys } from './queries';
import type { TaskDetailPayload, TaskDto, TaskList } from './types';

type Patch = Partial<Pick<TaskDto, 'status' | 'archivedAt'>>;

/**
 * Görev mutasyonları — iyimser güncelleme + hata halinde geri alma + sunucu mesajı
 * (denetim O1/Bulgu 18). "Sil" geri alınabilir arşivdir (5 sn "Geri al"; denetim D4/Bulgu 2).
 */
export function useTaskActions(opts: { onProofRequired?: (taskId: string) => void; weekKey?: string } = {}) {
  const qc = useQueryClient();

  const patchCaches = useCallback(
    (taskId: string, patch: Patch | null) => {
      const snapshots = qc.getQueriesData<TaskList>({ queryKey: ['team', 'tasks'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<TaskList>(key, {
          ...data,
          items: patch === null ? data.items.filter((t) => t.id !== taskId) : data.items.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
        });
      }
      return () => {
        for (const [key, data] of snapshots) qc.setQueryData(key, data);
      };
    },
    [qc]
  );

  const move = useCallback(
    async (task: Pick<TaskDto, 'id' | 'title' | 'status'>, to: TaskStatus, note?: string | null) => {
      if (task.status === to) return true;
      const rollback = patchCaches(task.id, { status: to });
      try {
        await teamFetch(`${API}/tasks?id=${encodeURIComponent(task.id)}`, { method: 'PUT', json: { status: to, note: note ?? undefined } });
        const label = isTaskStatus(to) ? STATUS_META[to].label : to;
        if (to === 'review') toast.success('Onaya gönderildi', { description: task.title });
        else if (to === 'done') toast.success('Onaylandı', { description: task.title });
        else if (task.status === 'review' && to === 'in_progress') toast('Revizyon istendi', { description: task.title });
        else toast.success(`Durum: ${label}`, { description: task.title });
        announce(`${task.title}: ${label}`);
        invalidateTasks(qc, task.id);
        return true;
      } catch (err) {
        rollback();
        if (err instanceof TeamApiError && err.code === 'PROOF_REQUIRED') {
          toast.error(err.message, { description: 'Görevi açıp not ya da dosya ekleyebilirsin.' });
          opts.onProofRequired?.(task.id);
        } else {
          toast.error(errorMessage(err));
        }
        return false;
      }
    },
    [patchCaches, qc, opts]
  );

  const update = useCallback(
    async (taskId: string, fields: Record<string, unknown>, success?: string) => {
      try {
        await teamFetch(`${API}/tasks?id=${encodeURIComponent(taskId)}`, { method: 'PUT', json: fields });
        if (success) toast.success(success);
        invalidateTasks(qc, taskId);
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        invalidateTasks(qc, taskId);
        return false;
      }
    },
    [qc]
  );

  const archive = useCallback(
    async (task: Pick<TaskDto, 'id' | 'title'>, archived: boolean) => {
      const rollback = patchCaches(task.id, null);
      try {
        await teamFetch(`${API}/tasks?id=${encodeURIComponent(task.id)}`, { method: 'PUT', json: { archived } });
        invalidateTasks(qc, task.id);
        toast.success(archived ? 'Görev arşivlendi' : 'Görev arşivden çıkarıldı', {
          description: task.title,
          duration: 6000,
          action: {
            label: 'Geri al',
            onClick: () => {
              void teamFetch(`${API}/tasks?id=${encodeURIComponent(task.id)}`, { method: 'PUT', json: { archived: !archived } })
                .then(() => invalidateTasks(qc, task.id))
                .catch((e) => toast.error(errorMessage(e)));
            },
          },
        });
        return true;
      } catch (err) {
        rollback();
        toast.error(errorMessage(err));
        return false;
      }
    },
    [patchCaches, qc]
  );

  const duplicate = useCallback(
    async (task: Pick<TaskDto, 'id' | 'title'>) => {
      try {
        await teamFetch(`${API}/tasks/${encodeURIComponent(task.id)}/duplicate`, { method: 'POST', json: { weekKey: opts.weekKey } });
        toast.success('Görev kopyalandı', { description: task.title });
        invalidateTasks(qc);
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        return false;
      }
    },
    [qc, opts.weekKey]
  );

  const hardDelete = useCallback(
    async (task: Pick<TaskDto, 'id' | 'title'>) => {
      await teamFetch(`${API}/tasks?id=${encodeURIComponent(task.id)}`, { method: 'DELETE' });
      patchCaches(task.id, null);
      qc.removeQueries({ queryKey: teamKeys.task(task.id) });
      invalidateTasks(qc);
      toast.success('Görev kalıcı olarak silindi', { description: task.title });
    },
    [patchCaches, qc]
  );

  /** Detay alt işlemi — yanıt güncel detaydır; önbelleğe doğrudan yazılır. */
  const act = useCallback(
    async (taskId: string, body: Record<string, unknown>) => {
      const data = await teamFetch<TaskDetailPayload>(`${API}/tasks/${encodeURIComponent(taskId)}`, { method: 'POST', json: body });
      qc.setQueryData(teamKeys.task(taskId), data);
      void qc.invalidateQueries({ queryKey: ['team', 'tasks'] });
      return data;
    },
    [qc]
  );

  return { move, update, archive, duplicate, hardDelete, act };
}
