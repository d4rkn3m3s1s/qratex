'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { m } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { resolveBadgeThumb } from '@/lib/badge-images';
import { errorText } from './api';

/** Rozet ikonu → BadgeGlyph kaynağı (yol/URL → görsel, aksi halde emoji). */
export function glyphSource(icon: string | null | undefined): { imageSrc?: string; emoji?: string } {
  const v = (icon ?? '').trim();
  if (!v) return {};
  // Hazır rozet SVG'leri 0,5–1 MB; katalog ızgarası/sheet için 320 px WebP küçük resim (perf K2).
  if (v.startsWith('/') || /^https?:\/\//i.test(v)) return { imageSrc: resolveBadgeThumb(v) ?? v };
  return { emoji: v };
}

/**
 * Sakin ilerleme çubuğu (ops kaydı): genişlik değişince 200 ms tween; azaltılmış harekette anında.
 * Değer metinle de verilir (yalnız renge/uzunluğa dayanmaz).
 */
export function ProgressBar({ value, max, accent, label, ready }: { value: number; max: number; accent?: string; label: string; ready?: boolean }) {
  const { reduce } = useMotionPolicy();
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <m.div
        className={cn('h-full rounded-full', ready ? 'bg-success' : !accent && 'bg-brand')}
        style={accent && !ready ? { backgroundColor: accent } : undefined}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { duration: DURATION.base, ease: EASE.standard }}
      />
    </div>
  );
}

export function FormRow({ label, htmlFor, hint, error, children }: { label: ReactNode; htmlFor: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Rozeti bir müşteriye elle verme diyaloğu (gerekçeli; puan basmaz). */
export function GrantDialog({
  open,
  onOpenChange,
  badgeName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  badgeName: string;
  onConfirm: (email: string, reason: string) => Promise<unknown>;
}) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setEmail('');
      setReason('');
      setError(null);
    }
  }, [open]);
  const valid = /\S+@\S+\.\S+/.test(email.trim()) && reason.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || busy) return;
            setBusy(true);
            setError(null);
            try {
              await onConfirm(email.trim(), reason.trim());
              onOpenChange(false);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>“{badgeName}” rozetini ver</DialogTitle>
            <DialogDescription>
              Rozet müşterinin koleksiyonuna eklenir ve rozet anı gösterilir. Elle verme ödül puanı basmaz; işlem denetim kaydına yazılır.
            </DialogDescription>
          </DialogHeader>
          <FormRow label="Müşteri e-postası" htmlFor={`${id}-email`}>
            <Input id={`${id}-email`} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-11" required />
          </FormRow>
          <FormRow label="Gerekçe" htmlFor={`${id}-reason`} hint="En az 5 karakter. Ör. “Lansman etkinliği katılımı”.">
            <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} aria-describedby={`${id}-reason-hint`} required />
          </FormRow>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
              {busy ? 'Veriliyor…' : 'Rozeti ver'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
