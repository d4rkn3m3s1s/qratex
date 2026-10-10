'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EyeOff, Lightbulb, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeverityBadge } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import type { AssigneeDto, TaskDetail, TaskSuggestion } from '@/lib/dealer-queues/types';
import type { TaskPriority } from '@/lib/dealer-queues/work-core';
import { errorMessage, fetchJson, queueKeys, sendJson } from '../shared/api';
import { useSharedCopy } from '../shared/copy';
import { TaskDialog } from '../shared/task-dialog';
import { RelTime } from '../shared/ui';
import { useAssignedCopy } from './copy';

type SuggestionData = { items: TaskSuggestion[] };

/**
 * Önerilen işler: olumsuz yorumların AI önerileri (sunucuda birleştirilmiş, kanıt sayılı).
 * GET'te LLM yok; "Göreve çevir" gerçek görev oluşturur, "Gizle" kalıcıdır.
 */
export function SuggestionsPanel({ assignees, onCreated }: { assignees: AssigneeDto[] | undefined; onCreated: (d: TaskDetail) => void }) {
  const copy = useAssignedCopy();
  const shared = useSharedCopy();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queueKeys.suggestions,
    queryFn: ({ signal }) => fetchJson<SuggestionData>('/api/dealer/queues/work/suggestions', { signal }),
    staleTime: 60_000,
  });
  const [accepting, setAccepting] = useState<TaskSuggestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const drop = (key: string) =>
    qc.setQueryData<SuggestionData>(queueKeys.suggestions, (old) => (old ? { items: old.items.filter((i) => i.key !== key) } : old));

  const dismiss = async (s: TaskSuggestion) => {
    setBusy(s.key);
    try {
      await sendJson('/api/dealer/queues/work/suggestions', 'POST', { key: s.key });
      drop(s.key);
      toast.success(copy.suggestions.dismissed);
      announce(copy.suggestions.dismissed);
    } catch (err) {
      toast.error(errorMessage(err, shared.failed));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="suggestions-title" className="space-y-3 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1">
      <div className="space-y-1">
        <h3 id="suggestions-title" className="qx-body flex items-center gap-2 font-semibold text-fg">
          <Lightbulb aria-hidden className="h-4 w-4 text-brand" />
          {copy.suggestions.title}
        </h3>
        <p className="qx-small text-fg-muted">{copy.suggestions.description}</p>
      </div>
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: copy.suggestions.empty, description: null }}>
        {(d) => (
          <ul className="space-y-2">
            {d.items.slice(0, 6).map((s) => (
              <li key={s.key} className="space-y-2 rounded-control border border-subtle bg-surface-2 p-3">
                <p className="qx-small break-words text-fg">{s.text}</p>
                <div className="qx-caption flex flex-wrap items-center gap-2 text-fg-muted">
                  <SeverityBadge severity={s.priority} size="sm" label={shared.priority[s.priority]} />
                  <span>{copy.suggestions.evidence(s.evidence)}</span>
                  <RelTime iso={s.lastSeenAt} />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy !== null}
                    loading={busy === s.key}
                    onClick={() => void dismiss(s)}
                    aria-label={copy.suggestions.dismissFor(s.text)}
                  >
                    <EyeOff aria-hidden className="mr-1 h-4 w-4" />
                    {copy.suggestions.dismiss}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 shadow-none"
                    disabled={busy !== null}
                    onClick={() => setAccepting(s)}
                    aria-label={copy.suggestions.acceptFor(s.text)}
                  >
                    <ListPlus aria-hidden className="mr-1 h-4 w-4" />
                    {copy.suggestions.accept}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <TaskDialog
        open={accepting !== null}
        onOpenChange={(o) => (!o ? setAccepting(null) : undefined)}
        title={copy.suggestions.acceptTitle}
        submitLabel={copy.create}
        textLabel={copy.taskText}
        defaultText={accepting?.text ?? ''}
        defaultPriority={(accepting?.priority === 'critical' ? 'high' : (accepting?.priority ?? 'medium')) as TaskPriority}
        assignees={assignees}
        onSubmit={async (p) => {
          if (!accepting) return;
          const key = accepting.key;
          const detail = await sendJson<TaskDetail>('/api/dealer/queues/tasks', 'POST', { ...p, feedbackId: accepting.feedbackIds[0] ?? null });
          // Göreve çevrilen öneri bir daha önerilmesin (kalıcı gizleme; başarısızsa yalnız listeden düşer).
          await sendJson('/api/dealer/queues/work/suggestions', 'POST', { key }).catch(() => null);
          drop(key);
          toast.success(copy.suggestions.accepted);
          announce(copy.suggestions.accepted);
          onCreated(detail);
        }}
      />
    </section>
  );
}
