'use client';

/**
 * Adım 3 — ödül anı. Eski ekran aynı cümleyi üç kez söylüyordu (başlık + açıklama + toast),
 * çarpansız XP gösteriyordu, tavanı açıklamıyordu ve anonime karşılanmayan "Kayıt ol ve puan
 * kazan" vaadi veriyordu (envanter #32-37). Şimdi: tek teşekkür + sunucunun KREDİLEDİĞİ
 * gerçek değerler + seviye ilerlemesi + tavan açıklaması; anonime gerçek bağlama teklifi
 * (`?claim=1` dönüşünde hesaba bağlanır). Seviye kutlaması An Motoru'nda (tam bir kez).
 */
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { CheckCircle2, CloudOff, Gift, Info, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION, EASE, SPRING } from '@/lib/motion/tokens';
import type { FeedbackRewardResult } from '@/lib/feedback-funnel/schema';
import type { FunnelCopy } from './copy';
import type { FunnelViewerInfo } from './types';
import { btnPrimary, btnSecondary } from './button-styles';

export type FunnelOutcome = { kind: 'sent'; reward: FeedbackRewardResult } | { kind: 'queued' };

function withClaimIntent(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}claim=1`;
}

export function SuccessPanel({
  outcome,
  copy,
  venueName,
  viewer,
  selfPath,
  reduce,
  headingRef,
}: {
  outcome: FunnelOutcome;
  copy: FunnelCopy;
  venueName: string;
  viewer: FunnelViewerInfo;
  selfPath: string;
  reduce: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const queued = outcome.kind === 'queued';
  const reward = outcome.kind === 'sent' ? outcome.reward : null;
  const callback = encodeURIComponent(withClaimIntent(selfPath));

  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center">
      <Motion.div
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : SPRING.bouncy}
        className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full',
          queued ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'
        )}
      >
        {queued ? <CloudOff aria-hidden className="h-10 w-10" /> : <CheckCircle2 aria-hidden className="h-10 w-10" />}
      </Motion.div>

      <div className="space-y-2">
        <h1 ref={headingRef} tabIndex={-1} className="qx-h1 text-fg outline-none">
          {queued ? copy.successQueuedTitle : copy.successTitle}
        </h1>
        <p className="qx-body text-fg-muted">{queued ? copy.successQueued : copy.successSub(venueName)}</p>
      </div>

      {reward && (reward.status === 'credited' || reward.status === 'capped') && (
        <Motion.section
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.slow, ease: EASE.emphasized, delay: reduce ? 0 : 0.15 }}
          aria-labelledby="fb-earned"
          className="w-full rounded-card border border-brand-border bg-brand-subtle p-4 text-left qx-elevation-1"
        >
          <p id="fb-earned" className="qx-overline text-brand">
            {copy.earned}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="qx-display qx-num text-fg">
              +{reward.points} <span className="qx-body font-semibold text-fg-muted">{copy.points}</span>
            </span>
            {reward.xp > 0 && (
              <span className="qx-h3 qx-num text-brand">
                +{reward.xp} {copy.xp}
              </span>
            )}
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between qx-small text-fg-muted">
              <span className="font-medium text-fg">{reward.leveledUp ? copy.levelUp(reward.level) : copy.levelLine(reward.level)}</span>
              <span className="qx-num">{copy.toNextLevel(reward.xpToNextLevel)}</span>
            </div>
            <div
              role="progressbar"
              aria-label={copy.levelLine(reward.level)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={reward.levelProgressPct}
              className="h-2 overflow-hidden rounded-full bg-surface-3"
            >
              <Motion.div
                className="h-full rounded-full bg-brand"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${reward.levelProgressPct}%` }}
                transition={{ duration: reduce ? 0 : DURATION.celebrate, ease: EASE.emphasized }}
              />
            </div>
          </div>
          {reward.squadContribution > 0 && (
            <p className="mt-3 flex items-center gap-2 qx-small text-fg-muted">
              <Users aria-hidden className="h-4 w-4 text-brand" />
              {copy.squadLine(reward.squadContribution)}
            </p>
          )}
          {reward.status === 'capped' && (
            <p className="mt-3 flex items-start gap-2 rounded-control bg-surface-1 p-3 qx-small text-fg-muted">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <span>{reward.points > 0 ? copy.cappedPartial(reward.points, reward.requested) : copy.cappedNote}</span>
            </p>
          )}
        </Motion.section>
      )}

      {reward?.status === 'conflict' && (
        <section className="w-full rounded-card border border-subtle bg-surface-1 p-4 text-left">
          <p className="qx-body font-semibold text-fg">{copy.conflictTitle}</p>
          <p className="mt-1 qx-small text-fg-muted">{copy.conflictBody}</p>
        </section>
      )}

      {reward?.status === 'claimable' && (
        <section aria-labelledby="fb-claim" className="w-full rounded-card border border-brand-border bg-brand-subtle p-4 text-left qx-elevation-1">
          <p id="fb-claim" className="flex items-center gap-2 qx-h3 text-fg">
            <Gift aria-hidden className="h-5 w-5 text-brand" />
            {copy.claimTitle(reward.points)}
          </p>
          <p className="mt-1 qx-small text-fg-muted">{copy.claimBody}</p>
          <div className="mt-4 grid gap-2">
            <Link href={`/auth/register?callbackUrl=${callback}`} className={btnPrimary}>
              <Sparkles aria-hidden className="h-4 w-4" />
              {copy.claimRegister}
            </Link>
            <Link href={`/auth/login?callbackUrl=${callback}`} className={btnSecondary}>
              {copy.claimLogin}
            </Link>
          </div>
        </section>
      )}

      {reward?.status === 'guest' && <p className="qx-small text-fg-muted">{copy.guestBody}</p>}

      <nav className="grid w-full gap-2" aria-label={copy.stepNames[2]}>
        {viewer.signedIn && viewer.role === 'CUSTOMER' && (
          <Link href="/customer/me/voices" className={btnSecondary}>
            {copy.goVoices}
          </Link>
        )}
        {viewer.signedIn && viewer.homePath ? (
          <Link href={viewer.homePath} className={btnSecondary}>
            {copy.goPanel}
          </Link>
        ) : (
          <Link href="/" className={btnSecondary}>
            {copy.goHome}
          </Link>
        )}
      </nav>
    </div>
  );
}
