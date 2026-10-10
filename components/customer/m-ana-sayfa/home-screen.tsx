'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { m as Motion } from 'framer-motion';
import { toast } from '@/lib/admin-toast';
import { moments } from '@/lib/moments/client';
import { QueryState } from '@/components/states';
import { formatInt } from '@/components/ds/play/shared';
import { listContainer, listItem, useMotionPolicy } from '@/lib/motion';
import type { CustomerHomeData, HomeStreak } from '@/lib/customer-home/types';
import { useHomeCopy } from './copy';
import { readEnvelope, useCustomerHome, useHomeCache } from './use-home';
import { HomeSkeleton } from './home-skeleton';
import { StatusHero } from './status-hero';
import { DailyGoals } from './daily-goals';
import { StreakCard } from './streak-card';
import { PendingActions } from './pending-actions';
import { LeagueStrip } from './league-strip';
import { SpinCard } from './spin-card';
import { SurpriseBoxCard } from './surprise-box-card';
import { FirstSteps } from './first-steps';
import type { SpinResult } from './spin-dialog';

// Çark diyaloğu ayrı chunk: yalnız "Çarkı çevir"e basılınca yüklenir.
const SpinDialog = dynamic(() => import('./spin-dialog'), { ssr: false });

/**
 * Müşteri Ana Sayfa istemci adası. İlk veri SSR'dan (HydrationBoundary) gelir; bu ada
 * yalnız etkileşimi (seri dokunuşu, çark, tazeleme) taşır. Hata asla "boş" görünmez.
 */
export function HomeScreen() {
  const { copy } = useHomeCopy();
  const query = useCustomerHome();

  return (
    <div data-register="play" className="mx-auto w-full max-w-6xl">
      <h1 className="sr-only">{copy.pageLabel}</h1>
      <QueryState
        query={query}
        skeleton={<HomeSkeleton />}
        error={{ title: copy.errorTitle, description: copy.errorDesc }}
        loadingLabel={copy.pageLabel}
      >
        {(data) => <HomeContent data={data} />}
      </QueryState>
    </div>
  );
}

type StreakTouch = HomeStreak & {
  isNewDay: boolean;
  milestoneReward: { days: number; points: number } | null;
};

function HomeContent({ data }: { data: CustomerHomeData }) {
  const { copy, locale } = useHomeCopy();
  const policy = useMotionPolicy();
  const { patch, refresh } = useHomeCache();
  const [spinOpen, setSpinOpen] = useState(false);
  const [streakSaving, setStreakSaving] = useState(!data.streak.countedToday);
  const touchedRef = useRef(false);

  // Seri: sayfa açılışında bugünü say (POST; günde bir kez ilerler, sunucu idempotent).
  useEffect(() => {
    if (touchedRef.current) return;
    touchedRef.current = true;
    if (data.streak.countedToday) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/customer/streak', { method: 'POST', credentials: 'same-origin' });
        const s = await readEnvelope<StreakTouch>(res);
        if (!alive) return;
        patch((prev) => ({
          ...prev,
          streak: {
            days: s.days,
            longest: s.longest,
            countedToday: s.countedToday,
            week: s.week,
            nextMilestone: s.nextMilestone,
          },
          goals: prev.goals.map((g) => (g.id === 'streak' ? { ...g, done: s.countedToday } : g)),
        }));
        const reward = s.milestoneReward;
        if (reward && reward.points > 0) {
          const shown = moments.points({ points: reward.points });
          moments.refresh();
          toast.success(shown ? copy.streakToast(reward.days) : copy.streakToastNoHost(reward.days, formatInt(reward.points, locale)));
          void refresh();
        }
      } catch {
        // Seri dokunuşu kritik değil: kart "kaydediliyor"dan çıkar, veri bir sonraki tazelemede gelir.
      } finally {
        if (alive) setStreakSaving(false);
      }
    })();
    return () => {
      alive = false;
    };
    // Yalnız ilk açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSpinResult = useCallback(
    (r: SpinResult) => {
      const gained = { points: r.credited.points, xp: r.credited.xp };
      if (gained.points > 0 || gained.xp > 0) {
        const shown = moments.points(gained);
        if (!shown) {
          toast.success(
            gained.points > 0 ? copy.spinWonPoints(formatInt(gained.points, locale)) : copy.spinWonXp(formatInt(gained.xp, locale))
          );
        }
        moments.refresh(); // seviye/lig atlaması kaydedilmiş olabilir
      }
      patch((prev) => ({
        ...prev,
        wallet: r.balance != null ? { ...prev.wallet, points: r.balance } : prev.wallet,
        spin: prev.spin ? { ...prev.spin, remaining: r.remaining } : prev.spin,
        goals: prev.goals.map((g) => (g.id === 'spin' ? { ...g, done: true } : g)),
      }));
    },
    [copy, locale, patch]
  );

  const onSpinOpenChange = useCallback(
    (open: boolean) => {
      setSpinOpen(open);
      if (!open) void refresh(); // haftalık kazanç, ödül hedefi, lig sırası sunucudan tazelenir
    },
    [refresh]
  );

  const openSpin = useCallback(() => {
    if (data.spin && data.spin.remaining > 0) setSpinOpen(true);
  }, [data.spin]);

  const item = policy.variants(listItem);

  return (
    <Motion.div
      className="flex min-w-0 flex-col gap-4 sm:gap-5"
      variants={policy.variants(listContainer)}
      initial="hidden"
      animate="visible"
    >
      <Motion.div variants={item}>
        <StatusHero data={data} />
      </Motion.div>

      {data.isNewCustomer ? (
        <Motion.div variants={item}>
          <FirstSteps />
        </Motion.div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:col-span-7">
          <Motion.div variants={item}>
            <DailyGoals goals={data.goals} streakSaving={streakSaving} onSpin={openSpin} />
          </Motion.div>
          <Motion.div variants={item}>
            <PendingActions items={data.pending} />
          </Motion.div>
          <Motion.div variants={item}>
            <StreakCard streak={data.streak} saving={streakSaving} />
          </Motion.div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:col-span-5">
          {data.spin || data.surpriseBox ? (
            <Motion.div variants={item} className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-1">
              {data.spin ? <SpinCard spin={data.spin} onOpen={openSpin} /> : null}
              {data.surpriseBox ? <SurpriseBoxCard box={data.surpriseBox} /> : null}
            </Motion.div>
          ) : null}
          <Motion.div variants={item}>
            <LeagueStrip league={data.league} showLeaderboardLink={data.sections.leaderboard} />
          </Motion.div>
        </div>
      </div>

      {data.spin && spinOpen ? (
        <SpinDialog open={spinOpen} onOpenChange={onSpinOpenChange} spin={data.spin} onResult={onSpinResult} />
      ) : null}
    </Motion.div>
  );
}
