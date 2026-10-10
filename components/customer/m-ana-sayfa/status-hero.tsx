'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { m as Motion, useAnimationControls } from 'framer-motion';
import { ChevronRight, Gift, QrCode } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserAvatarFrame } from '@/components/ui/avatar-frame';
import { LeagueEmblem, MOMENT_PULSE_EVENT, RewardProgress, XpRing } from '@/components/ds/play';
import { FOCUS_RING, formatInt } from '@/components/ds/play/shared';
import { SPRING, useNumberTicker, useReducedMotionPref } from '@/lib/motion';
import { HOME_LINKS } from '@/lib/customer-home/core';
import type { CustomerHomeData } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';

/**
 * Durum kartı: kim olduğun (avatar + çerçeve + kuşanılmış arka plan), bakiye (An Motoru
 * puan kapsülünün TEK hedefi), seviye halkası (XP), lig çipi, sonraki ödüle kalan puan ve
 * ana eylem (QR tara). Puan ve XP ayrı para birimi olarak ayrı gösterilir.
 */
export function StatusHero({ data }: { data: CustomerHomeData }) {
  const { copy, locale } = useHomeCopy();
  const { profile, wallet, level, league, sections } = data;
  const name = profile.name?.trim() || copy.fallbackName;

  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative isolate overflow-hidden rounded-sheet border border-brand-border bg-surface-1 qx-elevation-2"
    >
      {profile.backgroundUrl ? (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url("${profile.backgroundUrl}")` }}
        />
      ) : null}
      {/* Tek, statik marka gradyanı (sonsuz küre/leke animasyonları kaldırıldı). */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_0%_0%,hsl(var(--gradient-from)/0.22),transparent_60%),radial-gradient(90%_70%_at_100%_100%,hsl(var(--gradient-to)/0.18),transparent_60%)]"
      />

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        {/* Kimlik satırı */}
        <div className="flex items-center gap-3">
          <Link
            href={HOME_LINKS.profile}
            aria-label={copy.editProfile}
            className={cn('relative size-14 shrink-0 rounded-full sm:size-16', FOCUS_RING)}
          >
            <UserAvatarFrame frameId={profile.frameId} customColor={profile.frameColor}>
              <Avatar className="size-full">
                {profile.image ? <AvatarImage src={profile.image} alt="" /> : null}
                <AvatarFallback className="bg-brand-subtle font-semibold text-brand">{getInitials(name)}</AvatarFallback>
              </Avatar>
            </UserAvatarFrame>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="qx-small text-fg-muted">{copy.greeting[data.greeting]},</p>
            <h2 id="home-hero-title" className="qx-h2 truncate text-fg">
              {name}
            </h2>
          </div>
          <a
            href="#home-league"
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-[hsl(var(--surface-2)/0.72)] px-2.5 qx-small text-fg backdrop-blur',
              FOCUS_RING
            )}
          >
            <LeagueEmblem leagueKey={league.key} name={league.name} size="sm" />
            <span className="max-w-[7rem] truncate font-medium">{league.name}</span>
          </a>
        </div>

        {/* Bakiye + seviye */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-4">
          <div className="min-w-0">
            <p className="qx-overline text-fg-muted">{copy.balance}</p>
            <BalanceNumber value={wallet.points} unit={copy.pointsUnit} locale={locale} />
            <p className="qx-small text-fg-muted">
              {wallet.weekEarned > 0 ? copy.weekEarned(formatInt(wallet.weekEarned, locale)) : copy.weekEarnedNone}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <XpRing level={level.level} current={level.intoLevel} max={level.levelSpan} size={76} />
            <p className="qx-caption tabular-nums text-fg-muted">
              {copy.xpProgress(formatInt(level.intoLevel, locale), formatInt(level.levelSpan, locale))}
            </p>
          </div>
        </div>

        {/* Sonraki ödül */}
        {sections.rewards ? (
          wallet.nextReward ? (
            <div className="rounded-card border border-subtle bg-[hsl(var(--surface-2)/0.66)] p-3 backdrop-blur">
              <RewardProgress
                current={wallet.points}
                target={wallet.nextReward.cost}
                rewardLabel={`${copy.nextReward}: ${wallet.nextReward.name}`}
              />
              <Link
                href={HOME_LINKS.rewards}
                className={cn(
                  'mt-1 inline-flex min-h-11 items-center gap-1 qx-small font-semibold text-brand',
                  FOCUS_RING
                )}
              >
                {wallet.affordableRewards > 0 ? copy.affordable(wallet.affordableRewards) : copy.seeRewards}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : wallet.affordableRewards > 0 ? (
            <Link
              href={HOME_LINKS.rewards}
              className={cn(
                'flex min-h-11 items-center justify-between gap-2 rounded-card border border-success-border bg-success-subtle px-3 py-2 qx-small font-semibold text-success',
                FOCUS_RING
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Gift className="size-4" aria-hidden />
                {copy.affordable(wallet.affordableRewards)}
              </span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <p className="qx-small text-fg-muted">{copy.noRewards}</p>
          )
        ) : null}

        <Button asChild size="lg" className="min-h-12 w-full gap-2 sm:w-auto sm:self-start">
          <Link href={HOME_LINKS.scan}>
            <QrCode className="size-5" aria-hidden />
            {copy.scanCta}
          </Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * Büyük bakiye sayısı — An Motoru puan kapsülünün uçtuğu hedef (`data-moment-anchor`).
 * Değer değişince öncekinden sayar (0'dan değil); kapsül vardığında bir kez nabız atar.
 */
function BalanceNumber({ value, unit, locale }: { value: number; unit: string; locale: 'tr' | 'en' }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduce = useReducedMotionPref();
  const controls = useAnimationControls();
  const shown = useNumberTicker(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPulse = () => {
      if (reduce) return;
      void controls.start({ scale: [1, 1.08, 1], transition: SPRING.bouncy });
    };
    el.addEventListener(MOMENT_PULSE_EVENT, onPulse);
    return () => el.removeEventListener(MOMENT_PULSE_EVENT, onPulse);
  }, [controls, reduce]);

  return (
    <p className="flex items-baseline gap-2">
      <span ref={ref} data-moment-anchor="points" className="inline-block">
        <Motion.span animate={controls} className="inline-block qx-display font-display tabular-nums text-fg" aria-hidden>
          {formatInt(shown, locale)}
        </Motion.span>
      </span>
      <span className="qx-body font-medium text-fg-muted" aria-hidden>
        {unit}
      </span>
      <span className="sr-only" aria-live="polite">
        {formatInt(value, locale)} {unit}
      </span>
    </p>
  );
}
