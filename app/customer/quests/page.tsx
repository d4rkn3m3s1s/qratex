'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Clock,
  Star,
  CheckCircle,
  Trophy,
  Zap,
  Flame,
  Calendar,
  CalendarDays,
  Sparkles,
  Gift,
  ChevronRight,
  Timer,
  Award,
  Crown,
  TrendingUp,
  RefreshCw,
  Filter,
  Lock,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/admin-toast';
import confetti from 'canvas-confetti';
import { CHART_BRAND, CHART_HEX } from '@/lib/chart-palette';
import { useAppT } from '@/lib/app-locale';

interface Quest {
  id: string;
  name: string;
  description: string;
  type: string; // Can be DAILY, WEEKLY, MONTHLY, SPECIAL or lowercase variants
  target: number;
  reward: { points: number; xp: number } | number;
  progress: number;
  completed: boolean;
  claimed?: boolean;
  expiresAt: string | null;
  difficulty?: 'easy' | 'medium' | 'hard';
  icon?: string;
}

// Helper to get reward points
const getRewardPoints = (reward: Quest['reward']): number => {
  if (typeof reward === 'number') return reward;
  return reward?.points || 0;
};

// Helper to get reward XP
const getRewardXP = (reward: Quest['reward']): number => {
  if (typeof reward === 'number') return Math.floor(reward / 2);
  return reward?.xp || 0;
};

const typeConfigData = {
  label: 'Daily',
  icon: Calendar,
  color: 'from-green-500 to-emerald-500',
  bgColor: 'bg-green-500/10',
  borderColor: 'border-green-500/30',
  textColor: 'text-green-500',
  badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const buildTypeConfig = (t: (key: string) => string): Record<string, typeof typeConfigData> => ({
  DAILY: {
    label: t('customerQuests.types.daily'),
    icon: Calendar,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-500',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  daily: {
    label: t('customerQuests.types.daily'),
    icon: Calendar,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-500',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  WEEKLY: {
    label: t('customerQuests.types.weekly'),
    icon: CalendarDays,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-500',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  weekly: {
    label: t('customerQuests.types.weekly'),
    icon: CalendarDays,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-500',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  MONTHLY: {
    label: t('customerQuests.types.monthly'),
    icon: Trophy,
    color: 'from-primary to-primary/80',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    textColor: 'text-primary',
    badgeClass: 'border-primary/30 bg-primary/20 text-primary',
  },
  monthly: {
    label: t('customerQuests.types.monthly'),
    icon: Trophy,
    color: 'from-primary to-primary/80',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    textColor: 'text-primary',
    badgeClass: 'border-primary/30 bg-primary/20 text-primary',
  },
  SPECIAL: {
    label: t('customerQuests.types.special'),
    icon: Sparkles,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-500',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  special: {
    label: t('customerQuests.types.special'),
    icon: Sparkles,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-500',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
});

// Default config for unknown types
const defaultTypeConfig = {
  label: 'Quest',
  icon: Target,
  color: 'from-gray-500 to-slate-500',
  bgColor: 'bg-gray-500/10',
  borderColor: 'border-gray-500/30',
  textColor: 'text-gray-500',
  badgeClass: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const difficultyConfig = {
  easy: { label: 'Easy', color: 'text-green-500', stars: 1 },
  medium: { label: 'Medium', color: 'text-yellow-500', stars: 2 },
  hard: { label: 'Hard', color: 'text-red-500', stars: 3 },
};

// Calculate time remaining
const getTimeRemaining = (expiresAt: string | null, t: (key: string) => string): string => {
  if (!expiresAt) return '';
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  
  if (diff <= 0) return t('customerQuests.expired');
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} ${t('customerQuests.daysLeft')}`;
  }
  
  return `${hours}${t('customerQuests.hourShort')} ${minutes}${t('customerQuests.minuteShort')} ${t('customerQuests.left')}`;
};

export default function CustomerQuestsPage() {
  const t = useAppT();
  const typeConfig = buildTypeConfig(t);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'SPECIAL'>('all');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  const fetchQuests = useCallback(async () => {
    try {
      const res = await fetch('/api/gamification/quests?userId=me', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();

      if (data.success) {
        const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
        const questsWithProgress = data.data.map((quest: Quest, index: number) => ({
          ...quest,
          difficulty: difficulties[index % 3],
        }));
        setQuests(questsWithProgress);
      }
    } catch (error) {
      toast.error(t('customerQuests.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch streak
  const fetchStreak = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/trends', { cache: 'no-store' });
      const data = await res.json();
      if (data?.insights?.currentStreak) {
        setStreak(data.insights.currentStreak);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchQuests();
    fetchStreak();
  }, [fetchQuests, fetchStreak]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchQuests();
    toast.success(t('customerQuests.refreshed'));
  };

  const handleClaimReward = async (quest: Quest) => {
    if (quest.claimed || claimingId) return;
    
    setClaimingId(quest.id);

    try {
      const response = await fetch(`/api/gamification/quests/${quest.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        toast.error(data.error || t('customerQuests.claimError'));
        return;
      }

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: [CHART_BRAND, CHART_HEX.green, CHART_HEX.yellow, CHART_HEX.red],
      });

      const points = data?.data?.reward?.points ?? getRewardPoints(quest.reward);
      const xp = data?.data?.reward?.xp ?? getRewardXP(quest.reward);

      toast.success(t('customerQuests.claimedTitle'), {
        description: `+${points} ${t('customerQuests.points')}, +${xp} XP ${t('customerQuests.earned')}`,
      });

      setQuests((prev) =>
        prev.map((q) => (q.id === quest.id ? { ...q, claimed: true } : q))
      );
    } catch {
      toast.error(t('customerQuests.claimError'));
    } finally {
      setClaimingId(null);
    }
  };

  const filteredQuests = filter === 'all' 
    ? quests 
    : quests.filter(q => q.type.toUpperCase() === filter.toUpperCase());
    
  const activeQuests = filteredQuests.filter((q) => !q.completed);
  const completedQuests = filteredQuests.filter((q) => q.completed);

  const stats = {
    total: quests.length,
    active: quests.filter(q => !q.completed).length,
    completed: quests.filter(q => q.completed).length,
    claimed: quests.filter(q => q.claimed).length,
    totalRewards: quests.filter(q => q.completed).reduce((acc, q) => acc + getRewardPoints(q.reward), 0),
    totalXP: quests.filter(q => q.completed).reduce((acc, q) => acc + getRewardXP(q.reward), 0),
  };

  // Calculate daily progress
  const dailyQuests = quests.filter(q => q.type === 'DAILY' || q.type === 'daily');
  const dailyCompleted = dailyQuests.filter(q => q.completed).length;
  const dailyProgress = dailyQuests.length > 0 ? (dailyCompleted / dailyQuests.length) * 100 : 0;

  return (
    <div className="space-y-4 md:space-y-6 pb-6 md:pb-6">
      <DashboardPageHeading
        title={t('customerQuests.title')}
        description={t('customerQuests.description')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5 sm:gap-2 min-h-10 touch-manipulation shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </Button>
        }
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('customerQuests.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {t('customerQuests.description')}
        </p>
      </div>

      <DashboardPageHeroChrome tone="auto" padded={false}>
        <div className="relative p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Daily Progress */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                <div className="shrink-0 rounded-lg bg-gradient-to-br from-primary to-primary/80 p-2.5 shadow-lg sm:rounded-xl sm:p-3">
                  <Target className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-balance">{t('customerQuests.dailyQuests')}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground text-pretty">
                    {dailyCompleted}/{dailyQuests.length} {t('customerQuests.completed')}
                  </p>
                </div>
              </div>
              
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">{t('customerQuests.progress')}</span>
                  <span className="font-medium">{Math.round(dailyProgress)}%</span>
                </div>
                <div className="relative">
                  <Progress value={dailyProgress} className="h-2.5 sm:h-3" />
                  {dailyProgress === 100 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -right-1 -top-1"
                    >
                      <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
                    </motion.div>
                  )}
                </div>
              </div>
              
              {dailyProgress === 100 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 sm:mt-4 p-2.5 sm:p-3 rounded-lg bg-green-500/10 border border-green-500/20"
                >
                  <p className="text-xs sm:text-sm text-green-500 font-medium flex items-center gap-1.5 sm:gap-2">
                    <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    {t('customerQuests.dailyAllDone')}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Streak & Stats */}
            <div className="flex flex-row md:flex-col justify-center gap-3 sm:gap-4">
              <div className="flex-1 md:flex-none p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/20">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <motion.div
                    animate={streak > 0 ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    <Flame className={`h-6 w-6 sm:h-8 sm:w-8 ${streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-muted-foreground'}`} />
                  </motion.div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold">{streak} {t('customerQuests.day')}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{t('customerQuests.activeStreak')}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 sm:gap-3">
                <div className="flex-1 p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-muted/50 text-center">
                  <p className="text-base sm:text-lg font-bold text-primary">{stats.completed}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">{t('customerQuests.completed')}</p>
                </div>
                <div className="flex-1 p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-muted/50 text-center">
                  <p className="text-base sm:text-lg font-bold text-yellow-500">{stats.totalRewards}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">{t('customerQuests.points')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardPageHeroChrome>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: t('customerQuests.activeQuest'), value: stats.active, icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
          { label: t('customerQuests.completed'), value: stats.completed, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: t('customerQuests.earnedPoints'), value: stats.totalRewards, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { label: t('customerQuests.earnedXp'), value: stats.totalXP, icon: Zap, color: 'text-primary', bg: 'bg-primary/10' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl ${stat.bg}`}>
                    <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="flex-1 overflow-x-auto">
          <TabsList className="h-9 sm:h-10 w-full sm:w-auto">
            <TabsTrigger value="all" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden xs:inline">{t('customerQuests.all')}</span>
            </TabsTrigger>
            <TabsTrigger value="DAILY" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{t('customerQuests.types.daily')}</span>
            </TabsTrigger>
            <TabsTrigger value="WEEKLY" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{t('customerQuests.types.weekly')}</span>
            </TabsTrigger>
            <TabsTrigger value="MONTHLY" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{t('customerQuests.types.monthly')}</span>
            </TabsTrigger>
            <TabsTrigger value="SPECIAL" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{t('customerQuests.types.special')}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Badge variant="outline" className="hidden sm:flex gap-1 shrink-0">
          {filteredQuests.length} {t('customerQuests.quest')}
        </Badge>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 sm:p-6">
                <div className="animate-pulse space-y-3 sm:space-y-4">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 bg-muted rounded-lg sm:rounded-xl" />
                    <div className="flex-1 space-y-1.5 sm:space-y-2">
                      <div className="h-4 bg-muted rounded w-2/3" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-2 sm:h-3 bg-muted rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* Active Quests */}
          {activeQuests.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <h2 className="text-base sm:text-lg font-semibold">{t('customerQuests.activeQuests')}</h2>
                <Badge variant="outline" className="text-[10px] sm:text-xs">{activeQuests.length}</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <AnimatePresence mode="popLayout">
                  {activeQuests.map((quest, index) => {
                    const progressPercent = Math.min((quest.progress / quest.target) * 100, 100);
                    const config = typeConfig[quest.type] || defaultTypeConfig;
                    const difficulty = quest.difficulty ? difficultyConfig[quest.difficulty] : null;
                    const TypeIcon = config.icon;
                    
                    return (
                      <motion.div
                        key={quest.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: Math.min(index, 10) * 0.05 }}
                      >
                        <Card className={`h-full overflow-hidden border ${config.borderColor} active:scale-[0.98] hover:shadow-lg transition-all group`}>
                          {/* Progress bar at top */}
                          <div className="h-1 bg-muted">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPercent}%` }}
                              transition={{ duration: 0.5, delay: index * 0.1 }}
                              className={`h-full bg-gradient-to-r ${config.color}`}
                            />
                          </div>
                          
                          <CardContent className="p-3 sm:p-5">
                            <div className="flex gap-3 sm:gap-4">
                              {/* Icon */}
                              <div className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl ${config.bgColor} self-start group-hover:scale-110 transition-transform`}>
                                <TypeIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${config.textColor}`} />
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
                                <div>
                                  <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                    <h3 className="font-semibold text-sm sm:text-base truncate">{quest.name}</h3>
                                    <Badge className={`${config.badgeClass} text-[10px] sm:text-xs`} variant="outline">
                                      {config.label}
                                    </Badge>
                                  </div>
                                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                    {quest.description}
                                  </p>
                                </div>

                                {/* Progress */}
                                <div className="space-y-1 sm:space-y-1.5">
                                  <div className="flex justify-between text-xs sm:text-sm">
                                    <span className="font-medium">
                                      {quest.progress} / {quest.target}
                                    </span>
                                    <span className={`font-medium ${config.textColor}`}>
                                      {Math.round(progressPercent)}%
                                    </span>
                                  </div>
                                  <Progress value={progressPercent} className="h-1.5 sm:h-2" />
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between pt-1.5 sm:pt-2">
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    {/* Rewards */}
                                    <div className="flex items-center gap-0.5 sm:gap-1">
                                      <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 fill-yellow-500" />
                                      <span className="text-xs sm:text-sm font-medium">{getRewardPoints(quest.reward)}</span>
                                    </div>
                                    <div className="flex items-center gap-0.5 sm:gap-1">
                                      <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                                      <span className="text-xs sm:text-sm font-medium">{getRewardXP(quest.reward)}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Time / Difficulty */}
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    {difficulty && (
                                      <div className="hidden sm:flex items-center gap-0.5">
                                        {[...Array(3)].map((_, i) => (
                                          <Star
                                            key={i}
                                            className={`h-2.5 w-2.5 sm:h-3 sm:w-3 ${i < difficulty.stars ? difficulty.color : 'text-muted'} ${i < difficulty.stars ? 'fill-current' : ''}`}
                                          />
                                        ))}
                                      </div>
                                    )}
                                    {quest.expiresAt && (
                                      <Badge variant="outline" className="text-[9px] sm:text-[10px] gap-0.5 sm:gap-1 px-1.5 sm:px-2">
                                        <Timer className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                        {getTimeRemaining(quest.expiresAt, t)}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Completed Quests */}
          {completedQuests.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                <h2 className="text-base sm:text-lg font-semibold">{t('customerQuests.completedQuests')}</h2>
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] sm:text-xs">
                  {completedQuests.length}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <AnimatePresence mode="popLayout">
                  {completedQuests.map((quest, index) => {
                    const config = typeConfig[quest.type] || defaultTypeConfig;
                    const TypeIcon = config.icon;
                    
                    return (
                      <motion.div
                        key={quest.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: Math.min(index, 10) * 0.05 }}
                      >
                        <Card className={`h-full overflow-hidden active:scale-[0.98] ${quest.claimed ? 'opacity-60' : 'border-green-500/30'}`}>
                          {/* Completed bar */}
                          <div className={`h-1 ${quest.claimed ? 'bg-muted' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`} />
                          
                          <CardContent className="p-3 sm:p-5">
                            <div className="flex items-center gap-3 sm:gap-4">
                              {/* Icon */}
                              <div className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl ${quest.claimed ? 'bg-muted' : 'bg-green-500/10'}`}>
                                {quest.claimed ? (
                                  <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                                ) : (
                                  <Gift className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />
                                )}
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                  <h3 className={`font-semibold text-sm sm:text-base truncate ${quest.claimed ? 'text-muted-foreground' : ''}`}>
                                    {quest.name}
                                  </h3>
                                  <Badge className={`${quest.claimed ? 'bg-muted text-muted-foreground' : config.badgeClass} text-[10px] sm:text-xs`} variant="outline">
                                    {config.label}
                                  </Badge>
                                </div>
                                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                  {quest.description}
                                </p>
                              </div>
                              
                              {/* Claim Button */}
                              {!quest.claimed ? (
                                <Button
                                  onClick={() => handleClaimReward(quest)}
                                  disabled={claimingId === quest.id}
                                  className="gap-1.5 sm:gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shrink-0 h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm"
                                >
                                  {claimingId === quest.id ? (
                                    <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                      <span className="hidden sm:inline">{t('customerQuests.claimReward')}</span>
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <Badge variant="secondary" className="gap-1 shrink-0 text-[10px] sm:text-xs">
                                  <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  {t('customerQuests.claimed')}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Rewards info */}
                            {!quest.claimed && (
                              <div className="flex items-center gap-3 sm:gap-4 mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-dashed">
                                <div className="flex items-center gap-1 sm:gap-1.5">
                                  <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 fill-yellow-500" />
                                  <span className="text-xs sm:text-sm font-medium">+{getRewardPoints(quest.reward)}</span>
                                </div>
                                <div className="flex items-center gap-1 sm:gap-1.5">
                                  <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                                  <span className="text-xs sm:text-sm font-medium">+{getRewardXP(quest.reward)}</span>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}

          {filteredQuests.length === 0 && (
            <Card>
              <CardContent className="p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Target className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
                </div>
                <h3 className="font-semibold text-sm sm:text-base mb-1">{t('customerQuests.notFound')}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                  {filter !== 'all'
                    ? `${(typeConfig[filter] || defaultTypeConfig).label} ${t('customerQuests.notFoundTypeSuffix')}`
                    : t('customerQuests.noActiveHint')}
                </p>
                {filter !== 'all' ? (
                  <Button variant="outline" onClick={() => setFilter('all')} className="min-h-10 touch-manipulation w-full sm:w-auto text-xs sm:text-sm">
                    {t('customerQuests.showAll')}
                  </Button>
                ) : (
                  <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 w-full">
                    <Button asChild variant="outline" size="sm" className="gap-1.5 w-full min-h-10 touch-manipulation text-xs sm:text-sm sm:flex-1">
                      <Link href="/customer/consumptions">{t('customerQuests.myConsumptions')}</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-1.5 w-full min-h-10 touch-manipulation text-xs sm:text-sm sm:flex-1">
                      <Link href="/customer/feedbacks">{t('customerQuests.myFeedbacks')}</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
