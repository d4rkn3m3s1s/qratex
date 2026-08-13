'use client';

import { useState, useEffect } from 'react';
import { m as Motion } from 'framer-motion';
import {
  MessageSquare,
  Loader2,
  Star,
  User,
  Mic,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Minus,
  BarChart3,
  MapPin,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppLocale, useAppT } from '@/lib/app-locale';

type VoCItem = {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  intent?: string | null;
  topics?: unknown;
  themes?: unknown;
  createdAt: string;
  userName: string;
  locationName?: string;
};

type VoCData = {
  voc: {
    recent: VoCItem[];
    stats: {
      avgRating: number;
      totalFeedback: number;
      totalPublic: number;
      last24hCount: number;
    };
    sentiment: { positive: number; negative: number; neutral: number };
    ratingDistribution: number[];
    dailyTrend: { date: string; label: string; count: number }[];
  };
};

const normalizeTriplet = (a: number, b: number, c: number) => {
  const total = a + b + c;
  if (!total) return [0, 0, 0];
  const raw = [(a / total) * 100, (b / total) * 100, (c / total) * 100];
  const rounded = raw.map((v) => Math.round(v));
  let diff = 100 - (rounded[0] + rounded[1] + rounded[2]);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((x, y) => (diff > 0 ? y.frac - x.frac : x.frac - y.frac));
  for (const item of order) {
    if (!diff) break;
    rounded[item.i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return rounded;
};

function SentimentDonut({ positive, negative, neutral }: { positive: number; negative: number; neutral: number }) {
  const t = useAppT();
  const total = positive + negative + neutral || 1;
  const [positivePct, negativePct, neutralPct] = normalizeTriplet(positive, negative, neutral);
  const data = [
    { value: positive, color: 'rgb(34, 197, 94)', label: t('dealerVocWall.sentimentPositive'), pct: positivePct },
    { value: negative, color: 'rgb(239, 68, 68)', label: t('dealerVocWall.sentimentNegative'), pct: negativePct },
    { value: neutral, color: 'rgb(148, 163, 184)', label: t('dealerVocWall.sentimentNeutral'), pct: neutralPct },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
        {t('dealerVocWall.noDataYet')}
      </div>
    );
  }

  let currentAngle = -90;
  const size = 140;
  const r = size / 2 - 12;
  const ir = r * 0.6;

  const getPath = (start: number, end: number) => {
    const sx = size / 2 + r * Math.cos((start * Math.PI) / 180);
    const sy = size / 2 + r * Math.sin((start * Math.PI) / 180);
    const ex = size / 2 + r * Math.cos((end * Math.PI) / 180);
    const ey = size / 2 + r * Math.sin((end * Math.PI) / 180);
    const ix = size / 2 + ir * Math.cos((end * Math.PI) / 180);
    const iy = size / 2 + ir * Math.sin((end * Math.PI) / 180);
    const ix2 = size / 2 + ir * Math.cos((start * Math.PI) / 180);
    const iy2 = size / 2 + ir * Math.sin((start * Math.PI) / 180);
    const large = end - start > 180 ? 1 : 0;
    return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} L ${ix} ${iy} A ${ir} ${ir} 0 ${large} 0 ${ix2} ${iy2} Z`;
  };

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        {data.map((d, i) => {
          const angle = (d.value / total) * 360;
          const path = getPath(currentAngle, currentAngle + angle);
          currentAngle += angle;
          return (
            <Motion.path
              key={i}
              d={path}
              fill={d.color}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 200 }}
            />
          );
        })}
      </svg>
      <div className="space-y-1 text-sm">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="font-medium">{d.pct}%</span>
            <span className="text-xs text-muted-foreground">({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingBars({ dist }: { dist: number[] }) {
  const max = Math.max(...dist, 1);
  const total = dist.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-2">
      {[5, 4, 3, 2, 1].map((r, i) => {
        const val = dist[r - 1] ?? 0;
        return (
          <Motion.div key={r} className="flex items-center gap-2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.05 }}>
            <span className="text-xs w-4">{r}★</span>
            <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
              <Motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(val / max) * 100}%` }}
                transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }}
                className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 rounded"
              />
            </div>
            <span className="text-xs w-16 text-right font-medium">{Math.round((val / total) * 100)}% ({val})</span>
          </Motion.div>
        );
      })}
    </div>
  );
}

function DailyTrendChart({ data }: { data: { date: string; label: string; count: number }[] }) {
  const t = useAppT();
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <Motion.div
          key={d.date}
          initial={{ height: 0 }}
          animate={{ height: `${(d.count / max) * 100}%` }}
          transition={{ delay: Math.min(i, 10) * 0.05, duration: 0.4 }}
          className="flex-1 min-w-0 flex flex-col items-center gap-1"
        >
          <span className="text-[10px] font-medium text-muted-foreground order-2">{d.label}</span>
          <div
            className="w-full rounded-t bg-gradient-to-t from-cyan-500 to-cyan-400 min-h-[4px]"
            title={t('dealerVocWall.chartBarTooltip').replace('{date}', d.date).replace('{count}', String(d.count))}
          />
          <span className="text-[10px] font-medium order-1">{d.count}</span>
        </Motion.div>
      ))}
    </div>
  );
}

function LiveTicker({ items }: { items: VoCItem[] }) {
  const t = useAppT();
  const { locale } = useAppLocale();
  if (!items.length) return null;
  const repeated = [...items, ...items];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm">
      <Motion.div
        className="flex min-w-max gap-3 py-3 pr-3"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 24, ease: 'linear', repeat: Infinity }}
      >
        {repeated.map((item, idx) => {
          const sentiment = (item.sentiment || 'neutral').toLowerCase();
          const tone =
            sentiment === 'positive'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : sentiment === 'negative'
                ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                : 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
          return (
            <div
              key={`${item.id}-${idx}`}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${tone}`}
            >
              <span className="truncate max-w-[120px] sm:max-w-[260px]">{item.text || t('dealerVocWall.noComment')}</span>
              <span className="opacity-70">•</span>
              <span>{item.locationName || t('dealerVocWall.locationFallback')}</span>
              <span className="opacity-70">•</span>
              <span>{formatRelativeTime(item.createdAt, locale === 'en' ? 'en' : 'tr')}</span>
            </div>
          );
        })}
      </Motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

function LiveFeedStrip({ items }: { items: VoCItem[] }) {
  const t = useAppT();
  const { locale } = useAppLocale();
  if (!items.length) return null;
  const repeated = [...items.slice(0, 12), ...items.slice(0, 12)];
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/50 backdrop-blur-sm">
      <Motion.div
        className="pointer-events-none absolute left-0 top-0 h-full w-1/3 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0"
        animate={{ x: ['-120%', '360%'] }}
        transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
      />
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          {t('dealerVocWall.liveFeedTitle')}
        </CardTitle>
        <CardDescription>{t('dealerVocWall.liveFeedDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <Motion.div
          className="flex min-w-max gap-3 pb-1"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
        >
          {repeated.map((item, idx) => {
            const sentiment = (item.sentiment || 'neutral').toLowerCase();
            const dotColor =
              sentiment === 'positive' ? 'bg-emerald-500' : sentiment === 'negative' ? 'bg-red-500' : 'bg-slate-400';
            return (
              <div
                key={`${item.id}-strip-${idx}`}
                className="w-[90vw] min-w-[140px] sm:w-[240px] rounded-xl border border-border/70 bg-background/70 p-2 sm:p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                    <span className="text-[11px] text-muted-foreground">
                      {item.locationName || t('dealerVocWall.locationBranchDefault')}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(item.createdAt, locale === 'en' ? 'en' : 'tr')}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-foreground/90">{item.text || t('dealerVocWall.noComment')}</p>
              </div>
            );
          })}
        </Motion.div>
      </CardContent>
    </Card>
  );
}

export default function DealerVoCWallPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [data, setData] = useState<VoCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [kioskMode, setKioskMode] = useState(false);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/dealer/voc-wall?limit=50')
      .then((r) => r.json())
      .then((j) => {
        if (j.voc) setData(j);
      })
      .catch(() => toast.error(t('dealerVocWall.toastLoadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!kioskMode) return;
    const timer = window.setInterval(() => {
      fetchData();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [kioskMode]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-36 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-48 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-48 rounded-xl bg-muted/50 animate-pulse" />
        </div>
        <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  const voc = data?.voc;
  if (!voc) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
            <MessageSquare className="h-7 w-7 shrink-0 text-primary" /> {t('dealerVocWall.errorTitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">{t('dealerVocWall.errorDescription')}</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('dealerVocWall.errorRetry')}
            <Button variant="outline" size="sm" className="mt-4 touch-manipulation" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 shrink-0 mr-2" /> {t('dealerVocWall.refresh')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sentiment = {
    positive: voc.sentiment?.positive ?? 0,
    negative: voc.sentiment?.negative ?? 0,
    neutral: voc.sentiment?.neutral ?? 0,
  };
  const sentimentTotal = sentiment.positive + sentiment.negative + sentiment.neutral;
  const ratingDist = voc.ratingDistribution ?? [0, 0, 0, 0, 0];
  const dailyTrend = voc.dailyTrend ?? [];

  return (
    <div className={`pb-8 ${kioskMode ? 'space-y-10' : 'space-y-8'}`}>
      <DashboardPageHero
        eyebrow={t('dealerVocWall.eyebrow')}
        title={t('dealerVocWall.title')}
        description={t('dealerVocWall.description')}
        icon={<Mic className="h-7 w-7" aria-hidden />}
        tone="auto"
        chips={
          <Badge variant="secondary" className="font-normal">
            {t('dealerVocWall.chipPublic').replace('{count}', String(voc.stats.totalPublic))}
          </Badge>
        }
        actions={
          <>
            <Button
              variant={kioskMode ? 'default' : 'outline'}
              size="sm"
              type="button"
              className={
                kioskMode
                  ? 'touch-manipulation'
                  : 'touch-manipulation border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20'
              }
              onClick={() => setKioskMode((prev) => !prev)}
            >
              {kioskMode ? t('dealerVocWall.tvModeOn') : t('dealerVocWall.tvMode')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="touch-manipulation border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              type="button"
              onClick={fetchData}
            >
              <RefreshCw className="h-4 w-4 shrink-0 mr-2" /> {t('dealerVocWall.refresh')}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="touch-manipulation border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <Link href="/dealer/feedbacks">{t('dealerVocWall.linkAllFeedbacks')}</Link>
            </Button>
          </>
        }
      />

      <LiveTicker items={voc.recent.slice(0, kioskMode ? 24 : 18)} />
      <LiveFeedStrip items={voc.recent} />

      {/* Stats */}
      <Motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4"
      >
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Star className="h-5 w-5 text-amber-600 dark:text-amber-400 fill-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dealerVocWall.statAvgRating')}</p>
              <p className="text-xl font-bold">{(voc.stats.avgRating ?? 0).toFixed(1)} / 5</p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-950/30 dark:to-teal-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20">
              <MessageSquare className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dealerVocWall.statTotalFeedback')}</p>
              <p className="text-xl font-bold">{voc.stats.totalFeedback}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dealerVocWall.statLast24h')}</p>
              <p className="text-xl font-bold">{voc.stats.last24hCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-0 shadow-md">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <ThumbsUp className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dealerVocWall.statPositiveRate')}</p>
              <p className="text-xl font-bold">
                {sentimentTotal > 0
                  ? `${Math.round((sentiment.positive / sentimentTotal) * 100)}%`
                  : '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      </Motion.div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} whileHover={{ y: -3 }}>
          <Card className="h-full overflow-x-auto md:overflow-x-visible">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ThumbsUp className="h-4 w-4 text-emerald-500" />
                <ThumbsDown className="h-4 w-4 text-red-500" />
                <Minus className="h-4 w-4 text-slate-400" />
                {t('dealerVocWall.chartSentimentTitle')}
              </CardTitle>
              <CardDescription>{t('dealerVocWall.chartSentimentDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="h-[210px]">
              <SentimentDonut positive={sentiment.positive} negative={sentiment.negative} neutral={sentiment.neutral} />
            </CardContent>
          </Card>
        </Motion.div>
        <Motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} whileHover={{ y: -3 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                {t('dealerVocWall.chartRatingTitle')}
              </CardTitle>
              <CardDescription>{t('dealerVocWall.chartRatingDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="h-[210px]">
              <RatingBars dist={ratingDist} />
            </CardContent>
          </Card>
        </Motion.div>
        <Motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} whileHover={{ y: -3 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-500" />
                {t('dealerVocWall.chartTrendTitle')}
              </CardTitle>
              <CardDescription>{t('dealerVocWall.chartTrendDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="h-[210px]">
              <DailyTrendChart data={dailyTrend} />
            </CardContent>
          </Card>
        </Motion.div>
      </div>

      {/* Feedback wall */}
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-cyan-500" />
              {t('dealerVocWall.wallTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('dealerVocWall.wallSubtitle')}</p>
          </div>
        </div>

        {voc.recent.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground font-medium">{t('dealerVocWall.emptyPublicTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('dealerVocWall.emptyPublicHint')}</p>
              <Link href="/dealer/feedbacks">
                <Button variant="outline" size="sm" className="mt-4">
                  {t('dealerVocWall.goToFeedbacks')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {voc.recent.map((item, i) => {
              const stRaw = (item.sentiment || '').toLowerCase();
              const sentimentDisplay =
                stRaw === 'positive'
                  ? t('feedback.positive')
                  : stRaw === 'negative'
                    ? t('feedback.negative')
                    : stRaw === 'neutral' || !item.sentiment
                      ? t('feedback.neutral')
                      : item.sentiment ?? t('feedback.neutral');
              const isPositive = stRaw === 'positive';
              const isNegative = stRaw === 'negative';
              const borderColor = isPositive ? 'border-l-emerald-500' : isNegative ? 'border-l-red-500' : 'border-l-slate-400';
              const bgGlow = isPositive ? 'from-emerald-500/5 to-transparent' : isNegative ? 'from-red-500/5 to-transparent' : 'from-slate-500/5 to-transparent';

              return (
                <Motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.03, type: 'spring', stiffness: 200 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                >
                  <Card className={`h-full overflow-hidden border-l-4 ${borderColor} hover:shadow-lg transition-shadow bg-gradient-to-r ${bgGlow}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-4 w-4 ${s <= item.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`}
                              />
                            ))}
                          </div>
                          <Badge variant={isPositive ? 'default' : isNegative ? 'destructive' : 'secondary'} className="text-xs">
                            {sentimentDisplay}
                          </Badge>
                          <Motion.span
                            className={`h-2 w-2 rounded-full ${isPositive ? 'bg-emerald-500' : isNegative ? 'bg-red-500' : 'bg-slate-400'}`}
                            animate={{ opacity: [0.35, 1, 0.35], scale: [1, 1.15, 1] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(item.createdAt, locale === 'en' ? 'en' : 'tr')}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 line-clamp-4 min-h-[3.5rem]">
                        {item.text || t('dealerVocWall.noComment')}
                      </p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3.5 w-3" />
                          {item.userName}
                        </div>
                        {item.locationName && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3" />
                            {item.locationName}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Motion.div>
              );
            })}
          </div>
        )}
      </Motion.div>
    </div>
  );
}
