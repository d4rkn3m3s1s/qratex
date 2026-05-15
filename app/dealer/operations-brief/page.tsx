'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Download, Loader2, MessageSquare, Package, QrCode, Sparkles } from 'lucide-react';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { DealerOperationsBriefDailyChart } from '@/components/dealer/operations-brief-daily-chart';

type BriefPayload = {
  success?: boolean;
  generatedAt?: string;
  feedback?: { unread: number; last7d: number };
  consumptions?: { today: number; last7d: number };
  actionItems?: { open: number; completedLast7d: number };
  catalog?: { activeProducts: number; activeQrCodes: number };
  remedy?: { pendingCustomerOffers: number };
  dailySeries?: { date: string; feedbacks: number; consumptions: number }[];
};

export default function DealerOperationsBriefPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [data, setData] = useState<BriefPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const nf = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR'),
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dealer/operations-brief', { cache: 'no-store' });
        const json = (await res.json()) as BriefPayload;
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

  const fb = data?.feedback;
  const cons = data?.consumptions;
  const act = data?.actionItems;
  const cat = data?.catalog;
  const rem = data?.remedy;

  const downloadCsv = () => {
    if (!data?.feedback || !data.consumptions || !data.actionItems || !data.catalog || !data.remedy) return;
    const sep = locale === 'en' ? ',' : ';';
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows: (string | number)[][] = [
      ['generatedAt', data.generatedAt ?? ''],
      ['feedbackUnread', data.feedback.unread],
      ['feedbackLast7d', data.feedback.last7d],
      ['consumptionsToday', data.consumptions.today],
      ['consumptionsLast7d', data.consumptions.last7d],
      ['actionItemsOpen', data.actionItems.open],
      ['actionItemsCompleted7d', data.actionItems.completedLast7d],
      ['activeQrCodes', data.catalog.activeQrCodes],
      ['activeProducts', data.catalog.activeProducts],
      ['remedyPendingOffers', data.remedy.pendingCustomerOffers],
    ];
    (data.dailySeries ?? []).forEach((row) => {
      rows.push([`day_${row.date}_feedbacks`, row.feedbacks]);
      rows.push([`day_${row.date}_consumptions`, row.consumptions]);
    });
    const body = rows.map((r) => r.map((c) => esc(c)).join(sep)).join('\n');
    const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operations-brief-${(data.generatedAt ?? 'export').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('dealerOperationsBrief.exportOk'));
  };

  return (
    <div className="space-y-8 pb-12">
      <DashboardPageHero
        eyebrow={t('dealerOperationsBrief.eyebrow')}
        title={t('dealerOperationsBrief.title')}
        description={t('dealerOperationsBrief.subtitle')}
        icon={<Sparkles className="size-7" aria-hidden />}
        tone="auto"
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t('dealerOperationsBrief.loading')}
        </div>
      ) : !fb || !cons || !act || !cat || !rem ? (
        <p className="py-16 text-center text-muted-foreground">{t('dealerOperationsBrief.loadError')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadCsv}>
              <Download className="size-4" aria-hidden />
              {t('dealerOperationsBrief.exportCsv')}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription className="pr-6">{t('dealerOperationsBrief.card.feedbackUnread')}</CardDescription>
                <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{nf.format(fb.unread)}</span>
                  {fb.unread > 0 ? (
                    <Badge variant="destructive" className="text-[10px] uppercase">
                      {t('dealerOperationsBrief.badge.needsAttention')}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dealerOperationsBrief.card.feedback7d')}: {nf.format(fb.last7d)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{t('dealerOperationsBrief.card.consumptionToday')}</CardDescription>
                <Package className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{nf.format(cons.today)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dealerOperationsBrief.card.consumption7d')}: {nf.format(cons.last7d)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{t('dealerOperationsBrief.card.actionsOpen')}</CardDescription>
                <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{nf.format(act.open)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dealerOperationsBrief.card.actionsDone7d')}: {nf.format(act.completedLast7d)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{t('dealerOperationsBrief.card.remedyPending')}</CardDescription>
                <Sparkles className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{nf.format(rem.pendingCustomerOffers)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('dealerOperationsBrief.card.remedyHint')}</p>
              </CardContent>
            </Card>
          </div>

          {(data.dailySeries?.length ?? 0) > 0 ? (
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-lg">{t('dealerOperationsBrief.chartTitle')}</CardTitle>
                <CardDescription>{t('dealerOperationsBrief.chartHint')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-1">
                <DealerOperationsBriefDailyChart
                  data={data.dailySeries ?? []}
                  labels={{
                    feedbacks: t('dealerOperationsBrief.seriesFeedbacks'),
                    consumptions: t('dealerOperationsBrief.seriesConsumptions'),
                  }}
                  height={280}
                />
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <QrCode className="size-5 text-primary" aria-hidden />
                  {t('dealerOperationsBrief.catalogTitle')}
                </CardTitle>
                <CardDescription>{t('dealerOperationsBrief.catalogHint')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('dealerOperationsBrief.activeQr')}</p>
                  <p className="text-2xl font-semibold tabular-nums">{nf.format(cat.activeQrCodes)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('dealerOperationsBrief.activeProducts')}</p>
                  <p className="text-2xl font-semibold tabular-nums">{nf.format(cat.activeProducts)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-base">{t('dealerOperationsBrief.nextTitle')}</CardTitle>
                <CardDescription>{t('dealerOperationsBrief.nextHint')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link
                  href="/dealer/feedbacks"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-border/80 bg-card px-4 py-3 text-center text-sm font-medium hover:border-primary/30"
                >
                  {t('dealerOperationsBrief.linkFeedbacks')}
                </Link>
                <Link
                  href="/dealer/action-items"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-border/80 bg-card px-4 py-3 text-center text-sm font-medium hover:border-primary/30"
                >
                  {t('dealerOperationsBrief.linkActions')}
                </Link>
                <Link
                  href="/dealer/remedy-queue"
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-border/80 bg-card px-4 py-3 text-center text-sm font-medium hover:border-primary/30"
                >
                  {t('dealerOperationsBrief.linkRemedy')}
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
