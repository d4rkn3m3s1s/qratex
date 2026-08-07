'use client';

import { useEffect, useRef, useState } from 'react';
import { Flame, Gift, Check } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { triggerSuccessBurst } from '@/lib/effects/confetti';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type Milestone = { days: number; points: number };

type StreakResponse = {
  success?: boolean;
  streak?: number;
  longest?: number;
  milestones?: Milestone[];
  claimedMilestones?: number[];
  nextMilestone?: Milestone | null;
  daysUntilNextMilestone?: number | null;
  todayClaimed?: boolean;
  milestoneReward?: Milestone | null;
};

/**
 * GÜNLÜK GİRİŞ SERİSİ kartı.
 *
 * Mount olduğunda /api/customer/streak GET çağırır → bu, login streak'i günde bir
 * kez ilerletir (touchLoginStreak) ve kilometre taşında atomik puan ödülü verir.
 * Yeni bir ödül kazanıldıysa küçük bir kutlama (konfeti + toast) tetiklenir.
 *
 * MİNİ OYUN serisinden ve UserStreak loyalty'den bağımsızdır.
 */
export function LoginStreakCard({ className }: { className?: string }) {
  const [data, setData] = useState<StreakResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const celebratedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/customer/streak', { credentials: 'same-origin' });
        const json: StreakResponse = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok && json.success) {
          setData(json);
          // Bu yüklemede yeni bir kilometre taşı ödülü kazanıldıysa kutla (bir kez).
          if (json.todayClaimed && json.milestoneReward && !celebratedRef.current) {
            celebratedRef.current = true;
            triggerSuccessBurst();
            toast.success(
              `🔥 ${json.milestoneReward.days} günlük seri! +${json.milestoneReward.points} puan kazandın!`
            );
          }
        }
      } catch {
        // Sessizce geç — streak kartı kritik değil.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Yüklenirken hafif iskelet.
  if (loading) {
    return (
      <Card className={cn('overflow-hidden border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-transparent', className)}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-11 w-11 rounded-xl bg-orange-500/20" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-2 w-full rounded bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const streak = data.streak ?? 0;
  const longest = data.longest ?? 0;
  const milestones = data.milestones ?? [];
  const claimed = data.claimedMilestones ?? [];
  const next = data.nextMilestone ?? null;
  const daysLeft = data.daysUntilNextMilestone ?? null;

  // Sonraki kilometre taşına ilerleme (bir önceki taş -> sonraki taş arası).
  let progressPct = 0;
  if (next) {
    const prevMilestoneDays = milestones
      .filter((m) => m.days < next.days)
      .reduce((max, m) => Math.max(max, m.days), 0);
    const span = Math.max(1, next.days - prevMilestoneDays);
    progressPct = Math.max(0, Math.min(100, ((streak - prevMilestoneDays) / span) * 100));
  } else {
    progressPct = 100; // tüm kilometre taşları alındı
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent shadow-sm',
        className
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative shrink-0">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500">
              <Flame className="h-6 w-6" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black tabular-nums tracking-tight text-foreground">
                {streak}
              </span>
              <span className="text-sm font-semibold text-orange-500">günlük seri</span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              {next && daysLeft != null && daysLeft > 0 ? (
                <>
                  Sonraki ödüle{' '}
                  <span className="font-semibold text-foreground">{daysLeft} gün</span> kaldı
                  {' · '}
                  <span className="inline-flex items-center gap-0.5 text-orange-500 font-semibold">
                    <Gift className="h-3 w-3" /> +{next.points} puan
                  </span>
                </>
              ) : (
                <>Tüm kilometre taşlarını tamamladın! En uzun serin: {longest} gün 🎉</>
              )}
            </p>
          </div>
        </div>

        {/* Sonraki taşa ilerleme çubuğu */}
        {next && (
          <Progress
            value={progressPct}
            className="h-1.5 rounded-full mt-3 bg-orange-500/15"
            indicatorClassName="bg-gradient-to-r from-orange-500 to-amber-400"
          />
        )}

        {/* Kilometre taşı rozetleri */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {milestones.map((m) => {
            const isClaimed = claimed.includes(m.days);
            const isReached = streak >= m.days;
            return (
              <span
                key={m.days}
                title={`${m.days} gün → +${m.points} puan`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                  isClaimed
                    ? 'border-orange-500/40 bg-orange-500/15 text-orange-500'
                    : isReached
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-border/60 bg-muted/40 text-muted-foreground'
                )}
              >
                {isClaimed ? <Check className="h-3 w-3" /> : <Flame className="h-3 w-3" />}
                {m.days}g
              </span>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default LoginStreakCard;
