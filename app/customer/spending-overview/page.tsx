'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, ChevronRight, Download, Loader2, Store, Wallet } from 'lucide-react';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';

type OverviewPayload = {
  success?: boolean;
  generatedAt?: string;
  totals?: { visits: number; recordedSpend: number; uniqueDealers: number };
  reviews?: { count: number; avgRating: number | null };
  topDealers?: { dealerId: string; visits: number; label: string; logo: string | null }[];
  monthlyVisits?: { key: string; label: string; count: number; barPct: number }[];
};

export default function CustomerSpendingOverviewPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const nf = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR'),
    [locale]
  );
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 0,
      }),
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/customer/spending-overview', { cache: 'no-store' });
        const json = (await res.json()) as OverviewPayload;
        if (cancelled) return;
        if (!res.ok || !json.success) setData(null);
        else setData(json);
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

  const totals = data?.totals;
  const reviews = data?.reviews;

  const downloadCsv = () => {
    if (!data?.totals) return;
    const sep = locale === 'en' ? ',' : ';';
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows: (string | number)[][] = [
      ['generatedAt', data.generatedAt ?? ''],
      ['visits', data.totals.visits],
      ['uniqueDealers', data.totals.uniqueDealers],
      ['recordedSpendTry', data.totals.recordedSpend],
      ['reviewCount', data.reviews?.count ?? 0],
      ['avgRating', data.reviews?.avgRating ?? ''],
    ];
    (data.monthlyVisits ?? []).forEach((m) => {
      rows.push([`month_${m.key}`, m.count]);
    });
    (data.topDealers ?? []).forEach((d, i) => {
      rows.push([`topDealer_${i + 1}_id`, d.dealerId]);
      rows.push([`topDealer_${i + 1}_label`, d.label]);
      rows.push([`topDealer_${i + 1}_visits`, d.visits]);
    });
    const body = rows.map((r) => r.map((c) => esc(c)).join(sep)).join('\n');
    const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spending-overview-${(data.generatedAt ?? 'export').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('customerSpendingOverview.exportOk'));
  };

  return (
    <div className="space-y-8 pb-12">
      <DashboardPageHero
        eyebrow={t('customerSpendingOverview.eyebrow')}
        title={t('customerSpendingOverview.title')}
        description={t('customerSpendingOverview.subtitle')}
        icon={<Wallet className="size-7" aria-hidden />}
        tone="auto"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t('customerSpendingOverview.loading')}
        </div>
      ) : !totals ? (
        <p className="py-16 text-center text-muted-foreground">{t('customerSpendingOverview.loadError')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadCsv}>
              <Download className="size-4" aria-hidden />
              {t('customerSpendingOverview.exportCsv')}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('customerSpendingOverview.metric.visits')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{nf.format(totals.visits)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('customerSpendingOverview.metric.uniqueDealers')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{nf.format(totals.uniqueDealers)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('customerSpendingOverview.metric.recordedSpend')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{currency.format(totals.recordedSpend)}</CardTitle>
                <p className="text-xs text-muted-foreground">{t('customerSpendingOverview.metric.spendHint')}</p>
              </CardHeader>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardDescription>{t('customerSpendingOverview.metric.reviews')}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {reviews?.avgRating != null ? reviews.avgRating : '—'}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {nf.format(reviews?.count ?? 0)} {t('customerSpendingOverview.metric.reviewsCountSuffix')}
                </p>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="border-border/80 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="size-5 text-primary" aria-hidden />
                  {t('customerSpendingOverview.monthlyTitle')}
                </CardTitle>
                <CardDescription>{t('customerSpendingOverview.monthlyHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data.monthlyVisits ?? []).map((m) => (
                  <div key={m.key} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>{m.label}</span>
                      <span className="tabular-nums">{nf.format(m.count)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary/80 to-cyan-500/70"
                        style={{ width: `${m.barPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/80 lg:col-span-3">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Store className="size-5 text-primary" aria-hidden />
                    {t('customerSpendingOverview.topDealersTitle')}
                  </CardTitle>
                  <CardDescription>{t('customerSpendingOverview.topDealersHint')}</CardDescription>
                </div>
                <Link
                  href="/customer/consumptions"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t('customerSpendingOverview.openConsumptions')}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.topDealers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('customerSpendingOverview.noDealers')}</p>
                ) : (
                  (data.topDealers ?? []).map((d, i) => (
                    <div
                      key={d.dealerId}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5',
                        'transition-colors hover:bg-muted/30'
                      )}
                    >
                      <Badge variant="secondary" className="tabular-nums">
                        #{i + 1}
                      </Badge>
                      {d.logo ? (
                        <img src={d.logo} alt="" className="size-9 rounded-lg object-cover" />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                          {d.label.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{d.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {nf.format(d.visits)} {t('customerSpendingOverview.visitsSuffix')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/customer/feedbacks"
              className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
            >
              {t('customerSpendingOverview.linkFeedbacks')}
            </Link>
            <Link
              href="/customer/nearby"
              className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
            >
              {t('customerSpendingOverview.linkNearby')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
