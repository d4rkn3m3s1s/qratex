'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronRight, Gauge, Loader2, Target } from 'lucide-react';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

type StatsPayload = {
  success?: boolean;
  data?: {
    user?: { level?: number; points?: number; levelProgress?: number; xpProgress?: number; xpNeeded?: number };
    stats?: {
      feedbackCount?: number;
      badgeCount?: number;
      pendingReviewCount?: number;
      consumptionCount?: number;
    };
    activeQuests?: { id: string; name: string; progress: number; target: number; icon?: string | null }[];
    badges?: { id: string; name: string; icon?: string; rarity?: string }[];
  };
};

export default function CustomerProgressHubPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [data, setData] = useState<StatsPayload['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewBadge, setPreviewBadge] = useState<
    { id: string; name: string; icon?: string; rarity?: string } | null
  >(null);

  const nf = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR'),
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/customer/stats', { cache: 'no-store' });
        const json = (await res.json()) as StatsPayload;
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) setData(null);
        else setData(json.data);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const user = data?.user;
  const stats = data?.stats;
  const levelProgress = user?.levelProgress != null ? Math.min(100, Number(user.levelProgress)) : 0;
  const quests = data?.activeQuests ?? [];
  const badges = (data?.badges ?? []).slice(0, 8);

  return (
    <div className="space-y-8 pb-12">
      <DashboardPageHero
        eyebrow={t('customerProgressHub.eyebrow')}
        title={t('customerProgressHub.title')}
        description={t('customerProgressHub.subtitle')}
        icon={<Gauge className="size-7" aria-hidden />}
        tone="auto"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t('customerProgressHub.loading')}
        </div>
      ) : !user || !stats ? (
        <p className="py-16 text-center text-muted-foreground">{t('customerProgressHub.loadError')}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-lg">{t('customerProgressHub.levelTitle')}</CardTitle>
                <CardDescription>{t('customerProgressHub.levelHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('customerProgressHub.levelLabel')}
                    </p>
                    <p className="text-3xl font-bold tabular-nums">{nf.format(user.level ?? 1)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t('customerProgressHub.pointsLabel')}</p>
                    <p className="text-xl font-semibold tabular-nums">{nf.format(user.points ?? 0)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('customerProgressHub.xpProgress')}</span>
                    <span className="tabular-nums">
                      {nf.format(user.xpProgress ?? 0)} / {nf.format(user.xpNeeded ?? 1)}
                    </span>
                  </div>
                  <Progress value={levelProgress} className="h-2.5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-lg">{t('customerProgressHub.activityTitle')}</CardTitle>
                <CardDescription>{t('customerProgressHub.activityHint')}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('customerProgressHub.statFeedback')}</p>
                  <p className="text-2xl font-semibold tabular-nums">{nf.format(stats.feedbackCount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('customerProgressHub.statBadges')}</p>
                  <p className="text-2xl font-semibold tabular-nums">{nf.format(stats.badgeCount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('customerProgressHub.statConsumptions')}</p>
                  <p className="text-2xl font-semibold tabular-nums">{nf.format(stats.consumptionCount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('customerProgressHub.statPendingReviews')}</p>
                  <p className="text-2xl font-semibold tabular-nums">{nf.format(stats.pendingReviewCount ?? 0)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/80">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="size-5 text-primary" aria-hidden />
                    {t('customerProgressHub.questsTitle')}
                  </CardTitle>
                  <CardDescription>{t('customerProgressHub.questsHint')}</CardDescription>
                </div>
                <Link href="/customer/quests" className="text-sm font-medium text-primary hover:underline">
                  {t('customerProgressHub.openQuests')}
                  <ChevronRight className="inline size-4 align-text-bottom" aria-hidden />
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {quests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('customerProgressHub.noQuests')}</p>
                ) : (
                  quests.map((q) => {
                    const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
                    return (
                      <div key={q.id} className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
                        <p className="text-sm font-medium">{q.name}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {q.progress}/{q.target}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-lg">{t('customerProgressHub.badgesTitle')}</CardTitle>
                  <CardDescription>{t('customerProgressHub.badgesHint')}</CardDescription>
                </div>
                <Link href="/customer/badges" className="text-sm font-medium text-primary hover:underline">
                  {t('customerProgressHub.openBadges')}
                  <ChevronRight className="inline size-4 align-text-bottom" aria-hidden />
                </Link>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {badges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('customerProgressHub.noBadges')}</p>
                ) : (
                  badges.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setPreviewBadge(b)}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${b.name} — ${t('customerProgressHub.badgePreviewAria')}`}
                    >
                      <Badge
                        variant="secondary"
                        className="gap-1 px-2 py-1 text-xs font-normal cursor-pointer hover:bg-secondary/80 transition-colors"
                      >
                        {b.icon ? <span aria-hidden>{b.icon}</span> : null}
                        <span className="max-w-[10rem] truncate">{b.name}</span>
                      </Badge>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/customer/journey-score"
              className={cn(
                'rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium',
                'hover:border-primary/30'
              )}
            >
              {t('customerProgressHub.linkJourney')}
            </Link>
            <Link
              href="/customer/spending-overview"
              className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
            >
              {t('customerProgressHub.linkSpending')}
            </Link>
            <Link
              href="/customer/rewards"
              className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
            >
              {t('customerProgressHub.linkRewards')}
            </Link>
          </div>
        </>
      )}

      <Dialog open={!!previewBadge} onOpenChange={(open) => !open && setPreviewBadge(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewBadge?.icon ? <span aria-hidden className="text-2xl">{previewBadge.icon}</span> : null}
              {previewBadge?.name}
            </DialogTitle>
            <DialogDescription>
              {previewBadge?.rarity
                ? t('customerProgressHub.badgeRarityLabel').replace('{rarity}', previewBadge.rarity)
                : t('customerProgressHub.badgePreviewDescription')}
            </DialogDescription>
          </DialogHeader>
          <Link
            href="/customer/badges"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => setPreviewBadge(null)}
          >
            {t('customerProgressHub.openBadges')}
            <ChevronRight className="inline size-4 align-text-bottom" aria-hidden />
          </Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
