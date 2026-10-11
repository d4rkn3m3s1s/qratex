'use client';

import { useEffect, useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTeamCopy } from './copy';

/**
 * Not isteyen kararlar için satır içi diyalog (revizyon iste, yeniden aç, görünüm adı).
 * `window.prompt` yerine (denetim D4/Bulgu 16: PWA/iOS'ta kötü, çok satırlı nota izin vermiyordu).
 */
export function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  required,
  quickNotes,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  label: string;
  required?: boolean;
  quickNotes?: string[];
  confirmLabel: string;
  onConfirm: (note: string) => Promise<unknown> | unknown;
}) {
  const tx = useTeamCopy();
  const id = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  const canSubmit = !busy && (!required || note.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canSubmit) return;
            setBusy(true);
            try {
              await onConfirm(note.trim());
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {quickNotes && quickNotes.length > 0 && (
            <div role="group" aria-label="Hazır notlar" className="flex flex-wrap gap-1.5">
              {quickNotes.map((q) => (
                <Button
                  key={q}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 min-h-9"
                  onClick={() => setNote((cur) => (cur.trim() ? `${cur.trim()}\n${q}` : q))}
                >
                  + {q}
                </Button>
              ))}
            </div>
          )}
          <label htmlFor={id} className="qx-small block font-medium text-fg">
            {label}
            {required ? <span className="text-danger"> *</span> : <span className="text-fg-muted">{tx.optional}</span>}
          </label>
          <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} autoFocus />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Kaydediliyor…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
