'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Bot,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  Link2,
  Zap,
  Star,
  TrendingUp,
  Target,
  ChevronRight,
  BarChart3,
  Shield,
  ListChecks,
  Users,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { formatRelativeTime } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import type { CopilotDailyPoint } from '@/components/dealer/copilot-daily-trend-chart';

const CopilotDailyTrendChart = dynamic(
  () =>
    import('@/components/dealer/copilot-daily-trend-chart').then((m) => m.CopilotDailyTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[240px] w-full rounded-xl" /> }
);

interface CopilotSummary {
  period: string;
  criticalIssues: Array<{
    feedbackId: string;
    rating: number;
    sentiment: string | null;
    excerpt: string;
    urgency: number | null;
    createdAt: string;
  }>;
  topActions: Array<{ action: string; priority?: string; feedbackId: string }>;
  totalNegativeFeedback: number;
  stats?: {
    totalFeedback: number;
    negativeCount: number;
    positiveCount: number;
    replyRate: number;
    avgRating: number | null;
    repliedCount: number;
    actionItemsPending: number;
    churnCount: number;
    openIncidents: number;
  };
  nextBestActions?: Array<{ cardKey: string; label: string; href: string; priority: number }>;
  campaignRoiHints?: Array<{
    campaignId: string;
    title: string;
    attributedFeedbackCount: number;
    sentCount: number;
    hint: string;
  }>;
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

export default function DealerCopilotPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [summary, setSummary] = useState<CopilotSummary | null>(null);
  const [dailyTrend, setDailyTrend] = useState<CopilotDailyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/copilot-summary')
      .then((res) => res.json())
      .then((json) => {
        if (json.summary) setSummary(json.summary);
        if (Array.isArray(json.dailyTrend)) setDailyTrend(json.dailyTrend);
      })
      .catch(() => toast.error(t('dealerCopilot.toastLoadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[340px] gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="rounded-2xl bg-primary/20 p-4"
          >
            <Bot className="h-12 w-12 text-primary" />
          </motion.div>
          <InlineLoadingStatus spinnerClassName="text-primary" description={t('dealerCopilot.loadingDescription')} />
        </motion.div>
      </div>
    );
  }

  const stats = summary?.stats;
  const nextBest = summary?.nextBestActions ?? [];

  return (
    <div className="space-y-8">
      <DashboardPageHero
        eyebrow={t('dealerCopilot.eyebrow')}
        title={t('dealerCopilot.title')}
        description={t('dealerCopilot.description')}
        icon={<Bot className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <>
            <Button asChild size="lg" variant="secondary">
              <Link href="/dealer/feedbacks">
                <MessageSquare className="h-4 w-4" />
                {t('dealerCopilot.linkFeedbacks')}
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/dealer/action-items">
                <ListChecks className="h-4 w-4" />
                {t('dealerCopilot.linkActions')}
              </Link>
            </Button>
            {/* AI merkezi köprüsü: sürekli sohbet için */}
            <Button asChild size="lg" variant="outline">
              <Link href="/dealer/ai-chat">
                <Sparkles className="h-4 w-4" />
                AI Sohbet
              </Link>
            </Button>
          </>
        }
      />

      {!summary ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bot className="h-14 w-14 mx-auto text-muted-foreground opacity-40" />
            <p className="text-muted-foreground mt-4">{t('dealerCopilot.errorTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('dealerCopilot.errorHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* İstatistik kartları */}
          {stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: t('dealerCopilot.statFeedback7d'),
                  value: stats.totalFeedback,
                  icon: MessageSquare,
                  color: 'text-primary',
                  bg: 'bg-primary/10',
                },
                {
                  label: t('dealerCopilot.statNegative'),
                  value: stats.negativeCount,
                  icon: AlertTriangle,
                  color: 'text-amber-500',
                  bg: 'bg-amber-500/10',
                },
                {
                  label: t('dealerCopilot.statReplyRate'),
                  value: stats.replyRate,
                  suffix: '%',
                  decimals: 1,
                  icon: CheckCircle2,
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-500/10',
                },
                {
                  label: t('dealerCopilot.statAvgRating'),
                  value: stats.avgRating ?? 0,
                  suffix: ' / 5',
                  decimals: 1,
                  icon: Star,
                  color: 'text-amber-500',
                  bg: 'bg-amber-500/10',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <Card className="overflow-hidden border-0 shadow-lg">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                          <p className="text-2xl font-bold mt-1">
                            <AnimatedNumber
                              value={item.value}
                              decimals={item.decimals ?? 0}
                              suffix={item.suffix ?? ''}
                            />
                          </p>
                        </div>
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                          <item.icon className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {/* Hızlı aksiyonlar (Next Best Actions) */}
          {nextBest.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    {t('dealerCopilot.nextBestTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('dealerCopilot.nextBestSubtitle')}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {nextBest.map((action, i) => (
                      <motion.div
                        key={action.cardKey}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.05 * i }}
                      >
                        <Link href={action.href}>
                          <Button variant="outline" className="gap-2 border-primary/30 hover:bg-primary/10 h-auto py-3">
                            {action.label}
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Günlük trend grafiği */}
          {dailyTrend.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    {t('dealerCopilot.trendTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('dealerCopilot.trendSubtitle')}</p>
                </CardHeader>
                <CardContent>
                  <CopilotDailyTrendChart data={dailyTrend} />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {summary.campaignRoiHints && summary.campaignRoiHints.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
            >
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="h-5 w-5 text-blue-500" />
                    {t('dealerCopilot.campaignSignalTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('dealerCopilot.campaignSignalSubtitle')}</p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {summary.campaignRoiHints.map((h) => (
                    <div key={h.campaignId} className="rounded-lg border border-border/60 bg-card/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium line-clamp-1">{h.title}</span>
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs shrink-0">
                          <Link href={`/dealer/campaigns/${h.campaignId}/performance`}>{t('dealerCopilot.campaignDetail')}</Link>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('dealerCopilot.campaignMeta')
                          .replace('{sent}', String(h.sentCount))
                          .replace('{matched}', String(h.attributedFeedbackCount))}
                      </p>
                      <p className="text-xs mt-1 text-muted-foreground">{h.hint}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Kritik sorunlar */}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    {t('dealerCopilot.criticalTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t('dealerCopilot.criticalSubtitle').replace('{count}', String(summary.totalNegativeFeedback))}
                  </p>
                </CardHeader>
                <CardContent>
                  {summary.criticalIssues.length === 0 ? (
                    <div className="text-center py-10">
                      <Shield className="h-12 w-12 mx-auto text-emerald-500/50" />
                      <p className="text-muted-foreground mt-3 font-medium">{t('dealerCopilot.criticalEmptyTitle')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('dealerCopilot.criticalEmptySubtitle')}</p>
                    </div>
                  ) : (
                    <ul className="space-y-4">
                      {summary.criticalIssues.map((issue, i) => (
                        <motion.li
                          key={issue.feedbackId}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 * i }}
                          className="group rounded-xl border bg-card p-4 hover:bg-muted/30 transition-colors"
                        >
                          <p className="text-sm font-medium leading-snug">{issue.excerpt}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <Badge variant="outline" className="text-xs">
                              {t('dealerCopilot.ratingBadge').replace('{rating}', String(issue.rating))}
                            </Badge>
                            {issue.sentiment && (
                              <Badge variant="secondary" className="capitalize text-xs">
                                {issue.sentiment}
                              </Badge>
                            )}
                            {issue.urgency != null && issue.urgency >= 0.7 && (
                              <Badge className="bg-red-500/20 text-red-600 border-0 text-xs">
                                {t('dealerCopilot.urgencyHigh')}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(issue.createdAt, locale === 'en' ? 'en' : 'tr')}
                            </span>
                            <Link
                              href="/dealer/feedbacks"
                              className="ml-auto text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Link2 className="h-3 w-3" />
                              {t('dealerCopilot.goToFeedback')}
                            </Link>
                          </div>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Önerilen aksiyonlar */}
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    {t('dealerCopilot.recommendedTitle')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('dealerCopilot.recommendedSubtitle')}</p>
                </CardHeader>
                <CardContent>
                  {summary.topActions.length === 0 ? (
                    <div className="text-center py-10">
                      <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground mt-3">{t('dealerCopilot.recommendedEmpty')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('dealerCopilot.recommendedEmptyHint')}</p>
                      <Link href="/dealer/action-items" className="mt-4 inline-block">
                        <Button variant="outline" size="sm">{t('dealerCopilot.goToActions')}</Button>
                      </Link>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {summary.topActions.map((action, i) => (
                        <motion.li
                          key={`${action.feedbackId}-${i}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * i }}
                          className="flex items-start gap-3 p-3 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{action.action}</p>
                            {action.priority && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {action.priority}
                              </Badge>
                            )}
                          </div>
                          <Link href="/dealer/action-items">
                            <Button variant="ghost" size="sm" className="shrink-0 gap-1">
                              {t('dealerCopilot.addAction')}
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Alt bilgi / Olaylar & Churn */}
          {stats && (stats.openIncidents > 0 || stats.churnCount > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center gap-6">
                    {stats.openIncidents > 0 && (
                      <Link href="/dealer/incidents" className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {t('dealerCopilot.incidentsOpen').replace('{count}', String(stats.openIncidents))}
                          </p>
                          <p className="text-xs text-muted-foreground">{t('dealerCopilot.incidentsHint')}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    )}
                    {stats.churnCount > 0 && (
                      <Link href="/dealer/churn-risk" className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20">
                          <TrendingUp className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {t('dealerCopilot.churnRisk').replace('{count}', String(stats.churnCount))}
                          </p>
                          <p className="text-xs text-muted-foreground">{t('dealerCopilot.churnHint')}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
