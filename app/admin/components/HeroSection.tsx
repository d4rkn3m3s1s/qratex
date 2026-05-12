'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Users, MessageSquare, QrCode, Shield, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn, formatCompactNumber, getInitials } from '@/lib/utils';
import type { DashboardData, AnalyticsData } from '../types';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Spotlight } from '@/components/ui/spotlight';
import { FloatingOrbs } from '@/components/customer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import type { AdminProgressTrend } from '@/components/admin/admin-progress-stat-card';

interface HeroSectionProps {
  data: DashboardData;
  analyticsData: AnalyticsData | null;
}

function growthTrend(n: number | null | undefined): AdminProgressTrend | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  if (n > 0) return { label: `+${n}%`, direction: 'up' };
  if (n < 0) return { label: `${n}%`, direction: 'down' };
  return { label: '0%', direction: 'neutral' };
}

function greetingLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

function TrendPill({ trend }: { trend?: AdminProgressTrend }) {
  if (!trend) return null;
  const Icon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
  const cls =
    trend.direction === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend.direction === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums', cls)}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {trend.label}
    </span>
  );
}

export function HeroSection({ data, analyticsData }: HeroSectionProps) {
  const { data: session } = useSession();
  const ug = analyticsData?.userGrowth;
  const fg = analyticsData?.feedbackGrowth;
  const firstName =
    typeof session?.user?.name === 'string' ? session.user.name.split(/\s+/)[0] : 'Yönetici';

  return (
    <DashboardPageHeroChrome
      className="mx-2 sm:mx-4 mt-3 sm:mt-4 md:mx-6 md:mt-6"
      padded={false}
      tone="auto"
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, type: 'spring', bounce: 0.32 }}
        className="relative overflow-hidden rounded-[inherit] px-6 py-6 md:px-8 md:py-8"
      >
        <Spotlight className="top-0 left-0" fill="hsl(var(--primary))" />
        <FloatingOrbs />
        <div className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen">
          <div className="absolute -left-24 top-[-80px] h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute -right-24 bottom-[-80px] h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-10 items-stretch justify-between">
          <div className="flex flex-1 flex-col gap-5 text-center md:flex-row md:items-center md:gap-7 md:text-left">
            <div className="group relative mx-auto shrink-0 md:mx-0">
              <Avatar className="h-24 w-24 border-4 border-background/60 shadow-2xl ring-2 ring-primary/40">
                {session?.user?.image ? (
                  <AvatarImage src={session.user.image} alt={firstName} />
                ) : (
                  <AvatarFallback className="text-3xl font-bold bg-primary text-primary-foreground">
                    {getInitials(session?.user?.name ?? 'Admin')}
                  </AvatarFallback>
                )}
              </Avatar>
              <div
                className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-primary to-primary/85 shadow-lg shadow-primary/30"
                title="Yönetici"
              >
                <Shield className="h-5 w-5 text-primary-foreground" aria-hidden />
              </div>
              <Link
                href="/admin/settings"
                className="pointer-events-none absolute -bottom-10 left-1/2 h-7 -translate-x-1/2 translate-y-1 rounded-full border border-border/70 bg-background/95 px-3 text-[11px] font-medium text-foreground opacity-0 shadow-lg transition-all hover:bg-background group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"
              >
                Ayarlar
              </Link>
            </div>

            <div className="min-w-0 flex-1 space-y-2 md:space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/15 px-3 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur-md">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Yönetim paneli · Canlı veri
                </span>
              </div>

              <h1 className="text-balance text-2xl font-extrabold leading-tight tracking-tight md:text-4xl">
                <span className="font-normal opacity-80">{greetingLabel()},</span>{' '}
                <span className="text-foreground">{firstName}</span>
              </h1>

              <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty md:mx-0 md:text-[15px] md:leading-7">
                Platformunuzun komut merkezi. Analitik, geri bildirimler, AI özetleri ve ayarlar tek yerden;
                veriler otomatik yenilenir.
                {analyticsData != null &&
                  (analyticsData.userGrowth != null || analyticsData.feedbackGrowth != null) && (
                    <span className="mt-2 block text-xs text-muted-foreground sm:text-sm">
                      Son 30 gün:{' '}
                      <span
                        className={
                          ((analyticsData.userGrowth ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600') +
                          ' dark:text-emerald-300 font-semibold dark:font-semibold'
                        }
                      >
                        {(analyticsData.userGrowth ?? 0) >= 0 ? '+' : ''}
                        {analyticsData.userGrowth ?? 0}%
                      </span>{' '}
                      kullanıcı ·{' '}
                      <span
                        className={
                          ((analyticsData.feedbackGrowth ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600') +
                          ' dark:text-emerald-300 font-semibold'
                        }
                      >
                        {(analyticsData.feedbackGrowth ?? 0) >= 0 ? '+' : ''}
                        {analyticsData.feedbackGrowth ?? 0}%
                      </span>{' '}
                      geri bildirim
                    </span>
                  )}
              </p>

              <div className="flex flex-wrap justify-center gap-2 pt-1 text-xs md:justify-start md:text-[13px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-background/30 px-2.5 py-1 text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  {formatCompactNumber(data.totals.users)} kullanıcı
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-background/30 px-2.5 py-1 text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-sky-400" />
                  {formatCompactNumber(data.totals.feedbacks)} geri bildirim
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-background/30 px-2.5 py-1 text-muted-foreground">
                  <QrCode className="h-3.5 w-3.5 text-amber-400" />
                  {formatCompactNumber(data.totals.activeQRCodes)} aktif QR
                </span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto md:max-w-[min(100%,340px)] md:shrink-0">
            <Card className="border-border/45 bg-card/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]">
              <div className="space-y-3 p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Anlık özet
                </p>
                <ul className="space-y-2">
                  {(
                    [
                      {
                        label: 'Kullanıcı',
                        value: formatCompactNumber(data.totals.users),
                        icon: Users,
                        trend: growthTrend(ug),
                      },
                      {
                        label: 'Geri bildirim',
                        value: formatCompactNumber(data.totals.feedbacks),
                        icon: MessageSquare,
                        trend: growthTrend(fg),
                      },
                      {
                        label: 'Aktif QR',
                        value: formatCompactNumber(data.totals.activeQRCodes),
                        icon: QrCode,
                        trend: undefined,
                      },
                    ] as const
                  ).map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/35 px-3 py-2.5 dark:border-white/[0.07] dark:bg-black/20"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
                          <row.icon className="size-4" aria-hidden />
                        </span>
                        <span className="truncate text-sm text-muted-foreground">{row.label}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold tabular-nums leading-none tracking-tight text-foreground">
                          {row.value}
                        </p>
                        <div className="mt-0.5 flex justify-end">
                          <TrendPill trend={row.trend} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        </div>
      </motion.div>
    </DashboardPageHeroChrome>
  );
}
