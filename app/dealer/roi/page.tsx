'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Loader2,
  MessageSquare,
  ListChecks,
  Star,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  BarChart3,
  Target,
  Reply,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppT } from '@/lib/app-locale';
import { Skeleton } from '@/components/ui/skeleton';
import type { RoiWeeklyPoint, RoiDailyPoint } from '@/components/dealer/roi-charts';

const RoiWeeklyAreaChart = dynamic(
  () => import('@/components/dealer/roi-charts').then((m) => m.RoiWeeklyAreaChart),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full rounded-xl" /> }
);
const RoiDailyBarChart = dynamic(
  () => import('@/components/dealer/roi-charts').then((m) => m.RoiDailyBarChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> }
);

type ROIMetrics = {
  period: string;
  feedbackTotal: number;
  feedbackReplied: number;
  replyRate: number;
  actionItemsTotal: number;
  actionItemsDone: number;
  actionCompletionRate: number;
  avgRating: number | null;
  feedbackCount: number;
  comparison?: {
    feedbackTotalPrev: number;
    replyRatePrev: number;
    actionCompletionRatePrev: number;
    avgRatingPrev: number | null;
    replyRateChange: number | null;
    actionRateChange: number | null;
    ratingChange: number | null;
    feedbackChange: number | null;
  };
};

const AnimatedNumber = ({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1200;
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
  return <span>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}{suffix}</span>;
};

function ChangeBadge({ change, isPercent = false }: { change: number | null; isPercent?: boolean }) {
  const t = useAppT();
  if (change == null || change === 0) return null;
  const up = change > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {isPercent ? `${change}%` : change} {t('dealerRoi.changeVsPrevMonth')}
    </span>
  );
}

export default function DealerROIPage() {
  const t = useAppT();
  const [metrics, setMetrics] = useState<ROIMetrics | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<RoiWeeklyPoint[]>([]);
  const [dailyTrend, setDailyTrend] = useState<RoiDailyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/roi')
      .then((r) => r.json())
      .then((j) => {
        if (j.metrics) setMetrics(j.metrics);
        if (Array.isArray(j.weeklyTrend)) setWeeklyTrend(j.weeklyTrend);
        if (Array.isArray(j.dailyTrend)) setDailyTrend(j.dailyTrend);
      })
      .catch(() => toast.error(t('dealerRoi.toastLoadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
          <p className="text-sm text-muted-foreground">{t('dealerRoi.loadingDescription')}</p>
        </motion.div>
      </div>
    );
  }

  const comp = metrics?.comparison;

  return (
    <div className="space-y-8">
      <DashboardPageHero
        eyebrow={t('dealerRoi.eyebrow')}
        title={t('dealerRoi.title')}
        description={t('dealerRoi.description')}
        icon={<DollarSign className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <>
            <Button
              asChild
              variant="outline"
              className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <Link href="/dealer/feedbacks">
                <MessageSquare className="h-4 w-4" />
                {t('dealerRoi.linkFeedbacks')}
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link href="/dealer/action-items">
                <ListChecks className="h-4 w-4" />
                {t('dealerRoi.linkActions')}
              </Link>
            </Button>
          </>
        }
      />

      {!metrics ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="h-14 w-14 mx-auto text-muted-foreground opacity-40" />
            <p className="text-muted-foreground mt-4">{t('dealerRoi.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('dealerRoi.emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Kartları */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-emerald-500/10 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-bl-full" />
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                    {t('dealerRoi.kpiFeedbackMonth')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    <AnimatedNumber value={metrics.feedbackTotal} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dealerRoi.subReplied').replace('{count}', String(metrics.feedbackReplied))}
                  </p>
                  <ChangeBadge change={comp?.feedbackChange ?? null} />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="overflow-hidden relative">
                <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-primary/10" />
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Reply className="h-4 w-4 text-primary" aria-hidden />
                    {t('dealerRoi.kpiReplyRate')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    <AnimatedNumber value={metrics.replyRate} decimals={1} suffix="%" />
                  </div>
                  <Progress value={metrics.replyRate} className="mt-2 h-2" />
                  <div className="mt-2">
                    <ChangeBadge change={comp?.replyRateChange ?? null} isPercent />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="overflow-hidden relative">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-full" />
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-amber-500" />
                    {t('dealerRoi.kpiActionCompletion')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    <AnimatedNumber value={metrics.actionCompletionRate} decimals={1} suffix="%" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dealerRoi.subActionsDone')
                      .replace('{done}', String(metrics.actionItemsDone))
                      .replace('{total}', String(metrics.actionItemsTotal))}
                  </p>
                  <Progress value={metrics.actionCompletionRate} className="mt-2 h-2" />
                  <div className="mt-2">
                    <ChangeBadge change={comp?.actionRateChange ?? null} isPercent />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card className="overflow-hidden relative">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-full" />
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    {t('dealerRoi.kpiAvgRating')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {metrics.avgRating != null ? (
                      <AnimatedNumber value={metrics.avgRating} decimals={1} />
                    ) : (
                      '-'
                    )}{' '}
                    <span className="text-lg text-muted-foreground">/ 5</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dealerRoi.subFeedbackCount').replace('{count}', String(metrics.feedbackCount))}
                  </p>
                  {comp?.ratingChange != null && comp.ratingChange !== 0 && (
                    <ChangeBadge change={comp.ratingChange} />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Haftalık trend grafiği */}
          {weeklyTrend.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-500" />
                    {t('dealerRoi.weeklyTrendTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('dealerRoi.weeklyTrendSubtitle')}</p>
                </CardHeader>
                <CardContent>
                  <RoiWeeklyAreaChart data={weeklyTrend} />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Günlük bar chart */}
          {dailyTrend.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    {t('dealerRoi.dailyTrendTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('dealerRoi.dailyTrendSubtitle')}</p>
                </CardHeader>
                <CardContent>
                  <RoiDailyBarChart data={dailyTrend} />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Hedef özeti */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
                    <Target className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{t('dealerRoi.howToImproveTitle')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{t('dealerRoi.howToImproveBody')}</p>
                  </div>
                  <Link href="/dealer/feedbacks">
                    <Button variant="outline" className="gap-2">
                      {t('dealerRoi.ctaReplyFeedback')}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}
