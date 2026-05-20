'use client';

import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Compass, ChevronRight } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

type DealerLabelKey =
  | 'feedbacks'
  | 'reviews'
  | 'remedy_queue'
  | 'voc_wall'
  | 'heatmap'
  | 'radar'
  | 'campaigns'
  | 'surveys'
  | 'churn_risk'
  | 'roi'
  | 'benchmark'
  | 'business_outcomes'
  | 'growth_hub'
  | 'scan_card'
  | 'products'
  | 'qr_codes'
  | 'consumptions'
  | 'incidents'
  | 'action_items'
  | 'analytics'
  | 'innovation_hub'
  | 'operations_brief'
  | 'experience_guide'
  | 'shift_pulse';

const SECTIONS: { sectionTitleKey: string; sectionDescKey: string; links: { href: string; labelKey: DealerLabelKey }[] }[] = [
  {
    sectionTitleKey: 'dealerDiscover.sectionVoiceTitle',
    sectionDescKey: 'dealerDiscover.sectionVoiceDesc',
    links: [
      { href: '/dealer/feedbacks', labelKey: 'feedbacks' },
      { href: '/dealer/reviews', labelKey: 'reviews' },
      { href: '/dealer/remedy-queue', labelKey: 'remedy_queue' },
      { href: '/dealer/voc-wall', labelKey: 'voc_wall' },
      { href: '/dealer/heatmap', labelKey: 'heatmap' },
      { href: '/dealer/radar', labelKey: 'radar' },
    ],
  },
  {
    sectionTitleKey: 'dealerDiscover.sectionGrowthTitle',
    sectionDescKey: 'dealerDiscover.sectionGrowthDesc',
    links: [
      { href: '/dealer/growth-hub', labelKey: 'growth_hub' },
      { href: '/dealer/campaigns', labelKey: 'campaigns' },
      { href: '/dealer/surveys', labelKey: 'surveys' },
      { href: '/dealer/churn-risk', labelKey: 'churn_risk' },
      { href: '/dealer/roi', labelKey: 'roi' },
      { href: '/dealer/benchmark', labelKey: 'benchmark' },
      { href: '/dealer/business-outcomes', labelKey: 'business_outcomes' },
    ],
  },
  {
    sectionTitleKey: 'dealerDiscover.sectionOpsTitle',
    sectionDescKey: 'dealerDiscover.sectionOpsDesc',
    links: [
      { href: '/dealer/scan', labelKey: 'scan_card' },
      { href: '/dealer/products', labelKey: 'products' },
      { href: '/dealer/qr-codes', labelKey: 'qr_codes' },
      { href: '/dealer/consumptions', labelKey: 'consumptions' },
      { href: '/dealer/incidents', labelKey: 'incidents' },
      { href: '/dealer/action-items', labelKey: 'action_items' },
      { href: '/dealer/analytics', labelKey: 'analytics' },
      { href: '/dealer/operations-brief', labelKey: 'operations_brief' },
      { href: '/dealer/innovation', labelKey: 'innovation_hub' },
    ],
  },
];

export default function DealerDiscoverPage() {
  const t = useAppT();

  return (
    <div className="space-y-8 pb-10">
      <DashboardPageHero
        eyebrow={t('dealerDiscover.eyebrow')}
        title={t('dealerDiscover.title')}
        description={t('dealerDiscover.subtitle')}
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
                  <span>{t(`sidebarNav.dealer.${link.labelKey}`)}</span>
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
