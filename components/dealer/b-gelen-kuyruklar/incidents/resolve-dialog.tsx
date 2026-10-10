'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { ROOT_CAUSES, requiresResolutionNote, type RootCause } from '@/lib/dealer-queues/incident-catalog';
import { errorMessage } from '../shared/api';
import { useSharedCopy } from '../shared/copy';
import { useIncidentCopy } from './copy';

/**
 * Çözüm diyaloğu: masa sinyali dışındaki vakalarda kısa çözüm notu zorunlu (sunucu da doğrular),
 * kök neden isteğe bağlı. Hata diyaloğu kapatmaz.
 */
export function ResolveDialog({
  open,
  onOpenChange,
  incident,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: { id: string; type: string; title: string } | null;
  onConfirm: (input: { resolutionNote: string | null; rootCause: RootCause | null }) => Promise<unknown>;
}) {
  const copy = useIncidentCopy();
  const shared = useSharedCopy();
  const [note, setNote] = useState('');
  const [rootCause, setRootCause] = useState<RootCause | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const causeId = useId();
  const needsNote = incident ? requiresResolutionNote(incident.type) : true;

  useEffect(() => {
    if (open) {
      setNote('');
      setRootCause(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const canSubmit = !busy && (!needsNote || note.trim().length >= 3);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ resolutionNote: note.trim() || null, rootCause });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, shared.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.resolveTitle}</DialogTitle>
          <DialogDescription>
            {incident ? <span className="block font-medium text-fg">{incident.title}</span> : null}
            {copy.resolveBody}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor={noteId} className="qx-small font-medium text-fg">
              {needsNote ? copy.resolveNote : copy.resolveNoteOptional}
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              required={needsNote}
              aria-required={needsNote}
              className="w-full rounded-control border border-strong bg-surface-1 px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {needsNote ? (
            <div className="space-y-2">
              <p id={causeId} className="qx-small font-medium text-fg">
                {copy.rootCause}
              </p>
              <ChoiceChips
                aria-labelledby={causeId}
                size="sm"
                deselectable
                options={ROOT_CAUSES.map((c) => ({ value: c, label: shared.rootCause[c] }))}
                value={rootCause}
                onChange={(v) => setRootCause(v)}
              />
            </div>
          ) : null}
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {shared.cancel}
            </Button>
            <Button type="submit" className="shadow-none" disabled={!canSubmit} loading={busy}>
              {copy.resolveConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
