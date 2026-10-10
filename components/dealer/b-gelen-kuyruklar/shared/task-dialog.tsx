'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { TASK_PRIORITIES, TASK_TEXT_MAX, type TaskPriority } from '@/lib/dealer-queues/work-core';
import type { AssigneeDto } from '@/lib/dealer-queues/types';
import { errorMessage } from './api';
import { useSharedCopy } from './copy';
import { AssigneeSelect, DueDateInput, Field } from './ui';

export interface TaskDialogPayload {
  text: string;
  priority: TaskPriority;
  assignedToId: string | null;
  dueAt: string | null;
}

/**
 * Görev formu (yeni görev, öneriden görev, vakadan görev). <form> → Enter ile gönderilir;
 * hata diyaloğu kapatmaz.
 */
export function TaskDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  textLabel,
  defaultText = '',
  defaultPriority = 'medium',
  showPriority = true,
  assignees,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  textLabel: string;
  defaultText?: string;
  defaultPriority?: TaskPriority;
  showPriority?: boolean;
  assignees: AssigneeDto[] | undefined;
  onSubmit: (payload: TaskDialogPayload) => Promise<unknown>;
}) {
  const shared = useSharedCopy();
  const ids = { text: useId(), priority: useId(), assignee: useId(), due: useId() };
  const [text, setText] = useState(defaultText);
  const [priority, setPriority] = useState<TaskPriority>(defaultPriority);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(defaultText);
      setPriority(defaultPriority);
      setAssignee(null);
      setDue(null);
      setError(null);
      setBusy(false);
    }
  }, [open, defaultText, defaultPriority]);

  const canSubmit = !busy && text.trim().length >= 3;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ text: text.trim(), priority, assignedToId: assignee, dueAt: due });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, shared.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label={textLabel} htmlFor={ids.text} hint={`${text.length}/${TASK_TEXT_MAX}`}>
            <textarea
              id={ids.text}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={TASK_TEXT_MAX}
              rows={3}
              required
              minLength={3}
              className="w-full rounded-control border border-strong bg-surface-1 px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          {showPriority ? (
            <div className="space-y-2">
              <p id={ids.priority} className="qx-small font-medium text-fg">
                {shared.priorityLabel}
              </p>
              <ChoiceChips
                aria-labelledby={ids.priority}
                size="sm"
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: shared.priority[p] }))}
                value={priority}
                onChange={(v) => v && setPriority(v)}
                required
              />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shared.assignee} htmlFor={ids.assignee}>
              <AssigneeSelect id={ids.assignee} value={assignee} onChange={setAssignee} assignees={assignees} />
            </Field>
            <Field label={shared.dueAt} htmlFor={ids.due}>
              <DueDateInput id={ids.due} value={due} onChange={setDue} />
            </Field>
          </div>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {shared.cancel}
            </Button>
            <Button type="submit" className="shadow-none" disabled={!canSubmit} loading={busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
