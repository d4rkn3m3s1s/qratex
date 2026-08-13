'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import {
  TrendingDown,
  Loader2,
  AlertTriangle,
  User,
  Star,
  Shield,
  Target,
  Zap,
  ChevronRight,
  Users,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { ChurnInterventionSettings } from '@/components/dealer/churn-intervention-settings';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface ChurnData {
  churnRisk: {
    dealerId: string;
    period: string;
    avgChurnRisk: number | null;
    feedbackCountWithRisk: number;
    highRiskCount: number;
    riskDistribution?: { low: number; medium: number; high: number };
    highRiskFeedbacks: Array<{
      id: string;
      rating: number;
      text?: string | null;
      churnRisk: number | null;
      sentiment: string | null;
      urgency?: number | null;
      intent?: string | null;
      createdAt: string;
      userId?: string;
      userName?: string | null;
      userImage?: string | null;
    }>;
  };
}

export default function DealerChurnRiskPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [data, setData] = useState<ChurnData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/churn-risk')
      .then((res) => res.json())
      .then((json) => {
        if (json.churnRisk) setData({ churnRisk: json.churnRisk });
      })
      .catch(() => toast.error(t('dealerChurnRisk.toastLoadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
          <p className="text-sm text-muted-foreground">{t('dealerChurnRisk.loadingDescription')}</p>
        </Motion.div>
      </div>
    );
  }

  const cr = data?.churnRisk;
  const avgPct = cr?.avgChurnRisk != null ? Math.round(cr.avgChurnRisk * 100) : null;
  const dist = cr?.riskDistribution ?? { low: 0, medium: 0, high: 0 };
  const totalWithDist = dist.low + dist.medium + dist.high;

  const getRiskColor = (pct: number) => {
    if (pct < 30) return 'text-emerald-600 bg-emerald-500/15 border-emerald-500/30';
    if (pct < 50) return 'text-amber-600 bg-amber-500/15 border-amber-500/30';
    return 'text-red-600 bg-red-500/15 border-red-500/30';
  };

  return (
    <div className="space-y-8">
      <DashboardPageHero
        eyebrow={t('dealerChurnRisk.eyebrow')}
        title={t('dealerChurnRisk.title')}
        description={t('dealerChurnRisk.description')}
        icon={<TrendingDown className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <Button
            asChild
            variant="outline"
            className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <Link href="/dealer/campaigns">
              <Target className="h-4 w-4" />
              {t('dealerChurnRisk.linkCampaigns')}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <ChurnInterventionSettings />

      {/* Metrik kartları */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-amber-500/10 bg-card/80 backdrop-blur-sm overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                {t('dealerChurnRisk.kpiAvgRisk')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {avgPct != null ? (
                <>
                  <div className="text-3xl font-bold">{avgPct}%</div>
                  <Progress value={avgPct} className="mt-3 h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {avgPct < 30 ? t('dealerChurnRisk.riskHealthy') : avgPct < 50 ? t('dealerChurnRisk.riskWatch') : t('dealerChurnRisk.riskAction')}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm py-2">{t('dealerChurnRisk.aiPending')}</p>
              )}
            </CardContent>
          </Card>
        </Motion.div>
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="border-muted/50">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t('dealerChurnRisk.kpiWithRisk')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{cr?.feedbackCountWithRisk ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('dealerChurnRisk.feedbackWord')}</p>
            </CardContent>
          </Card>
        </Motion.div>
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-red-500/10 bg-red-500/5">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                {t('dealerChurnRisk.kpiHighRisk')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{cr?.highRiskCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('dealerChurnRisk.customersWord')}</p>
            </CardContent>
          </Card>
        </Motion.div>
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="border-muted/50">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('dealerChurnRisk.kpiDistribution')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 h-2 rounded-full overflow-hidden">
                {totalWithDist > 0 ? (
                  <>
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${(dist.low / totalWithDist) * 100}%` }}
                    />
                    <div
                      className="bg-amber-500"
                      style={{ width: `${(dist.medium / totalWithDist) * 100}%` }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${(dist.high / totalWithDist) * 100}%` }}
                    />
                  </>
                ) : (
                  <div className="w-full bg-muted" />
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {t('dealerChurnRisk.distLow')} {dist.low}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {t('dealerChurnRisk.distMedium')} {dist.medium}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {t('dealerChurnRisk.distHigh')} {dist.high}
                </span>
              </div>
            </CardContent>
          </Card>
        </Motion.div>
      </div>

      {/* Önerilen aksiyon */}
      {(cr?.highRiskCount ?? 0) > 0 && (
        <Motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20">
                  <Zap className="h-6 w-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{t('dealerChurnRisk.recommendedTitle')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('dealerChurnRisk.recommendedBody').replace('{count}', String(cr?.highRiskCount ?? 0))}
                  </p>
                </div>
                <Link href="/dealer/campaigns">
                  <Button className="gap-2">{t('dealerChurnRisk.createCampaign')}</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </Motion.div>
      )}

      {/* Yüksek riskli geri bildirimler */}
      <Motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('dealerChurnRisk.listTitle')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t('dealerChurnRisk.listSubtitle')}</p>
          </CardHeader>
          <CardContent>
            {!cr?.highRiskFeedbacks?.length ? (
              <div className="text-center py-16">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                  <Shield className="h-8 w-8 text-emerald-600" />
                </div>
                <p className="mt-4 font-medium text-muted-foreground">{t('dealerChurnRisk.emptyHighRiskTitle')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('dealerChurnRisk.emptyHighRiskHint')}</p>
                <Link href="/dealer/feedbacks" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">{t('dealerChurnRisk.goToFeedbacks')}</Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-4">
                {cr.highRiskFeedbacks.map((fb, i) => {
                  const pct = fb.churnRisk != null ? Math.round(fb.churnRisk * 100) : 0;
                  return (
                    <Motion.li
                      key={fb.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="group rounded-xl border bg-card p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={fb.userImage || ''} />
                            <AvatarFallback className="bg-amber-500/20 text-amber-700">
                              {getInitials(fb.userName || 'A')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{fb.userName || t('dealerChurnRisk.anonymous')}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              {formatRelativeTime(fb.createdAt, locale === 'en' ? 'en' : 'tr')}
                            </p>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="flex items-center gap-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              <span className="font-medium">{fb.rating}</span>/5
                            </span>
                            <Badge variant="outline" className={getRiskColor(pct)}>
                              {t('dealerChurnRisk.riskBadge').replace('{pct}', String(pct))}
                            </Badge>
                            {fb.sentiment && (
                              <Badge variant="secondary" className="capitalize">
                                {fb.sentiment}
                              </Badge>
                            )}
                            {fb.urgency != null && fb.urgency >= 0.7 && (
                              <Badge variant="outline" className="text-red-600 border-red-500/50">
                                {t('dealerChurnRisk.urgencyHigh')}
                              </Badge>
                            )}
                          </div>
                          {fb.text && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              "{fb.text}"
                            </p>
                          )}
                        </div>
                        <Link href="/dealer/feedbacks" className="shrink-0">
                          <Button variant="ghost" size="sm" className="gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {t('dealerChurnRisk.detail')}
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </Motion.li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </Motion.div>
    </div>
  );
}
