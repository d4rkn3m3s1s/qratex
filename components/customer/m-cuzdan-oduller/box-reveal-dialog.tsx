'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Coins, Gift, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RarityBadge } from '@/components/ds/play';
import { InlineError } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import SignatureGiftBox3D, { type BoxPhase } from '@/components/rewards/signature-gift-box-lazy';
import { SPRING, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { RevealPayload } from '@/lib/wallet-rewards/types';
import { errorText } from './api';
import { useWalletCopy } from './copy';
import { formatPoints } from './format';
import { useCopyCode } from './use-copy-code';

/** Açılış süreleri — toplam ≤ 1,8 sn (§4.2 `celebrate` bütçesi); "Atla" her an sonuca geçer. */
const T_MIN_SHAKE = 700;
const T_OPENING = 450;
const T_REVEAL = 350;

/**
 * Sürpriz kutu açılışı — imza 3B kutu (lazy three.js chunk) yalnız bu anda yüklenir.
 * İçerik kutunun kendisinden değil sunucunun `RevealPayload`'ından kurulur; sabit/sahte
 * "Premium", "Günlük giriş ödülü", zamanlayıcıya bağlı "Kayıtlandı" çipleri yoktur.
 * Radix Dialog: odak tuzağı, Esc, `aria-modal`, kaydırma kilidi; sonuç `aria-live` ile okunur.
 * Azaltılmış harekette 3B sahne kurulmaz; statik kutu + anında sonuç.
 */
export function BoxRevealDialog({
  open,
  onOpenChange,
  run,
  onRevealed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kutuyu açan istek (günlük kutu için önce oluşturma + açma). */
  run: (() => Promise<RevealPayload>) | null;
  onRevealed: (payload: RevealPayload) => void;
}) {
  const copy = useWalletCopy();
  const policy = useMotionPolicy();
  const [phase, setPhase] = useState<BoxPhase>('idle');
  const [result, setResult] = useState<RevealPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const doneRef = useRef<HTMLButtonElement>(null);
  const { copy: copyCode } = useCopyCode({ copied: copy.passes.copied, failed: copy.passes.copyFailed });

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const finish = useCallback(
    (payload: RevealPayload) => {
      clearTimers();
      setPhase('done');
      const msg = payload.alreadyOpened
        ? copy.boxes.alreadyOpened
        : payload.points > 0
          ? copy.boxes.pointsWon(formatPoints(payload.points, copy.locale))
          : copy.boxes.revealTitle;
      announce(msg);
      window.setTimeout(() => doneRef.current?.focus(), 0);
    },
    [copy]
  );

  const start = useCallback(async () => {
    if (!run) return;
    clearTimers();
    setError(null);
    setResult(null);
    setPhase(policy.reduce ? 'idle' : 'shaking');
    const t0 = performance.now();
    try {
      const payload = await run();
      setResult(payload);
      onRevealed(payload);
      if (policy.reduce || payload.alreadyOpened) {
        finish(payload);
        return;
      }
      const wait = Math.max(0, T_MIN_SHAKE - (performance.now() - t0));
      timers.current.push(window.setTimeout(() => setPhase('opening'), wait));
      timers.current.push(window.setTimeout(() => setPhase('reveal'), wait + T_OPENING));
      timers.current.push(
        window.setTimeout(() => {
          if (policy.allowCelebrate && (payload.tier === 'legendary' || payload.tier === 'epic')) {
            try {
              navigator.vibrate?.(40);
            } catch {
              /* titreşim yok */
            }
          }
          finish(payload);
        }, wait + T_OPENING + T_REVEAL)
      );
    } catch (err) {
      setPhase('idle');
      setError(errorText(err, copy.errors));
    }
  }, [run, policy.reduce, policy.allowCelebrate, onRevealed, finish, copy.errors]);

  useEffect(() => {
    if (open && run) void start();
    if (!open) {
      clearTimers();
      setPhase('idle');
      setResult(null);
      setError(null);
    }
    return clearTimers;
    // `run` her açılışta yeni bir kapanış (closure) olarak gelir; açılış başına bir kez çalışır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, run]);

  const showResult = !!result && (phase === 'reveal' || phase === 'done');
  const working = !result && !error;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-overlay/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-base" />
        <DialogPrimitive.Content
          data-register="play"
          onEscapeKeyDown={(e) => working && e.preventDefault()}
          onPointerDownOutside={(e) => working && e.preventDefault()}
          className={cn(
            'dark fixed inset-0 z-modal flex flex-col overflow-y-auto bg-surface-0 text-fg outline-none [color-scheme:dark]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-4rem)] sm:w-[min(34rem,calc(100vw-4rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-sheet sm:border sm:border-subtle sm:qx-elevation-3',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-base'
          )}
          style={{
            backgroundImage:
              'radial-gradient(120% 60% at 50% 0%, hsl(var(--brand) / 0.18), transparent 60%), radial-gradient(80% 50% at 100% 100%, hsl(var(--category-2) / 0.12), transparent 60%)',
          }}
        >
          <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="qx-h3 text-fg">{result ? result.title : copy.boxes.opening}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{copy.boxes.tierHint}</DialogPrimitive.Description>
            {!working && (
              <DialogPrimitive.Close
                className="grid size-11 place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={copy.detail.close}
              >
                <X aria-hidden className="size-5" />
              </DialogPrimitive.Close>
            )}
          </header>

          <div className="relative mx-auto grid h-60 w-full max-w-sm place-items-center sm:h-72">
            {policy.reduce ? (
              <span className="grid size-28 place-items-center rounded-sheet bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border" aria-hidden>
                {result?.couponCode ? <Gift className="size-14" /> : result && result.points > 0 ? <Coins className="size-14" /> : <Package className="size-14" />}
              </span>
            ) : (
              <SignatureGiftBox3D phase={phase} className="h-full w-full" />
            )}
            {!policy.reduce && result && showResult && result.points > 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center">
                <Motion.span
                  initial={{ opacity: 0, y: 24, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={SPRING.bouncy}
                  className="qx-h2 qx-num rounded-chip bg-surface-1/80 px-3 py-1 font-bold text-fg ring-1 ring-inset ring-brand-border"
                >
                  {copy.boxes.revealPoints(formatPoints(result.points, copy.locale))}
                </Motion.span>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-live="polite">
            {error && (
              <>
                <InlineError variant="banner">{error}</InlineError>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    {copy.detail.close}
                  </Button>
                  <Button onClick={() => void start()}>{copy.retry}</Button>
                </div>
              </>
            )}

            <AnimatePresence>
              {result && showResult && (
                <Motion.div
                  key="result"
                  initial={policy.reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={policy.transition({ duration: 0.2 })}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RarityBadge rarity={result.tier} register="play" />
                    <span className="qx-caption text-fg-muted">{copy.boxes.source[result.source]}</span>
                  </div>
                  {result.alreadyOpened && <p className="qx-small text-fg-muted">{copy.boxes.alreadyOpened}</p>}
                  {result.points > 0 && (
                    <div>
                      <p className="qx-display qx-num text-success">{copy.boxes.revealPoints(formatPoints(result.points, copy.locale))}</p>
                      {result.newBalance !== null && <p className="qx-small text-fg-muted">{copy.boxes.revealCredited(formatPoints(result.newBalance, copy.locale))}</p>}
                    </div>
                  )}
                  {result.message && <p className="qx-body text-fg">{result.message}</p>}
                  {result.couponCode && (
                    <div className="rounded-card border border-subtle bg-surface-1 p-3">
                      <p className="qx-overline text-fg-muted">{copy.boxes.revealCoupon}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="min-w-0 flex-1 select-all break-all font-mono text-lg font-semibold tracking-wider text-fg">{result.couponCode}</p>
                        <Button variant="outline" size="sm" onClick={() => void copyCode(result.couponCode!)}>
                          {copy.passes.copy}
                        </Button>
                      </div>
                      <p className="qx-caption mt-1 text-fg-muted">{copy.boxes.revealCouponHint}</p>
                    </div>
                  )}
                  {!result.message && !result.couponCode && result.points === 0 && <p className="qx-small text-fg-muted">{copy.boxes.revealNothing}</p>}
                  <div className="flex justify-end">
                    <Button ref={doneRef} onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                      {copy.boxes.done}
                    </Button>
                  </div>
                </Motion.div>
              )}
            </AnimatePresence>

            {result && !showResult && (
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => finish(result)}>
                  {copy.boxes.skip}
                </Button>
              </div>
            )}
            {working && <p className="qx-small text-center text-fg-muted" role="status">{copy.boxes.opening}</p>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
