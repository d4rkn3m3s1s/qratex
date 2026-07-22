'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import {
  Trophy,
  Target,
  Gift,
  Star,
  QrCode,
  MessageSquare,
  Zap,
  Medal,
  Crown,
  Flame,
  Megaphone,
  TrendingUp,
  Award,
  Calendar,
  Coffee,
  Heart,
  Sparkles,
  Clock,
  BarChart3,
  ListChecks,
  ArrowRight,
  Gauge,
  BookOpen,
} from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { triggerConfetti, triggerSuccessBurst } from '@/lib/effects/confetti';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Spotlight } from '@/components/ui/spotlight';
import { UserAvatarFrame, DiamondBadge, RubyBadge } from '@/components/ui/avatar-frame';
import {
  cn,
  getInitials,
  getLeague,
  getLeagueMeta,
  getLeagueProgress,
  getNextLeagueMeta,
  formatNumber,
  getRarityColor,
  getRarityBgColor
} from '@/lib/utils';
import { DEFAULT_LEAGUE_RULES } from '@/lib/league-rules-core';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { SpinWheel } from '@/components/gamification/spin-wheel';

// Components
import { AnimatedNumber, GlowCard, FloatingOrbs } from '@/components/customer';
import { CustomerDashboardSkeleton } from '@/components/customer/dashboard/customer-dashboard-skeleton';
import { useCustomerT } from '@/lib/use-customer-locale';

function StatCard({ title, value, icon: Icon, colorClass, numberFormat }: any) {
  return (
    <GlowCard pulse className="p-3 sm:p-4 flex flex-col items-center justify-center gap-1 border-primary/10 bg-card min-h-[92px] sm:min-h-0 touch-manipulation">
      <div className={`p-2 rounded-full bg-primary/5 ${colorClass} mb-1`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
        {numberFormat ? numberFormat(value) : value}
      </p>
      <p className="text-[10px] sm:text-xs text-muted-foreground font-semibold uppercase tracking-wider text-center leading-tight px-1">{title}</p>
    </GlowCard>
  );
}

import type {
  Quest,
  BadgeData,
  FeedbackData,
  ActivityItem,
  LeaderboardEntry,
  Reward,
  FavoriteDealer,
  DiscoverySnapshot
} from '@/app/customer/types';
import { getGreeting } from '@/app/customer/types';

export default function CustomerDashboard() {
  const { data: session } = useSession();
  const user = session?.user;
  const tc = useCustomerT();

  // --- States ---
  const [stats, setStats] = useState({
    feedbackCount: 0,
    badgeCount: 0,
    points: 0,
    level: 1,
    streak: 0,
    cardCount: 0,
    pendingReviewCount: 0,
  });
  const [userLevelProgress, setUserLevelProgress] = useState<number | null>(null);
  const [activeQuests, setActiveQuests] = useState<Quest[]>([]);
  const [userBadges, setUserBadges] = useState<BadgeData[]>([]);
  const [recentFeedbacks, setRecentFeedbacks] = useState<FeedbackData[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [spinStatus, setSpinStatus] = useState<{ canSpin: boolean; lastSpin: string | null }>({
    canSpin: true,
    lastSpin: null,
  });
  const [discovery, setDiscovery] = useState<DiscoverySnapshot>({
    trendingVenues: [],
    weeklyBest: [],
    sponsored: [],
  });
  const [favorites, setFavorites] = useState<FavoriteDealer[]>([]);
  const [favoriteToggling, setFavoriteToggling] = useState<string | null>(null);
  const [isLeagueSheetOpen, setIsLeagueSheetOpen] = useState(false);
  const [pinnedItems, setPinnedItems] = useState<any[]>([]);

  const queryClient = useQueryClient();

  // --- Unified Data Fetching ---
  type ApiResult = { res: Response; data: Record<string, unknown> };

  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['customer', 'dashboard', session?.user?.id],
    queryFn: async (): Promise<{
      statsData: Record<string, unknown>;
      leaderData: Record<string, unknown>;
      rewardsData: Record<string, unknown>;
      spinData: Record<string, unknown>;
      discoveryData: Record<string, unknown>;
      discoveryRes: Response;
      favoritesData: Record<string, unknown>;
      favoritesRes: Response;
      showcaseData: Record<string, unknown>;
      showcaseRes: Response;
    }> => {
      const opts = { credentials: 'same-origin' as RequestCredentials };

      const safeFetch = async (url: string): Promise<ApiResult> => {
        try {
          const res = await fetch(url, opts);
          const data = await res.json().catch(() => ({}));
          return { res, data: typeof data === 'object' && data !== null ? data as Record<string, unknown> : {} };
        } catch (e) {
          console.error(`Fetch error for ${url}:`, e);
          return { res: new Response(null, { status: 500 }), data: {} };
        }
      };

      const [
        statsResult,
        leaderResult,
        rewardsResult,
        spinResult,
        discoveryResult,
        favoritesResult,
        showcaseResult
      ] = await Promise.all([
        safeFetch('/api/customer/stats'),
        safeFetch('/api/leaderboard?limit=5'),
        safeFetch('/api/gamification/rewards'),
        safeFetch('/api/gamification/spin'),
        safeFetch('/api/customer/discovery'),
        safeFetch('/api/customer/favorites'),
        safeFetch('/api/customer/showcase'),
      ]);

      return {
        statsData: statsResult.data,
        leaderData: leaderResult.data,
        rewardsData: rewardsResult.data,
        spinData: spinResult.data,
        discoveryData: discoveryResult.data,
        discoveryRes: discoveryResult.res,
        favoritesData: favoritesResult.data,
        favoritesRes: favoritesResult.res,
        showcaseData: showcaseResult.data,
        showcaseRes: showcaseResult.res,
      };
    },
    enabled: !!session?.user,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 2,
  });

  const { data: weeklyCardData } = useQuery({
    queryKey: ['customer', 'weekly-card'],
    queryFn: async () => {
      const r = await fetch('/api/customer/weekly-card', { credentials: 'same-origin' });
      const j = await r.json();
      return j.success ? j : null;
    },
    enabled: !!session?.user,
    staleTime: 120_000,
  });

  // --- Process Fetched Data ---
  useEffect(() => {
    if (!dashboardData) return;

    const { statsData, leaderData, rewardsData, spinData, discoveryData, discoveryRes, favoritesData, favoritesRes } = dashboardData;

    // 1. Stats
    const statsResult = statsData as {
      success?: boolean;
      data?: {
        stats?: Record<string, unknown>;
        user?: Record<string, unknown>;
        activeQuests?: Quest[];
        badges?: BadgeData[];
        recentFeedbacks?: FeedbackData[];
        recentActivity?: ActivityItem[];
      };
    };
    if (statsResult?.success && statsResult.data) {
      const d = statsResult.data;
      const s = d.stats ?? {};

      setStats({
        feedbackCount: Number(s.feedbackCount) || 0,
        badgeCount: Number(s.badgeCount) || 0,
        points: Number(s.points) || 0,
        level: Number(s.level) || 1,
        streak: Number(s.streak) || 0,
        cardCount: Number(s.cardCount) || 0,
        pendingReviewCount: Number(s.pendingReviewCount) || 0,
      });

      setUserLevelProgress(d.user?.levelProgress != null ? Number(d.user.levelProgress) : null);
      setActiveQuests(d.activeQuests ?? []);
      setUserBadges(d.badges ?? []);
      setRecentFeedbacks(d.recentFeedbacks ?? []);
      setRecentActivity(d.recentActivity ?? []);
    }

    // 2. Leaderboard
    const leaderResult = leaderData as {
      success?: boolean;
      data?: { leaderboard?: (LeaderboardEntry & { id?: string; isCurrentUser?: boolean })[]; userRank?: number };
    };
    if (leaderResult?.success && Array.isArray(leaderResult.data?.leaderboard)) {
      const raw = leaderResult.data.leaderboard;
      const lb: LeaderboardEntry[] = raw.slice(0, 5).map((u, i) => ({
        rank: i + 1,
        name: u.name,
        points: u.points,
        level: u.level,
        avatar: u.image,
        isCurrentUser: Boolean(u.isCurrentUser),
      }));
      // Kullanıcı ilk 5'te değilse, kendi sırasını en alta ekle (aksi halde tekrar etme).
      const userInTop = lb.some((e) => e.isCurrentUser);
      if (!userInTop && leaderResult.data?.userRank) {
        lb.push({
          rank: leaderResult.data.userRank,
          name: 'Siz',
          points: user?.points ?? 0,
          level: user?.level ?? 1,
          isCurrentUser: true,
        });
      }
      setLeaderboard(lb);
    }

    // 3. Rewards
    const revardsResult = rewardsData as { success?: boolean; data?: { id: string; name: string; icon: string; cost: number }[] };
    if (revardsResult?.success && Array.isArray(revardsResult.data)) {
      setRewards(
        revardsResult.data.slice(0, 3).map((r: { id: string; name: string; icon: string; cost: number }) => ({
          id: r.id,
          name: r.name,
          icon: r.icon || '/images/badges/sürpriz kutusu.svg',
          cost: r.cost,
        }))
      );
    }

    // 4. Spin Status
    const spinResult = spinData as { error?: unknown; canSpin?: boolean; lastSpin?: string | null };
    if (!spinResult?.error) {
      setSpinStatus({
        canSpin: spinResult.canSpin ?? true,
        lastSpin: spinResult.lastSpin ?? null,
      });
    }

    // 5. Discovery
    const discResult = discoveryData as {
      success?: boolean;
      data?: {
        trendingVenues?: DiscoverySnapshot['trendingVenues'];
        weeklyBest?: DiscoverySnapshot['weeklyBest'];
        sponsored?: DiscoverySnapshot['sponsored'];
        favoriteDealerIds?: string[];
      };
    };
    if (discoveryRes?.ok && discResult?.success && discResult.data) {
      setDiscovery({
        trendingVenues: discResult.data.trendingVenues ?? [],
        weeklyBest: discResult.data.weeklyBest ?? [],
        sponsored: discResult.data.sponsored ?? [],
        favoriteDealerIds: discResult.data.favoriteDealerIds ?? [],
      });
    }

    // 6. Favorites
    const favResult = favoritesData as { success?: boolean; data?: { dealerId: string; businessName: string | null; addedAt: string }[] };
    if (favoritesRes?.ok && favResult?.success && Array.isArray(favResult.data)) {
      setFavorites(
        favResult.data.map((f: { dealerId: string; businessName: string | null; addedAt: string }) => ({
          dealerId: f.dealerId,
          businessName: f.businessName,
          addedAt: f.addedAt,
        }))
      );
    }

    // 7. Showcase Pinned Items
    const shResult = (dashboardData as any)?.showcaseData;
    if (shResult?.success) {
      const pins: any[] = [];
      if (Array.isArray(shResult.cosmetics)) {
        shResult.cosmetics.forEach((c: any) => {
          if (c.isPinned) {
            pins.push({
              id: c.cosmeticId,
              type: 'cosmetic',
              name: c.cosmetic.name,
              imageUrl: c.cosmetic.imageUrl,
            });
          }
        });
      }
      if (Array.isArray(shResult.badges)) {
        shResult.badges.forEach((b: any) => {
          if (b.isPinned) {
            pins.push({
              id: b.badgeId,
              type: 'badge',
              name: b.badge.name,
              imageUrl: b.badge.imageUrl,
            });
          }
        });
      }
      setPinnedItems(pins);
    }
  }, [dashboardData, user?.points, user?.level]);

  // --- Level Up Detection ---
  useEffect(() => {
    if (stats.level > 1 && stats.level > (user?.level || 1)) {
      triggerConfetti();
      toast.success(`${tc('customerDashboard.levelUpTitle')} ${stats.level}! 🎉`);
    }
  }, [stats.level, user?.level]);

  // --- Handlers ---
  const toggleFavorite = async (dealerId: string) => {
    if (favoriteToggling) return;
    const isFav = (discovery.favoriteDealerIds || []).includes(dealerId);

    setFavoriteToggling(dealerId);
    try {
      const method = isFav ? 'DELETE' : 'POST';
      const url = isFav ? `/api/customer/favorites?dealerId=${encodeURIComponent(dealerId)}` : '/api/customer/favorites';
      const options = {
        method,
        headers: isFav ? undefined : { 'Content-Type': 'application/json' },
        body: isFav ? undefined : JSON.stringify({ dealerId }),
      };

      const res = await fetch(url, options);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'İşlem başarısız');
        return;
      }

      setDiscovery((prev) => ({
        ...prev,
        favoriteDealerIds: isFav
          ? (prev.favoriteDealerIds || []).filter((id) => id !== dealerId)
          : [...(prev.favoriteDealerIds || []), dealerId],
      }));

      setFavorites((prev) => {
        if (isFav) return prev.filter((f) => f.dealerId !== dealerId);
        const venue = discovery.trendingVenues.find((v) => v.dealerId === dealerId);
        return [
          ...prev,
          { dealerId, businessName: venue?.businessName ?? null, addedAt: new Date().toISOString() },
        ];
      });

      queryClient.invalidateQueries({ queryKey: ['customer', 'dashboard'] });
    } catch (error) {
      toast.error('Bağlantı hatası');
    } finally {
      setFavoriteToggling(null);
    }
  };

  // --- Derived Data ---
  const loading = !!session?.user && dashboardData === undefined;
  const userPoints = stats.points ?? user?.points ?? 0;
  const currentLevel = stats.level || user?.level || 1;
  const league = getLeague(userPoints);
  const leagueMeta = getLeagueMeta(userPoints);
  const leagueProgress = getLeagueProgress(userPoints);
  const nextLeague = getNextLeagueMeta(userPoints);
  const pointsToNextLeague = nextLeague ? Math.max(0, nextLeague.minPoints - userPoints) : 0;
  const displayName = typeof user?.name === 'string' ? user.name.split(' ')[0] : 'Kullanıcı';

  if (loading) {
    return <CustomerDashboardSkeleton />;
  }

  // --- Main Return ---
  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-6 pb-10">
        {/* ─── Hero: bayi/admin ile aynı DashboardPageHeroChrome kabı ─── */}
        <DashboardPageHeroChrome tone="auto" padded={false}>
          <m.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, type: 'spring', bounce: 0.35 }}
            className={cn(
              "relative overflow-hidden rounded-[inherit] px-6 py-6 md:px-8 md:py-8",
              (session?.user as any)?.equippedBackground
            )}
          >
          <Spotlight className="top-0 left-0" fill="hsl(var(--primary))" />
          <FloatingOrbs />
          <div className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen">
            <div className="absolute -left-24 top-[-80px] h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute -right-24 bottom-[-80px] h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
          </div>

          <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-10 items-stretch justify-between">
            {/* Sol taraf: avatar + selamlama + mini özet */}
            <div className="flex flex-1 items-center gap-5 md:gap-7 text-center md:text-left">
              <div className="relative shrink-0 group w-28 h-28 flex items-center justify-center">
                <UserAvatarFrame 
                  frameId={(session?.user as any)?.equippedFrame || null}
                  customColor={(session?.user as any)?.customFrameColor || null}
                >
                  <Avatar className="h-20 w-20 border-4 border-background/60 shadow-2xl ring-2 ring-primary/40">
                    {user?.image ? (
                      <AvatarImage src={user.image} alt={displayName} />
                    ) : (
                      <AvatarFallback className="text-2xl bg-primary text-primary-foreground font-bold">
                        {getInitials(user?.name || 'User')}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </UserAvatarFrame>
                <div className="absolute bottom-0 right-0 flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 border-2 border-background shadow-lg shadow-amber-500/40 text-background font-black text-xs z-10">
                  {currentLevel}
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  className="pointer-events-none group-hover:pointer-events-auto absolute -bottom-10 left-1/2 -translate-x-1/2 translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 rounded-full px-3 h-7 text-[11px] font-medium shadow-lg bg-background/95 text-foreground border border-border/70 transition-all z-20"
                >
                  <Link prefetch={false} href="/customer/settings">{tc('customerDashboard.editProfile')}</Link>
                </Button>
              </div>
              <div className="space-y-2 md:space-y-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsLeagueSheetOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-background/15 text-primary text-xs font-semibold backdrop-blur-md border border-primary/20 shadow-sm hover:bg-background/25 hover:border-primary/40 transition-colors"
                >
                  <Medal className="w-3.5 h-3.5" />
                  <span className="truncate">{league} Ligi</span>
                  <span className="h-1 w-1 rounded-full bg-primary/70" />
                  <span className="text-[11px] text-primary/80">
                    {tc('customerDashboard.leagueLevel')} {currentLevel}
                  </span>
                </button>
                <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight text-balance">
                  <span className="opacity-80 font-normal">{getGreeting()},</span>{' '}
                  <span className="block md:inline text-foreground">
                    {displayName}
                  </span>
                </h1>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-1.5 text-xs md:text-[13px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/30 px-2.5 py-1 text-muted-foreground border border-white/5">
                    <Target className="w-3.5 h-3.5 text-primary" />
                    {formatNumber(userPoints)} XP
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/30 px-2.5 py-1 text-muted-foreground border border-white/5">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                    {stats.feedbackCount} {tc('customerDashboard.feedbackCount')}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/30 px-2.5 py-1 text-muted-foreground border border-white/5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    {stats.badgeCount} {tc('customerDashboard.badgeCount')}
                  </span>
                  {stats.streak > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-orange-400 border border-orange-500/30">
                      <Flame className="w-3.5 h-3.5" />
                      {stats.streak} {tc('customerDashboard.dayStreak')}
                    </span>
                  )}
                </div>

                {/* Showcase Pinned Badges/Cosmetics in Hero */}
                {pinnedItems.length > 0 && (
                  <div className="flex items-center justify-center md:justify-start gap-2.5 pt-3">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-bold mr-1">Vitrin:</span>
                    <div className="flex items-center gap-2">
                      {pinnedItems.map((item) => (
                        <div key={item.id} className="relative w-8 h-8 rounded-lg bg-background/40 border border-white/5 p-1 flex items-center justify-center hover:scale-110 transition-transform duration-200" title={item.name}>
                          {item.id === 'diamond_badge' ? (
                            <DiamondBadge />
                          ) : item.id === 'ruby_badge' ? (
                            <RubyBadge />
                          ) : item.imageUrl ? (
                            <div className="relative w-full h-full">
                              <Image src={item.imageUrl} alt={item.name} fill className="object-contain p-1" unoptimized />
                            </div>
                          ) : (
                            <Award className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stats.badgeCount === 0 && (
                  <div className="pt-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] text-primary shadow-sm">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="whitespace-nowrap">{tc('customerDashboard.firstBadgeHint')}</span>
                      <Button
                        asChild
                        size="sm"
                        variant="secondary"
                        className="h-6 rounded-full border-none px-2 text-[10px] font-semibold"
                      >
                        <Link prefetch={false} href="/customer/quests">{tc('customerDashboard.firstQuest')}</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sağ taraf: puan kartı + lig ilerleme */}
            <div className="w-full md:w-auto -mx-2 md:mx-0">
              <div className="flex md:block gap-3 overflow-x-auto md:overflow-visible px-2 md:px-0 snap-x snap-mandatory md:snap-none touch-pan-x overscroll-x-contain">
                <Card className="w-full min-w-0 shrink-0 snap-center border-border/80 bg-card/95 shadow-md backdrop-blur-sm sm:min-w-[260px] md:w-[320px] lg:w-[340px] max-w-[min(100%,340px)] sm:max-w-none">
                  <CardContent className="flex h-full flex-col justify-between gap-4 p-3 sm:p-4">
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {tc('customerDashboard.currentPoints')}
                      </p>
                      <p className="inline-flex items-baseline gap-2 rounded-2xl border border-border/60 bg-muted/40 px-4 py-2 text-4xl font-black tabular-nums tracking-tight text-foreground md:text-5xl">
                        <AnimatedNumber value={userPoints} format={(n) => formatNumber(Math.round(n))} />
                        <span className="text-sm text-muted-foreground md:text-base">XP</span>
                      </p>
                      {nextLeague && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {tc('customerDashboard.nextLeague')}: {nextLeague.name}
                            </span>
                            <span className="font-semibold text-foreground">
                              {formatNumber(pointsToNextLeague)} {tc('customerDashboard.xpLeft')}
                            </span>
                          </div>
                          <Progress value={leagueProgress} className="h-1.5 rounded-full" />
                        </div>
                      )}
                    </div>
                    <Button asChild size="lg" className="min-h-12 w-full gap-2 rounded-2xl text-base touch-manipulation">
                      <Link prefetch={false} href="/customer/scan">
                        <QrCode className="h-5 w-5 shrink-0" />
                        {tc('customerDashboard.scanQrCta')}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          </m.div>
        </DashboardPageHeroChrome>

        {((weeklyCardData?.quests && weeklyCardData.quests.length > 0) ||
          (weeklyCardData as { weeklyVictory?: { eligible?: boolean } })?.weeklyVictory?.eligible) && (
          <m.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:bg-card/40 dark:ring-white/[0.06] md:p-5"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-primary" aria-hidden />
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">{tc('customerDashboard.weeklyCard')}</h2>
                  <p className="text-[11px] text-muted-foreground">{weeklyCardData?.weekLabel}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8 text-xs shrink-0">
                <Link prefetch={false} href="/customer/quests">{tc('customerDashboard.allQuests')}</Link>
              </Button>
            </div>
            {(weeklyCardData as { weeklyVictory?: { eligible?: boolean; message?: string; ctaHref?: string; ctaLabel?: string } })
              ?.weeklyVictory?.eligible && (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>
                  {(weeklyCardData as { weeklyVictory?: { message?: string } }).weeklyVictory?.message}
                </span>
                <Button asChild size="sm" variant="secondary" className="h-8 text-xs shrink-0">
                  <Link prefetch={false} href={(weeklyCardData as { weeklyVictory?: { ctaHref?: string } }).weeklyVictory?.ctaHref || '/customer/surprise-boxes'}>
                    {(weeklyCardData as { weeklyVictory?: { ctaLabel?: string } }).weeklyVictory?.ctaLabel || 'Sürpriz kutular'}
                  </Link>
                </Button>
              </div>
            )}
            {weeklyCardData?.quests && weeklyCardData.quests.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-3">
                {weeklyCardData.quests.map((q: { id: string; title: string; description: string; target: number; progress: number; reward: unknown }) => (
                  <li
                    key={q.id}
                    className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 flex flex-col gap-2"
                  >
                    <p className="text-sm font-medium leading-snug line-clamp-2">{q.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{q.description}</p>
                    <div className="mt-auto flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {q.progress}/{q.target}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        Ödül
                      </Badge>
                    </div>
                    <Progress value={Math.min(100, (q.progress / Math.max(1, q.target)) * 100)} className="h-1.5" />
                  </li>
                ))}
              </ul>
            )}
          </m.section>
        )}

        {/* ─── Sosyal Sorumluluk Öncelikli Vurgu ─── */}
        <m.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="overflow-hidden border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                    <Heart className="h-3.5 w-3.5" />
                    Sosyal sorumluluk
                  </div>
                  <h2 className="mt-2 text-lg sm:text-xl font-bold tracking-tight text-balance">
                    Puanlarını gerçek etkiye dönüştür
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    Su, eğitim, çevre ve hayvan projelerine destek ol. Bağış liderliğinde yerini gör.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button asChild className="h-10 rounded-xl px-4">
                    <Link prefetch={false} href="/customer/donations">
                      Sosyal sorumluluk
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-10 rounded-xl px-4">
                    <Link prefetch={false} href="/customer/donations?tab=leaderboard">Liderlik</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </m.section>

        {/* ─── Yeni müşteri rehberi (hiç feedback yoksa): ilk değer yolculuğu ─── */}
        {stats.feedbackCount === 0 && (
          <m.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/15 p-2.5 shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold tracking-tight">
                      {tc('customerDashboard.welcome.title')}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {tc('customerDashboard.welcome.subtitle')}
                    </p>
                    <ol className="mt-3 space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">1</span>
                        <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{tc('customerDashboard.welcome.step1')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">2</span>
                        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{tc('customerDashboard.welcome.step2')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">3</span>
                        <Gift className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{tc('customerDashboard.welcome.step3')}</span>
                      </li>
                    </ol>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild className="h-10 rounded-xl px-4">
                        <Link prefetch={false} href="/customer/quests">
                          {tc('customerDashboard.welcome.cta')}
                          <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </m.section>
        )}

        {/* ─── Özet Rakamlar (Bento Grid) ─── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            title={tc('customerDashboard.statFeedback')}
            value={stats.feedbackCount}
            icon={MessageSquare}
            colorClass="text-blue-500"
          />
          <StatCard
            title={tc('customerDashboard.statPoints')}
            value={userPoints}
            icon={Target}
            colorClass="text-amber-500"
            numberFormat={(n: number) => formatNumber(n)}
          />
          <StatCard
            title={tc('customerDashboard.statBadges')}
            value={stats.badgeCount}
            icon={Trophy}
            colorClass="text-emerald-500"
          />
          <StatCard
            title={tc('customerDashboard.statStreak')}
            value={stats.streak}
            icon={Flame}
            colorClass="text-orange-500"
          />
        </section>

        {/* ─── Hızlı Eylemler & Spin Wheel ─── */}
        <m.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4"
        >
          {/* Spin Wheel Card Yeri */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 border border-border/50 rounded-2xl overflow-hidden bg-card hover:border-primary/30 transition-all flex flex-col items-center justify-center p-4">
            <SpinWheel
              compact
              lastSpinDate={spinStatus.lastSpin}
              onPrizeWon={(prize) => {
                if (prize.type === 'points') setStats((prev) => ({ ...prev, points: prev.points + prize.value }));
                triggerSuccessBurst(); // Qratex 2.0 Burst!
              }}
            />
          </div>

          {[
            { href: '/customer/scan', icon: QrCode, label: tc('customerDashboard.quickScan'), bg: 'bg-primary/10', color: 'text-primary' },
            { href: '/customer/progress-hub', icon: Gauge, label: tc('customerDashboard.quickProgress'), bg: 'bg-sky-500/10', color: 'text-sky-500' },
            { href: '/customer/quests', icon: Target, label: tc('customerDashboard.quickQuests'), bg: 'bg-emerald-500/10', color: 'text-emerald-500' },
            { href: '/customer/badges', icon: Trophy, label: tc('customerDashboard.quickBadges'), bg: 'bg-amber-500/10', color: 'text-amber-500' },
            { href: '/customer/rewards', icon: Gift, label: tc('customerDashboard.quickRewards'), bg: 'bg-primary/10', color: 'text-primary' },
          ].map((action, i) => (
            <Link prefetch={false} key={i} href={action.href} className="group flex flex-col items-center justify-center p-4 sm:p-6 min-h-[100px] sm:min-h-0 rounded-2xl bg-card border border-border/50 hover:bg-muted/50 active:bg-muted/70 transition-colors touch-manipulation">
              <div className={`p-3 sm:p-4 rounded-full ${action.bg} mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300 shadow-inner`}>
                <action.icon className={`w-7 h-7 sm:w-8 sm:h-8 ${action.color}`} />
              </div>
              <span className="font-semibold text-sm tracking-tight">{action.label}</span>
            </Link>
          ))}
        </m.section>

        {/* ─── Favorilerim (Sadece favori varsa göster) ─── */}
        {favorites.length > 0 && (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Heart className="w-5 h-5 fill-primary text-primary" />
              <h2 className="text-xl font-bold">Favorilerim</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 px-1 snap-x snap-mandatory select-none no-scrollbar touch-pan-x overscroll-x-contain">
              {favorites.map((fav) => (
                <div key={fav.dealerId} className="shrink-0 w-[min(240px,85vw)] snap-center rounded-2xl border border-border/60 bg-card p-4 shadow-sm relative group">
                  <button
                    onClick={() => toggleFavorite(fav.dealerId)}
                    disabled={favoriteToggling === fav.dealerId}
                    type="button"
                    className="absolute top-3 right-3 p-2 min-h-10 min-w-10 flex items-center justify-center rounded-full bg-background/90 hover:bg-muted transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50 touch-manipulation"
                  >
                    <Heart className="w-4 h-4 fill-primary text-primary" />
                  </button>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {fav.businessName ? fav.businessName.charAt(0) : 'M'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm line-clamp-1">{fav.businessName || 'İşletme'}</h3>
                      <p className="text-xs text-muted-foreground">Tıkla & incele</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full rounded-xl mt-2 h-8 text-xs">
                    <Link prefetch={false} href={`/customer/nearby?focus=${fav.dealerId}`}>Sayfasına Git</Link>
                  </Button>
                </div>
              ))}
            </div>
          </m.div>
        )}
        {/* ─── Mystery Quest (Pop-up Banner) ─── */}
        {activeQuests.filter(q => q.type === 'mystery' && q.progress < q.target).map((mysteryQuest, idx) => {
          const progressPercent = Math.min(100, Math.round((mysteryQuest.progress / Math.max(1, mysteryQuest.target)) * 100));
          return (
            <m.div key={`mystery-${mysteryQuest.id}`} initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.2, type: 'spring' }} className="col-span-12">
              <div className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground p-4 sm:p-6 shadow-lg border border-primary/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10 flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-md">
                      <Sparkles className="w-6 h-6 text-white animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-background/25 text-foreground border-border/60 uppercase text-[10px] tracking-wider px-2 py-0.5 dark:bg-white/10 dark:text-white dark:border-white/20">SÜRELİ GİZEM</Badge>
                        <span className="text-xs font-medium text-foreground/80 dark:text-white/80 flex items-center gap-1"><Clock className="w-3 h-3" /> 2 Saat Kaldı</span>
                      </div>
                      <h3 className="font-bold text-lg leading-tight">{mysteryQuest.name}</h3>
                      <p className="text-sm text-foreground/80 dark:text-white/80 mt-1 line-clamp-1">{mysteryQuest.description || 'Hemen tamamla, ekstra puanları kap!'}</p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <span className="font-bold text-2xl tracking-tighter">+{mysteryQuest.reward.points} <span className="text-sm text-foreground/70 dark:text-white/70">XP</span></span>
                      <Button asChild variant="secondary" size="sm" className="rounded-xl shadow-xl hover:scale-105 transition-transform">
                        <Link prefetch={false} href="/customer/quests">Hemen Katıl</Link>
                      </Button>
                    </div>
                    <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                      <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </m.div>
          );
        })}

        {/* ─── Keşif Köşesi (Trendler) & Haftanın Enleri ─── */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Trend Mekanlar */}
          <m.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-8">
            <Card className="rounded-3xl border-border/60 shadow-md overflow-hidden bg-gradient-to-br from-card to-card/50 h-full">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    <CardTitle className="text-lg">Trend Mekanlar</CardTitle>
                  </div>
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-muted-foreground hover:text-primary">
                    <Link prefetch={false} href="/customer/nearby">Tümünü gör</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {discovery.trendingVenues.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Yakınınızda trend mekan bulunamadı.</div>
                  ) : (
                    discovery.trendingVenues.slice(0, 4).map((venue, idx) => {
                      const isFav = (discovery.favoriteDealerIds || []).includes(venue.dealerId);
                      return (
                        <div key={venue.dealerId} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold shrink-0">
                              #{idx + 1}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-base truncate">{venue.businessName}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> {venue.avgRating.toFixed(1)}</span>
                                <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {venue.feedbackCount} yorum</span>
                                <span className="text-primary font-medium">Yakında</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => toggleFavorite(venue.dealerId)}
                              disabled={favoriteToggling === venue.dealerId}
                              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors disabled:opacity-50"
                            >
                              <Heart className={`w-5 h-5 ${isFav ? 'fill-primary text-primary' : 'text-muted-foreground'}`} />
                            </button>
                            <Button asChild variant="secondary" size="sm" className="rounded-xl hidden sm:flex">
                              <Link prefetch={false} href={`/customer/nearby?focus=${venue.dealerId}`}>Ziyaret Et</Link>
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>

          {/* Haftanın Enleri */}
          <m.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-4">
            <Card className="rounded-3xl border-amber-500/30 shadow-md bg-gradient-to-br from-amber-500/10 to-transparent h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <CardTitle className="text-lg">Haftanın Enleri</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {discovery.weeklyBest.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-1">Bu hafta için henüz veri yok.</p>
                ) : (
                  discovery.weeklyBest.slice(0, 3).map((best, i) => (
                    <div key={i} className="flex gap-3 items-center bg-card/60 rounded-2xl p-3 border border-border/50 backdrop-blur-sm">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Award className={`w-5 h-5 text-orange-500 ${i === 0 ? 'scale-110' : ''}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">{best.label}</p>
                        <p className="text-sm font-bold truncate">{best.winner?.businessName || 'Belli değil'}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </m.div>
        </div>

        {/* ─── Kampanya & İndirimler (Reklam/Sponsorlu Ara Katman) ─── */}
        {discovery.sponsored.length > 0 && (
          <m.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-4">
            <div className="flex items-center gap-2 mb-4 px-1">
              <Megaphone className="w-5 h-5 fill-primary/20 text-primary" />
              <h2 className="text-lg font-bold">Size Özel Fırsatlar</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {discovery.sponsored.map((promo, idx) => (
                <Link prefetch={false} href={`/customer/nearby?promo=${promo.id}`} key={idx} className="group relative rounded-2xl overflow-hidden border border-primary/20 bg-background hover:shadow-lg hover:border-primary/50 transition-all flex h-28">
                  <div className="w-1/3 bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Zap className="w-8 h-8 text-primary group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1 px-2 py-0.5 bg-primary/10 rounded-full w-fit">Sponsorlu</span>
                    <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{promo.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </m.section>
        )}

        {/* ─── Oyunlaştırma Özeti (Aktif Görevler) ─── */}
        {/* "Son Rozetler" kartı kaldırıldı — rozetler artık yalnızca profil/rozetler sayfasında. */}
        <div className="grid gap-6">
          {/* Aktif Görevler */}
          <m.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
            <Card className="rounded-3xl border border-border/60 shadow-md h-full bg-gradient-to-b from-card to-muted/10">
              <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Aktif Görevler</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="rounded-xl h-8">
                  <Link prefetch={false} href="/customer/quests">Detaylar</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-5">
                  {activeQuests.filter(q => q.progress < q.target).slice(0, 3).map((quest) => {
                    const progressPercent = Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100));
                    return (
                      <div key={quest.id} className="group flex items-start gap-4">
                        <div className="mt-1 flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Target className="w-5 h-5 text-primary opacity-80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <p className="font-semibold text-sm leading-tight text-foreground/90 group-hover:text-primary transition-colors">{quest.name}</p>
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">+{quest.reward.points} XP</span>
                          </div>
                          <Progress value={progressPercent} className="h-2 rounded-full bg-muted mt-2" indicatorClassName="bg-primary" />
                          <p className="text-xs text-muted-foreground mt-1.5 text-right font-medium">{quest.progress} / {quest.target}</p>
                        </div>
                      </div>
                    );
                  })}
                  {activeQuests.filter(q => q.progress < q.target).length === 0 && (
                    <div className="text-center py-6 text-muted-foreground bg-muted/30 rounded-2xl">
                      <p className="text-sm font-medium">Harika! Tüm aktif görevleri tamamladın.</p>
                      <p className="text-xs mt-1">Yarın yeni görevler için tekrar gel.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>

        </div>

        {/* ─── Liderlik ─── */}
        {/* "Lig Durumu" kartı kaldırıldı — lig bilgisi profil sayfasında görülebilir. */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Lig Durumu (KALDIRILDI) */}
          <div className="hidden">
            <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="h-full">
              <Card className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent h-full shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                      <Medal className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">Lig Durumu</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5 px-3 py-1 text-sm rounded-lg font-semibold shadow-inner">
                    {league} Ligi
                  </Badge>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-6">
                    <div className="relative pt-6 pb-2">
                      <div className="flex justify-between text-sm font-medium mb-3">
                        <span className="text-muted-foreground">Kazanılan Puan</span>
                        <span className="font-bold">{formatNumber(userPoints)} XP</span>
                      </div>
                      <div className="relative h-4 w-full bg-muted/60 rounded-full overflow-hidden shadow-inner">
                        <m.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(2, leagueProgress)}%` }}
                          transition={{ duration: 1, delay: 0.2, type: 'spring' }}
                          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80"
                        />
                      </div>
                      {nextLeague && (
                        <div className="flex justify-between text-xs text-muted-foreground mt-3 font-medium">
                          <span>{getLeagueMeta(userPoints)?.minPoints} XP</span>
                          <span className="flex items-center gap-1 text-primary">Hedef: {formatNumber(nextLeague.minPoints)} XP</span>
                        </div>
                      )}
                    </div>

                    {nextLeague ? (
                      <div className="bg-background/80 backdrop-blur rounded-xl p-4 border border-primary/10 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Crown className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-sm leading-tight text-muted-foreground">
                          <strong className="text-foreground">{nextLeague.name} Ligine</strong> yükselmek için <strong className="text-primary">{formatNumber(pointsToNextLeague)} XP</strong> kaldı.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-primary/10 rounded-xl p-4 border border-primary/20 flex items-center gap-3">
                        <Crown className="w-6 h-6 text-primary shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-primary">Zirvedesin!</p>
                          <p className="text-xs text-primary/80">En üst lig olan Efsane Ligindesin.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </m.div>
          </div>

          {/* Liderlik Tablosu Gözat — Lig Durumu kaldırıldığı için tam genişlik */}
          <div className="lg:col-span-12">
            <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="h-full">
              <Card className="rounded-2xl border border-border/60 shadow-sm h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <div className="p-2.5 rounded-xl bg-orange-500/15">
                      <Crown className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <CardTitle className="text-lg">Liderlik Tablosu</CardTitle>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="rounded-xl">
                    <Link prefetch={false} href="/customer/leaderboard">Tümü</Link>
                  </Button>
                </CardHeader>
                <CardContent className="pt-4 flex-1">
                  <div className="space-y-[6px]">
                    {leaderboard.map((entry, idx) => (
                      <m.div
                        key={idx}
                        whileHover={{ scale: 1.01, x: 4 }}
                        className={`flex items-center gap-4 p-3 rounded-xl transition-all ${entry.isCurrentUser
                          ? 'bg-primary/10 border border-primary/20 shadow-sm'
                          : 'bg-muted/40 hover:bg-muted/60 border border-transparent'
                          }`}
                      >
                        <div
                          className={`w-8 h-8 flex items-center justify-center font-bold text-sm shrink-0
                            ${entry.rank === 1 ? 'text-amber-500 scale-125' :
                              entry.rank === 2 ? 'text-slate-400 scale-110' :
                                entry.rank === 3 ? 'text-amber-700 scale-105' :
                                  'text-muted-foreground'
                            }`}
                        >
                          {entry.rank === 1 ? <Crown className="w-6 h-6 fill-current" /> : `#${entry.rank}`}
                        </div>
                        {entry.avatar ? (
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-background shadow-sm">
                            <Image src={entry.avatar} alt={entry.name} width={40} height={40} className="object-cover" />
                          </div>
                        ) : (
                          <Avatar className="w-10 h-10 shrink-0 ring-2 ring-background shadow-sm">
                            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/75 text-sm font-bold text-primary-foreground">
                              {getInitials(entry.name)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${entry.isCurrentUser ? 'text-primary' : 'text-foreground/90'}`}>
                            {entry.name} {entry.isCurrentUser && '(Sen)'}
                          </p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5 font-semibold">SVY {entry.level}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black tabular-nums tracking-tight">{formatNumber(entry.points)}</span>
                          <span className="text-[10px] text-muted-foreground block text-right mt-0.5 font-medium">XP</span>
                        </div>
                      </m.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </m.div>
          </div>
        </div>

        {/* ─── Son aktiviteler & Ödül mağazası ─── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/15">
                    <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <CardTitle className="text-lg">Son Aktivite Logu</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="rounded-xl h-8">
                  <Link prefetch={false} href="/customer/feedbacks">Tümü</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-[6px]">
                  {(recentActivity.length > 0 ? recentActivity : recentFeedbacks).slice(0, 5).map((activity, i) => (
                    <div
                      key={(activity as { id: string }).id || `act-${i}`}
                      className="flex justify-between items-center bg-card/60 p-3 rounded-2xl hover:bg-muted/50 transition-colors border border-border/40"
                    >
                      <div className="min-w-0 mr-4">
                        <p className="font-semibold text-sm truncate">{'business' in activity ? activity.business : (activity as FeedbackData).business}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {'product' in activity && (activity as ActivityItem).product && (
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[120px]">
                              {(activity as ActivityItem).product}
                            </span>
                          )}
                          {'rating' in activity && (activity as FeedbackData).rating && (
                            <div className="flex text-amber-500">
                              {[...Array((activity as FeedbackData).rating)].map((_, idx) => (
                                <Star key={idx} className="w-3 h-3 fill-current" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {'points' in activity && (activity as FeedbackData).points != null && (
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold px-2 py-0.5 shadow-sm">
                            +{(activity as FeedbackData).points}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {recentActivity.length === 0 && recentFeedbacks.length === 0 && (
                    <div className="py-8 text-center rounded-2xl bg-muted/40 border border-dashed border-border/60">
                      <Coffee className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm font-medium text-foreground">Henüz hareket yok.</p>
                      <p className="text-xs text-muted-foreground mt-1">QR tara, puan kazanmaya başla!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>

          <m.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
            <Card className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/15">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Ödül Vitrini</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="rounded-xl h-8">
                  <Link prefetch={false} href="/customer/rewards">Tümü</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-[6px]">
                  {rewards.map((reward) => (
                    <m.div
                      key={reward.id}
                      whileHover={{ x: 4 }}
                      className="flex items-center gap-4 p-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 p-1 group-hover:scale-105 transition-transform duration-300">
                        <Image src={reward.icon} alt={reward.name} width={36} height={36} className="object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate text-foreground group-hover:text-primary transition-colors">{reward.name}</p>
                        <p className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md inline-block mt-1 font-semibold">{formatNumber(reward.cost)} XP</p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="rounded-xl shrink-0 h-8 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary" disabled={userPoints < reward.cost}>
                        <Link prefetch={false} href="/customer/rewards">{userPoints < reward.cost ? 'Kilitli' : 'Al'}</Link>
                      </Button>
                    </m.div>
                  ))}
                  {rewards.length === 0 && (
                    <div className="py-8 text-center rounded-2xl bg-muted/40 border border-dashed border-border/60">
                      <Gift className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm font-medium text-foreground">Ödüller yakında geliyor.</p>
                      <p className="text-xs text-muted-foreground mt-1">Takipte kal!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>
        </div>
      </div>
      <Sheet open={isLeagueSheetOpen} onOpenChange={setIsLeagueSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Lig Detayları</SheetTitle>
            <SheetDescription>
              Mevcut lig durumunu ve tüm liglerin puan aralıklarını buradan görebilirsin.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <p className="text-xs font-semibold text-primary/80 mb-1">Şu anki ligin</p>
              <p className="text-lg font-bold text-primary mb-1">{leagueMeta.name} Ligi</p>
              <p className="text-xs text-primary/80">
                {formatNumber(leagueMeta.minPoints)} – {formatNumber(leagueMeta.maxPoints)} XP aralığında.
              </p>
              <p className="mt-2 text-xs text-primary-foreground/80">
                Toplam {formatNumber(userPoints)} XP ile bu ligdesin. Bir sonraki lige geçmek için{' '}
                {nextLeague ? (
                  <span className="font-semibold">
                    {formatNumber(pointsToNextLeague)} XP
                  </span>
                ) : (
                  <span className="font-semibold">zirvedesin</span>
                )}{' '}
                gerekiyor.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Tüm ligler</p>
              <div className="space-y-2">
                {DEFAULT_LEAGUE_RULES.map((rule) => {
                  const isCurrent = rule.key === leagueMeta.key;
                  const gradient = rule.gradient || 'from-slate-600 to-slate-800';
                  return (
                    <div
                      key={rule.key}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                        isCurrent
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-border/60 bg-background/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-7 w-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[11px] font-semibold text-white`}
                        >
                          {rule.name[0]}
                        </div>
                        <div>
                          <p className={`font-semibold ${isCurrent ? 'text-primary' : ''}`}>
                            {rule.name}
                            {isCurrent && ' (Şu an)'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatNumber(rule.minPoints)} – {formatNumber(rule.maxPoints)} XP
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </LazyMotion>
  );
}
