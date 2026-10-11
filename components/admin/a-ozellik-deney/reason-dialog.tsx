'use client';

import { useId, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError, TONE_CALLOUT, matchesConfirmPhrase, type ImpactItem } from '@/components/states';
import { cn } from '@/lib/utils';
import { errorText } from './api';
import { useFeatureLabCopy } from './copy';

/**
 * Gerekçe zorunlu değişiklik diyaloğu: etki önizlemesi + (kritikte) anahtarı yazarak onay.
 * Hata olursa diyalog açık kalır ve hata görünür; "olmuş gibi" kapanmaz.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  warning,
  confirmPhrase,
  confirmLabel,
  tone = 'brand',
  minLength = 5,
  requireReason = true,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  impact?: ImpactItem[];
  warning?: ReactNode;
  confirmPhrase?: string;
  confirmLabel: ReactNode;
  tone?: 'brand' | 'danger' | 'warning';
  minLength?: number;
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  children?: ReactNode;
}) {
  const fx = useFeatureLabCopy();
  const noteId = useId();
  const phraseId = useId();
  const [note, setNote] = useState('');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reasonOk = !requireReason || note.trim().length >= minLength;
  const phraseOk = !confirmPhrase || matchesConfirmPhrase(phrase, confirmPhrase);
  const valid = reasonOk && phraseOk;

  const reset = () => {
    setNote('');
    setPhrase('');
    setError(null);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
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
          {impact?.length ? (
            <dl className="divide-y divide-border rounded-card border border-border bg-surface-muted text-sm">
              {impact.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                  <dt className="text-fg-muted">{it.label}</dt>
                  <dd className={it.emphasis ? 'text-right font-semibold text-fg' : 'text-right text-fg'}>{it.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {warning ? (
            <p role="note" className={cn('rounded-card border px-3 py-2 text-sm', TONE_CALLOUT.warning)}>
              {warning}
            </p>
          ) : null}
          {children}
          {requireReason ? (
            <div className="space-y-2">
              <Label htmlFor={noteId}>{fx.reason}</Label>
              <Textarea
                id={noteId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Kısa gerekçe (denetim günlüğüne yazılır)"
                rows={3}
                maxLength={500}
                aria-invalid={note.length > 0 && note.trim().length < minLength}
                aria-describedby={`${noteId}-hint`}
              />
              <p id={`${noteId}-hint`} className="text-xs text-fg-muted">
                En az {minLength} karakter. Gerekçe ve işlemi yapan kişi denetim günlüğüne yazılır.
              </p>
            </div>
          ) : null}
          {confirmPhrase ? (
            <div className="space-y-2">
              <Label htmlFor={phraseId}>
                Onaylamak için <span className="font-mono font-semibold text-fg">{confirmPhrase}</span> yazın
              </Label>
              <Input id={phraseId} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
            </div>
          ) : null}
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" variant={tone === 'danger' ? 'destructive' : 'default'} className="min-h-11 sm:min-h-10" disabled={!valid || busy} aria-busy={busy}>
              {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
