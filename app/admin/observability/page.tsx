'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Activity, Server, Clock, AlertTriangle, ExternalLink, BarChart3, List, Zap, Copy, Check } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { VercelStatusSummary } from '@/app/api/admin/vercel-status/route';
import type { HealthResponse } from '@/app/api/admin/health/route';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/admin-toast';
import { PREMIUM_PANEL_CARD_BASE, premiumPanelCardAccentClass } from '@/lib/panel-surface';
import type { WebVitalsSummaryPayload } from '@/lib/rum-web-vitals';

const REFRESH_INTERVAL_MS = 30_000;

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'operational' || s === 'none' || s === 'full') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (s.includes('degraded') || s.includes('performance')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  if (s.includes('partial') || s.includes('major') || s.includes('outage')) return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

export default function AdminObservabilityPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'tr-TR';
  const [vercelStatus, setVercelStatus] = useState<VercelStatusSummary | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [rum, setRum] = useState<WebVitalsSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [rumCopied, setRumCopied] = useState(false);
  const [healthCopied, setHealthCopied] = useState(false);
  const [vercelCopied, setVercelCopied] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [vercelRes, healthRes, rumRes] = await Promise.all([
        fetch('/api/admin/vercel-status'),
        fetch('/api/admin/health'),
        fetch('/api/admin/web-vitals-summary', { cache: 'no-store' }),
      ]);
      const vercelOk = vercelRes.ok;
      const healthOk = healthRes.ok;
      const rumOk = rumRes.ok;
      const vercelJson = await vercelRes.json();
      const healthJson = await healthRes.json();

      if (rumOk) {
        try {
          setRum((await rumRes.json()) as WebVitalsSummaryPayload);
        } catch {
          setRum(null);
        }
      } else {
        setRum(null);
      }

      if (!vercelOk) setVercelStatus(null);
      else if (!vercelJson.error) setVercelStatus(vercelJson as VercelStatusSummary);

      if (!healthOk) setHealth(null);
      else setHealth(healthJson as HealthResponse);

      if (!vercelOk && !healthOk) setError(t('adminObservability.errorBoth'));
      else if (!vercelOk) setError(t('adminObservability.errorVercelOnly'));
      else if (!healthOk) setError(t('adminObservability.errorHealthOnly'));

      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adminObservability.errorLoad'));
      setVercelStatus(null);
      setHealth(null);
      setRum(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastFetched) return t('adminObservability.emptyDash');
    const sec = Math.floor((Date.now() - lastFetched.getTime()) / 1000);
    if (sec < 10) return t('adminObservability.updatedJustNow');
    if (sec < 60) return t('adminObservability.updatedSecondsAgo').replace('{n}', String(sec));
    return t('adminObservability.updatedMinutesAgo').replace('{n}', String(Math.floor(sec / 60)));
  }, [lastFetched, tick, t]);

  const incidentCount = vercelStatus?.incidents?.length ?? 0;

  const dfShort = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      }),
    [locale]
  );

  const copyRumPayload = useCallback(async () => {
    if (!rum) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(rum, null, 2));
      setRumCopied(true);
      window.setTimeout(() => setRumCopied(false), 2000);
      toast.success(t('adminObservability.rumCopySuccess'));
    } catch {
      toast.error(t('adminObservability.rumCopyFail'));
    }
  }, [rum, t]);

  const copyHealthPayload = useCallback(async () => {
    if (!health) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(health, null, 2));
      setHealthCopied(true);
      window.setTimeout(() => setHealthCopied(false), 2000);
      toast.success(t('adminObservability.rumCopySuccess'));
    } catch {
      toast.error(t('adminObservability.rumCopyFail'));
    }
  }, [health, t]);

  const copyVercelPayload = useCallback(async () => {
    if (!vercelStatus) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(vercelStatus, null, 2));
      setVercelCopied(true);
      window.setTimeout(() => setVercelCopied(false), 2000);
      toast.success(t('adminObservability.rumCopySuccess'));
    } catch {
      toast.error(t('adminObservability.rumCopyFail'));
    }
  }, [vercelStatus, t]);

  return (
    <div className="min-h-screen bg-background relative">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.08),transparent)]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/[0.05] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 h-[350px] w-[350px] rounded-full bg-primary/[0.05] blur-3xl" />
      </div>

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-6xl mx-auto">
        <AdminPremiumHero
          eyebrow={t('adminObservability.heroEyebrow')}
          title={t('adminObservability.heroTitle')}
          description={t('adminObservability.heroDescription')}
          icon={<Activity className="text-white" />}
          chips={
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm bg-background/85 text-foreground border-border/70 dark:bg-white/20 dark:text-white dark:border-white/35">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-200" />
                </span>
                {t('adminObservability.liveBadge')}
              </span>
              {incidentCount > 0 && (
                <Badge className="bg-amber-400/90 text-amber-950 border-amber-200 hover:bg-amber-400">
                  {t('adminObservability.incidentsBadge').replace('{count}', String(incidentCount))}
                </Badge>
              )}
            </div>
          }
          aside={
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-end w-full">
              {vercelStatus && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-white">
                  <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-100" />
                  <Badge className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                    {vercelStatus.indicator.status}
                  </Badge>
                </div>
              )}
              {health && (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-white">
                    <Server className={`h-5 w-5 ${health.ok ? 'text-emerald-200' : 'text-red-200'}`} />
                    <span className="text-sm font-semibold">{health.ok ? t('adminObservability.appHealthOk') : t('adminObservability.appHealthError')}</span>
                    <span className="text-xs text-muted-foreground tabular-nums dark:text-white/80">
                      {health.latencyMs} {t('adminObservability.msUnit')}
                    </span>
                  </div>
                  {health.metrics && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm bg-background/85 border-border/70 text-foreground dark:bg-white/15 dark:border-white/25 dark:text-white">
                      <Zap className="h-5 w-5 text-amber-200" />
                      <span className="text-sm font-bold tabular-nums">{health.metrics.last60s.requests}</span>
                      <span className="text-xs text-muted-foreground dark:text-white/80">{t('adminObservability.requestsPer60s')}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          }
        />

        <section id="core-web-vitals" className="scroll-mt-24 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('adminObservability.cwvSectionTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('adminObservability.cwvSectionHint')}</p>
            </div>
          </div>
          <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'overflow-hidden border-border/80')}>
            <div className={premiumPanelCardAccentClass('primary')} aria-hidden />
            <CardContent className="p-0 pt-4">
              <div className="overflow-x-auto px-4 pb-4 sm:px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="px-2 py-2 font-semibold sm:px-3">{t('adminObservability.cwvColMetric')}</th>
                      <th className="px-2 py-2 font-semibold sm:px-3">{t('adminObservability.cwvColTarget')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2.5 font-medium text-foreground sm:px-3">{t('adminObservability.cwvMetricLcp')}</td>
                      <td className="px-2 py-2.5 tabular-nums text-muted-foreground sm:px-3">{t('adminObservability.cwvMetricLcpGood')}</td>
                    </tr>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2.5 font-medium text-foreground sm:px-3">{t('adminObservability.cwvMetricInp')}</td>
                      <td className="px-2 py-2.5 tabular-nums text-muted-foreground sm:px-3">{t('adminObservability.cwvMetricInpGood')}</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-2.5 font-medium text-foreground sm:px-3">{t('adminObservability.cwvMetricCls')}</td>
                      <td className="px-2 py-2.5 tabular-nums text-muted-foreground sm:px-3">{t('adminObservability.cwvMetricClsGood')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground sm:px-6">
                {t('adminObservability.cwvNote')}
              </p>
              <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
                <a
                  href="https://web.dev/articles/vitals"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {t('adminObservability.cwvLinkWebDev')}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
                <a
                  href="https://vercel.com/docs/speed-insights"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {t('adminObservability.cwvLinkVercel')}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="rum-web-vitals" className="scroll-mt-24 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-primary/20">
                <Zap className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t('adminObservability.rumSectionTitle')}</h2>
                <p className="text-xs text-muted-foreground">{t('adminObservability.rumSectionHint')}</p>
              </div>
            </div>
            {rum ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-2 self-start sm:self-center"
                onClick={() => void copyRumPayload()}
              >
                {rumCopied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {t('adminObservability.rumCopyJson')}
              </Button>
            ) : null}
          </div>
          <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'overflow-hidden border-border/80')}>
            <div className={premiumPanelCardAccentClass('violet')} aria-hidden />
            <CardContent className="space-y-4 p-0 pt-4">
              {!rum || rum.totalSamples === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">{t('adminObservability.rumEmpty')}</p>
              ) : (
                <>
                  <div className="overflow-x-auto px-4 sm:px-6">
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t('adminObservability.rumWindow')}: {Math.round(rum.windowMs / 60_000)} {t('adminObservability.rumMinutes')} ·{' '}
                      {dfShort.format(new Date(rum.generatedAt))}
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th className="px-2 py-2 font-semibold sm:px-3">{t('adminObservability.rumColMetric')}</th>
                          <th className="px-2 py-2 font-semibold sm:px-3">{t('adminObservability.rumColCount')}</th>
                          <th className="px-2 py-2 font-semibold sm:px-3">{t('adminObservability.rumColAvg')}</th>
                          <th className="px-2 py-2 font-semibold sm:px-3">{t('adminObservability.rumColGoodPct')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rum.byName.map((row) => (
                          <tr key={row.name} className="border-b last:border-0">
                            <td className="px-2 py-2 font-medium text-foreground sm:px-3">{row.name}</td>
                            <td className="px-2 py-2 tabular-nums sm:px-3">{row.count}</td>
                            <td className="px-2 py-2 tabular-nums sm:px-3">{row.avgValue}</td>
                            <td className="px-2 py-2 tabular-nums sm:px-3">{row.goodPct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-border/60 px-4 py-3 sm:px-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('adminObservability.rumByRoleTitle')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(rum.byRole).map(([role, count]) => (
                        <Badge key={role} variant="secondary" className="font-normal">
                          {role}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-border/60 px-4 pb-4 sm:px-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('adminObservability.rumRecentTitle')}
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {rum.recent.map((r, i) => (
                        <li key={`${r.ts}-${r.path}-${i}`} className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
                          <span className="text-foreground/80">{dfShort.format(new Date(r.ts))}</span>
                          <span>{r.role}</span>
                          <span className="max-w-[14rem] truncate">{r.path}</span>
                          <span>{r.name}</span>
                          <span className="tabular-nums">{Math.round(r.value * 1000) / 1000}</span>
                          <span className="text-primary/90">{r.rating}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 shadow-lg"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </span>
            <Button variant="outline" size="sm" onClick={fetchData} className="border-red-500/30">
              {t('adminObservability.refresh')}
            </Button>
          </motion.div>
        )}

        {/* Son güncelleme + Yenile */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('adminObservability.lastUpdatedPrefix')} <span className="font-semibold text-foreground">{lastUpdatedLabel}</span>
          </p>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="shadow-sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('adminObservability.refresh')}
          </Button>
        </div>

        {/* 3 ana kart */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-primary/20">
              <BarChart3 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('adminObservability.summaryCardsTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('adminObservability.summaryCardsHint')}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Vercel Status */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'hover:shadow-xl hover:shadow-cyan-500/5')}>
                <div className={premiumPanelCardAccentClass('cyan')} aria-hidden />
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pl-6 pr-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    {t('adminObservability.cardVercelTitle')}
                  </CardTitle>
                  {vercelStatus ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                      onClick={() => void copyVercelPayload()}
                      title={t('adminObservability.vercelCopyJson')}
                    >
                      {vercelCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                      {t('adminObservability.jsonCopyButton')}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="pl-6">
                  {loading && !vercelStatus ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : vercelStatus ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground leading-relaxed">{vercelStatus.indicator.description}</p>
                      <Badge className={statusBadgeClass(vercelStatus.indicator.status)} variant="outline">
                        {vercelStatus.indicator.status}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('adminObservability.emptyDash')}</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* App Health */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'hover:shadow-xl hover:shadow-emerald-500/5')}>
                <div className={premiumPanelCardAccentClass('emerald')} aria-hidden />
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pl-6 pr-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Server className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    {t('adminObservability.cardHealthTitle')}
                  </CardTitle>
                  {health ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                      onClick={() => void copyHealthPayload()}
                      title={t('adminObservability.healthCopyJson')}
                    >
                      {healthCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                      {t('adminObservability.jsonCopyButton')}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="pl-6">
                  {loading && !health ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : health ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={health.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'} variant="outline">
                          {health.ok ? t('adminObservability.statusOkShort') : t('adminObservability.statusErrorShort')}
                        </Badge>
                        <span className="text-lg font-bold tabular-nums text-foreground">{health.latencyMs}</span>
                        <span className="text-sm text-muted-foreground">{t('adminObservability.msUnit')}</span>
                      </div>
                      {health.region && <p className="text-xs text-muted-foreground font-mono">{health.region}</p>}
                      {health.database != null && (
                        <p className="text-xs text-muted-foreground">
                          {t('adminObservability.dbLabel')}{' '}
                          {health.database === 'ok' ? t('adminObservability.dbConnected') : t('adminObservability.dbError')}
                        </p>
                      )}
                      {health.mail && (
                        <p className="text-xs text-muted-foreground">
                          {t('adminObservability.transactionalMail')}{' '}
                          <span
                            className={
                              health.mail.configured
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-amber-700 dark:text-amber-300'
                            }
                          >
                            {health.mail.configured
                              ? [health.mail.smtp && 'SMTP', health.mail.resend && 'Resend'].filter(Boolean).join(' + ') ||
                                t('adminObservability.emptyDash')
                              : t('adminObservability.mailNotConfigured')}
                          </span>
                        </p>
                      )}
                      {health.ops && (
                        <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                          <p>
                            {t('adminObservability.queue')}{' '}
                            <span className={health.ops.queuePending > 50 ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-foreground'}>
                              {health.ops.queuePending} {t('adminObservability.pending')}
                            </span>
                            {health.ops.queueOldestAgeSec != null && health.ops.queueOldestAgeSec > 120 && (
                              <span className="text-amber-700 dark:text-amber-300"> · {Math.round(health.ops.queueOldestAgeSec / 60)}dk gecikme</span>
                            )}
                          </p>
                          <p>
                            {t('adminObservability.webhooks24h')}{' '}
                            <span className="text-foreground">{health.ops.webhookDeliveries24h}</span>
                            {health.ops.webhookFailures24h > 0 && (
                              <span className="text-red-700 dark:text-red-300"> · {health.ops.webhookFailures24h} {t('adminObservability.failed')}</span>
                            )}
                          </p>
                          <p>
                            {t('adminObservability.activeUsers24h')}{' '}
                            <span className="text-foreground">{health.ops.activeUsers24h}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('adminObservability.emptyDash')}</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Last 60s */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className={cn(PREMIUM_PANEL_CARD_BASE, 'hover:shadow-xl hover:shadow-amber-500/5')}>
                <div className={premiumPanelCardAccentClass('amber')} aria-hidden />
                <CardHeader className="pb-2 pl-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    {t('adminObservability.cardLast60Title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pl-6">
                  {loading && !health ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : health?.metrics ? (
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="font-bold tabular-nums text-foreground text-lg">{health.metrics.last60s.requests}</span>{' '}
                        {t('adminObservability.metricRequestsSuffix')}
                      </p>
                      <p className="text-sm">
                        <span className="font-bold tabular-nums text-foreground">{health.metrics.last60s.errors}</span>{' '}
                        {t('adminObservability.metricErrorsSuffix')}
                      </p>
                      <p className="text-sm">
                        <span className="font-bold tabular-nums text-foreground">{health.metrics.last60s.avgMs.toFixed(1)}</span>{' '}
                        {t('adminObservability.metricAvgMsSuffix')}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">{t('adminObservability.metricsFootnote')}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('adminObservability.emptyDash')}</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Vercel Components */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/30">
              <List className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('adminObservability.componentsSectionTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('adminObservability.componentsSectionHint')}</p>
            </div>
          </div>
          <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <CardContent className="p-0">
              {loading && !vercelStatus ? (
                <Skeleton className="h-48 w-full rounded-b-lg" />
              ) : vercelStatus?.components?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colComponent')}</th>
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colStatus')}</th>
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colUpdated')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vercelStatus.components.map((c) => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3">
                            <Badge className={statusBadgeClass(c.status)} variant="outline">{c.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {c.updated_at ? new Date(c.updated_at).toLocaleString(dateLocale) : t('adminObservability.emptyDash')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">{t('adminObservability.componentsEmpty')}</div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Incidents */}
        {vercelStatus?.incidents?.length ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{t('adminObservability.incidentsSectionTitle')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('adminObservability.incidentsSectionHint').replace('{count}', String(vercelStatus.incidents.length))}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {vercelStatus.incidents.map((i) => (
                <Card key={i.id} className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{i.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {i.created_at ? new Date(i.created_at).toLocaleString(dateLocale) : t('adminObservability.emptyDash')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusBadgeClass(i.status)} variant="outline">{i.status}</Badge>
                      {i.shortlink && (
                        <a href={i.shortlink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          {t('adminObservability.detailLink')} <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* Top Paths */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('adminObservability.topPathsTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('adminObservability.topPathsHint')}</p>
            </div>
          </div>
          <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
            <CardContent className="p-0">
              {loading && !health ? (
                <Skeleton className="h-32 w-full rounded-b-lg" />
              ) : health?.metrics?.topPaths?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colPath')}</th>
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colRequests')}</th>
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colErrors')}</th>
                        <th className="px-4 py-3 font-semibold">{t('adminObservability.colAvgMs')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.metrics.topPaths.map((row) => (
                        <tr key={row.path} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{row.path}</td>
                          <td className="px-4 py-3 font-semibold tabular-nums">{row.requests}</td>
                          <td className="px-4 py-3 tabular-nums">{row.errors}</td>
                          <td className="px-4 py-3 tabular-nums">{row.avgMs.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">{t('adminObservability.topPathsEmpty')}</div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
