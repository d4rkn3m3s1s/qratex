'use client';

import { useEffect, useState } from 'react';
import { Loader2, Star, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TONE_CHIP } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ratingTone, voidDeadline } from '@/lib/dealer/kasa/core';
import { KasaApiError, formatCountdown, postJson } from './api';
import { useKasaCopy } from './copy';

export function CustomerAvatar({
  src,
  initials,
  size = 40,
  className,
}: {
  src: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-subtle font-semibold text-brand ring-1 ring-inset ring-brand-border',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2/OAuth ve hazır avatar yolları; host listesi değişken
        <img src={src} alt="" width={size} height={size} decoding="async" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}

export function RatingBadge({ rating, className }: { rating: number | null; className?: string }) {
  const { copy } = useKasaCopy();
  const tone = ratingTone(rating);
  if (rating == null || tone == null) {
    return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs', TONE_CHIP.neutral, className)}>{copy.common.notRated}</span>;
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium qx-num', TONE_CHIP[tone], className)}
      aria-label={copy.common.stars(rating)}
    >
      <Star className="h-3 w-3 fill-current" aria-hidden />
      {rating}/5
    </span>
  );
}

/** Geri alma penceresinin kalan süresi (sn hassasiyetinde; pencere bitince null). */
export function useVoidCountdown(createdAt: string, enabled: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  const deadline = voidDeadline(createdAt);
  useEffect(() => {
    if (!enabled || Date.now() >= deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled, deadline]);
  if (!enabled) return null;
  const left = deadline - now;
  return left > 0 ? left : null;
}

export function VoidDialog({
  open,
  onOpenChange,
  consumptionId,
  summary,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  consumptionId: string;
  summary: { label: string; amount: string; points: number | null };
  onDone: (reversedPoints: number) => void;
}) {
  const { copy } = useKasaCopy();
  const c = copy.ledger.void;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  const valid = reason.trim().length >= 3;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ reversedPoints: number }>(`/api/dealer/consumptions/${encodeURIComponent(consumptionId)}/void`, {
        reason: reason.trim(),
      });
      toast.success(c.done(res.reversedPoints));
      onOpenChange(false);
      onDone(res.reversedPoints);
    } catch (e) {
      setError(e instanceof KasaApiError && e.status !== 0 ? e.message : copy.common.networkError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.desc}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <dt className="text-fg-muted">{copy.ledger.table.product}</dt>
          <dd className="font-medium">{summary.label}</dd>
          <dt className="text-fg-muted">{c.impactAmount}</dt>
          <dd className="qx-num">{summary.amount}</dd>
          {summary.points != null && (
            <>
              <dt className="text-fg-muted">{c.impactPoints}</dt>
              <dd className="qx-num font-semibold text-danger">−{summary.points}</dd>
            </>
          )}
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor={`void-reason-${consumptionId}`}>{c.reason}</Label>
          <Textarea
            id={`void-reason-${consumptionId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={c.reasonPlaceholder}
            maxLength={200}
            rows={2}
            aria-invalid={!!error}
            aria-describedby={error ? `void-error-${consumptionId}` : undefined}
          />
          {error && (
            <p id={`void-error-${consumptionId}`} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="min-h-11">
            {copy.common.cancel}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!valid || busy} className="min-h-11">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="mr-2 h-4 w-4" aria-hidden />}
            {c.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Geri alma düğmesi + geri sayım (pencere kapanınca kendiliğinden kaybolur). */
export function VoidButton({
  createdAt,
  voidable,
  onClick,
  size = 'sm',
}: {
  createdAt: string;
  voidable: boolean;
  onClick: () => void;
  size?: 'sm' | 'default';
}) {
  const { copy } = useKasaCopy();
  const left = useVoidCountdown(createdAt, voidable);
  if (!voidable || left == null) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={onClick}
      className="min-h-11 gap-1.5"
      aria-label={`${copy.ledger.void.button} — ${copy.ledger.void.remaining(formatCountdown(left))}`}
    >
      <Undo2 className="h-4 w-4" aria-hidden />
      {copy.ledger.void.button}
      <span className="qx-num text-xs text-fg-muted">{formatCountdown(left)}</span>
    </Button>
  );
}
