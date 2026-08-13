'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Medal,
  Crown,
  Star,
  Sparkles,
  Flame,
  Zap,
  MessageSquare,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import Image from 'next/image';
import { getInitials, getLeague, formatNumber } from '@/lib/utils';
import { defaultAvatars } from '@/lib/avatar-options';
import { getLeagueAvatarUrl } from '@/lib/league-avatars';
import { useAppT } from '@/lib/app-locale';

interface LeaderboardUser {
  id: string;
  name: string | null;
  image: string | null;
  points: number;
  totalPoints?: number;
  level: number;
  rank: number;
  feedbackCount?: number;
  badgeCount?: number;
  referralCount?: number;
  score?: number;
  isCurrentUser?: boolean;
  league?: string;
  leagueKey?: string;
  leagueProgress?: number;
  nextLeague?: string | null;
  pointsToNextLeague?: number;
}


export default function CustomerLeaderboardPage() {
  const t = useAppT();
  const { data: session } = useSession();
  type CategoryKey = 'points' | 'feedbacks' | 'badges' | 'referrals';
  const [period, setPeriod] = useState('weekly');
  const [category, setCategory] = useState<CategoryKey>('points');
  const [showCategoryPanel, setShowCategoryPanel] = useState(true);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [periodLabel, setPeriodLabel] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, [period, category]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${period}&category=${category}&limit=50`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      
      if (data.success && data.data.leaderboard) {
        // Assign random avatars if no image
        const withAvatars = data.data.leaderboard.map((user: LeaderboardUser, i: number) => ({
          ...user,
          image: user.image || defaultAvatars[i % defaultAvatars.length],
        }));
        setLeaderboard(withAvatars);
        setUserRank(data.data.userRank);
        setTotalUsers(data.data.totalUsers || 0);
        setPeriodLabel(data.data.periodLabel || t('customerLeaderboard.periodWeekly'));
        setCategoryLabel(data.data.categoryLabel || t('customerLeaderboard.categoryPoints'));
      }
    } catch (error) {
      console.error('Leaderboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const userLeague = getLeague((session?.user as { points?: number })?.points ?? 0);

  const scoreMeta =
    category === 'feedbacks'
      ? { icon: MessageSquare, suffix: t('customerLeaderboard.feedbacks') }
      : category === 'badges'
        ? { icon: Award, suffix: t('customerLeaderboard.badges') }
        : category === 'referrals'
          ? { icon: Sparkles, suffix: t('customerLeaderboard.referrals') }
          : { icon: Star, suffix: t('customerLeaderboard.points') };
  const ScoreIcon = scoreMeta.icon;
  const categoryOptions: Array<{
    key: CategoryKey;
    label: string;
    description: string;
    icon: typeof Star;
  }> = [
    {
      key: 'points',
      label: t('customerLeaderboard.categoryPoints'),
      description: t('customerLeaderboard.categoryPointsDesc'),
      icon: Star,
    },
    {
      key: 'feedbacks',
      label: t('customerLeaderboard.categoryFeedbacks'),
      description: t('customerLeaderboard.categoryFeedbacksDesc'),
      icon: MessageSquare,
    },
    {
      key: 'badges',
      label: t('customerLeaderboard.categoryBadges'),
      description: t('customerLeaderboard.categoryBadgesDesc'),
      icon: Award,
    },
    {
      key: 'referrals',
      label: t('customerLeaderboard.categoryReferrals'),
      description: t('customerLeaderboard.categoryReferralsDesc'),
      icon: Sparkles,
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title={t('customerLeaderboard.title')}
        description={t('customerLeaderboard.description')}
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('customerLeaderboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">{t('customerLeaderboard.description')}</p>
      </div>

      {/* User Stats Banner */}
      <Motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="relative overflow-hidden border-border/60 bg-card/50 backdrop-blur-sm">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-primary/[0.04]" aria-hidden />
          <CardContent className="relative p-4 md:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6">
              {/* User Info */}
              <div className="flex items-center gap-3 md:gap-4">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-16 w-16 md:h-20 md:w-20 ring-4 ring-primary/30">
                    <AvatarImage src={session?.user?.image || ''} />
                    <AvatarFallback className="bg-primary text-xl text-primary-foreground md:text-2xl">
                      {getInitials(session?.user?.name || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1 md:p-1.5 shadow-lg">
                    <Zap className="h-3 w-3 md:h-4 md:w-4 text-white" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-bold truncate">{session?.user?.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-1">
                    <Badge variant="outline" className="gap-1 text-xs h-6">
                      <Star className="h-3 w-3" />
                      {t('customerLeaderboard.level')} {session?.user?.level || 1}
                    </Badge>
                    <Badge className="h-6 gap-1 border-0 bg-primary text-xs text-primary-foreground hover:bg-primary/90">
                      <Sparkles className="h-3 w-3" />
                      {userLeague}
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Stats */}
              <div className="flex items-center justify-center sm:justify-end flex-1 gap-4 md:gap-6">
                {/* Rank */}
                <div className="text-center px-2">
                  <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5">{t('customerLeaderboard.yourRank')}</p>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-2xl md:text-3xl font-bold text-primary">#{userRank || '?'}</span>
                    {userRank && userRank <= 10 && (
                      <Motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Flame className="h-4 w-4 text-orange-500" />
                      </Motion.div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">/ {totalUsers} kişi</p>
                </div>
                
                <div className="w-px h-10 bg-border/50" />
                
                {/* Points */}
                <div className="text-center px-2">
                  <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5">{t('customerLeaderboard.totalPoints')}</p>
                  <div className="flex items-center justify-center gap-1">
                    <Star className="h-4 w-4 md:h-5 md:w-5 text-yellow-500 fill-yellow-500" />
                    <span className="text-xl md:text-2xl font-bold">{formatNumber(session?.user?.points || 0)}</span>
                  </div>
                </div>
                
                <div className="hidden sm:block w-px h-10 bg-border/50" />
                
                {/* Period */}
                <div className="text-center px-2 hidden sm:block">
                  <p className="text-[10px] md:text-xs text-muted-foreground mb-1">{t('customerLeaderboard.period')}</p>
                  <Badge variant="secondary" className="text-xs">
                    {periodLabel} · {categoryLabel}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Motion.div>

      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowCategoryPanel((prev) => !prev)}
          >
            <div>
              <p className="text-sm font-semibold">{t('customerLeaderboard.categoriesTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('customerLeaderboard.categoriesDescription')}
              </p>
            </div>
            {showCategoryPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showCategoryPanel && (
            <div className="grid gap-2 md:grid-cols-2">
              {categoryOptions.map((item) => {
                const Icon = item.icon;
                const active = category === item.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => setCategory(item.key)}
                    className={`rounded-lg border p-3 text-left transition ${
                      active
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="weekly" className="gap-2 text-sm">
            <Flame className="h-4 w-4" />
            {t('customerLeaderboard.periodWeekly')}
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-2 text-sm">
            <Trophy className="h-4 w-4" />
            {t('customerLeaderboard.periodMonthly')}
          </TabsTrigger>
          <TabsTrigger value="alltime" className="gap-2 text-sm">
            <Crown className="h-4 w-4" />
            {t('customerLeaderboard.periodAllTime')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="mt-6 space-y-8">
          {loading ? (
            <div className="space-y-4">
              <div className="flex justify-center gap-4 mb-8">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className={`${i === 1 ? 'h-52 w-40' : 'h-44 w-36'} rounded-2xl`} />
                ))}
              </div>
              {[...Array(7)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Podium - Top 3 - Modern Design */}
              {leaderboard.length >= 3 && (
                <Motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative mb-12"
                >
                  {/* Background glow */}
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent rounded-3xl" />
                  
                  {/* Podium Container */}
                  <div className="relative grid grid-cols-3 gap-2 md:gap-4 items-end pt-8 pb-4 px-2 md:px-8">
                    
                    {/* 2nd Place */}
                    <Motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-col items-center"
                    >
                      {/* Avatar & Info Card */}
                      <div className="relative mb-2">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                          <div className="bg-gradient-to-r from-slate-400 to-slate-500 rounded-full p-1.5 shadow-lg">
                            <Medal className="h-4 w-4 md:h-5 md:w-5 text-white" />
                          </div>
                        </div>
                        <Avatar className="h-16 w-16 md:h-20 md:w-20 ring-4 ring-slate-400/50 shadow-xl">
                          <AvatarImage src={leaderboard[1]?.image || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-slate-400 to-slate-600 text-white text-lg md:text-xl">
                            {getInitials(leaderboard[1]?.name || '')}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      
                      <p className="font-bold text-sm md:text-base truncate max-w-[100px] md:max-w-[120px] text-center">
                        {leaderboard[1]?.name}
                      </p>
                      
                      <div className="flex items-center gap-1 mt-1">
                        <ScoreIcon className="h-4 w-4 text-yellow-500" />
                        <span className="font-bold text-base md:text-lg">
                          {formatNumber((leaderboard[1]?.score ?? leaderboard[1]?.points) || 0)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {leaderboard[1]?.feedbackCount || 0}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Award className="h-3 w-3" />
                          {leaderboard[1]?.badgeCount || 0}
                        </span>
                      </div>
                      
                      {/* Podium Stand */}
                      <div className="w-full mt-3 bg-gradient-to-t from-slate-600 to-slate-500 rounded-t-xl pt-6 pb-3 text-center shadow-lg">
                        <span className="text-2xl md:text-3xl font-bold text-white">2</span>
                      </div>
                    </Motion.div>

                    {/* 1st Place */}
                    <Motion.div
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                      className="flex flex-col items-center -mt-8"
                    >
                      {/* Crown */}
                      <Motion.div
                        animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="mb-2"
                      >
                        <Crown className="h-8 w-8 md:h-10 md:w-10 text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                      </Motion.div>
                      
                      {/* Avatar */}
                      <div className="relative mb-2">
                        <Motion.div
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 bg-yellow-400/30 rounded-full blur-xl"
                        />
                        <Avatar className="relative h-20 w-20 md:h-28 md:w-28 ring-4 ring-yellow-400 shadow-2xl shadow-yellow-500/30">
                          <AvatarImage src={leaderboard[0]?.image || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-amber-600 text-white text-xl md:text-2xl">
                            {getInitials(leaderboard[0]?.name || '')}
                          </AvatarFallback>
                        </Avatar>
                        <Motion.div
                          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute -top-1 -right-1"
                        >
                          <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-yellow-400" />
                        </Motion.div>
                      </div>
                      
                      <p className="font-bold text-base md:text-lg truncate max-w-[110px] md:max-w-[140px] text-center">
                        {leaderboard[0]?.name}
                      </p>
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        <ScoreIcon className="h-5 w-5 md:h-6 md:w-6 text-yellow-500" />
                        <span className="font-bold text-xl md:text-2xl text-yellow-500">
                          {formatNumber((leaderboard[0]?.score ?? leaderboard[0]?.points) || 0)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {leaderboard[0]?.feedbackCount || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Award className="h-3.5 w-3.5" />
                          {leaderboard[0]?.badgeCount || 0}
                        </span>
                      </div>
                      
                      <Badge className="mt-2 bg-yellow-500/20 text-yellow-500 border-yellow-500/30 gap-1.5">
                        <Image src={getLeagueAvatarUrl(leaderboard[0]?.leagueKey ?? 'BASLANGIC')} alt="" width={18} height={18} className="rounded-full" />
                        Lv. {leaderboard[0]?.level} · {leaderboard[0]?.league ?? getLeague(leaderboard[0]?.points ?? 0)}
                      </Badge>
                      
                      {/* Podium Stand */}
                      <div className="w-full mt-3 bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-t-xl pt-8 pb-4 text-center shadow-xl shadow-yellow-500/20">
                        <span className="text-3xl md:text-4xl font-bold text-white">1</span>
                      </div>
                    </Motion.div>

                    {/* 3rd Place */}
                    <Motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-col items-center"
                    >
                      {/* Avatar & Info Card */}
                      <div className="relative mb-2">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                          <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-full p-1.5 shadow-lg">
                            <Medal className="h-4 w-4 md:h-5 md:w-5 text-white" />
                          </div>
                        </div>
                        <Avatar className="h-16 w-16 md:h-20 md:w-20 ring-4 ring-amber-600/50 shadow-xl">
                          <AvatarImage src={leaderboard[2]?.image || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white text-lg md:text-xl">
                            {getInitials(leaderboard[2]?.name || '')}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      
                      <p className="font-bold text-sm md:text-base truncate max-w-[100px] md:max-w-[120px] text-center">
                        {leaderboard[2]?.name}
                      </p>
                      
                      <div className="flex items-center gap-1 mt-1">
                        <ScoreIcon className="h-4 w-4 text-yellow-500" />
                        <span className="font-bold text-base md:text-lg">
                          {formatNumber((leaderboard[2]?.score ?? leaderboard[2]?.points) || 0)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {leaderboard[2]?.feedbackCount || 0}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Award className="h-3 w-3" />
                          {leaderboard[2]?.badgeCount || 0}
                        </span>
                      </div>
                      
                      {/* Podium Stand */}
                      <div className="w-full mt-3 bg-gradient-to-t from-amber-700 to-amber-600 rounded-t-xl pt-4 pb-3 text-center shadow-lg">
                        <span className="text-2xl md:text-3xl font-bold text-white">3</span>
                      </div>
                    </Motion.div>
                  </div>
                </Motion.div>
              )}

              {/* Rest of Leaderboard */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-bold">{t('customerLeaderboard.ranking')}</h3>
                  <Badge variant="secondary" className="ml-auto">
                    {leaderboard.length} {t('customerLeaderboard.players')}
                  </Badge>
                </div>
                
                <AnimatePresence>
                  {leaderboard.slice(3).map((user, index) => {
                    const isTop10 = user.rank <= 10;
                    const rankColors = {
                      4: 'from-primary/20 to-primary/5 border-primary/30',
                      5: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
                      6: 'from-emerald-500/20 to-green-500/10 border-emerald-500/30',
                      7: 'from-teal-500/20 to-cyan-500/10 border-teal-500/30',
                      8: 'from-primary/20 to-blue-500/10 border-primary/30',
                      9: 'from-violet-500/20 to-indigo-500/10 border-violet-500/30',
                      10: 'from-orange-500/20 to-amber-500/10 border-orange-500/30',
                    };
                    const bgClass = isTop10 
                      ? rankColors[user.rank as keyof typeof rankColors] || 'from-slate-500/10 to-slate-500/5 border-slate-500/20'
                      : 'from-slate-500/5 to-transparent border-border/50';
                    
                    return (
                      <Motion.div
                        key={user.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index, 10) * 0.03 }}
                        whileHover={{ scale: 1.01, y: -2 }}
                        className={`relative overflow-hidden rounded-xl border bg-gradient-to-r ${bgClass} ${
                          user.isCurrentUser ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                        }`}
                      >
                        {/* Glow effect for top 10 */}
                        {isTop10 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 opacity-50" />
                        )}
                        
                        <div className="relative flex items-center gap-4 p-4">
                          {/* Rank Badge */}
                          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                            isTop10 
                              ? 'bg-gradient-to-br from-primary/20 to-primary/10 text-primary border border-primary/30' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            #{user.rank}
                          </div>

                          {/* Avatar */}
                          <div className="relative">
                            <Avatar className={`h-14 w-14 ${isTop10 ? 'ring-2 ring-primary/50' : 'ring-2 ring-border'}`}>
                              <AvatarImage src={user.image || ''} />
                              <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                                {getInitials(user.name || '')}
                              </AvatarFallback>
                            </Avatar>
                            {user.isCurrentUser && (
                              <div className="absolute -top-1 -right-1 bg-primary rounded-full p-1">
                                <Sparkles className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </div>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`font-semibold truncate ${user.isCurrentUser ? 'text-primary' : ''}`}>
                                {user.name}
                              </p>
                              {user.isCurrentUser && (
                                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                                  {t('customerLeaderboard.you')}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <Badge variant="outline" className="text-xs h-5 gap-1">
                                <Zap className="h-3 w-3" />
                                {t('customerLeaderboard.lvlShort')} {user.level}
                              </Badge>
                            <span className="text-xs text-muted-foreground hidden sm:inline flex items-center gap-1">
                                <Image src={getLeagueAvatarUrl(user.leagueKey ?? 'BASLANGIC')} alt="" width={14} height={14} className="rounded-full flex-shrink-0" />
                                {(user.league || getLeague(user.points ?? 0))} {t('customerLeaderboard.league')}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              <Progress value={user.leagueProgress || 0} className="h-1.5" />
                              <p className="text-[10px] text-muted-foreground">
                                {user.nextLeague
                                  ? `${user.nextLeague} ${t('customerLeaderboard.forNextLeague')} ${formatNumber(user.pointsToNextLeague ?? 0)} ${t('customerLeaderboard.points')}`
                                  : t('customerLeaderboard.upperLeague')}
                              </p>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="hidden md:flex flex-col items-center gap-1 px-4 border-l border-border/50">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1 text-sm">
                                <MessageSquare className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{user.feedbackCount || 0}</span>
                              </div>
                              <div className="flex items-center gap-1 text-sm">
                                <Award className="h-4 w-4 text-amber-500" />
                                <span className="font-medium">{user.badgeCount || 0}</span>
                              </div>
                              <div className="flex items-center gap-1 text-sm">
                                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                                <span className="font-medium">{user.referralCount || 0}</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{t('customerLeaderboard.fbBadgeInvite')}</span>
                          </div>

                          {/* Points */}
                          <div className="flex flex-col items-end gap-1 pl-4 border-l border-border/50">
                            <div className="flex items-center gap-1.5">
                              <ScoreIcon className="h-5 w-5 text-yellow-500" />
                              <span className="text-xl font-bold">{formatNumber(user.score ?? user.points)}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{scoreMeta.suffix}</span>
                          </div>
                        </div>
                      </Motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Empty State */}
              {leaderboard.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <Trophy className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">{t('customerLeaderboard.emptyTitle')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('customerLeaderboard.emptyDescription')}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
