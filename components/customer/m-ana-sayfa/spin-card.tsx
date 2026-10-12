'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatInt } from '@/components/ds/play/shared';
import { cn } from '@/lib/utils';
import type { HomeSpin } from '@/lib/customer-home/types';
import { useSpinCopy } from './spin-copy';
import { WheelFace, jackpotIndex, pad2, splitMs } from './spin-wheel';
import { useHomeCache } from './use-home';

/** Kalan süre (saniyede bir); hedef geçince bir kez `onExpire`. */
function useRemaining(targetIso: string, onExpire: () => void) {
  const target = useMemo(() => Date.parse(targetIso), [targetIso]);
  const [now, setNow] = useState<number | null>(null);
  const fired = useRef(false);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (n >= target && !fired.current) {
        fired.current = true;
        expire.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return now == null || Number.isNaN(target) ? null : Math.max(0, target - now);
}

/**
 * Çark girişi — durum BFF'ten gelir (ikinci GET yok). Tam ekran deneyim tıklanınca yüklenir.
 * Hak varken: çarkın bir kısmı kartın kenarından taşar, en büyük dilim metne bakar.
 * Kullanıldıysa: çark sakinleşir (nötr), göbekte "?" ve gece yarısına büyük geri sayım.
 */
export function SpinCard({ spin, onOpen }: { spin: HomeSpin; onOpen: () => void }) {
  const { copy, locale } = useSpinCopy();
  const { refresh } = useHomeCache();
  const available = spin.remaining > 0;
  const prizes = spin.prizes;
  const count = Math.max(1, prizes.length);
  const jp = jackpotIndex(prizes);
  const maxPoints = jp >= 0 ? formatInt(prizes[jp].value, locale) : null;
  const units = useMemo(() => ({ points: copy.unitPoints, xp: copy.unitXp, nothing: copy.nothingShort }), [copy]);
  // Büyük dilim metne (sola, 270°) baksın.
  const peekRotation = jp >= 0 ? 270 - (jp + 0.5) * (360 / count) : -90;

  const left = useRemaining(spin.resetAt, () => void refresh());
  const t = left == null ? null : splitMs(left);

  return (
    <section
      aria-labelledby="spin-card-title"
      data-spin-card
      className="relative isolate flex h-full min-h-[13.5rem] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-1 p-card"
    >
      {/* Taşan çark: dekor; yalnız transform ile yerleşir. */}
      <div
        className={cn(
          'pointer-events-none absolute -right-[5.5rem] top-1/2 -z-10 size-[13rem] -translate-y-1/2 sm:-right-[4.5rem] sm:size-[14rem]',
          !available && 'opacity-80'
        )}
        aria-hidden
      >
        <div className="size-full" style={{ transform: `rotate(${peekRotation}deg)` }}>
          <WheelFace prizes={prizes} units={units} muted={!available} className="size-full" />
        </div>
      </div>

      <div className="flex max-w-[58%] flex-1 flex-col sm:max-w-[60%]">
        <p className="qx-overline text-fg-muted">
          {copy.overline}
          {available && spin.remaining > 1 ? <span className="text-brand"> · {copy.spinsLeft(spin.remaining)}</span> : null}
        </p>
        <h2 id="spin-card-title" className="qx-h3 mt-1.5 text-balance text-fg">
          {available ? copy.readyTitle : copy.usedTitle}
        </h2>
        {maxPoints ? (
          <p className="qx-small mt-1.5 text-pretty text-fg-muted">{available ? copy.readyBody(maxPoints) : copy.usedBody(maxPoints)}</p>
        ) : null}

        <div className="mt-auto pt-4">
          {available ? (
            <Button className="min-h-11 gap-2 px-5" onClick={onOpen}>
              {copy.cta}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <div>
              <p className="qx-caption text-fg-muted">{copy.nextIn}</p>
              <p
                className="qx-num mt-0.5 text-[1.75rem] font-semibold leading-none tracking-tight text-fg tabular-nums"
                role="timer"
                aria-label={t ? copy.countdownAria(t.h, t.m) : undefined}
              >
                {t ? (
                  <>
                    {pad2(t.h)}
                    <span className="text-fg-muted">:</span>
                    {pad2(t.m)}
                    <span className="text-fg-muted">:</span>
                    <span className="text-fg-muted">{pad2(t.s)}</span>
                  </>
                ) : (
                  '--:--:--'
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
