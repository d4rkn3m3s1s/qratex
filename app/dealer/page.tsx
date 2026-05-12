'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import {
  QrCode,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Star,
  Plus,
  BarChart3,
  Sparkles,
  Clock,
  Crown,
  Activity,
  ChevronRight,
  ListChecks,
  MapPin,
  Settings,
  RefreshCw,
  ScanLine,
  AlertCircle,
  ArrowUpRight,
  ScanSearch,
  Target,
  PieChart,
  Sunrise,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from '@/lib/admin-toast';
import { SimpleBarChart, DonutChart, SimpleAreaChart } from '@/components/charts/chart-lazy';
import { RatingDistributionBar, MiniSparkline } from '@/components/charts';
import type { SimpleBarChartDatum, DonutChartDatum, RatingDistributionDatum } from '@/components/charts';
import type { DealerStats } from './types';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import {
  getSentimentIcon,
  getSentimentBadge,
  AnimatedCounter,
  PerformanceRing,
  container,
  item,
} from './components/dealer-helpers';



export default function DealerDashboard() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'qrcodes'>('feedbacks');
  const [offlineSyncing, setOfflineSyncing] = useState(false);

  const {
    data: statsData,
    isLoading: statsLoading,
    error: statsError,
    refetch: fetchStats,
  } = useQuery({
    queryKey: ['dealer', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/dealer/stats');
      const result = await res.json();
      if (!result.success) throw new Error(result?.error || t('dealerDashboard.statsLoadError'));
      return result.data as DealerStats;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: profileData } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const r = await fetch('/api/user/profile', { credentials: 'same-origin' });
      const d = await r.json();
      if (d.success && d.user) return { address: d.user.address, latitude: d.user.latitude, longitude: d.user.longitude } as { address?: string | null; latitude?: number | null; longitude?: number | null };
      return null;
    },
    staleTime: 5 * 60_000,
  });
  const profile = profileData ?? null;

  const { data: offlineData } = useQuery({
    queryKey: ['dealer', 'offline-sync'],
    queryFn: async () => {
      const r = await fetch('/api/dealer/offline-sync', { credentials: 'same-origin' });
      const d = await r.json();
      if (d.success && Array.isArray(d.pendingItems)) return { count: d.pendingItems.length, items: d.pendingItems.map((i: { id: string; action: string; payload: unknown }) => ({ id: i.id, action: i.action, payload: i.payload })) };
      return { count: 0, items: [] };
    },
    staleTime: 30_000,
  });
  const offlinePending = offlineData ?? { count: 0, items: [] };

  const { data: actionsData } = useQuery({
    queryKey: ['dealer', 'next-best-actions'],
    queryFn: async () => {
      const r = await fetch('/api/dealer/next-best-actions', { credentials: 'same-origin' });
      const d = await r.json();
      if (d.actions && Array.isArray(d.actions)) return d.actions.slice(0, 3).map((a: { cardKey: string; label: string; href: string }) => ({ cardKey: a.cardKey, label: a.label, href: a.href }));
      return [];
    },
    staleTime: 60_000,
  });
  const nextBestActions = actionsData ?? [];

  const { data: benchmarkData } = useQuery({
    queryKey: ['dealer', 'benchmark'],
    queryFn: async () => {
      const r = await fetch('/api/dealer/benchmark');
      const d = await r.json();
      return d.benchmark ?? null;
    },
    staleTime: 5 * 60_000,
  });
  const benchmark = benchmarkData ?? null;

  const { data: briefingData } = useQuery({
    queryKey: ['dealer', 'morning-briefing'],
    queryFn: async () => {
      const r = await fetch('/api/dealer/morning-briefing');
      const d = await r.json();
      if (!d.success) return null;
      return d as {
        last24h: {
          lowRatingFeedbackCount: number;
          newFeedbackCount: number;
          openIncidents: number;
          remedyQueueCount: number;
          vocTextFeedbackCount?: number;
          pushSubscribersAmongActiveCustomers?: number;
        };
        highlights: string[];
        urgentFeedbacks?: Array<{
          id: string;
          rating: number;
          excerpt: string;
          createdAt: string;
          customerLabel: string;
        }>;
        suggestedPlaybook?: {
          id: string;
          title: string;
          dealerCtaHref: string;
          dealerCtaLabel: string;
        } | null;
      };
    },
    staleTime: 60_000,
  });
  const briefing = briefingData ?? null;

  const { data: layoutData } = useQuery({
    queryKey: ['dealer', 'dashboard-layout'],
    queryFn: async () => {
      const res = await fetch('/api/dealer/dashboard-layout');
      const json = await res.json();
      return json.success ? (json.widgets as any[]) : null;
    },
    staleTime: 5 * 60_000,
  });

  const widgetsData = layoutData || [
    { id: "kpi-cards", visible: true, order: 1 },
    { id: "weekly-comparison", visible: true, order: 2 },
    { id: "benchmark-comparison", visible: true, order: 3 },
    { id: "charts-row-1", visible: true, order: 4 },
    { id: "charts-row-2", visible: true, order: 5 },
    { id: "recent-activity", visible: true, order: 6 },
    { id: "analytics-summary", visible: true, order: 7 },
    { id: "extra-data", visible: true, order: 8 }
  ];

  const data = statsData ?? null;
  const loading = statsLoading;
  const error = statsError ? (statsError instanceof Error ? statsError.message : t('dealerDashboard.connectionError')) : null;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('dealerDashboard.greetingMorning');
    if (h < 18) return t('dealerDashboard.greetingDay');
    return t('dealerDashboard.greetingEvening');
  }, [t]);

  const sentimentDataForMemo = data?.sentimentData || { positive: 0, neutral: 0, negative: 0 };
  const dominantSentiment = useMemo(() => {
    const arr = [{ k: 'positive' as const, v: sentimentDataForMemo.positive }, { k: 'neutral' as const, v: sentimentDataForMemo.neutral }, { k: 'negative' as const, v: sentimentDataForMemo.negative }];
    arr.sort((a, b) => b.v - a.v);
    return arr[0].v > 0 ? (arr[0].k === 'positive' ? t('dealerDashboard.positive') : arr[0].k === 'negative' ? t('dealerDashboard.negative') : t('dealerDashboard.neutral')) : null;
  }, [t, sentimentDataForMemo.positive, sentimentDataForMemo.neutral, sentimentDataForMemo.negative]);

  if (loading) {
    return (
      <div className="space-y-5 pb-10">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-5">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="grid lg:grid-cols-12 gap-5">
          <Skeleton className="h-80 rounded-2xl lg:col-span-7" />
          <Skeleton className="h-80 rounded-2xl lg:col-span-5" />
        </div>
      </div>
    );
  }

  if (!data && error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-4 p-6">
        <div className="rounded-full bg-destructive/10 p-4"><AlertCircle className="h-10 w-10 text-destructive" /></div>
        <h2 className="text-lg font-semibold">{t('dealerDashboard.dataLoadErrorTitle')}</h2>
        <p className="text-muted-foreground text-center max-w-sm">{error}</p>
        <Button onClick={() => fetchStats()}><RefreshCw className="h-4 w-4 mr-2" />{t('common.refresh')}</Button>
      </div>
    );
  }

  const stats = {
    totalFeedbacks: Number(data?.stats?.totalFeedbacks) || 0,
    avgRating: data?.stats?.avgRating != null ? String(data.stats.avgRating) : '0',
    totalQRCodes: Number(data?.stats?.totalQRCodes) || 0,
    activeQRCodes: Number(data?.stats?.activeQRCodes) || 0,
    totalScans: Number(data?.stats?.totalScans) || 0,
    feedbackGrowth: Number(data?.stats?.feedbackGrowth) || 0,
    ratingChange: Number(data?.stats?.ratingChange) || 0,
    weeklyFeedbacks: Number(data?.stats?.weeklyFeedbacks) || 0,
    conversionRate: data?.stats?.conversionRate != null ? String(data.stats.conversionRate) : '0',
    actionCompletionRate: data?.stats?.actionCompletionRate != null ? Number(data.stats.actionCompletionRate) : undefined,
    actionItemsTotal: data?.stats?.actionItemsTotal,
    actionItemsDone: data?.stats?.actionItemsDone,
  };
  const performance = data?.performance || { score: 0, level: t('dealerDashboard.beginner'), color: 'gray' };
  const sentimentData = data?.sentimentData || { positive: 0, neutral: 0, negative: 0 };
  const weeklyData = Array.isArray(data?.weeklyData) ? data.weeklyData : [];
  const previousWeekData = Array.isArray(data?.previousWeekData) ? data.previousWeekData : [];
  const previousWeekFeedbacks = Number(data?.previousWeekFeedbacks) ?? 0;
  const recentFeedbacks = Array.isArray(data?.recentFeedbacks) ? data.recentFeedbacks : [];
  const qrCodes = Array.isArray(data?.qrCodes) ? data.qrCodes : [];
  const consumptionStats = data?.consumptionStats ?? null;
  const weekOverWeekChange =
    previousWeekFeedbacks > 0
      ? Math.round(((stats.weeklyFeedbacks - previousWeekFeedbacks) / previousWeekFeedbacks) * 100)
      : stats.weeklyFeedbacks > 0 ? 100 : 0;

  const weeklyAvgRating = weeklyData.length ? (weeklyData.reduce((a, d) => a + (Number(d.avgRating) || 0), 0) / weeklyData.length).toFixed(1) : '—';
  const dailyAvg = stats.weeklyFeedbacks > 0 ? (stats.weeklyFeedbacks / 7).toFixed(1) : '0';
  const bestDay = weeklyData.length ? weeklyData.reduce((best, d) => (d.feedbacks > (best?.feedbacks ?? 0) ? d : best), weeklyData[0]) : null;
  const feedbackPerScan = stats.totalScans > 0 ? ((stats.totalFeedbacks / stats.totalScans) * 100).toFixed(1) : '—';

  const barChartData: SimpleBarChartDatum[] = weeklyData.map((d) => ({ name: d.day, value: d.feedbacks }));
  const areaChartData = weeklyData.map((d) => ({ name: d.day, value: Number(d.avgRating) || 0 }));
  const donutSentimentData: DonutChartDatum[] = [
    { name: t('dealerDashboard.positive'), value: sentimentData.positive, color: 'hsl(142, 76%, 36%)' },
    { name: t('dealerDashboard.neutral'), value: sentimentData.neutral, color: 'hsl(var(--muted-foreground))' },
    { name: t('dealerDashboard.negative'), value: sentimentData.negative, color: 'hsl(0, 84%, 60%)' },
  ].filter((d) => d.value > 0);
  const ratingDistTotal = recentFeedbacks.length || 1;
  const ratingDist: RatingDistributionDatum[] = [1, 2, 3, 4, 5].map((stars) => {
    const count = recentFeedbacks.filter((f) => f.rating === stars).length;
    return { stars, count, percent: Math.round((count / ratingDistTotal) * 100) };
  });

  const handleOfflineSync = async () => {
    if (!offlinePending.items.length) return;
    setOfflineSyncing(true);
    try {
      const res = await fetch('/api/dealer/offline-sync', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: offlinePending.items }) });
      const d = await res.json();
      if (d.success) {
        toast.success(d.message || t('dealerDashboard.syncCompleted'));
        await queryClient.invalidateQueries({ queryKey: ['dealer', 'offline-sync'] });
      } else toast.error(d.error || t('dealerDashboard.syncFailed'));
    } catch { toast.error(t('dealerDashboard.connectionError')); }
    finally { setOfflineSyncing(false); }
  };

  const statCards: Array<{
    key: string;
    title: string;
    value: string | number;
    suffix?: string;
    total?: number;
    change?: number;
    changeLabel?: string;
    icon: typeof MessageSquare;
    iconClass: string;
    bgClass: string;
    sparklineValues?: number[];
    sparklineColor?: string;
  }> = [
      { key: 'feedbacks', title: t('dealerDashboard.totalFeedbacks'), value: stats.totalFeedbacks, change: stats.feedbackGrowth, changeLabel: '%', icon: MessageSquare, iconClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-500/10', sparklineValues: weeklyData.map((d) => d.feedbacks), sparklineColor: 'hsl(142, 76%, 36%)' },
      { key: 'rating', title: t('dealerDashboard.averageRating'), value: stats.avgRating, suffix: '/5', change: stats.ratingChange !== 0 ? stats.ratingChange : undefined, changeLabel: ` ${t('dealerDashboard.points')}`, icon: Star, iconClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-500/10', sparklineValues: weeklyData.map((d) => Number(d.avgRating) || 0), sparklineColor: 'hsl(38, 92%, 50%)' },
      { key: 'scans', title: t('dealerDashboard.totalScans'), value: stats.totalScans, icon: ScanSearch, iconClass: 'text-cyan-600 dark:text-cyan-400', bgClass: 'bg-cyan-500/10' },
      { key: 'qr', title: t('dealerDashboard.activeQr'), value: stats.activeQRCodes, total: stats.totalQRCodes, icon: QrCode, iconClass: 'text-primary', bgClass: 'bg-primary/10' },
      { key: 'conversion', title: t('dealerDashboard.conversionRate'), value: stats.conversionRate, suffix: '%', icon: Target, iconClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-500/10' },
    ];
  if (typeof stats.actionCompletionRate === 'number') {
    statCards.push({ key: 'action', title: t('dealerDashboard.actionCompletion'), value: stats.actionCompletionRate, suffix: '%', icon: ListChecks, iconClass: 'text-teal-600 dark:text-teal-400', bgClass: 'bg-teal-500/10' });
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-5 pb-10">
        {/* ─── Üst bölüm: admin ile aynı DashboardPageHero kabı ─── */}
        <DashboardPageHero
          eyebrow={t('dealerDashboard.eyebrow')}
          title={`${greeting}, ${(typeof session?.user?.name === 'string' ? session.user.name.split(' ')[0] : null) || t('dealerDashboard.operator')}`}
          description={t('dealerDashboard.description')}
          icon={<Crown />}
          tone="auto"
          actions={
            <>
              <div className="rounded-xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                <m.div className="flex items-center gap-2" whileHover={{ scale: 1.02 }}>
                  <PerformanceRing value={performance.score} color={performance.color} />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('dealerDashboard.performanceLabel')}</p>
                    <p className="text-sm font-semibold text-foreground">{performance.level}</p>
                  </div>
                </m.div>
              </div>
              <Button asChild size="default" className="rounded-xl shadow-md">
                <Link href="/dealer/qr-codes"><Plus className="h-4 w-4 mr-2" />{t('dealerDashboard.newQrCode')}</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="default"
                className="rounded-xl hidden sm:inline-flex border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              >
                <Link href="/dealer/scan"><ScanLine className="h-4 w-4 mr-2" />{t('dealerDashboard.scan')}</Link>
              </Button>
            </>
          }
        />

        {/* ─── Alerts: offline, next best, location ─── */}
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-col gap-2">
          {offlinePending.count > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 px-4 py-3">
              <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm flex-1">{t('dealerDashboard.pendingOperationsPrefix')} {offlinePending.count} {t('dealerDashboard.pendingOperationsSuffix')}</span>
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400" onClick={handleOfflineSync} disabled={offlineSyncing}>
                {offlineSyncing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}{t('dealerDashboard.syncNow')}
              </Button>
            </div>
          )}
          {nextBestActions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">{t('dealerDashboard.todo')}:</span>
              {nextBestActions.map((a: { cardKey: string; label: string; href: string }) => (
                <Button key={a.cardKey} asChild size="sm" variant="secondary" className="rounded-lg h-8">
                  <Link href={a.href}><ChevronRight className="h-3.5 w-3.5 mr-1" />{a.label}</Link>
                </Button>
              ))}
            </div>
          )}
          {profile && !profile.address && (profile.latitude == null || profile.longitude == null) && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm flex-1">{t('dealerDashboard.addLocationHint')}</span>
              <Button asChild size="sm" variant="outline" className="border-amber-500/30"><Link href="/dealer/settings"><Settings className="h-4 w-4 mr-2" />{t('common.settings')}</Link></Button>
            </div>
          )}
          {briefing && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <Sunrise className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm min-w-0">
                  <p className="font-medium text-foreground">{t('dealerDashboard.briefing24hTitle')}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {t('dealerDashboard.briefing24hLine')
                      .replace('{newFb}', String(briefing.last24h.newFeedbackCount))
                      .replace('{lowRating}', String(briefing.last24h.lowRatingFeedbackCount))
                      .replace('{openIncidents}', String(briefing.last24h.openIncidents))
                      .replace('{remedyQueue}', String(briefing.last24h.remedyQueueCount))}
                    {typeof briefing.last24h.vocTextFeedbackCount === 'number' &&
                      t('dealerDashboard.briefingVocSuffix').replace('{count}', String(briefing.last24h.vocTextFeedbackCount))}
                    {typeof briefing.last24h.pushSubscribersAmongActiveCustomers === 'number' &&
                      briefing.last24h.pushSubscribersAmongActiveCustomers > 0 &&
                      t('dealerDashboard.briefingPushSuffix').replace(
                        '{count}',
                        String(briefing.last24h.pushSubscribersAmongActiveCustomers),
                      )}
                  </p>
                  {briefing.highlights.length > 0 && (
                    <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {briefing.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {briefing.suggestedPlaybook && (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-background/40 px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{t('dealerDashboard.suggestedPlaybook')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{briefing.suggestedPlaybook.title}</p>
                      <Button asChild size="sm" variant="secondary" className="mt-2 h-7 text-xs">
                        <Link href={briefing.suggestedPlaybook.dealerCtaHref}>
                          {briefing.suggestedPlaybook.dealerCtaLabel}
                        </Link>
                      </Button>
                    </div>
                  )}
                  {briefing.urgentFeedbacks && briefing.urgentFeedbacks.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('dealerDashboard.urgentFeedbacksTitle')}</p>
                      <ul className="space-y-1.5">
                        {briefing.urgentFeedbacks.map((f) => (
                          <li key={f.id} className="text-xs rounded-md border border-border/60 bg-background/30 px-2 py-1.5">
                            <span className="font-medium">{f.rating}★</span>{' '}
                            <span className="text-muted-foreground">{f.customerLabel}</span>
                            {f.excerpt ? <span className="block mt-0.5 text-muted-foreground line-clamp-2">{f.excerpt}</span> : null}
                            <Link href="/dealer/feedbacks" className="text-primary text-[11px] font-medium inline-block mt-1 hover:underline">
                              {t('dealerDashboard.linkGoFeedbacks')}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {briefing.last24h.remedyQueueCount > 0 && (
                  <Button asChild size="sm" variant="default" className="rounded-lg">
                    <Link href="/dealer/remedy-queue">{t('dealerDashboard.remedyQueueShort')}</Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className="rounded-lg">
                  <Link href="/dealer/feedbacks">{t('dealerDashboard.linkFeedbacksShort')}</Link>
                </Button>
              </div>
            </div>
          )}
        </m.div>

        {widgetsData.filter(w => w.visible).sort((a, b) => a.order - b.order).map(widget => {
          if (widget.id === 'kpi-cards') return (
            <m.section key={widget.id} variants={container} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {statCards.map((stat) => (
                <m.div key={stat.key} variants={item} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.99 }}>
                  <Card className="overflow-hidden border border-border/60 bg-card rounded-2xl h-full hover:shadow-lg hover:border-primary/20 transition-shadow duration-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <m.div className={`p-2 rounded-xl ${stat.bgClass}`} whileHover={{ rotate: [0, -8, 8, 0], transition: { duration: 0.4 } }}>
                          <stat.icon className={`h-5 w-5 ${stat.iconClass}`} />
                        </m.div>
                        {stat.change !== undefined && stat.change !== 0 && (
                          <span className={`flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${stat.change >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                            {stat.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {stat.change >= 0 ? '+' : '-'}{typeof stat.change === 'number' && stat.change % 1 !== 0 ? Math.abs(stat.change).toFixed(1) : Math.abs(stat.change)}{stat.changeLabel ?? '%'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{stat.title}</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-2xl font-bold tabular-nums">
                          {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
                        </span>
                        {stat.suffix && <span className="text-muted-foreground text-sm">{stat.suffix}</span>}
                        {stat.total !== undefined && <span className="text-muted-foreground text-sm">/ {stat.total}</span>}
                      </div>
                      {stat.sparklineValues && stat.sparklineValues.length > 0 && (
                        <div className="mt-2 h-8 -mb-1">
                          <MiniSparkline values={stat.sparklineValues} color={stat.sparklineColor} height={28} showArea />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </m.div>
              ))}
            </m.section>
          );

          if (widget.id === 'weekly-comparison') return (
            <m.div
              key={widget.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 100 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              <m.div whileHover={{ y: -2 }} className="sm:col-span-3">
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10">
                          <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{t('dealerDashboard.weekCompareTitle')}</p>
                          <p className="text-xl font-bold tabular-nums">
                            {t('dealerDashboard.weekFeedbackLine').replace('{count}', String(stats.weeklyFeedbacks))}
                            {previousWeekFeedbacks >= 0 && (
                              <>{t('dealerDashboard.weekPrevPart').replace('{count}', String(previousWeekFeedbacks))}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6">
                        {weekOverWeekChange !== 0 && (
                          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full ${weekOverWeekChange >= 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/15 text-red-700 dark:text-red-400'}`}>
                            {weekOverWeekChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                            {weekOverWeekChange >= 0 ? '+' : ''}{weekOverWeekChange}%
                          </span>
                        )}
                        {previousWeekData.length > 0 && (
                          <div className="h-10 w-24 sm:w-32">
                            <MiniSparkline values={previousWeekData.map((d) => d.feedbacks)} color="hsl(var(--muted-foreground))" height={40} showArea />
                          </div>
                        )}
                        <div className="h-10 w-24 sm:w-32">
                          <MiniSparkline values={weeklyData.map((d) => d.feedbacks)} color="hsl(var(--primary))" height={40} showArea />
                        </div>
                        <span className="text-xs text-muted-foreground hidden sm:block">{t('dealerDashboard.last7DayTrend')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </m.div>
            </m.div>
          );

          if (widget.id === 'charts-row-1') return (
            <div key={widget.id} className="grid lg:grid-cols-3 gap-5">
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, type: 'spring', stiffness: 100 }}
                className="lg:col-span-2"
                whileHover={{ y: -2 }}
              >
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden h-full hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Activity className="h-5 w-5 text-primary" />
                          {t('dealerDashboard.chartWeeklyFeedbackTitle')}
                        </CardTitle>
                        <CardDescription>{t('dealerDashboard.chartWeeklyFeedbackDesc')}</CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{stats.weeklyFeedbacks}</p>
                        <p className="text-xs text-muted-foreground">{t('dealerDashboard.thisWeekLabel')}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <SimpleBarChart data={barChartData} dataKey="value" height={220} color="hsl(var(--primary))" />
                    <Button asChild variant="ghost" size="sm" className="w-full mt-3 rounded-xl">
                      <Link href="/dealer/analytics">{t('dealerDashboard.detailedAnalytics')} <ArrowUpRight className="h-4 w-4 ml-1" /></Link>
                    </Button>
                  </CardContent>
                </Card>
              </m.div>
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18, type: 'spring', stiffness: 100 }}
                whileHover={{ y: -2 }}
              >
                <Card className="border border-border/60 bg-card rounded-2xl h-full hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Sparkles className="h-5 w-5 text-primary" />
                      {t('dealerDashboard.sentimentDistributionTitle')}
                    </CardTitle>
                    <CardDescription>{t('dealerDashboard.sentimentDistributionDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <DonutChart
                      data={donutSentimentData.length > 0 ? donutSentimentData : [{ name: t('dealerDashboard.noDataChart'), value: 100, color: 'hsl(var(--muted))' }]}
                      size={180}
                      height={240}
                      showLegend={donutSentimentData.length > 0}
                    />
                  </CardContent>
                </Card>
              </m.div>
            </div>
          );

          if (widget.id === 'charts-row-2') return (
            <div key={widget.id} className="grid lg:grid-cols-2 gap-5">
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, type: 'spring', stiffness: 100 }}
                whileHover={{ y: -2 }}
              >
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden h-full hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Star className="h-5 w-5 text-amber-500" />
                      {t('dealerDashboard.weeklyAvgRatingTrendTitle')}
                    </CardTitle>
                    <CardDescription>{t('dealerDashboard.weeklyAvgRatingTrendDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <SimpleAreaChart
                      data={areaChartData}
                      dataKey="value"
                      height={200}
                      color="hsl(38, 92%, 50%)"
                      gradientId="rating-gradient"
                    />
                  </CardContent>
                </Card>
              </m.div>
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
                whileHover={{ y: -2 }}
              >
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden h-full hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      {t('dealerDashboard.ratingDistributionTitle')}
                    </CardTitle>
                    <CardDescription>{t('dealerDashboard.ratingDistributionDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <RatingDistributionBar
                      data={ratingDist}
                      maxCount={Math.max(1, ...ratingDist.map((d) => d.count))}
                      barColor="hsl(var(--primary))"
                    />
                  </CardContent>
                </Card>
              </m.div>
            </div>
          );

          if (widget.id === 'recent-activity') return (
            <m.div
              key={widget.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
            >
              <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit">
                      <m.button
                        onClick={() => setActiveTab('feedbacks')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'feedbacks' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        whileTap={{ scale: 0.97 }}
                      >
                        <MessageSquare className="h-4 w-4" /> {t('dealerDashboard.tabRecentFeedbacks')}
                      </m.button>
                      <m.button
                        onClick={() => setActiveTab('qrcodes')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'qrcodes' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        whileTap={{ scale: 0.97 }}
                      >
                        <QrCode className="h-4 w-4" /> {t('dealerDashboard.tabQrCodes')}
                      </m.button>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="rounded-xl w-fit">
                      <Link href={activeTab === 'feedbacks' ? '/dealer/feedbacks' : '/dealer/qr-codes'}>{t('dealerDashboard.seeAll')} <ChevronRight className="h-4 w-4 ml-1" /></Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <AnimatePresence mode="wait">
                    {activeTab === 'feedbacks' ? (
                      <m.div key="fb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                        {recentFeedbacks.length === 0 ? (
                          <div className="py-12 text-center text-muted-foreground">
                            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
                            <p className="font-medium">{t('dealerDashboard.emptyFeedbacksTitle')}</p>
                            <p className="text-sm">{t('dealerDashboard.emptyFeedbacksHint')}</p>
                          </div>
                        ) : (
                          recentFeedbacks.map((fb, i) => (
                            <m.div
                              key={fb.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03, type: 'spring', stiffness: 300 }}
                              whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                              className="flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors cursor-default"
                            >
                              <div className="relative shrink-0">
                                {fb.userImage && (fb.userImage.startsWith('http') || fb.userImage.startsWith('/')) ? (
                                  <Image src={fb.userImage} alt={String(fb.userName || '')} width={40} height={40} className="rounded-full" unoptimized />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">{(String(fb.userName || '?').charAt(0)).toUpperCase()}</div>
                                )}
                                <span className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5 shadow">{getSentimentIcon(fb.sentiment)}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-medium">{fb.userName ?? t('dealerDashboard.anonymous')}</span>
                                  {getSentimentBadge(fb.sentiment, {
                                    positive: t('dealerDashboard.positive'),
                                    negative: t('dealerDashboard.negative'),
                                    neutral: t('dealerDashboard.neutral'),
                                  })}
                                  <div className="flex text-amber-500 ml-auto">
                                    {[1, 2, 3, 4, 5].map(k => <Star key={k} className={`h-3.5 w-3.5 ${k <= fb.rating ? 'fill-current' : 'opacity-30'}`} />)}
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{fb.text || t('dealerDashboard.commentNone')}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1"><QrCode className="h-3 w-3" />{fb.qrName}</span>
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRelativeTime(fb.createdAt, locale === 'en' ? 'en' : 'tr')}</span>
                                </div>
                              </div>
                            </m.div>
                          ))
                        )}
                      </m.div>
                    ) : (
                      <m.div key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid sm:grid-cols-2 gap-3">
                        {qrCodes.length === 0 ? (
                          <div className="col-span-2 py-12 text-center">
                            <QrCode className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                            <p className="font-medium text-muted-foreground">{t('dealerDashboard.emptyQrTitle')}</p>
                            <Button asChild className="mt-3 rounded-xl"><Link href="/dealer/qr-codes"><Plus className="h-4 w-4 mr-2" />{t('dealerDashboard.createFirstQr')}</Link></Button>
                          </div>
                        ) : (
                          qrCodes.map((qr, i) => (
                            <m.div
                              key={qr.id}
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: i * 0.04, type: 'spring', stiffness: 200 }}
                              whileHover={{ y: -2, scale: 1.01 }}
                              className="p-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="h-11 w-11 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                                  <QrCode className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold truncate">{qr.name}</span>
                                    {qr.isActive ? <span className="w-2 h-2 rounded-full bg-emerald-500" /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />}
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono">{qr.code}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="py-2 rounded-lg bg-background/60"><p className="text-sm font-bold tabular-nums">{qr.scans}</p><p className="text-[10px] text-muted-foreground">{t('dealerDashboard.labelScan')}</p></div>
                                <div className="py-2 rounded-lg bg-background/60"><p className="text-sm font-bold tabular-nums">{qr.feedbacks}</p><p className="text-[10px] text-muted-foreground">{t('dealerDashboard.labelFeedbackSingular')}</p></div>
                                <div className="py-2 rounded-lg bg-background/60 flex flex-col items-center justify-center">
                                  <span className="flex items-center gap-0.5 text-sm font-bold"><Star className="h-3 w-3 text-amber-500 fill-amber-500" />{qr.avgRating}</span>
                                  <p className="text-[10px] text-muted-foreground">{t('dealerDashboard.labelScore')}</p>
                                </div>
                              </div>
                            </m.div>
                          ))
                        )}
                      </m.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </m.div>
          );

          if (widget.id === 'analytics-summary') return (
            <m.section
              key={widget.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <m.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 120 }} whileHover={{ y: -2 }}>
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden h-full hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('dealerDashboard.analyticsWeeklyAvgRating')}</p>
                        <p className="text-3xl font-bold mt-1 tabular-nums flex items-baseline gap-1">
                          <m.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>{weeklyAvgRating}</m.span>
                          <span className="text-lg text-muted-foreground">/5</span>
                        </p>
                      </div>
                      <m.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
                        <Star className="h-10 w-10 text-amber-500/80" />
                      </m.div>
                    </div>
                  </CardContent>
                </Card>
              </m.div>
              <m.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 120 }} whileHover={{ y: -2 }}>
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden h-full hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('dealerDashboard.dominantSentimentLabel')}</p>
                        <p className="text-xl font-bold mt-1">{dominantSentiment ?? t('dealerDashboard.noDataChart')}</p>
                      </div>
                      <m.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 }}>
                        <PieChart className="h-10 w-10 text-primary/70" />
                      </m.div>
                    </div>
                    {dominantSentiment && <p className="text-xs text-muted-foreground mt-2">{t('dealerDashboard.basedOnComments')}</p>}
                  </CardContent>
                </Card>
              </m.div>
              <m.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 120 }} className="sm:col-span-2" whileHover={{ y: -2 }}>
                <Card className="border border-border/60 bg-card rounded-2xl overflow-hidden h-full hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('dealerDashboard.summary30dTitle')}</p>
                      <p className="text-2xl sm:text-3xl font-bold mt-1 tabular-nums">
                        <AnimatedCounter value={stats.totalFeedbacks} /> {t('dealerDashboard.summary30dFeedbackSuffix')}
                        {stats.feedbackGrowth !== 0 && (
                          <m.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className={`ml-2 text-base font-medium ${stats.feedbackGrowth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            ({stats.feedbackGrowth >= 0 ? '+' : ''}{stats.feedbackGrowth}%)
                          </m.span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{t('dealerDashboard.vsPrev30Days')}</p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="rounded-xl w-fit shrink-0">
                      <Link href="/dealer/analytics">{t('dealerDashboard.detailedAnalytics')} <ArrowUpRight className="h-4 w-4 ml-1" /></Link>
                    </Button>
                  </CardContent>
                </Card>
              </m.div>
            </m.section>
          );

          if (widget.id === 'extra-data') return (
            <m.section
              key={widget.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, type: 'spring', stiffness: 100 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} whileHover={{ scale: 1.02 }}>
                <Card className="rounded-xl border border-border/50 bg-card/80 h-full">
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('dealerDashboard.dailyAvgTitle')}</p>
                    <p className="text-xl font-bold mt-1 tabular-nums">{dailyAvg} <span className="text-xs font-normal text-muted-foreground">{t('dealerDashboard.dailyAvgPerDay')}</span></p>
                  </CardContent>
                </Card>
              </m.div>
              <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }} whileHover={{ scale: 1.02 }}>
                <Card className="rounded-xl border border-border/50 bg-card/80 h-full">
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('dealerDashboard.bestDayTitle')}</p>
                    <p className="text-lg font-bold mt-1">{bestDay ? bestDay.day : '—'}</p>
                    {bestDay && <p className="text-xs text-muted-foreground">{t('dealerDashboard.bestDayFeedbackCount').replace('{count}', String(bestDay.feedbacks))}</p>}
                  </CardContent>
                </Card>
              </m.div>
              <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} whileHover={{ scale: 1.02 }}>
                <Card className="rounded-xl border border-border/50 bg-card/80 h-full">
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('dealerDashboard.scanToFeedbackTitle')}</p>
                    <p className="text-xl font-bold mt-1 tabular-nums">{feedbackPerScan}<span className="text-xs font-normal text-muted-foreground">%</span></p>
                  </CardContent>
                </Card>
              </m.div>
              {consumptionStats ? (
                <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }} whileHover={{ scale: 1.02 }}>
                  <Card className="rounded-xl border border-border/50 bg-card/80 h-full">
                    <CardContent className="p-4">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('dealerDashboard.consumptionCardTitle')}</p>
                      <p className="text-lg font-bold mt-1 tabular-nums">{t('dealerDashboard.consumptionCardLine').replace('{total}', String(consumptionStats.total))}</p>
                      <p className="text-xs text-muted-foreground">{t('dealerDashboard.consumptionCardSub').replace('{customers}', String(consumptionStats.customers)).replace('{reviewed}', String(consumptionStats.reviewed))}</p>
                    </CardContent>
                  </Card>
                </m.div>
              ) : (
                <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44 }} whileHover={{ scale: 1.02 }}>
                  <Card className="rounded-xl border border-border/50 bg-card/80 h-full">
                    <CardContent className="p-4">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{t('dealerDashboard.moreInsightsTitle')}</p>
                      <p className="text-sm font-medium mt-1">{t('dealerDashboard.moreInsightsDesc')}</p>
                      <Button asChild variant="ghost" size="sm" className="mt-2 h-8 text-xs rounded-lg">
                        <Link href="/dealer/analytics">{t('dealerDashboard.exploreAnalytics')} <ArrowUpRight className="h-3 w-3 ml-1" /></Link>
                      </Button>
                    </CardContent>
                  </Card>
                </m.div>
              )}
            </m.section>
          );

          if (widget.id === 'benchmark-comparison' && benchmark) return (
            <m.div
              key={widget.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 100 }}
            >
              <Card className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 to-primary/10 transition-shadow hover:shadow-md dark:from-primary/10 dark:to-primary/15">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    {t('dealerDashboard.benchmarkWidgetTitle')}
                  </CardTitle>
                  <CardDescription>{t('dealerDashboard.benchmarkWidgetDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                      <p className="text-sm font-medium text-muted-foreground">{t('dealerDashboard.yourRating')}</p>
                      <p className="text-3xl font-bold mt-1 tabular-nums flex items-baseline gap-1">
                        {benchmark.dealer.avgRating} <span className="text-sm text-muted-foreground">/5</span>
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                      <p className="text-sm font-medium text-muted-foreground">{t('dealerDashboard.platformAverageShort')}</p>
                      <p className="text-3xl font-bold mt-1 tabular-nums flex items-baseline gap-1">
                        {benchmark.platform.avgRating} <span className="text-sm text-muted-foreground">/5</span>
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                      <p className="text-sm font-medium text-muted-foreground">{t('dealerDashboard.diffPointsLabel')}</p>
                      <p className={`text-2xl font-bold mt-1 tabular-nums flex items-center gap-1 ${benchmark.vsPlatform.ratingDiff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {benchmark.vsPlatform.ratingDiff >= 0 ? '+' : ''}{benchmark.vsPlatform.ratingDiff}
                        {benchmark.vsPlatform.ratingDiff >= 0 ? <TrendingUp className="h-5 w-5 ml-1" /> : <TrendingDown className="h-5 w-5 ml-1" />}
                      </p>
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                      <p className="text-sm font-medium text-primary">{t('dealerDashboard.percentileRankTitle')}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                        {t('dealerDashboard.topPercentileLine').replace('{pct}', String(benchmark.percentile))}
                      </p>
                      <p className="mt-1 text-xs text-primary/70">
                        {t('dealerDashboard.yourRankHint')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          );

          return null;
        })}

        {/* ─── Detaylı analitik link ─── */}
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="flex justify-center">
          <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button asChild variant="secondary" size="lg" className="rounded-xl shadow-sm">
              <Link href="/dealer/analytics" className="gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('dealerDashboard.allAnalyticsReports')}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </m.div>
        </m.div>
      </div>
    </LazyMotion>
  );
}
