'use client';

import Link from 'next/link';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accessibility, ExternalLink, ListChecks } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { PREMIUM_PANEL_CARD_BASE, premiumPanelCardAccentClass } from '@/lib/panel-surface';

const WCAG_QUICKREF = 'https://www.w3.org/WAI/WCAG22/quickref/';
const MDN_A11Y = 'https://developer.mozilla.org/en-US/docs/Web/Accessibility';
const AXE_RULES = 'https://dequeuniversity.com/rules/axe/';

export default function AdminAccessibilityPage() {
  const t = useAppT();

  const pillars = ['perceivable', 'operable', 'understandable', 'robust'] as const;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 pb-12">
      <AdminPremiumHero
        eyebrow={t('adminAccessibility.eyebrow')}
        title={t('adminAccessibility.title')}
        description={t('adminAccessibility.description')}
        icon={<Accessibility className="size-7" aria-hidden />}
        tone="auto"
      />

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('adminAccessibility.intro')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {pillars.map((p, i) => (
          <Card key={p} className={cn(PREMIUM_PANEL_CARD_BASE, 'border-border/80')}>
            <div className={premiumPanelCardAccentClass(i % 2 === 0 ? 'cyan' : 'emerald')} aria-hidden />
            <CardHeader className="pl-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4 shrink-0 text-primary" aria-hidden />
                {t(`adminAccessibility.pillar.${p}.title`)}
              </CardTitle>
              <CardDescription className="text-pretty">{t(`adminAccessibility.pillar.${p}.hint`)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'border-border/80')}>
        <div className={premiumPanelCardAccentClass('violet')} aria-hidden />
        <CardHeader className="pl-6">
          <CardTitle className="text-base">{t('adminAccessibility.linksTitle')}</CardTitle>
          <CardDescription>{t('adminAccessibility.linksHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pl-6 pt-0 sm:flex-row sm:flex-wrap">
          <a
            href={WCAG_QUICKREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium hover:border-primary/35 hover:bg-muted/40"
          >
            {t('adminAccessibility.linkWcag')}
            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
          </a>
          <a
            href={MDN_A11Y}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium hover:border-primary/35 hover:bg-muted/40"
          >
            {t('adminAccessibility.linkMdn')}
            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
          </a>
          <a
            href={AXE_RULES}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium hover:border-primary/35 hover:bg-muted/40"
          >
            {t('adminAccessibility.linkAxe')}
            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
          </a>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/design-language"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminAccessibility.linkDesignLanguage')}
        </Link>
        <Link
          href="/admin/observability#core-web-vitals"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminAccessibility.linkPerformance')}
        </Link>
        <Link
          href="/admin/observability#rum-web-vitals"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminAccessibility.linkRum')}
        </Link>
        <Link
          href="/admin/settings?tab=auth"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminAccessibility.linkEmailSettings')}
        </Link>
      </div>
    </div>
  );
}
