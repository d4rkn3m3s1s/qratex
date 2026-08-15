'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, ArrowUpRight, Download, Loader2, Radio } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
// recharts (~368KB) ayrı chunk'a: sayfa ilk yükünde inmez, grafik göründüğünde yüklenir.
const PlatformPulseDailyTrendsChart = dynamic(
  () => import('@/components/admin/platform-pulse-daily-trends-chart').then((m) => m.PlatformPulseDailyTrendsChart),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full rounded-xl" /> }
);

type PulsePayload = {
  success?: boolean;
  generatedAt?: string;
  window24hSince?: string;
  counts24h?: { auditLogs: number; feedbacks: number; consumptions: number; newUsers: number };
  counts7d?: { feedbacks: number; consumptions: number; newUsers: number };
  dailySeries?: { date: string; feedbacks: number; consumptions: number; audits: number }[];
  recentAudits?: {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    createdAt: string;
    user: { email: string | null; name: string | null; role: string };
  }[];
  auditsByEntity?: { entity: string; count: number }[];
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="border-border/80 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-bold tabular-nums tracking-tight">{value}</CardTitle>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardHeader>
    </Card>
  );
}

export default function AdminPlatformPulsePage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [data, setData] = useState<PulsePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const nf = useMemo(
    () => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR'),
    [locale]
  );
  const df = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/platform-pulse', { cache: 'no-store' });
        const json = (await res.json()) as PulsePayload;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          toast.error(t('adminPlatformPulse.loadError'));
          setData(null);
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) {
          toast.error(t('adminPlatformPulse.loadError'));
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

  const c24 = data?.counts24h;
  const c7 = data?.counts7d;

  const downloadPulseCsv = useCallback(() => {
    if (!data?.counts24h || !data.counts7d) return;
    const sep = locale === 'en' ? ',' : ';';
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows: (string | number)[][] = [
      ['generatedAt', data.generatedAt ?? ''],
      ['audit24h', data.counts24h.auditLogs],
      ['feedback24h', data.counts24h.feedbacks],
      ['consumption24h', data.counts24h.consumptions],
      ['newUsers24h', data.counts24h.newUsers],
      ['feedback7d', data.counts7d.feedbacks],
      ['consumption7d', data.counts7d.consumptions],
      ['newUsers7d', data.counts7d.newUsers],
    ];
    (data.dailySeries ?? []).forEach((d) => {
      rows.push([`day_${d.date}_feedbacks`, d.feedbacks]);
      rows.push([`day_${d.date}_consumptions`, d.consumptions]);
      rows.push([`day_${d.date}_audits`, d.audits]);
    });
    (data.auditsByEntity ?? []).forEach((e) => {
      rows.push([`entity24h_${e.entity}`, e.count]);
    });
    const body = rows.map((r) => r.map((c) => esc(c)).join(sep)).join('\n');
    const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-pulse-${(data.generatedAt ?? 'export').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('adminPlatformPulse.exportOk'));
  }, [data, locale, t]);

  return (
    <div className="space-y-8 pb-12">
      <AdminPremiumHero
        eyebrow={t('adminPlatformPulse.eyebrow')}
        title={t('adminPlatformPulse.title')}
        description={t('adminPlatformPulse.description')}
        icon={<Radio className="size-7" aria-hidden />}
        tone="auto"
        chips={
          data?.generatedAt ? (
            <Badge variant="outline" className="font-normal">
              {t('adminPlatformPulse.snapshot')}: {df.format(new Date(data.generatedAt))}
            </Badge>
          ) : null
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t('adminPlatformPulse.loading')}
        </div>
      ) : !c24 || !c7 ? (
        <p className="py-16 text-center text-muted-foreground">{t('adminPlatformPulse.empty')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadPulseCsv}>
              <Download className="size-4" aria-hidden />
              {t('adminPlatformPulse.exportCsv')}
            </Button>
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Activity className="size-5 text-primary" aria-hidden />
              {t('adminPlatformPulse.section24h')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={t('adminPlatformPulse.metric.audit24')} value={nf.format(c24.auditLogs)} />
              <StatCard label={t('adminPlatformPulse.metric.feedback24')} value={nf.format(c24.feedbacks)} />
              <StatCard label={t('adminPlatformPulse.metric.consumption24')} value={nf.format(c24.consumptions)} />
              <StatCard label={t('adminPlatformPulse.metric.newUsers24')} value={nf.format(c24.newUsers)} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">{t('adminPlatformPulse.section7d')}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label={t('adminPlatformPulse.metric.feedback7')} value={nf.format(c7.feedbacks)} />
              <StatCard label={t('adminPlatformPulse.metric.consumption7')} value={nf.format(c7.consumptions)} />
              <StatCard label={t('adminPlatformPulse.metric.newUsers7')} value={nf.format(c7.newUsers)} />
            </div>
          </div>

          {(data.dailySeries?.length ?? 0) > 0 ? (
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-lg">{t('adminPlatformPulse.chartTitle')}</CardTitle>
                <CardDescription>{t('adminPlatformPulse.chartHint')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <PlatformPulseDailyTrendsChart
                  data={data.dailySeries ?? []}
                  labels={{
                    feedbacks: t('adminPlatformPulse.seriesFeedbacks'),
                    consumptions: t('adminPlatformPulse.seriesConsumptions'),
                    audits: t('adminPlatformPulse.seriesAudits'),
                  }}
                  height={300}
                />
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-lg">{t('adminPlatformPulse.entityMix')}</CardTitle>
                <CardDescription>{t('adminPlatformPulse.entityMixHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data.auditsByEntity ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('adminPlatformPulse.noEntity')}</p>
                ) : (
                  (() => {
                    const max = Math.max(1, ...(data.auditsByEntity ?? []).map((r) => r.count));
                    return (data.auditsByEntity ?? []).map((row) => (
                      <div key={row.entity} className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80"
                            style={{
                              width: `${Math.min(100, (row.count / max) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-28 shrink-0 truncate text-right text-xs font-medium text-muted-foreground">
                          {row.entity}
                        </span>
                        <span className="w-10 shrink-0 text-right text-sm tabular-nums">{nf.format(row.count)}</span>
                      </div>
                    ));
                  })()
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-lg">{t('adminPlatformPulse.recentAudit')}</CardTitle>
                  <CardDescription>{t('adminPlatformPulse.recentAuditHint')}</CardDescription>
                </div>
                <Link
                  href="/admin/audit"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t('adminPlatformPulse.openAudit')}
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {(data.recentAudits ?? []).map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      'rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm',
                      'transition-colors hover:bg-muted/40'
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">{row.action}</span>
                      <time className="text-xs tabular-nums text-muted-foreground" dateTime={row.createdAt}>
                        {df.format(new Date(row.createdAt))}
                      </time>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono">{row.entity}</span>
                      {row.entityId ? <span className="truncate font-mono text-[11px]">{row.entityId}</span> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.user?.name || row.user?.email || '—'} · {row.user?.role}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/ecosystem"
              className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm font-medium hover:border-primary/30"
            >
              {t('adminPlatformPulse.linkEcosystem')}
            </Link>
            <Link
              href="/admin/feedbacks"
              className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm font-medium hover:border-primary/30"
            >
              {t('adminPlatformPulse.linkFeedbacks')}
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm font-medium hover:border-primary/30"
            >
              {t('adminPlatformPulse.linkUsers')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
