'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import {
  INCIDENT_DESCRIPTION_MAX,
  INCIDENT_SEVERITIES,
  INCIDENT_TITLE_MAX,
  INCIDENT_TYPES,
  incidentTypeDef,
  type IncidentSeverity,
} from '@/lib/dealer-queues/incident-catalog';
import type { AssigneeDto, IncidentDetail } from '@/lib/dealer-queues/types';
import { errorMessage, sendJson } from '../shared/api';
import { useQueueLocale, useSharedCopy } from '../shared/copy';
import { AssigneeSelect, DueDateInput, Field } from '../shared/ui';
import { useIncidentCopy } from './copy';

const MANUAL = INCIDENT_TYPES.filter((t) => t.manual);

/** Elle vaka aç: <form> (Enter ile gönderilir), etiketli alanlar, sunucu doğrulamasıyla aynı sınırlar. */
export function CreateIncidentDialog({
  open,
  onOpenChange,
  assignees,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignees: AssigneeDto[] | undefined;
  onCreated: (detail: IncidentDetail) => void;
}) {
  const copy = useIncidentCopy();
  const shared = useSharedCopy();
  const locale = useQueueLocale();
  const ids = { type: useId(), severity: useId(), title: useId(), description: useId(), assignee: useId(), due: useId() };
  const [type, setType] = useState<string>('manual_service');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [touchedSeverity, setTouchedSeverity] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType('manual_service');
      setSeverity('medium');
      setTouchedSeverity(false);
      setTitle('');
      setDescription('');
      setAssignee(null);
      setDue(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // Önem, kullanıcı değiştirmediyse türün varsayılanını izler (ör. güvenlik → kritik).
  useEffect(() => {
    if (!touchedSeverity) setSeverity(incidentTypeDef(type).defaultSeverity);
  }, [type, touchedSeverity]);

  const canSubmit = !busy && title.trim().length >= 3;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await sendJson<IncidentDetail>('/api/dealer/queues/incidents', 'POST', {
        type,
        severity,
        title: title.trim(),
        description: description.trim() || null,
        assignedToId: assignee,
        dueAt: due,
      });
      onCreated(detail);
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
          <DialogTitle>{copy.createTitle}</DialogTitle>
          <DialogDescription>{copy.createBody}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <p id={ids.type} className="qx-small font-medium text-fg">
              {copy.typeLabel}
            </p>
            <ChoiceChips
              aria-labelledby={ids.type}
              size="sm"
              options={MANUAL.map((t) => ({ value: t.code, label: t.label[locale] }))}
              value={type}
              onChange={(v) => v && setType(v)}
              required
            />
          </div>
          <div className="space-y-2">
            <p id={ids.severity} className="qx-small font-medium text-fg">
              {copy.severityLabel}
            </p>
            <ChoiceChips
              aria-labelledby={ids.severity}
              size="sm"
              options={INCIDENT_SEVERITIES.map((s) => ({ value: s, label: shared.severity[s] }))}
              value={severity}
              onChange={(v) => {
                if (!v) return;
                setTouchedSeverity(true);
                setSeverity(v);
              }}
              required
            />
          </div>
          <Field label={copy.titleLabel} htmlFor={ids.title} hint={`${title.length}/${INCIDENT_TITLE_MAX}`}>
            <input
              id={ids.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={INCIDENT_TITLE_MAX}
              required
              minLength={3}
              autoComplete="off"
              className="h-11 w-full rounded-control border border-strong bg-surface-1 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label={copy.descriptionLabel} htmlFor={ids.description}>
            <textarea
              id={ids.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={INCIDENT_DESCRIPTION_MAX}
              rows={3}
              className="w-full rounded-control border border-strong bg-surface-1 px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={shared.assignee} htmlFor={ids.assignee}>
              <AssigneeSelect id={ids.assignee} value={assignee} onChange={setAssignee} assignees={assignees} />
            </Field>
            <Field label={shared.dueAt} htmlFor={ids.due} hint={copy.dueHint}>
              <DueDateInput id={ids.due} value={due} onChange={setDue} />
            </Field>
          </div>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {shared.cancel}
            </Button>
            <Button type="submit" className="shadow-none" disabled={!canSubmit} loading={busy}>
              {copy.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
