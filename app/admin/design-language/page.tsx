'use client';

import Link from 'next/link';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutTemplate, ExternalLink } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { PREMIUM_PANEL_CARD_BASE, premiumPanelCardAccentClass } from '@/lib/panel-surface';

export default function AdminDesignLanguagePage() {
  const t = useAppT();

  const blocks = [
    { key: 'hero' as const, accent: 'primary' as const },
    { key: 'surfaces' as const, accent: 'cyan' as const },
    { key: 'avoid' as const, accent: 'violet' as const },
    { key: 'status' as const, accent: 'emerald' as const },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 pb-12">
      <AdminPremiumHero
        eyebrow={t('adminDesignLanguage.eyebrow')}
        title={t('adminDesignLanguage.title')}
        description={t('adminDesignLanguage.description')}
        icon={<LayoutTemplate className="size-7" aria-hidden />}
        tone="auto"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {blocks.map((b) => (
          <Card key={b.key} className={cn(PREMIUM_PANEL_CARD_BASE, 'border-border/80')}>
            <div className={premiumPanelCardAccentClass(b.accent)} aria-hidden />
            <CardHeader className="pl-6">
              <CardTitle className="text-base">{t(`adminDesignLanguage.block.${b.key}.title`)}</CardTitle>
              <CardDescription className="text-pretty">
                {t(`adminDesignLanguage.block.${b.key}.body`)}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'border-border/80')}>
        <div className={premiumPanelCardAccentClass('amber')} aria-hidden />
        <CardHeader className="pl-6">
          <CardTitle className="text-base">{t('adminDesignLanguage.repoTitle')}</CardTitle>
          <CardDescription>{t('adminDesignLanguage.repoBody')}</CardDescription>
        </CardHeader>
        <CardContent className="pl-6 pt-0">
          <code className="rounded-md bg-muted/60 px-2 py-1 text-xs">components/layout/DESIGN-LANGUAGE.md</code>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/accessibility"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminDesignLanguage.linkAccessibility')}
        </Link>
        <Link
          href="/admin/observability#core-web-vitals"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminDesignLanguage.linkObservability')}
          <ExternalLink className="size-3.5 opacity-70" aria-hidden />
        </Link>
        <Link
          href="/admin/settings?tab=auth"
          className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
        >
          {t('adminDesignLanguage.linkEmailSettings')}
        </Link>
      </div>
    </div>
  );
}
