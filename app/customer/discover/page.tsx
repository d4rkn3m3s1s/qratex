'use client';

import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Compass, ChevronRight } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

type CustomerLabelKey =
  | 'rewards'
  | 'quests'
  | 'surprise_boxes'
  | 'badges'
  | 'shop'
  | 'squads'
  | 'campaigns'
  | 'leaderboard'
  | 'donations'
  | 'ai_insights'
  | 'trends'
  | 'journey_score'
  | 'analytics'
  | 'nearby'
  | 'experiences'
  | 'spending_overview'
  | 'progress_hub';

const SECTIONS: { sectionTitleKey: string; sectionDescKey: string; links: { href: string; labelKey: CustomerLabelKey }[] }[] = [
  {
    sectionTitleKey: 'customerDiscover.sectionEarnTitle',
    sectionDescKey: 'customerDiscover.sectionEarnDesc',
    links: [
      { href: '/customer/progress-hub', labelKey: 'progress_hub' },
      { href: '/customer/rewards', labelKey: 'rewards' },
      { href: '/customer/quests', labelKey: 'quests' },
      { href: '/customer/surprise-boxes', labelKey: 'surprise_boxes' },
      { href: '/customer/badges', labelKey: 'badges' },
      { href: '/customer/shop', labelKey: 'shop' },
    ],
  },
  {
    sectionTitleKey: 'customerDiscover.sectionCommunityTitle',
    sectionDescKey: 'customerDiscover.sectionCommunityDesc',
    links: [
      { href: '/customer/squads', labelKey: 'squads' },
      { href: '/customer/campaigns', labelKey: 'campaigns' },
      { href: '/customer/leaderboard', labelKey: 'leaderboard' },
      { href: '/customer/donations', labelKey: 'donations' },
    ],
  },
  {
    sectionTitleKey: 'customerDiscover.sectionInsightTitle',
    sectionDescKey: 'customerDiscover.sectionInsightDesc',
    links: [
      { href: '/customer/ai-insights', labelKey: 'ai_insights' },
      { href: '/customer/trends', labelKey: 'trends' },
      { href: '/customer/journey-score', labelKey: 'journey_score' },
      { href: '/customer/analytics', labelKey: 'analytics' },
      { href: '/customer/spending-overview', labelKey: 'spending_overview' },
      { href: '/customer/nearby', labelKey: 'nearby' },
      { href: '/customer/experiences', labelKey: 'experiences' },
    ],
  },
];

export default function CustomerDiscoverPage() {
  const t = useAppT();

  return (
    <div className="space-y-8 pb-10">
      <DashboardPageHero
        eyebrow={t('customerDiscover.eyebrow')}
        title={t('customerDiscover.title')}
        description={t('customerDiscover.subtitle')}
        icon={<Compass className="size-7" aria-hidden />}
        tone="auto"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Card key={section.sectionTitleKey} className="border-border/80">
            <CardHeader>
              <CardTitle className="text-lg">{t(section.sectionTitleKey)}</CardTitle>
              <CardDescription>{t(section.sectionDescKey)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {section.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors',
                    'hover:bg-muted/80'
                  )}
                >
                  <span>{t(`sidebarNav.customer.${link.labelKey}`)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
