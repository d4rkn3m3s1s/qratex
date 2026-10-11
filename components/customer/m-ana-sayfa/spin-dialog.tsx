'use client';

import { useMemo, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatInt } from '@/components/ds/play/shared';
import { EASE, useReducedMotionPref } from '@/lib/motion';
import type { HomeSpin } from '@/lib/customer-home/types';
import { readEnvelope, HomeFetchError } from './use-home';
import { useHomeCopy } from './copy';

export type SpinResult = {
  prize: { id: string; type: 'points' | 'xp' | 'nothing'; value: number; label: string; index: number };
  credited: { points: number; xp: number };
  balance: number | null;
  remaining: number;
  isLevelUp: boolean;
};

/** Tam tur sayısı ve süre: çarkın gerçek sonuca dönüşü (play kaydı; azaltılmış harekette anında). */
const TURNS = 5;
const SPIN_SECONDS = 2.4;

function idempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `spin-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;
  }
}

/** Ödül diliminin merkezini tepe işaretçisine getiren mutlak açı (önceki dönüşten devam eder). */
export function targetRotation(current: number, index: number, count: number, turns = TURNS): number {
  const seg = 360 / Math.max(1, count);
  const center = index * seg + seg / 2;
  const base = current - (((current % 360) + 360) % 360);
  return base + turns * 360 + ((360 - center) % 360);
}

/**
 * Günlük çark diyaloğu (lazy chunk). Sonuç SUNUCUDA belirlenir (`POST /api/gamification/spin`,
 * Idempotency-Key ile); çark yalnız sunucunun seçtiği dilime döner. Kazanç `onResult` ile
 * An Motoru puan kapsülüne ve Ana Sayfa önbelleğine aktarılır. Kayıpta kutlama yok.
 */
export default function SpinDialog({
  open,
  onOpenChange,
  spin,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spin: HomeSpin;
  onResult: (result: SpinResult) => void;
}) {
  const { copy, locale } = useHomeCopy();
  const reduce = useReducedMotionPref();
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'spinning' | 'done'>('idle');
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Sunucu "hak bitti" dedi (başka sekme/cihazda çevrilmiş): buton bir daha istek atmaz. */
  const [limitHit, setLimitHit] = useState(false);
  const pendingRef = useRef<SpinResult | null>(null);

  const prizes = spin.prizes;
  const count = Math.max(1, prizes.length);
  const seg = 360 / count;
  const remaining = limitHit ? 0 : result ? result.remaining : spin.remaining;
  const busy = phase === 'requesting' || phase === 'spinning';

  const slices = useMemo(
    () =>
      prizes.map((p, i) => {
        const a0 = ((i * seg - 90) * Math.PI) / 180;
        const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
        const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
        const large = seg > 180 ? 1 : 0;
        const path = `M 100 100 L ${100 + 96 * Math.cos(a0)} ${100 + 96 * Math.sin(a0)} A 96 96 0 ${large} 1 ${100 + 96 * Math.cos(a1)} ${100 + 96 * Math.sin(a1)} Z`;
        return {
          id: p.id,
          label: p.label,
          path,
          color: `hsl(var(--category-${(i % 8) + 1}) / 0.32)`,
          tx: 100 + 62 * Math.cos(mid),
          ty: 100 + 62 * Math.sin(mid),
          rot: (i + 0.5) * seg,
        };
      }),
    [prizes, seg]
  );

  const finish = () => {
    const r = pendingRef.current;
    if (!r) return;
    pendingRef.current = null;
    setResult(r);
    setPhase('done');
    onResult(r);
  };

  const doSpin = async () => {
    if (busy || remaining <= 0) return;
    setError(null);
    setResult(null);
    setPhase('requesting');
    try {
      const res = await fetch('/api/gamification/spin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: '{}',
      });
      const data = await readEnvelope<SpinResult>(res);
      pendingRef.current = data;
      const index = Math.max(0, Math.min(count - 1, data.prize.index));
      if (reduce) {
        setRotation((r) => targetRotation(r, index, count, 0));
        finish();
      } else {
        setPhase('spinning');
        setRotation((r) => targetRotation(r, index, count));
      }
    } catch (e) {
      setPhase('idle');
      const used = e instanceof HomeFetchError && e.code === 'CONFLICT';
      if (used) setLimitHit(true);
      setError(used ? copy.spinUsed : copy.spinError);
    }
  };

  const message = (() => {
    if (!result) return null;
    if (result.prize.type === 'nothing') return copy.spinNothing;
    if (result.prize.type === 'points') {
      return result.credited.points > 0 ? copy.spinWonPoints(formatInt(result.credited.points, locale)) : copy.spinCapped;
    }
    return result.credited.xp > 0 ? copy.spinWonXp(formatInt(result.credited.xp, locale)) : copy.spinCapped;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy || !v ? onOpenChange(v) : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.spinDialogTitle}</DialogTitle>
          <DialogDescription>{copy.spinDialogDesc}</DialogDescription>
        </DialogHeader>

        {/* Konum dış sarmalayıcıda, dönüş içteki Motion elemanında (framer transform kuralı). */}
        <div className="relative mx-auto aspect-square w-full max-w-[18rem]">
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
            <circle cx="100" cy="100" r="99" fill="hsl(var(--surface-2))" stroke="hsl(var(--border-strong))" strokeWidth="2" />
          </svg>
          <Motion.svg
            viewBox="0 0 200 200"
            className="absolute inset-0 size-full"
            aria-hidden
            animate={{ rotate: rotation }}
            transition={reduce ? { duration: 0 } : { duration: SPIN_SECONDS, ease: EASE.emphasized }}
            onAnimationComplete={() => {
              if (phase === 'spinning') finish();
            }}
          >
            {slices.map((s) => (
              <g key={s.id}>
                <path d={s.path} fill={s.color} stroke="hsl(var(--border-subtle))" strokeWidth="1" />
                <text
                  x={s.tx}
                  y={s.ty}
                  transform={`rotate(${s.rot} ${s.tx} ${s.ty})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={count > 8 ? 8 : 10}
                  fontWeight={700}
                  fill="hsl(var(--text-1))"
                >
                  {s.label.length > 14 ? `${s.label.slice(0, 13)}…` : s.label}
                </text>
              </g>
            ))}
            <circle cx="100" cy="100" r="16" fill="hsl(var(--surface-1))" stroke="hsl(var(--border-strong))" strokeWidth="2" />
          </Motion.svg>
          {/* Tepe işaretçisi (sabit). */}
          <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            <path d="M 100 14 L 91 -2 L 109 -2 Z" transform="translate(0 6)" fill="hsl(var(--brand))" stroke="hsl(var(--surface-1))" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="min-h-12 text-center" aria-live="polite" role="status">
          {phase === 'requesting' || phase === 'spinning' ? (
            <p className="qx-small text-fg-muted">{copy.spinning}</p>
          ) : message ? (
            <p className={result?.prize.type === 'nothing' || (result && result.credited.points + result.credited.xp === 0) ? 'qx-body text-fg' : 'qx-h3 text-success'}>
              {message}
            </p>
          ) : error ? (
            <p className="qx-small text-danger">{error}</p>
          ) : (
            <p className="qx-small text-fg-muted">
              {remaining > 0 ? copy.spinRemaining(remaining) : copy.spinUsed}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
            {copy.spinClose}
          </Button>
          <Button className="min-h-11 gap-2" onClick={doSpin} disabled={busy || remaining <= 0}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
            {copy.spinButton}
          </Button>
        </div>

        <details className="qx-caption text-fg-muted">
          <summary className="min-h-11 cursor-pointer py-3">{copy.spinPrizeList}</summary>
          <ul className="flex flex-wrap gap-1.5 pb-1">
            {prizes.map((p) => (
              <li key={p.id} className="rounded-chip border border-subtle bg-surface-2 px-2 py-1 text-fg">
                {p.label}
              </li>
            ))}
          </ul>
        </details>
      </DialogContent>
    </Dialog>
  );
}
