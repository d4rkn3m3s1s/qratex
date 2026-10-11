'use client';

import { useId, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { errorText } from './api';
import { AdminGuvenMerkeziText } from './copy';

export type ReasonChoice<V extends string> = { value: V; label: string };

/**
 * Gerekçe zorunlu aksiyon diyaloğu (çöz, durum değiştir, askıya al, puan geri al).
 * Hata olursa diyalog açık kalır ve hata görünür ("olmuş gibi" kapanmaz).
 */
export function ReasonDialog<V extends string = string>({
  open,
  onOpenChange,
  title,
  description,
  choices,
  defaultChoice,
  choiceLabel = 'Karar',
  confirmLabel,
  tone = 'brand',
  minLength = 5,
  placeholder = 'Kısa gerekçe (denetim kaydına yazılır)',
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  choices?: ReasonChoice<V>[];
  defaultChoice?: V;
  choiceLabel?: string;
  confirmLabel: ReactNode;
  tone?: 'brand' | 'danger' | 'warning';
  minLength?: number;
  placeholder?: string;
  onConfirm: (input: { note: string; choice: V | null }) => Promise<unknown>;
  children?: ReactNode;
}) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [rawChoice, setChoice] = useState<V | null>(defaultChoice ?? choices?.[0]?.value ?? null);
  // Seçenekler değişebilir (ör. durum değişince "mevcut durum" listeden çıkar): listede olmayan
  // bayat seçim görünmez ama gönderilirdi → sunucu "aynı durum" diye reddederdi. İlk geçerliye düş.
  const choice: V | null =
    choices && rawChoice !== null && !choices.some((c) => c.value === rawChoice) ? (choices[0]?.value ?? null) : rawChoice;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = note.trim().length >= minLength && (!choices || choice !== null);

  const reset = () => {
    setNote('');
    setChoice(defaultChoice ?? choices?.[0]?.value ?? null);
    setError(null);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ note: note.trim(), choice });
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
          {children}
          {choices ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg">{choiceLabel}</p>
              <ChoiceChips<V> aria-label={choiceLabel} options={choices} value={choice} onChange={(v) => setChoice(v)} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={noteId}><AdminGuvenMerkeziText k="reason" /></Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={placeholder}
              rows={3}
              maxLength={800}
              aria-invalid={note.length > 0 && note.trim().length < minLength}
              aria-describedby={`${noteId}-hint`}
            />
            <p id={`${noteId}-hint`} className="text-xs text-fg-muted">
              En az {minLength} karakter. Gerekçe ve işlemi yapan kişi denetim günlüğüne yazılır.
            </p>
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              className="min-h-11 sm:min-h-10"
              disabled={!valid || busy}
              aria-busy={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
