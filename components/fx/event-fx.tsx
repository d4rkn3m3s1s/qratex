'use client';

import { playSound } from '@/lib/sound';

/**
 * Olay animasyonları — hafif, CSS kompozitör tabanlı (app/event-fx.css).
 * Ek kütüphane yok; azaltılmış harekette CSS hepsini kapatır (son durum anında).
 *
 *   <PointsGain value={balance}><AnimatedNumber value={balance} /></PointsGain>
 *   <DrawCheck className="h-5 w-5 text-success" />
 *   <Burst kind="hearts" trigger={sentCount} />
 *   const isNew = useNewIds(rows.map((r) => r.id));  // ilk çizimde hiçbiri yeni değil
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Sayı artınca "+N" yüzen etiket + parıltı. İlk çizimde ve azalışta sessiz. */
export function PointsGain({
  value,
  children,
  className,
  format = (n) => `+${new Intl.NumberFormat('tr-TR').format(n)}`,
}: {
  value: number;
  children: ReactNode;
  className?: string;
  format?: (delta: number) => string;
}) {
  const prev = useRef(value);
  const [gain, setGain] = useState<{ id: number; delta: number } | null>(null);
  useEffect(() => {
    const delta = value - prev.current;
    prev.current = value;
    if (delta > 0) {
      setGain((g) => ({ id: (g?.id ?? 0) + 1, delta }));
      playSound('points');
    }
  }, [value]);
  useEffect(() => {
    if (!gain) return;
    const t = window.setTimeout(() => setGain(null), 900);
    return () => window.clearTimeout(t);
  }, [gain]);
  return (
    <span className={cn('qx-fx-anchor', className)}>
      {children}
      {gain && (
        <span key={gain.id} aria-hidden>
          <span className="qx-fx-glint" />
          <span className="qx-fx-float">{format(gain.delta)}</span>
        </span>
      )}
    </span>
  );
}

/** Kendini çizen onay işareti (daire belirir, tik çizilir). */
export function DrawCheck({ className, circle = true }: { className?: string; circle?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={cn('qx-fx-check', className)} aria-hidden>
      {circle && <circle cx="12" cy="12" r="10" strokeWidth={2} opacity={0.35} />}
      <path d="M7 12.5l3.2 3.2L17 9" />
    </svg>
  );
}

const GLYPHS = { hearts: ['♥', '★', '♥', '✦'], stars: ['★', '✦', '★', '•'], light: ['✦', '•', '✦', '•'] } as const;

/**
 * Parçacık patlaması — `trigger` her değiştiğinde (0 hariç) bir kez çalar.
 * Kapsayıcı `relative` olmalı; yerleşimi etkilemez (absolute, 0×0).
 */
export function Burst({ trigger, kind = 'stars', count = 10, radius = 56, className }: { trigger: number; kind?: keyof typeof GLYPHS; count?: number; radius?: number; className?: string }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + (i % 2 ? 0.25 : -0.15);
        const r = radius * (0.7 + ((i * 37) % 10) / 25);
        return {
          x: `${Math.round(Math.cos(a) * r)}px`,
          y: `${Math.round(Math.sin(a) * r - 10)}px`,
          r: `${(i % 2 ? 1 : -1) * (20 + i * 9)}deg`,
          s: 0.7 + (i % 3) * 0.2,
          delay: `${(i % 4) * 30}ms`,
          g: GLYPHS[kind][i % GLYPHS[kind].length],
        };
      }),
    [count, radius, kind],
  );
  if (!trigger) return null;
  return (
    <span key={trigger} className={cn('qx-fx-burst', className)} aria-hidden>
      {parts.map((p, i) => (
        <span
          key={i}
          className={i % 2 ? 'text-warning' : kind === 'hearts' ? 'text-danger' : 'text-brand'}
          style={{ ['--x' as string]: p.x, ['--y' as string]: p.y, ['--r' as string]: p.r, ['--s' as string]: p.s, ['--delay' as string]: p.delay, fontSize: 14 }}
        >
          {p.g}
        </span>
      ))}
    </span>
  );
}

/** İlk çizimden SONRA listeye giren kimlikleri işaretler (giriş animasyonu için). */
/** `ready` false iken (veri yükleniyor) taban kaydedilmez — ilk yükleme "yeni" sayılmaz. */
export function useNewIds(ids: readonly string[], ready = true): (id: string) => boolean {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const key = ids.join('|');
  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (added.length) setFresh(new Set(added));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  return (id) => fresh.has(id);
}
