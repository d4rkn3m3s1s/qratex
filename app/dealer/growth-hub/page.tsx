'use client';

import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sprout, ChevronRight, BarChart3, Megaphone, TrendingDown, PieChart, Target } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/dealer/business-outcomes', titleKey: 'outcomes' as const, icon: Target },
  { href: '/dealer/campaigns', titleKey: 'campaigns' as const, icon: Megaphone },
  { href: '/dealer/roi', titleKey: 'roi' as const, icon: PieChart },
  { href: '/dealer/churn-risk', titleKey: 'churn' as const, icon: TrendingDown },
  { href: '/dealer/benchmark', titleKey: 'benchmark' as const, icon: BarChart3 },
  { href: '/dealer/analytics', titleKey: 'analytics' as const, icon: BarChart3 },
];

export default function DealerGrowthHubPage() {
  const t = useAppT();

  return (
    <div className="space-y-8 pb-12">
      <DashboardPageHero
        eyebrow={t('dealerGrowthHub.eyebrow')}
        title={t('dealerGrowthHub.title')}
        description={t('dealerGrowthHub.subtitle')}
        icon={<Sprout className="size-7" aria-hidden />}
        tone="auto"
      />

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('dealerGrowthHub.intro')}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group block">
              <Card
                className={cn(
                  'h-full border-border/80 transition-colors',
                  'hover:border-primary/35 hover:bg-primary/[0.03]'
                )}
              >
                <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <CardTitle className="text-base leading-snug group-hover:text-primary">
                      {t(`dealerGrowthHub.links.${item.titleKey}`)}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs">
                      {t(`dealerGrowthHub.desc.${item.titleKey}`)}
                    </CardDescription>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="text-xs font-medium text-primary opacity-90 group-hover:underline">
                    {t('dealerGrowthHub.open')}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/dealer/operations-brief"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('dealerGrowthHub.linkOps')}
        </Link>
        <Link
          href="/dealer/discover"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('dealerGrowthHub.linkDiscover')}
        </Link>
      </div>
    </div>
  );
}
