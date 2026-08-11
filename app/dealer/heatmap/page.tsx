'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin,
  Loader2,
  Star,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Clock,
  Award,
  BarChart3,
  QrCode,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import Link from 'next/link';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppT } from '@/lib/app-locale';

interface HeatmapRow {
  qrCodeId: string;
  locationName: string;
  code?: string;
  scanCount?: number;
  feedbackCount: number;
  avgRating: number;
  negativeCount: number;
  positiveCount: number;
  satisfactionScore: number;
}

interface HeatmapResponse {
  heatmap: HeatmapRow[];
  period: string;
  timeHeatmap?: number[][];
  summary?: {
    totalLocations: number;
    totalFeedbacks: number;
    bestLocation: { name: string; avgRating: number; feedbackCount: number } | null;
    mostActiveLocation: { name: string; feedbackCount: number } | null;
    peakHour: { hour: number; dayOfWeek: number; count: number };
  };
}

function TimeHeatmapGrid({ data }: { data: number[][] }) {
  const t = useAppT();
  const maxVal = Math.max(...data.flat(), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getColor = (value: number) => {
    const t = value / maxVal;
    if (t === 0) return 'bg-muted/40';
    if (t < 0.2) return 'bg-amber-400/30';
    if (t < 0.4) return 'bg-amber-500/50';
    if (t < 0.6) return 'bg-orange-500/70';
    if (t < 0.8) return 'bg-orange-600';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-0.5 items-end">
        <div className="w-9 shrink-0" />
        <div className="flex-1 flex">
          {hours.map((h) => (
            <div
              key={h}
              className="flex-1 min-w-[8px] text-[10px] text-muted-foreground text-center"
            >
              {h % 2 === 0 ? `${h}:00` : ''}
            </div>
          ))}
        </div>
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map((di) => (
        <div key={di} className="flex gap-1 items-center">
          <div className="w-9 shrink-0 text-[11px] text-muted-foreground font-medium">
            {t(`dealerHeatmap.weekdayShort.${di}`)}
          </div>
          <div className="flex-1 flex gap-0.5">
            {hours.map((hour) => {
              const val = data[di]?.[hour] ?? 0;
              return (
                <motion.div
                  key={hour}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: (di * 24 + hour) * 0.003,
                    type: 'spring',
                    stiffness: 300,
                    damping: 24,
                  }}
                  className={`flex-1 min-w-[8px] h-5 rounded-sm ${getColor(val)} cursor-default hover:ring-2 hover:ring-orange-400 hover:ring-offset-1 transition-all`}
                  title={t('dealerHeatmap.cellTooltip')
                    .replace('{day}', t(`dealerHeatmap.weekdayShort.${di}`))
                    .replace('{hour}', String(hour))
                    .replace('{count}', String(val))}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
        <span>{t('dealerHeatmap.intensityLow')}</span>
        <div className="flex gap-0.5 flex-1 max-w-[120px]">
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded-sm ${getColor(t * maxVal)}`}
            />
          ))}
        </div>
        <span>{t('dealerHeatmap.intensityHigh')}</span>
      </div>
    </div>
  );
}

function BarChartLocations({ items }: { items: HeatmapRow[] }) {
  const t = useAppT();
  const top = items
    .filter((r) => r.feedbackCount > 0)
    .sort((a, b) => b.feedbackCount - a.feedbackCount)
    .slice(0, 8);
  const maxF = Math.max(...top.map((r) => r.feedbackCount), 1);

  return (
    <div className="space-y-2">
      {top.map((row, i) => (
        <motion.div
          key={row.qrCodeId}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i, 10) * 0.06 }}
          className="flex items-center gap-2"
        >
          <span className="text-xs text-muted-foreground w-24 truncate" title={row.locationName}>
            {row.locationName}
          </span>
          <div className="flex-1 h-6 bg-muted/50 rounded overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(row.feedbackCount / maxF) * 100}%` }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.5 }}
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded"
            />
          </div>
          <span className="text-xs font-medium w-8 text-right">{row.feedbackCount}</span>
        </motion.div>
      ))}
      {top.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">{t('dealerHeatmap.barChartEmpty')}</p>
      )}
    </div>
  );
}

export default function DealerHeatmapPage() {
  const t = useAppT();
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [neighbor, setNeighbor] = useState<{
    category: string;
    peerAvgRating: number;
    peerFeedbackCount: number;
    note: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dealer/heatmap').then((r) => r.json()),
      fetch('/api/dealer/benchmark').then((r) => r.json()),
    ])
      .then(([hm, bm]) => {
        if (hm.heatmap) setData(hm);
        if (bm?.benchmark?.neighborSegment) setNeighbor(bm.benchmark.neighborSegment);
      })
      .catch(() => toast.error(t('dealerHeatmap.toastLoadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
        </div>
        <div className="h-48 rounded-xl bg-muted/50 animate-pulse" />
      </div>
    );
  }

  const heatmap = data?.heatmap ?? [];
  const period = data?.period ?? '';
  const timeHeatmap = data?.timeHeatmap ?? Array.from({ length: 7 }, () => Array(24).fill(0));
  const summary = data?.summary;

  return (
    <div className="space-y-8 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerHeatmap.eyebrow')}
        title={t('dealerHeatmap.title')}
        description={t('dealerHeatmap.description')}
        icon={<Flame className="h-7 w-7" aria-hidden />}
        tone="auto"
        chips={
          period ? (
            <Badge variant="secondary" className="font-normal">
              {period}
            </Badge>
          ) : null
        }
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <Link href="/dealer/qr-codes">
              <QrCode className="h-4 w-4" />
              {t('dealerHeatmap.qrCodesLink')}
            </Link>
          </Button>
        }
      />

      {neighbor && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
              {t('dealerHeatmap.neighborSegment')}
            </p>
            <p className="text-sm font-medium mt-1">{neighbor.category}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('dealerHeatmap.neighborPeerLine')
                .replace('{rating}', neighbor.peerAvgRating.toFixed(2))
                .replace('{count}', String(neighbor.peerFeedbackCount))}
            </p>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{neighbor.note}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0 border-sky-500/30">
            <Link href="/dealer/benchmark">{t('dealerHeatmap.benchmarkDetail')}</Link>
          </Button>
        </motion.div>
      )}

      {/* Summary cards */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <MapPin className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dealerHeatmap.statLocations')}</p>
                <p className="text-xl font-bold">{summary.totalLocations}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <MessageSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('dealerHeatmap.statTotalFeedback')}</p>
                <p className="text-xl font-bold">{summary.totalFeedbacks}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('dealerHeatmap.statBestRating')}</p>
                <p className="text-sm font-bold truncate" title={summary.bestLocation?.name}>
                  {summary.bestLocation?.name ?? '—'}
                </p>
                {summary.bestLocation && (
                  <p className="text-xs text-muted-foreground">
                    {t('dealerHeatmap.statBestSub')
                      .replace('{rating}', summary.bestLocation.avgRating.toFixed(1))
                      .replace('{count}', String(summary.bestLocation.feedbackCount))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-lg bg-primary/15 p-2">
                <Clock className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('dealerHeatmap.statPeakMoment')}</p>
                <p className="text-sm font-bold">
                  {t(`dealerHeatmap.weekdayShort.${summary.peakHour.dayOfWeek}`)} {summary.peakHour.hour}:00
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('dealerHeatmap.statPeakSub').replace('{count}', String(summary.peakHour.count))}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Time heatmap + Bar chart */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-orange-500" />
                {t('dealerHeatmap.chartTimeTitle')}
              </CardTitle>
              <CardDescription>{t('dealerHeatmap.chartTimeDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeHeatmapGrid data={timeHeatmap} />
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-amber-500" />
                {t('dealerHeatmap.chartLocationTitle')}
              </CardTitle>
              <CardDescription>{t('dealerHeatmap.chartLocationDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChartLocations items={heatmap} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Location cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-orange-500" />
              {t('dealerHeatmap.locationDetailsTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('dealerHeatmap.locationDetailsSubtitle')}</p>
          </div>
        </div>

        {heatmap.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground font-medium">{t('dealerHeatmap.emptyLocationTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('dealerHeatmap.emptyLocationHint')}</p>
              <Link href="/dealer/qr-codes">
                <Button variant="outline" size="sm" className="mt-4">
                  <QrCode className="h-4 w-4 mr-2" />
                  {t('dealerHeatmap.goQrCodes')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {heatmap.map((row, i) => (
              <motion.div
                key={row.qrCodeId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.04 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow overflow-hidden">
                  <div
                    className="h-1.5 w-full bg-muted"
                    style={{
                      background: `linear-gradient(90deg, rgb(34,197,94) 0%, rgb(34,197,94) ${row.satisfactionScore}%, rgb(239,68,68) ${row.satisfactionScore}%, rgb(239,68,68) 100%)`,
                    }}
                  />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
                        <span className="font-medium truncate" title={row.locationName}>
                          {row.locationName}
                        </span>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {t('dealerHeatmap.badgeFeedbackCount').replace('{count}', String(row.feedbackCount))}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm mb-3">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-medium">{row.avgRating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ThumbsUp className="h-4 w-4 text-emerald-500" />
                        {row.positiveCount}
                        <ThumbsDown className="h-4 w-4 text-red-500" />
                        {row.negativeCount}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{t('dealerHeatmap.satisfaction')}</span>
                        <span className="font-medium">%{row.satisfactionScore}</span>
                      </div>
                      <Progress value={row.satisfactionScore} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
