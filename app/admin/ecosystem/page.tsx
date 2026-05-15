'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid, Loader2, ArrowUpRight } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import type { EcosystemSummaryPayload } from '@/lib/admin-ecosystem-types';

const QUICK_LINKS = [
  { href: '/admin/platform-pulse', titleKey: 'linkPlatformPulse' },
  { href: '/admin/users', titleKey: 'linkUsers' },
  { href: '/admin/dealers-health', titleKey: 'linkDealersHealth' },
  { href: '/admin/feedbacks', titleKey: 'linkFeedbacks' },
  { href: '/admin/api-catalog', titleKey: 'linkApiCatalog' },
  { href: '/admin/modules', titleKey: 'linkModules' },
  { href: '/admin/analytics', titleKey: 'linkAnalytics' },
] as const;

function formatInt(n: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR').format(n);
}

export default function AdminEcosystemPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EcosystemSummaryPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ecosystem-summary', { cache: 'no-store' });
        const json = (await res.json()) as { success?: boolean } & Partial<EcosystemSummaryPayload>;
        if (cancelled) return;
        if (!res.ok || !json.success || json.totalUsers === undefined || !json.usersByRole) {
          toast.error(t('adminEcosystem.loadError'));
          setData(null);
          return;
        }
        setData({
          generatedAt: json.generatedAt!,
          totalUsers: json.totalUsers,
          usersByRole: json.usersByRole as EcosystemSummaryPayload['usersByRole'],
          feedbacksLast7Days: json.feedbacksLast7Days ?? 0,
          consumptionsLast7Days: json.consumptionsLast7Days ?? 0,
        });
      } catch {
        if (!cancelled) {
          toast.error(t('adminEcosystem.loadError'));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const roleOrder = ['ADMIN', 'DEALER', 'CUSTOMER', 'STAFF'] as const;

  return (
    <div className="space-y-8 pb-10">
      <AdminPremiumHero
        eyebrow={t('adminEcosystem.eyebrow')}
        title={t('adminEcosystem.title')}
        description={t('adminEcosystem.description')}
        icon={<LayoutGrid className="size-7" aria-hidden />}
        tone="auto"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span>{t('adminEcosystem.loading')}</span>
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('adminEcosystem.statTotalUsers')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{formatInt(data.totalUsers, locale)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('adminEcosystem.statFeedbacks7d')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{formatInt(data.feedbacksLast7Days, locale)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('adminEcosystem.statConsumptions7d')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{formatInt(data.consumptionsLast7Days, locale)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('adminEcosystem.statGenerated')}</CardDescription>
                <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
                  {new Date(data.generatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR')}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-lg">{t('adminEcosystem.rolesTitle')}</CardTitle>
              <CardDescription>{t('adminEcosystem.rolesHint')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {roleOrder.map((role) => (
                <Badge key={role} variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
                  <span className="font-medium">{t(`adminEcosystem.role.${role}`)}</span>
                  <span className="tabular-nums text-muted-foreground">{formatInt(data.usersByRole[role] ?? 0, locale)}</span>
                </Badge>
              ))}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{t('adminEcosystem.quickLinksTitle')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {QUICK_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/50 p-4 transition-colors',
                    'hover:border-primary/30 hover:bg-primary/[0.04]'
                  )}
                >
                  <span className="font-medium">{t(`adminEcosystem.quick.${item.titleKey}`)}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="py-12 text-center text-muted-foreground">{t('adminEcosystem.empty')}</p>
      )}
    </div>
  );
}
