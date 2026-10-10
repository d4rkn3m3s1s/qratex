'use client';

/**
 * Çözüm kartı — okutma/elle giriş sonrası alt sayfa (mobil) ya da ortalanmış panel (≥ sm).
 *  - Mekân: logo + ad + şube/masa + son ziyaret + taban ödül (sunucu matrisi) + "Geri bildirime başla"
 *  - Kart: bağla (POST /api/cards/[token]/activate) / zaten senin / bağlandı
 *  - Mesaj: galeriden/derin linkten gelen hata (eyleme dönük metin)
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { m } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Loader2, MapPin, ScanLine, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DURATION, EASE, SPRING, useMotionPolicy } from '@/lib/motion';
import { fill, formatPoints, formatVisitDate, type ScanCopy, type ScanLocale } from './copy';
import type { ScanRewardInfo, VenueInfo } from './scan-types';
import { VenueLogo } from './venue-logo';

export type CardActivation = 'idle' | 'pending' | 'done';

export type SheetState =
  | { type: 'venue'; code: string; venue: VenueInfo }
  | {
      type: 'card';
      token: string;
      state: 'unused' | 'mine';
      hasOtherCard: boolean;
      activation: CardActivation;
      error: string | null;
    }
  | { type: 'message'; tone: 'warning' | 'danger'; text: string; signIn?: boolean; retry?: boolean };

function RewardBlock({ reward, copy, locale }: { reward: ScanRewardInfo; copy: ScanCopy; locale: ScanLocale }) {
  const capReached = reward.remainingToday <= 0;
  return (
    <div className="rounded-card border border-brand-border bg-brand-subtle p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
        <Sparkles className="h-4 w-4 text-brand" aria-hidden />
        {copy.rewardTitle}
      </p>
      {capReached ? (
        <p className="mt-2 text-sm leading-relaxed text-fg">{copy.rewardCapReached}</p>
      ) : (
        <>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-brand">
            {fill(copy.rewardShort, { points: formatPoints(reward.basePoints, locale) })}
          </p>
          {reward.detailedPoints > reward.basePoints && (
            <p className="mt-0.5 text-sm text-fg">
              {fill(copy.rewardDetailed, {
                threshold: reward.detailThreshold,
                points: formatPoints(reward.detailedPoints, locale),
              })}
            </p>
          )}
          <p className="mt-2 text-xs text-fg-muted">
            {fill(copy.rewardRemaining, { points: formatPoints(reward.remainingToday, locale) })} · {copy.rewardNote}
          </p>
        </>
      )}
    </div>
  );
}

export function ResultSheet({
  state,
  reward,
  copy,
  locale,
  navigating,
  onClose,
  onStartFeedback,
  onScanAnother,
  onActivate,
  onRetry,
}: {
  state: SheetState | null;
  reward: ScanRewardInfo | null;
  copy: ScanCopy;
  locale: ScanLocale;
  navigating: boolean;
  onClose: () => void;
  onStartFeedback: (code: string) => void;
  onScanAnother: () => void;
  onActivate: (token: string) => void;
  onRetry: () => void;
}) {
  const policy = useMotionPolicy();
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const open = state !== null;
  const busy = navigating || (state?.type === 'card' && state.activation === 'pending');

  // Durum değişince (ör. kart bağlandı) birincil eyleme odak.
  const stateKey = state ? `${state.type}:${state.type === 'card' ? state.activation : ''}` : '';
  useEffect(() => {
    if (stateKey) primaryRef.current?.focus();
  }, [stateKey]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-overlay/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            primaryRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-modal outline-none sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6"
        >
          <m.div
            initial={policy.reduce ? false : { y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={policy.transition({ ...SPRING.gentle })}
            className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-sheet border border-subtle bg-surface-2 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] text-fg shadow-[var(--elevation-3)] sm:max-w-md sm:rounded-sheet sm:pb-5"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" aria-hidden />
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label={copy.close}
                disabled={busy}
                className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-control text-fg-muted transition-colors duration-fast hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </DialogPrimitive.Close>

            {state?.type === 'venue' && (
              <div className="space-y-4">
                <DialogPrimitive.Description className="sr-only">{copy.venueEyebrow}</DialogPrimitive.Description>
                <div className="flex items-start gap-3 pr-10">
                  <VenueLogo name={state.venue.name} logoUrl={state.venue.logoUrl} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">{copy.venueEyebrow}</p>
                    <DialogPrimitive.Title className="text-xl font-bold leading-tight text-balance break-words">
                      {state.venue.name}
                    </DialogPrimitive.Title>
                    {state.venue.placeLabel && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-fg-muted">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{state.venue.placeLabel}</span>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-fg-muted">
                      {state.venue.lastVisitAt
                        ? fill(copy.lastVisit, { date: formatVisitDate(state.venue.lastVisitAt, locale, copy) })
                        : copy.firstVisit}
                    </p>
                  </div>
                </div>

                {reward && <RewardBlock reward={reward} copy={copy} locale={locale} />}

                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button
                    ref={primaryRef}
                    size="lg"
                    className="min-h-12 flex-1 gap-2 text-base touch-manipulation"
                    disabled={navigating}
                    aria-busy={navigating}
                    onClick={() => onStartFeedback(state.code)}
                  >
                    {navigating ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                        {copy.openingFeedback}
                      </>
                    ) : (
                      <>
                        {copy.startFeedback}
                        <ArrowRight className="h-5 w-5" aria-hidden />
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="min-h-12 gap-2 touch-manipulation"
                    disabled={navigating}
                    onClick={onScanAnother}
                  >
                    <ScanLine className="h-4 w-4" aria-hidden />
                    {copy.scanAnother}
                  </Button>
                </div>
              </div>
            )}

            {state?.type === 'card' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 pr-10">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-control',
                      state.activation === 'done' || state.state === 'mine'
                        ? 'bg-success-subtle text-success'
                        : 'bg-brand-subtle text-brand'
                    )}
                  >
                    {state.activation === 'done' ? (
                      <m.span
                        initial={policy.reduce ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={policy.transition(SPRING.bouncy)}
                      >
                        <CheckCircle2 className="h-7 w-7" />
                      </m.span>
                    ) : (
                      <CreditCard className="h-7 w-7" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">{copy.cardEyebrow}</p>
                    <DialogPrimitive.Title className="text-xl font-bold leading-tight text-balance">
                      {state.activation === 'done'
                        ? copy.cardActivatedTitle
                        : state.state === 'mine'
                          ? copy.cardMineTitle
                          : copy.cardUnusedTitle}
                    </DialogPrimitive.Title>
                  </div>
                </div>
                <DialogPrimitive.Description className="text-sm leading-relaxed text-fg-muted">
                  {state.activation === 'done'
                    ? copy.cardActivatedBody
                    : state.state === 'mine'
                      ? copy.cardMineBody
                      : copy.cardUnusedBody}
                </DialogPrimitive.Description>
                {state.state === 'unused' && state.activation !== 'done' && state.hasOtherCard && (
                  <p className="rounded-control border border-info-border bg-info-subtle px-3 py-2 text-sm text-info">
                    {copy.cardUnusedHasOther}
                  </p>
                )}
                {state.error && (
                  <p role="alert" className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {state.error}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  {state.state === 'unused' && state.activation !== 'done' ? (
                    <Button
                      ref={primaryRef}
                      size="lg"
                      className="min-h-12 flex-1 gap-2 text-base touch-manipulation"
                      disabled={state.activation === 'pending'}
                      aria-busy={state.activation === 'pending'}
                      onClick={() => onActivate(state.token)}
                    >
                      {state.activation === 'pending' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                          {copy.cardActivating}
                        </>
                      ) : (
                        copy.cardActivate
                      )}
                    </Button>
                  ) : (
                    <Button ref={primaryRef} asChild size="lg" className="min-h-12 flex-1 gap-2 text-base touch-manipulation">
                      <Link href="/customer/my-card">
                        {copy.goToMyCard}
                        <ArrowRight className="h-5 w-5" aria-hidden />
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="lg"
                    className="min-h-12 gap-2 touch-manipulation"
                    disabled={state.activation === 'pending'}
                    onClick={onScanAnother}
                  >
                    <ScanLine className="h-4 w-4" aria-hidden />
                    {copy.scanAnother}
                  </Button>
                </div>
              </div>
            )}

            {state?.type === 'message' && (
              <m.div
                className="space-y-4"
                initial={policy.reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={policy.transition({ duration: DURATION.base, ease: EASE.standard })}
              >
                <div className="flex items-start gap-3 pr-10">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-control',
                      state.tone === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning'
                    )}
                  >
                    <AlertTriangle className="h-6 w-6" />
                  </span>
                  <DialogPrimitive.Title className="pt-2 text-base font-semibold leading-relaxed text-fg">
                    {state.text}
                  </DialogPrimitive.Title>
                </div>
                <DialogPrimitive.Description className="sr-only">{state.text}</DialogPrimitive.Description>
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  {state.signIn ? (
                    <Button ref={primaryRef} asChild size="lg" className="min-h-12 flex-1 touch-manipulation">
                      <Link href="/auth/login?callbackUrl=%2Fcustomer%2Fscan">{copy.signIn}</Link>
                    </Button>
                  ) : state.retry ? (
                    <Button ref={primaryRef} size="lg" className="min-h-12 flex-1 touch-manipulation" onClick={onRetry}>
                      {copy.retry}
                    </Button>
                  ) : (
                    <Button ref={primaryRef} size="lg" className="min-h-12 flex-1 gap-2 touch-manipulation" onClick={onScanAnother}>
                      <ScanLine className="h-4 w-4" aria-hidden />
                      {copy.scanAnother}
                    </Button>
                  )}
                  <Button variant="outline" size="lg" className="min-h-12 touch-manipulation" onClick={onClose}>
                    {copy.close}
                  </Button>
                </div>
              </m.div>
            )}
          </m.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
