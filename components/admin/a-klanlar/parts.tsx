'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { m } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { errorText } from './api';
import { fmtNumber } from './format';

export function FormField({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger" role="alert">
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

/**
 * Gerekçe isteyen onay diyaloğu (dondurma, üye çıkarma, iptal…). Etki listesi `children` ile
 * gösterilir. Hata olursa açık kalır ve sunucu mesajını gösterir; başarıda kapanır.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Gerekçe',
  minLength = 3,
  confirmLabel,
  tone = 'warning',
  onConfirm,
  children,
  extraValid = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  label?: string;
  minLength?: number;
  confirmLabel: ReactNode;
  tone?: 'warning' | 'danger' | 'brand';
  onConfirm: (reason: string) => Promise<unknown>;
  children?: ReactNode;
  extraValid?: boolean;
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
  const valid = reason.trim().length >= minLength && extraValid;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
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
          {children}
          <FormField htmlFor={`${id}-reason`} label={label} hint={`En az ${minLength} karakter. Denetim kaydına yazılır.`}>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              required
              aria-describedby={`${id}-reason-hint`}
            />
          </FormField>
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" variant={tone === 'danger' ? 'destructive' : 'default'} disabled={!valid || busy} aria-busy={busy}>
              {busy ? 'İşleniyor…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Etki listesi (onay diyaloğunda madde madde). */
export function ImpactList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 rounded-control border border-subtle bg-surface-muted p-3 text-sm text-fg">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * İki klanın oransal skor çubuğu. Genişlik değişimi kısa tween (azaltılmış harekette anında).
 * Konum dış sarmalayıcıda, animasyon içte (framer inline transform Tailwind'i ezmesin).
 */
export function ScoreBar({ a, b, labelA, labelB, winner }: { a: number; b: number; labelA: string; labelB: string; winner?: 'a' | 'b' | 'draw' | null }) {
  const policy = useMotionPolicy();
  const total = a + b;
  const pct = total > 0 ? Math.round((a / total) * 100) : 50;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={cn('min-w-0 truncate', winner === 'a' ? 'font-semibold text-fg' : 'text-fg-muted')}>
          {labelA} <span className="tabular-nums font-semibold text-fg">{fmtNumber(a)}</span>
        </span>
        <span className={cn('min-w-0 truncate text-right', winner === 'b' ? 'font-semibold text-fg' : 'text-fg-muted')}>
          <span className="tabular-nums font-semibold text-fg">{fmtNumber(b)}</span> {labelB}
        </span>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-info-subtle"
        role="img"
        aria-label={`${labelA} ${fmtNumber(a)} puan, ${labelB} ${fmtNumber(b)} puan`}
      >
        <m.div
          className="absolute inset-y-0 left-0 rounded-full bg-brand"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={policy.transition({ duration: DURATION.slow, ease: EASE.standard })}
        />
      </div>
    </div>
  );
}

/** Basit sayfalayıcı (sheet içi / günlük listeleri). */
export function Pager({ page, pageCount, total, onPage, label }: { page: number; pageCount: number; total: number; onPage: (p: number) => void; label: string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={`${label} sayfaları`} className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-fg-muted">
      <span>
        Sayfa {page} / {pageCount} · {fmtNumber(total)} kayıt
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Önceki
        </Button>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Sonraki
        </Button>
      </div>
    </nav>
  );
}
