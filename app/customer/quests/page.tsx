'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

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
  label: 'Günlük',
  icon: Calendar,
  color: 'from-green-500 to-emerald-500',
  bgColor: 'bg-green-500/10',
  borderColor: 'border-green-500/30',
  textColor: 'text-green-500',
  badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const typeConfig: Record<string, typeof typeConfigData> = {
  DAILY: {
    label: 'Günlük',
    icon: Calendar,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-500',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  daily: {
    label: 'Günlük',
    icon: Calendar,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-500',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  WEEKLY: {
    label: 'Haftalık',
    icon: CalendarDays,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-500',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  weekly: {
    label: 'Haftalık',
    icon: CalendarDays,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-500',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  MONTHLY: {
    label: 'Aylık',
    icon: Trophy,
    color: 'from-purple-500 to-violet-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-500',
    badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  monthly: {
    label: 'Aylık',
    icon: Trophy,
    color: 'from-purple-500 to-violet-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-500',
    badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  SPECIAL: {
    label: 'Özel',
    icon: Sparkles,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-500',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  special: {
    label: 'Özel',
    icon: Sparkles,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-500',
    badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
};

// Default config for unknown types
const defaultTypeConfig = {
  label: 'Görev',
  icon: Target,
  color: 'from-gray-500 to-slate-500',
  bgColor: 'bg-gray-500/10',
  borderColor: 'border-gray-500/30',
  textColor: 'text-gray-500',
  badgeClass: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const difficultyConfig = {
  easy: { label: 'Kolay', color: 'text-green-500', stars: 1 },
  medium: { label: 'Orta', color: 'text-yellow-500', stars: 2 },
  hard: { label: 'Zor', color: 'text-red-500', stars: 3 },
};

// Calculate time remaining
const getTimeRemaining = (expiresAt: string | null): string => {
  if (!expiresAt) return '';
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  
  if (diff <= 0) return 'Süresi doldu';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} gün kaldı`;
  }
  
  return `${hours}s ${minutes}d kaldı`;
};

export default function CustomerQuestsPage() {
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
        // Add progress simulation and difficulty
        const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
        const questsWithProgress = data.data.map((quest: Quest, index: number) => ({
          ...quest,
          progress: index === 0 ? quest.target : Math.floor(Math.random() * quest.target),
          completed: index === 0,
          claimed: false,
          difficulty: difficulties[index % 3],
        }));
        setQuests(questsWithProgress);
      }
    } catch (error) {
      toast.error('Görevler yüklenemedi');
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
    toast.success('Görevler güncellendi');
  };

  const handleClaimReward = async (quest: Quest) => {
    if (quest.claimed || claimingId) return;
    
    setClaimingId(quest.id);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Confetti effect
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#8b5cf6', '#22c55e', '#eab308', '#ef4444'],
    });
    
    const points = getRewardPoints(quest.reward);
    const xp = getRewardXP(quest.reward);
    
    toast.success('🎉 Ödül alındı!', {
      description: `+${points} puan, +${xp} XP kazandınız!`,
    });
    
    // Update quest as claimed
    setQuests(prev => prev.map(q => 
      q.id === quest.id ? { ...q, claimed: true } : q
    ));
    
    setClaimingId(null);
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
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      <DashboardHeader
        title="Görevler"
        description="Günlük görevleri tamamlayarak puan ve XP kazanın"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5 sm:gap-2 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
        }
      />

      {/* Hero Banner */}
      <Card className="relative overflow-hidden border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10" />
        <div className="absolute -right-8 -top-8 sm:-right-10 sm:-top-10 w-28 sm:w-40 h-28 sm:h-40 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -left-8 -bottom-8 sm:-left-10 sm:-bottom-10 w-24 sm:w-32 h-24 sm:h-32 bg-purple-500/20 rounded-full blur-3xl" />
        
        <CardContent className="relative p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Daily Progress */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-purple-600 shadow-lg">
                  <Target className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Günlük Görevler</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {dailyCompleted}/{dailyQuests.length} tamamlandı
                  </p>
                </div>
              </div>
              
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">İlerleme</span>
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
                    Tüm günlük görevler tamamlandı! 🎉
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
                    <p className="text-xl sm:text-2xl font-bold">{streak} gün</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Aktif Seri</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 sm:gap-3">
                <div className="flex-1 p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-muted/50 text-center">
                  <p className="text-base sm:text-lg font-bold text-primary">{stats.completed}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Tamamlanan</p>
                </div>
                <div className="flex-1 p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-muted/50 text-center">
                  <p className="text-base sm:text-lg font-bold text-yellow-500">{stats.totalRewards}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">Puan</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Aktif Görev', value: stats.active, icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Tamamlanan', value: stats.completed, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Kazanılan Puan', value: stats.totalRewards, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
          { label: 'Kazanılan XP', value: stats.totalXP, icon: Zap, color: 'text-pink-500', bg: 'bg-pink-500/10' },
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
              <span className="hidden xs:inline">Tümü</span>
            </TabsTrigger>
            <TabsTrigger value="DAILY" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Günlük</span>
            </TabsTrigger>
            <TabsTrigger value="WEEKLY" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Haftalık</span>
            </TabsTrigger>
            <TabsTrigger value="MONTHLY" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Aylık</span>
            </TabsTrigger>
            <TabsTrigger value="SPECIAL" className="gap-1 px-2 sm:px-3 text-xs sm:text-sm">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Özel</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Badge variant="outline" className="hidden sm:flex gap-1 shrink-0">
          {filteredQuests.length} görev
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
                <h2 className="text-base sm:text-lg font-semibold">Aktif Görevler</h2>
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
                        transition={{ delay: index * 0.05 }}
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
                                      <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" />
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
                                        {getTimeRemaining(quest.expiresAt)}
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
                <h2 className="text-base sm:text-lg font-semibold">Tamamlanan Görevler</h2>
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
                        transition={{ delay: index * 0.05 }}
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
                                      <span className="hidden sm:inline">Ödül Al</span>
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <Badge variant="secondary" className="gap-1 shrink-0 text-[10px] sm:text-xs">
                                  <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                  Alındı
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
                                  <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" />
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
                <h3 className="font-semibold text-sm sm:text-base mb-1">Görev bulunamadı</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                  {filter !== 'all' 
                    ? `${(typeConfig[filter] || defaultTypeConfig).label} görevi bulunmuyor` 
                    : 'Henüz aktif görev yok'}
                </p>
                {filter !== 'all' && (
                  <Button variant="outline" onClick={() => setFilter('all')} className="h-9 sm:h-10 text-xs sm:text-sm">
                    Tüm Görevleri Göster
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
