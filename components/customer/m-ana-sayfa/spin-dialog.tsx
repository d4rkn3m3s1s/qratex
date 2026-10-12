'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatInt } from '@/components/ds/play/shared';
import { AnimatedNumber } from '@/components/ds/data/animated-number';
import { EASE, useReducedMotionPref } from '@/lib/motion';
import { BUZZ, buzz, confetti, sound } from '@/lib/moments/effects';
import type { HomeSpin } from '@/lib/customer-home/types';
import { readEnvelope, HomeFetchError } from './use-home';
import { useSpinCopy } from './spin-copy';
import { WheelFace, WheelPointer, jackpotIndex, prizeText, useWheelEngine, type WheelFrame } from './spin-wheel';

export type SpinResult = {
  prize: { id: string; type: 'points' | 'xp' | 'nothing'; value: number; label: string; index: number };
  credited: { points: number; xp: number };
  balance: number | null;
  remaining: number;
  isLevelUp: boolean;
};

function idempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `spin-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;
  }
}

type Phase = 'idle' | 'spinning' | 'done';

/**
 * Günlük çark — tam ekran çevirme deneyimi (lazy chunk).
 * Sonuç SUNUCUDA belirlenir (`POST /api/gamification/spin`, Idempotency-Key); düğmeye basınca
 * çark geri çekilip hızlanır, cevap gelince o dilime yavaşlayarak iner. Kazanç `onResult` ile
 * An Motoru puan kapsülüne (z-toast, bu katmanın üstünde) ve Ana Sayfa önbelleğine aktarılır.
 * Azaltılmış harekette çark dönmez: sonuç dilimi doğrudan gösterilir.
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
  const { copy, locale } = useSpinCopy();
  const reduce = useReducedMotionPref();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  const prizes = spin.prizes;
  const count = Math.max(1, prizes.length);
  const jp = jackpotIndex(prizes);
  const units = useMemo(() => ({ points: copy.unitPoints, xp: copy.unitXp, nothing: copy.nothingShort }), [copy]);
  const remaining = limitHit ? 0 : result ? result.remaining : spin.remaining;
  const busy = phase === 'spinning';

  // DOM düğümleri: motor her karede bunları doğrudan günceller (React render yok).
  const faceRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghost2Ref = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const lastTick = useRef(0);
  const lastBuzz = useRef(0);

  const apply = useCallback((f: WheelFrame) => {
    const face = faceRef.current;
    if (face) face.style.transform = `rotate(${f.angle}deg)`;
    // Hıza bağlı bulanıklık: iki hayalet kopya geride kalır (yalnız transform + opacity).
    const blur = Math.min(0.42, Math.max(0, (f.speed - 0.25) * 0.4));
    const g1 = ghostRef.current;
    const g2 = ghost2Ref.current;
    if (g1) {
      g1.style.transform = `rotate(${f.angle - f.speed * 7}deg)`;
      g1.style.opacity = String(blur);
    }
    if (g2) {
      g2.style.transform = `rotate(${f.angle - f.speed * 14}deg)`;
      g2.style.opacity = String(blur * 0.55);
    }
    const p = pointerRef.current;
    if (p) p.style.transform = `rotate(${f.deflect}deg)`;
  }, []);

  const onPeg = useCallback((speed: number) => {
    const now = performance.now();
    // Yüksek hızda tık seli olmasın: tık en sık 55 ms'de bir, titreşim yavaşlarken.
    if (now - lastTick.current > 55) {
      lastTick.current = now;
      sound('click');
    }
    if (speed < 0.6 && now - lastBuzz.current > 80) {
      lastBuzz.current = now;
      buzz(6);
    }
  }, []);

  const engine = useWheelEngine({ count, apply, onPeg });

  const finish = useCallback(
    (r: SpinResult) => {
      setResult(r);
      setPhase('done');
      const gained = r.credited.points + r.credited.xp;
      if (gained > 0) {
        buzz(BUZZ.success);
        if (r.prize.index === jp) confetti('burst', { origin: { y: 0.42 } });
      } else {
        buzz(BUZZ.tap);
      }
      onResult(r);
    },
    [jp, onResult]
  );

  const doSpin = async () => {
    if (busy || remaining <= 0) return;
    setError(null);
    setResult(null);
    setPhase('spinning');
    if (!reduce) {
      sound('click');
      engine.start();
    }
    try {
      const res = await fetch('/api/gamification/spin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
        body: '{}',
      });
      const data = await readEnvelope<SpinResult>(res);
      const index = Math.max(0, Math.min(count - 1, data.prize.index));
      const r = { ...data, prize: { ...data.prize, index } };
      if (reduce) {
        engine.snap(index);
        finish(r);
      } else {
        engine.land(index, () => finish(r));
      }
    } catch (e) {
      const used = e instanceof HomeFetchError && e.code === 'CONFLICT';
      const settle = () => {
        setPhase('idle');
        if (used) setLimitHit(true);
        setError(used ? copy.used : copy.error);
      };
      if (reduce) settle();
      else engine.land(null, settle);
    }
  };

  const won = result ? result.credited.points + result.credited.xp > 0 : false;
  const capped = result ? result.prize.type !== 'nothing' && !won : false;
  const resultText = result ? prizeText({ ...result.prize, label: result.prize.label }, units) : null;
  const shownValue = result
    ? result.prize.type === 'points'
      ? result.credited.points || result.prize.value
      : result.prize.type === 'xp'
        ? result.credited.xp || result.prize.value
        : null
    : null;

  const wheelSize = 'size-[min(84vw,calc(100dvh-20rem),32rem)]';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => (!busy || v ? onOpenChange(v) : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-modal flex flex-col bg-background text-fg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <header className="flex items-start justify-between gap-4 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="qx-h2 text-fg">{copy.dialogTitle}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="qx-small mt-1 max-w-md text-fg-muted">{copy.dialogDesc}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                disabled={busy}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-subtle bg-surface-1 text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <X className="size-5" aria-hidden />
                <span className="sr-only">{copy.close}</span>
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-8">
            {/* Sahne: sabit çerçeve; dönüş içteki katmanlarda (transform), konum dış sarmalayıcıda. */}
            <div className={`relative ${wheelSize} shrink-0`}>
              <div ref={ghost2Ref} className="absolute inset-0 opacity-0 will-change-transform" aria-hidden>
                <WheelFace prizes={prizes} units={units} labelsOnly className="size-full" />
              </div>
              <div ref={ghostRef} className="absolute inset-0 opacity-0 will-change-transform" aria-hidden>
                <WheelFace prizes={prizes} units={units} labelsOnly className="size-full" />
              </div>
              <div
                ref={faceRef}
                className="absolute inset-0 will-change-transform"
                style={{ transform: `rotate(${engine.initialAngle}deg)` }}
              >
                <WheelFace prizes={prizes} units={units} winner={phase === 'done' && result ? result.prize.index : null} className="size-full" />
              </div>
              {/* İbre: pim noktası etrafında sapar. */}
              <div className="pointer-events-none absolute left-1/2 top-0 z-10 w-[11%] -translate-x-1/2 -translate-y-[38%]">
                <div ref={pointerRef} style={{ transformOrigin: '50% 29%' }}>
                  <WheelPointer className="block w-full" />
                </div>
              </div>
            </div>

            <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
              <div className="flex min-h-[5.5rem] flex-col items-center justify-center" role="status" aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="wait" initial={false}>
                  {phase === 'done' && result && resultText ? (
                    <Motion.div
                      key="result"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduce ? 0.25 : 0.42, ease: EASE.emphasized }}
                    >
                      <span className="sr-only">{copy.resultAnnounce(result.prize.label)}</span>
                      {result.prize.type === 'nothing' ? (
                        <>
                          <p className="qx-h2 text-fg">{copy.nothingTitle}</p>
                          <p className="qx-small mt-1 text-fg-muted">{copy.nothingBody}</p>
                        </>
                      ) : (
                        <>
                          <p className="qx-overline text-fg-muted">{won ? copy.wonTitle : resultText.unit}</p>
                          <p className="qx-num mt-1 text-5xl font-bold leading-none tracking-tight text-fg tabular-nums">
                            {shownValue != null && (
                              <AnimatedNumber
                                value={shownValue}
                                format={(n) => `+${formatInt(n, locale)}`}
                                animateOnMount
                                durationMs={700}
                              />
                            )}
                            <span className="ml-1.5 text-xl font-semibold text-fg-muted">{resultText.unit}</span>
                          </p>
                          <p className="qx-small mt-2 text-fg-muted">{capped ? copy.capped : copy.wonBody}</p>
                        </>
                      )}
                    </Motion.div>
                  ) : error ? (
                    <Motion.p key="err" className="qx-small text-danger" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      {error}
                    </Motion.p>
                  ) : (
                    <Motion.p key="ready" className="qx-body text-fg-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      {busy ? copy.spinning : remaining > 0 ? copy.ready(remaining) : copy.used}
                    </Motion.p>
                  )}
                </AnimatePresence>
              </div>

              {phase === 'done' && remaining <= 0 ? (
                <Button className="min-h-12 w-full text-base" onClick={() => onOpenChange(false)}>
                  {copy.done}
                </Button>
              ) : (
                <Button className="min-h-12 w-full gap-2 text-base" onClick={doSpin} disabled={busy || remaining <= 0}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {busy ? copy.spinning : phase === 'done' ? copy.spinAgain : copy.spin}
                </Button>
              )}

              <ul className="flex flex-wrap justify-center gap-1.5" aria-label={copy.prizes}>
                {prizes.map((p, i) => {
                  const t = prizeText(p, units);
                  return (
                    <li
                      key={p.id}
                      className={
                        i === jp
                          ? 'qx-caption rounded-full bg-brand px-2.5 py-1 font-semibold text-brand-fg tabular-nums'
                          : 'qx-caption rounded-full border border-subtle px-2.5 py-1 text-fg-muted tabular-nums'
                      }
                    >
                      {t.value}
                      {t.unit ? ` ${t.unit}` : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
