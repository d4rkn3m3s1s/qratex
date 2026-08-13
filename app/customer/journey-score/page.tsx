'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Compass, Star, MessageSquare, TrendingUp, CheckCircle2, Lock, Gift, ShieldAlert, Award, Coffee, Clock, MapPinned } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format } from 'date-fns';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { enUS, tr } from 'date-fns/locale';
import { useCustomerLocale, useCustomerT } from '@/lib/use-customer-locale';

interface TimelineEvent {
  id: string;
  type: 'register' | 'feedback' | 'badge' | 'reward' | 'consumption' | 'vip';
  title: string;
  description: string;
  icon: string;
  date: string;
  color: string;
  metadata?: any;
}

interface TimelineData {
  success: boolean;
  timeline: TimelineEvent[];
  stats: { totalFeedbacks: number; totalBadges: number; level: number; points: number };
}

const colorMaps: Record<string, string> = {
  violet: 'border-primary bg-primary/15 text-primary',
  primary: 'border-primary bg-primary/15 text-primary',
  emerald: 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400',
  blue: 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400',
  pink: 'border-primary bg-primary/15 text-primary',
};

const iconMaps: Record<string, any> = {
  feedback: MessageSquare,
  register: Compass,
  badge: Award,
  reward: Gift,
  consumption: Coffee,
  vip: Star,
};

/** Yerel varlık; klasör adı unicode içerir */
const MASCOT_SRC =
  '/images/zamanikimizisilerizimizide%C4%9Fil/fantastik%201.svg';

function journeyStageIndex(score: number) {
  const normalized = Math.max(0, Math.min(100, score));
  if (normalized < 30) return 0;
  if (normalized < 55) return 1;
  if (normalized < 80) return 2;
  return 3;
}
export default function CustomerJourneyScorePage() {
  const locale = useCustomerLocale();
  const tc = useCustomerT();
  const dateLocale = locale === 'en' ? enUS : tr;
  const journeyStageLabels = [
    tc('journeyScore.stage0'),
    tc('journeyScore.stage1'),
    tc('journeyScore.stage2'),
    tc('journeyScore.stage3'),
  ] as const;

  const { data: timelineData, isLoading: timelineLoading } = useQuery<TimelineData>({
    queryKey: ['customer', 'journey-timeline'],
    queryFn: async () => {
      const res = await fetch('/api/customer/journey-timeline');
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: scoreData, isLoading: scoreLoading } = useQuery<{ journeyScore: number; metrics: { totalFeedbackCount: number; avgRating: number; positiveRate: number; recentAvgRating: number } }>({
    queryKey: ['customer', 'journey-score'],
    queryFn: async () => {
      const res = await fetch('/api/customer/journey-score');
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      return j;
    },
    staleTime: 60_000,
  });

  const loading = timelineLoading || scoreLoading;

  if (loading) {
    return (
      <InlineLoadingStatus className="min-h-[260px]" label={tc('journeyScore.loading')} />
    );
  }

  const events = timelineData?.timeline ?? [];
  const stats = timelineData?.stats;
  const score = scoreData?.journeyScore ?? 0;
  const m = scoreData?.metrics ?? { totalFeedbackCount: 0, avgRating: 0, positiveRate: 0, recentAvgRating: 0 };
  const stageIndex = journeyStageIndex(score);
  const nextStageLabel = journeyStageLabels[Math.min(stageIndex + 1, journeyStageLabels.length - 1)];
  const feedbackTarget = Math.max(0, 5 - m.totalFeedbackCount);
  const positiveRatePercent = Math.round(m.positiveRate * 100);
  const currentStageHint =
    stageIndex === 0
      ? tc('journeyScore.stageHint0')
      : stageIndex === 1
        ? tc('journeyScore.stageHint1')
        : stageIndex === 2
          ? tc('journeyScore.stageHint2')
          : tc('journeyScore.stageHint3');
  const nextStepHint =
    stageIndex === 3
      ? tc('journeyScore.nextHintDone')
      : feedbackTarget > 0
        ? tc('journeyScore.nextHintNeedFeedback').replace('{count}', String(feedbackTarget))
        : tc('journeyScore.nextHintKeep').replace('{stage}', nextStageLabel);

  return (
    <div className="space-y-6 pb-12">
      <DashboardPageHero
        eyebrow={tc('journeyScore.eyebrow')}
        title={tc('journeyScore.title')}
        description={tc('journeyScore.description')}
        icon={<Compass className="h-7 w-7" aria-hidden />}
        tone="auto"
      />

      <Card className="rounded-xl border-dashed border-primary/30 bg-muted/20">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {tc('journeyScore.feedbackJourneyDesc')}
          </p>
          <Button asChild size="sm" variant="secondary" className="shrink-0 w-full min-h-10 touch-manipulation sm:w-auto">
            <Link href="/customer/feedbacks">{tc('journeyScore.feedbackJourneyBtn')}</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Score + Detailed Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Main Score Card spans 2 cols on md+ */}
        <Card className="rounded-2xl border-2 border-primary/25 overflow-hidden bg-gradient-to-br from-background to-muted/20 md:col-span-2 lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <Motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                className="relative w-28 h-28 mx-auto sm:mx-0 shrink-0"
              >
                <svg className="-rotate-90 drop-shadow-lg" width={112} height={112} viewBox="0 0 112 112">
                  <circle cx={56} cy={56} r={48} fill="none" stroke="currentColor" strokeWidth={8} className="text-muted/20" />
                  <Motion.circle
                    cx={56} cy={56} r={48}
                    fill="none" strokeWidth={8} strokeLinecap="round"
                    className="stroke-primary"
                    initial={{ strokeDashoffset: 2 * Math.PI * 48 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 48 * (1 - score / 100) }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    style={{ strokeDasharray: 2 * Math.PI * 48 }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-primary">{score}</span>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{tc('journeyScore.score')}</span>
                </div>
              </Motion.div>
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <h2 className="text-xl font-bold tracking-tight">{tc('journeyScore.scoreTitle')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tc('journeyScore.scoreDesc')}</p>

                <div className="flex flex-wrap gap-2 mt-4 justify-center sm:justify-start">
                  <Badge variant="secondary" className="bg-primary/10 px-3 py-1 text-primary hover:bg-primary/20 transition-colors">
                    <Star className="w-3 h-3 mr-1.5" /> {tc('journeyScore.levelShort')} {stats?.level}
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors">
                    <TrendingUp className="w-3 h-3 mr-1.5" /> {stats?.points} {tc('journeyScore.points')}
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                    <Award className="w-3 h-3 mr-1.5" /> {stats?.totalBadges} {tc('journeyScore.badges')}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Small metric cards */}
        <Card className="rounded-2xl bg-card border shadow-sm flex flex-col justify-center p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">{tc('journeyScore.totalFeedback')}</p>
              <h3 className="text-2xl font-bold">{m.totalFeedbackCount}</h3>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl bg-card border shadow-sm flex flex-col justify-center p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">{tc('journeyScore.positiveRate')}</p>
              <h3 className="text-2xl font-bold">%{(m.positiveRate * 100).toFixed(0)}</h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Dynamic Timehop Timeline */}
      <h2 className="text-2xl font-bold mt-10 mb-6 px-2">{tc('journeyScore.timehopTitle')}</h2>
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0 mt-0.5">
              <MapPinned className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{tc('journeyScore.whereAreYou')}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-relaxed">
                {tc('journeyScore.currentStagePrefix')} <span className="font-medium text-foreground">{journeyStageLabels[stageIndex]}</span> {tc('journeyScore.currentStageSuffix')} {currentStageHint}
              </p>
            </div>
            <div className="relative h-10 w-10 rounded-full border-2 border-primary bg-background shadow-sm overflow-hidden shrink-0">
              <Image
                src={MASCOT_SRC}
                alt={tc('journeyScore.mascotAlt')}
                width={40}
                height={40}
                className="object-cover object-center scale-110"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{tc('journeyScore.score')} {score}/100</span>
            <Badge variant="secondary" className="bg-primary/15 text-primary">{journeyStageLabels[stageIndex]}</Badge>
          </div>
          <Progress value={score} className="h-2.5" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {journeyStageLabels.map((label, i) => {
              const active = i === stageIndex;
              const done = i < stageIndex;
              return (
                <div
                  key={label}
                  className={`rounded-md border px-2 py-1.5 text-center text-[11px] sm:text-xs font-medium ${
                    active
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : done
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-border/60 bg-background/60 text-muted-foreground'
                  }`}
                >
                  {done ? `✓ ${label}` : label}
                </div>
              );
            })}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">{nextStepHint}</p>
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Compass className="h-12 w-12 mb-4 opacity-20" />
            <p>{tc('journeyScore.emptyTitle')}</p>
            <p className="text-sm">{tc('journeyScore.emptyDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative pl-6 sm:pl-0">
          {/* Vertical line centered on md up, left aligned on mobile */}
          <div className="absolute bottom-4 left-[26px] top-4 w-1 rounded-full bg-gradient-to-b from-primary/45 via-primary/25 to-border transform sm:left-1/2 sm:-translate-x-1/2" />

          <div className="space-y-4 sm:space-y-8">
            <AnimatePresence>
              {events.map((ev, i) => {
                const isEven = i % 2 === 0;
                const IconComponent = iconMaps[ev.type] || Compass;
                const colorClass = colorMaps[ev.color] || colorMaps.primary;
                const alignLeft = isEven;

                return (
                  <Motion.div
                    key={ev.id}
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: "-10%" }}
                    transition={{ type: "spring", stiffness: 100, damping: 20, delay: Math.min(i, 10) * 0.05 }}
                    className={`relative flex flex-col sm:flex-row items-start sm:items-center w-full group ${alignLeft ? 'sm:justify-end' : 'sm:justify-start'
                      }`}
                  >
                    {/* Node Circle */}
                    <div className="absolute left-[-16px] sm:left-1/2 sm:transform sm:-translate-x-1/2 z-10">
                      <Motion.div
                        whileHover={{ scale: 1.2, rotate: 10 }}
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-md border-4 border-background ${colorClass} bg-background`}
                      >
                        {typeof ev.icon === 'string' && ev.icon.length <= 4 && ev.icon.match(/\p{Emoji}/u) ? (
                          <span>{ev.icon}</span>
                        ) : (
                          <IconComponent className="w-5 h-5 currentColor" />
                        )}
                      </Motion.div>
                    </div>

                    {/* Content Card */}
                    <div className={`w-full sm:w-[calc(50%-40px)] pl-6 sm:pl-0 ${alignLeft ? 'sm:pr-10 sm:text-right' : 'sm:pl-10 sm:text-left'} pt-1 sm:pt-0`}>
                      <Card className={`overflow-hidden border group-hover:border-primary/30 transition-all duration-300 ${alignLeft ? 'hover:-translate-x-1' : 'hover:translate-x-1'
                        } ${alignLeft ? 'sm:rounded-tr-none' : 'sm:rounded-tl-none'} shadow-sm hover:shadow-md`}>
                        <CardContent className="p-4 sm:p-5">
                          <div className={`flex items-center gap-2 mb-2 ${alignLeft ? 'sm:flex-row-reverse sm:justify-start' : 'justify-start'}`}>
                            {ev.type === 'feedback' && ev.metadata?.rating && (
                              <div className="flex bg-amber-500/10 px-2 py-0.5 rounded text-amber-600 text-xs font-bold items-center gap-1">
                                <Star className="w-3 h-3 fill-amber-500" />
                                {ev.metadata.rating}/5
                              </div>
                            )}
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {ev.date ? formatDistanceToNow(new Date(ev.date), { addSuffix: true, locale: dateLocale }) : ''}
                            </span>
                          </div>

                          <h3 className="font-bold text-base sm:text-lg text-foreground mb-1 leading-tight">{ev.title}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{ev.description}</p>

                          <div className={`mt-3 pt-3 border-t text-xs text-muted-foreground/60 font-medium tracking-wide ${alignLeft ? 'text-left sm:text-right' : 'text-left'}`}>
                            {ev.date ? format(new Date(ev.date), 'd MMM yyyy HH:mm', { locale: dateLocale }) : ''}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                  </Motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
