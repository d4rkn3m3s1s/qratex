'use client';

import { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import { errorMessage, teamFetch } from '../lib/api';
import { API } from '../lib/queries';
import { useTaskActions } from '../lib/use-task-actions';
import { useWorkspace } from '../workspace-context';
import { displayName } from '../shared';
import type { TaskDetailPayload } from '../lib/types';
import { useTeamCopy } from '../copy';

/**
 * Alt görevler. Her işlem sunucu yanıtıyla doğrulanır (denetim #64: 403 sessizce yutuluyordu);
 * sil düğmesi her zaman görünür (hover yok). AI önerileri TEK istekte, sıralı eklenir
 * (denetim #66: N paralel istek aynı sıra numarasını üretiyordu).
 */
export function TaskChecklist({ data }: { data: TaskDetailPayload }) {
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { task, can } = data;
  const { members, can: caps, weekKey } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const editable = can.editChecklist && !task.archivedAt;
  const done = task.checklist.filter((c) => c.done).length;
  const total = task.checklist.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const act = async (body: Record<string, unknown>) => {
    try {
      await actions.act(task.id, body);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  const suggest = async () => {
    setAiBusy(true);
    try {
      const res = await teamFetch<{ items: string[] }>(`${API}/ai`, {
        method: 'POST',
        json: { op: 'suggest_checklist', title: task.title, description: task.description ?? '' },
      });
      if (res.items.length === 0) {
        toast(tu.aiBuGorevIcin);
        return;
      }
      if (await act({ op: 'add_checklist_many', items: res.items })) toast.success(tf.subtasksAdded(res.items.length));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAiBusy(false);
    }
  };

  if (!editable && total === 0) return null;

  return (
    <section aria-labelledby={`cl-${task.id}`} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`cl-${task.id}`} className="qx-small font-semibold text-fg">
          {tf.subtasksTitle}{' '}
          {total > 0 && (
            <span className="qx-num font-normal text-fg-muted">
              {done}/{total}
            </span>
          )}
        </h3>
        {editable && caps.aiAssist && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5" disabled={aiBusy} onClick={suggest}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> {aiBusy ? tu.oneriliyor : tu.aiIleOner}
          </Button>
        )}
      </div>
      {total > 0 && <Progress value={pct} aria-label={tf.subtaskProgress(pct)} className="h-1.5" />}
      <ul className="space-y-1">
        {task.checklist.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-surface-2">
            <Checkbox
              id={`ci-${c.id}`}
              checked={c.done}
              disabled={!editable}
              onCheckedChange={(v) => void act({ op: 'toggle_checklist', itemId: c.id, done: v === true })}
              className="h-5 w-5"
            />
            <label htmlFor={`ci-${c.id}`} className={cn('qx-small min-w-0 flex-1 break-words', c.done ? 'text-fg-muted line-through' : 'text-fg')}>
              {c.text}
              {c.dueDay && <span className="qx-caption ml-1.5 text-fg-muted">· {c.dueDay}</span>}
            </label>
            {editable && caps.editAnyTask ? (
              <Select
                value={c.assignedTo?.id ?? '__none'}
                onValueChange={(v) => void act({ op: 'update_checklist', itemId: c.id, assignedToId: v === '__none' ? null : v })}
              >
                <SelectTrigger className="h-8 w-32 shrink-0" aria-label={tf.assignSubtask(c.text)}>
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
            ) : c.assignedTo ? (
              <span className="qx-caption shrink-0 text-fg-muted">{displayName(c.assignedTo)}</span>
            ) : null}
            {editable && (
              <IconButton aria-label={tf.deleteSubtask(c.text)} icon={<Trash2 />} size="sm" variant="ghost" onClick={() => void act({ op: 'delete_checklist', itemId: c.id })} />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = text.trim();
            if (!v) return;
            setBusy(true);
            if (await act({ op: 'add_checklist', text: v })) setText('');
            setBusy(false);
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={tu.altGorevEkle} aria-label={tu.yeniAltGorev} maxLength={300} className="h-10" />
          <Button type="submit" variant="outline" className="h-10 gap-1.5" disabled={busy || !text.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> Ekle
          </Button>
        </form>
      )}
    </section>
  );
}
