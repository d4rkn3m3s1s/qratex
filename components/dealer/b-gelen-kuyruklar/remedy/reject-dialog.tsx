'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { REMEDY_REJECT_REASONS, type RemedyRejectReason } from '@/lib/dealer-queues/remedy-core';
import { useSharedCopy } from '../shared/copy';
import { errorMessage } from '../shared/api';
import { useRemedyCopy } from './copy';

/**
 * Red diyaloğu: neden ZORUNLU (otomasyonun öğrenmesi ve bayinin kendi raporu için), not
 * isteğe bağlı. Hata diyaloğu kapatmaz (sessiz "olmuş gibi" yok).
 */
export function RejectDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onConfirm: (input: { reason: RemedyRejectReason; note: string | null }) => Promise<unknown>;
}) {
  const copy = useRemedyCopy();
  const shared = useSharedCopy();
  const [reason, setReason] = useState<RemedyRejectReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();
  const reasonLabelId = useId();

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason, note: note.trim() || null });
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
          <DialogTitle>{title ?? copy.rejectTitle}</DialogTitle>
          <DialogDescription>{copy.rejectBody}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <p id={reasonLabelId} className="qx-small font-medium text-fg">
              {copy.rejectReasonLabel}
            </p>
            <ChoiceChips
              aria-labelledby={reasonLabelId}
              options={REMEDY_REJECT_REASONS.map((r) => ({ value: r, label: copy.rejectReason[r] }))}
              value={reason}
              onChange={(v) => setReason(v)}
              size="sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={noteId} className="qx-small font-medium text-fg">
              {copy.rejectNoteLabel}
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full rounded-control border border-strong bg-surface-1 px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {shared.cancel}
            </Button>
            <Button type="submit" variant="destructive" disabled={!reason || busy} loading={busy}>
              {copy.rejectConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
