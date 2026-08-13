'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import {
  BarChart3,
  Star,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingUp,
  Target,
  Award,
  Users,
  ListChecks,
  Sparkles,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppT } from '@/lib/app-locale';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  BenchmarkWeeklyPoint,
  BenchmarkDailyPoint,
  BenchmarkComparisonRow,
} from '@/components/dealer/benchmark-charts';

const BenchmarkDailyAreaChart = dynamic(
  () => import('@/components/dealer/benchmark-charts').then((m) => m.BenchmarkDailyAreaChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> }
);
const BenchmarkComparisonBars = dynamic(
  () => import('@/components/dealer/benchmark-charts').then((m) => m.BenchmarkComparisonBars),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full rounded-xl" /> }
);
const BenchmarkWeeklyComposedChart = dynamic(
  () => import('@/components/dealer/benchmark-charts').then((m) => m.BenchmarkWeeklyComposedChart),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full rounded-xl" /> }
);

interface BenchmarkData {
  benchmark: {
    dealerId: string;
    period: string;
    neighborSegment?: {
      category: string;
      peerDealerSample: number;
      peerAvgRating: number;
      peerFeedbackCount: number;
      note: string;
    } | null;
    dealer: {
      avgRating: number;
      replyRate: number;
      totalFeedback: number;
      actionRate?: number;
      actionTotal?: number;
      actionDone?: number;
    };
    platform: {
      avgRating: number;
      replyRate: number;
      totalFeedback: number;
      actionRate?: number;
    };
    vsPlatform: {
      ratingDiff: number;
      replyRateDiff: number;
      actionRateDiff?: number;
    };
    percentile?: number;
    totalDealers?: number;
  };
}

const AnimatedNumber = ({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1000;
    const steps = 40;
    const step = (value - display) / steps;
    let current = display;
    const t = setInterval(() => {
      current += step;
      if (Math.abs(current - value) < 0.01) {
        setDisplay(value);
        clearInterval(t);
      } else setDisplay(current);
    }, duration / steps);
    return () => clearInterval(t);
  }, [value]);
  return <span>{decimals > 0 ? Number(display).toFixed(decimals) : Math.round(display)}{suffix}</span>;
};

const DiffBadge = ({ value, isPercent = false }: { value: number; isPercent?: boolean }) => {
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
        <ArrowUp className="h-4 w-4" /> +{isPercent ? `${value}%` : value.toFixed(2)}
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
        <ArrowDown className="h-4 w-4" /> {isPercent ? `${value}%` : value.toFixed(2)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Minus className="h-4 w-4" /> 0
    </span>
  );
};

/** Radial progress for percentile (0-100) */
const RadialGauge = ({ value, size = 120 }: { value: number; size?: number }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 75 ? 'stroke-emerald-500' : value >= 50 ? 'stroke-blue-500' : 'stroke-amber-500';
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-muted/30"
      />
      <Motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={color}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        style={{ strokeDasharray: circumference }}
      />
    </svg>
  );
};

export default function DealerBenchmarkPage() {
  const t = useAppT();
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<BenchmarkWeeklyPoint[]>([]);
  const [dailyTrend, setDailyTrend] = useState<BenchmarkDailyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/benchmark')
      .then((res) => res.json())
      .then((json) => {
        if (json.benchmark) setData(json);
        if (Array.isArray(json.weeklyTrend)) setWeeklyTrend(json.weeklyTrend);
        if (Array.isArray(json.dailyTrend)) setDailyTrend(json.dailyTrend);
      })
      .catch(() => toast.error(t('dealerBenchmark.toastLoadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] gap-6">
        <Motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <Motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="rounded-2xl bg-blue-500/20 p-5"
          >
            <BarChart3 className="h-14 w-14 text-blue-500" />
          </Motion.div>
          <InlineLoadingStatus
            spinnerClassName="text-blue-500"
            description={(
              <>
                <p className="text-sm text-muted-foreground">{t('dealerBenchmark.loadingLine1')}</p>
                <p className="text-xs text-muted-foreground">{t('dealerBenchmark.loadingLine2')}</p>
              </>
            )}
          />
        </Motion.div>
      </div>
    );
  }

  const b = data?.benchmark;
  if (!b) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
            <BarChart3 className="h-7 w-7 shrink-0 text-blue-500" />
            {t('dealerBenchmark.emptyHeroTitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed max-w-xl">
            {t('dealerBenchmark.emptyHeroDescription')}
          </p>
        </div>
        <Card>
          <CardContent className="py-20 text-center">
            <Motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="rounded-full bg-blue-500/10 p-6">
                <BarChart3 className="h-16 w-16 text-blue-500/50" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">{t('dealerBenchmark.emptyNoDataTitle')}</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  {t('dealerBenchmark.emptyNoDataHint')}
                </p>
              </div>
              <Link href="/dealer/feedbacks">
                <Button variant="outline" className="gap-2">
                  {t('dealerBenchmark.goToFeedbacks')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </Motion.div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const comparisonData: BenchmarkComparisonRow[] = [
    { name: t('dealerBenchmark.rowAvgRating'), siz: b.dealer.avgRating, platform: b.platform.avgRating },
    { name: t('dealerBenchmark.rowReplyRate'), siz: b.dealer.replyRate, platform: b.platform.replyRate },
    { name: t('dealerBenchmark.rowActionRate'), siz: b.dealer.actionRate ?? 0, platform: b.platform.actionRate ?? 0 },
  ];
  const percentileDisplay = typeof b.percentile === 'number' ? 100 - b.percentile : 50;

  return (
    <div className="space-y-8 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerBenchmark.eyebrow')}
        title={t('dealerBenchmark.title')}
        description={t('dealerBenchmark.description')}
        icon={<BarChart3 className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <>
            <Button asChild variant="secondary" size="lg" className="gap-2 touch-manipulation">
              <Link href="/dealer/feedbacks">
                <MessageSquare className="h-4 w-4 shrink-0" />
                {t('dealerBenchmark.linkFeedbacks')}
              </Link>
            </Button>
            <Button asChild size="lg" className="gap-2 touch-manipulation">
              <Link href="/dealer/action-items">
                <ListChecks className="h-4 w-4 shrink-0" />
                {t('dealerBenchmark.linkActions')}
              </Link>
            </Button>
          </>
        }
      />

      {b.neighborSegment && (
        <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="border-teal-500/25 bg-teal-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-600" />
                {t('dealerBenchmark.neighborTitle')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{b.neighborSegment.note}</p>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>
                {t('dealerBenchmark.neighborCategoryLine')
                  .replace('{category}', b.neighborSegment.category)
                  .replace('{count}', String(b.neighborSegment.peerDealerSample))}
              </p>
              <p className="text-muted-foreground">
                {t('dealerBenchmark.neighborAvgLine')
                  .replace('{rating}', String(b.neighborSegment.peerAvgRating))
                  .replace('{feedbackCount}', String(b.neighborSegment.peerFeedbackCount))}
              </p>
            </CardContent>
          </Card>
        </Motion.div>
      )}

      {/* Yüzdelik sıra - Radial gauge */}
      {typeof b.percentile === 'number' && (
        <Motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="border-blue-500/20 bg-blue-500/5 overflow-hidden relative overflow-visible">
            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-bl-full -mr-20 -mt-20" />
            <CardContent className="pt-8 pb-8 relative">
              <div className="flex flex-col sm:flex-row sm:items-center gap-8">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <RadialGauge value={percentileDisplay} size={140} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600">
                        <AnimatedNumber value={percentileDisplay} suffix="%" />
                      </span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{t('dealerBenchmark.rankTitle')}</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                      {t('dealerBenchmark.rankBody').replace('{pct}', String(percentileDisplay))}
                      {b.totalDealers != null && (
                        <span className="block mt-1 text-xs">
                          {t('dealerBenchmark.rankDealersCompared').replace('{count}', String(b.totalDealers))}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex-1 flex flex-wrap gap-4">
                  {[
                    { label: t('dealerBenchmark.diffRating'), value: b.vsPlatform.ratingDiff, isPercent: false },
                    { label: t('dealerBenchmark.diffReply'), value: b.vsPlatform.replyRateDiff, isPercent: true },
                    typeof b.vsPlatform.actionRateDiff === 'number' && {
                      label: t('dealerBenchmark.diffAction'),
                      value: b.vsPlatform.actionRateDiff,
                      isPercent: true,
                    },
                  ]
                    .filter((x): x is { label: string; value: number; isPercent: boolean } => !!x)
                    .map((item, i) => (
                      <Motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="p-4 rounded-xl bg-card border min-w-[140px]"
                      >
                        <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                        <DiffBadge value={item.value} isPercent={item.isPercent} />
                      </Motion.div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </Motion.div>
      )}

      {/* Günlük trend - Son 7 gün */}
      {dailyTrend.length > 0 && (
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                {t('dealerBenchmark.dailyTrendTitle')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t('dealerBenchmark.dailyTrendSubtitle')}</p>
            </CardHeader>
            <CardContent>
              <BenchmarkDailyAreaChart data={dailyTrend} />
            </CardContent>
          </Card>
        </Motion.div>
      )}

      {/* Karşılaştırma bar grafiği */}
      <Motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              {t('dealerBenchmark.comparisonTitle')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t('dealerBenchmark.comparisonSubtitle')}</p>
          </CardHeader>
          <CardContent>
            <BenchmarkComparisonBars data={comparisonData} />
          </CardContent>
        </Card>
      </Motion.div>

      {/* İki kolon: Sizin metrikleriniz / Platform */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-blue-500/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                {t('dealerBenchmark.yourMetrics')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                {
                  icon: Star,
                  label: t('dealerBenchmark.metricAvgRating'),
                  value: b.dealer.avgRating,
                  decimals: 2,
                  suffix: ' / 5',
                  color: 'text-amber-500',
                },
                {
                  icon: MessageSquare,
                  label: t('dealerBenchmark.metricReplyRate'),
                  value: b.dealer.replyRate,
                  decimals: 1,
                  suffix: '%',
                  color: 'text-primary',
                },
                {
                  icon: ListChecks,
                  label: t('dealerBenchmark.metricActionCompletion'),
                  value: b.dealer.actionRate ?? 0,
                  decimals: 1,
                  suffix: '%',
                  color: 'text-emerald-500',
                },
              ].map((row, i) => (
                <Motion.div
                  key={row.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.05 }}
                  className="flex justify-between items-center p-4 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
                >
                  <span className="text-muted-foreground flex items-center gap-2">
                    <row.icon className={`h-4 w-4 ${row.color}`} />
                    {row.label}
                  </span>
                  <span className="font-bold text-lg">
                    <AnimatedNumber value={row.value} decimals={row.decimals} suffix={row.suffix} />
                  </span>
                </Motion.div>
              ))}
              <p className="text-sm text-muted-foreground pt-2">
                {t('dealerBenchmark.yourFooter')
                  .replace('{feedback}', String(b.dealer.totalFeedback))
                  .replace('{done}', String(b.dealer.actionDone ?? 0))
                  .replace('{total}', String(b.dealer.actionTotal ?? 0))}
              </p>
            </CardContent>
          </Card>
        </Motion.div>
        <Motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-slate-500" />
                {t('dealerBenchmark.platformAverage')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex justify-between items-center p-4 rounded-xl bg-muted/30">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Star className="h-4 w-4" /> {t('dealerBenchmark.metricAvgRating')}
                </span>
                <span className="font-bold text-lg">{b.platform.avgRating.toFixed(2)} / 5</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-muted/30">
                <span className="text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> {t('dealerBenchmark.metricReplyRate')}
                </span>
                <span className="font-bold text-lg">{b.platform.replyRate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-muted/30">
                <span className="text-muted-foreground flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> {t('dealerBenchmark.metricActionCompletion')}
                </span>
                <span className="font-bold text-lg">{(b.platform.actionRate ?? 0).toFixed(1)}%</span>
              </div>
              <p className="text-sm text-muted-foreground pt-2">
                {t('dealerBenchmark.platformFooter').replace('{count}', String(b.platform.totalFeedback))}
              </p>
            </CardContent>
          </Card>
        </Motion.div>
      </div>

      {/* Haftalık trend */}
      {weeklyTrend.length > 0 && (
        <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                {t('dealerBenchmark.weeklyTrendTitle')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t('dealerBenchmark.weeklyTrendSubtitle')}</p>
            </CardHeader>
            <CardContent>
              <BenchmarkWeeklyComposedChart data={weeklyTrend} />
            </CardContent>
          </Card>
        </Motion.div>
      )}

      {/* Hedef özeti */}
      <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/20">
                <Target className="h-7 w-7 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{t('dealerBenchmark.ctaTitle')}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t('dealerBenchmark.ctaBody')}</p>
              </div>
              <Link href="/dealer/action-items">
                <Button variant="outline" className="gap-2 shrink-0">
                  {t('dealerBenchmark.goToActions')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </Motion.div>
    </div>
  );
}
