'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge, defineStatusMap, statusBadgeProps } from '@/components/ds/data';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { FRAUD_FLAG_THRESHOLD, SENTIMENT_LABEL, type FeedSentiment } from '@/lib/admin-feedbacks/contract';
import { errorText } from './api';
import { AdminGeriBildirimlerText } from './copy';

export const SENTIMENT = defineStatusMap({
  positive: { label: SENTIMENT_LABEL.positive, tone: 'success' },
  neutral: { label: SENTIMENT_LABEL.neutral, tone: 'neutral' },
  negative: { label: SENTIMENT_LABEL.negative, tone: 'danger' },
  pending: { label: SENTIMENT_LABEL.pending, tone: 'info' },
});

const NUM = new Intl.NumberFormat('tr-TR');
export const fmtNumber = (n: number) => NUM.format(n);

const DT = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });
export const fmtDateTime = (iso: string) => DT.format(new Date(iso));

const RTF = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });
export function fmtRelative(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return RTF.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return RTF.format(Math.round(diff / 3600), 'hour');
  if (abs < 86_400 * 30) return RTF.format(Math.round(diff / 86_400), 'day');
  return DT.format(new Date(iso));
}

export function fmtHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk`;
  if (h < 48) return `${h.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`;
  return `${Math.round(h / 24).toLocaleString('tr-TR')} gün`;
}

export function fmtPercent01(v: number | null): string {
  return v == null ? '—' : `%${Math.round(v * 100)}`;
}

/** Yıldızlar: görsel dekoratif, anlam metinle (`5 üzerinden 4 puan`). */
export function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span role="img" aria-label={`5 üzerinden ${rating} puan`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cn(cls, i <= rating ? 'fill-warning text-warning' : 'text-fg-subtle')} />
      ))}
    </span>
  );
}

export function SentimentBadge({ value, size = 'sm' }: { value: FeedSentiment; size?: 'sm' | 'md' }) {
  return <StatusBadge size={size} {...statusBadgeProps(SENTIMENT, value)} />;
}

export function FlagBadges({
  isToxic,
  trustFlagged,
  fraudScore,
  isPublic,
  deletedAt,
}: {
  isToxic: boolean;
  trustFlagged: boolean;
  fraudScore: number | null;
  isPublic: boolean;
  deletedAt: string | null;
}) {
  const out: ReactNode[] = [];
  if (deletedAt) out.push(<StatusBadge key="del" size="sm" tone="neutral" label="Çöp kutusunda" />);
  if (isToxic) out.push(<StatusBadge key="tox" size="sm" tone="danger" label="Toksik" />);
  if (trustFlagged) out.push(<StatusBadge key="trust" size="sm" tone="warning" label="Güven işaretli" />);
  if (fraudScore != null && fraudScore >= FRAUD_FLAG_THRESHOLD)
    out.push(<StatusBadge key="fraud" size="sm" tone="warning" label={`Sahte şüphesi ${fmtPercent01(fraudScore)}`} />);
  if (!isPublic && !deletedAt) out.push(<StatusBadge key="hid" size="sm" tone="info" label="Gizli" />);
  if (!out.length) return null;
  return <span className="flex flex-wrap gap-1">{out}</span>;
}

/** Gerekçe zorunlu onay diyaloğu (çöp kutusu, gizleme, toksik işaret). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'warning',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  tone?: 'warning' | 'danger';
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const id = useId();
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
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || busy) return;
            setBusy(true);
            setError(null);
            try {
              await onConfirm(reason.trim());
              onOpenChange(false);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={id} className="qx-small font-medium text-fg">
              Gerekçe <span className="text-fg-muted"><AdminGeriBildirimlerText k="audited" /></span>
            </label>
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              required
              aria-describedby={`${id}-hint`}
              placeholder="Örn. hakaret içeriyor, aynı kişiden tekrar eden yorum"
            />
            <p id={`${id}-hint`} className="text-xs text-fg-muted">
              En az 3 karakter · {reason.trim().length}/500
            </p>
          </div>
          {error ? <InlineError variant="banner">{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" disabled={busy} onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              className="min-h-11 sm:min-h-10"
              disabled={!valid || busy}
              aria-busy={busy}
            >
              {busy ? 'Uygulanıyor…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
