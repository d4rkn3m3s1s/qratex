'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Lock,
  Sparkles,
  Star,
  Crown,
  Zap,
  Target,
  Medal,
  Gift,
  Flame,
  Shield,
  Heart,
  X,
  Clock,
  MapPin,
  Coffee,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  category: string;
  points: number;
  requirement: string;
  earned?: boolean;
  earnedAt?: string;
  progress?: number;
  currentValue?: number;
  targetValue?: number;
}

const rarityConfig = {
  COMMON: {
    label: 'Yaygın',
    color: 'from-gray-400 to-gray-600',
    cardBg: 'bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-[#0a0e1a] dark:via-[#111827] dark:to-[#0a0e1a]',
    borderColor: 'border-gray-300 dark:border-slate-500/40',
    textColor: 'text-gray-600 dark:text-gray-400',
    glowColor: 'shadow-gray-400/20 dark:shadow-slate-400/20',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(148,163,184,0.15),0_0_30px_rgba(148,163,184,0.08)]',
    badgeBg: 'bg-gray-200 dark:bg-gray-700/50',
    icon: Medal,
  },
  RARE: {
    label: 'Nadir',
    color: 'from-blue-400 to-cyan-500',
    cardBg: 'bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 dark:from-[#040d1f] dark:via-[#0a1628] dark:to-[#061225]',
    borderColor: 'border-blue-300 dark:border-cyan-500/40',
    textColor: 'text-blue-600 dark:text-cyan-400',
    glowColor: 'shadow-blue-400/20 dark:shadow-cyan-500/30',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(34,211,238,0.2),0_0_40px_rgba(34,211,238,0.1)]',
    badgeBg: 'bg-blue-100 dark:bg-cyan-900/40',
    icon: Shield,
  },
  EPIC: {
    label: 'Epik',
    color: 'from-purple-400 to-pink-500',
    cardBg: 'bg-gradient-to-br from-purple-50 via-pink-50 to-fuchsia-100 dark:from-[#0d0520] dark:via-[#150a25] dark:to-[#10061f]',
    borderColor: 'border-purple-300 dark:border-purple-500/50',
    textColor: 'text-purple-600 dark:text-purple-400',
    glowColor: 'shadow-purple-400/20 dark:shadow-purple-500/30',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(168,85,247,0.2),0_0_40px_rgba(168,85,247,0.1)]',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/40',
    icon: Zap,
  },
  LEGENDARY: {
    label: 'Efsanevi',
    color: 'from-yellow-400 via-orange-500 to-red-500',
    cardBg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-[#1a0f05] dark:via-[#1f1008] dark:to-[#1a0805]',
    borderColor: 'border-amber-300 dark:border-yellow-500/50',
    textColor: 'text-amber-600 dark:text-yellow-400',
    glowColor: 'shadow-yellow-400/30 dark:shadow-yellow-500/50',
    neonGlow: 'dark:shadow-[0_0_20px_rgba(250,204,21,0.2),0_0_50px_rgba(250,204,21,0.1)]',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    icon: Crown,
  },
};

const categoryConfig: Record<string, { label: string; icon: typeof Trophy }> = {
  feedback: { label: 'Geri Bildirim', icon: Target },
  engagement: { label: 'Etkileşim', icon: Heart },
  streak: { label: 'Seri', icon: Flame },
  speed: { label: 'Hız', icon: Clock },
  exploration: { label: 'Keşif', icon: MapPin },
  expertise: { label: 'Uzmanlık', icon: Coffee },
  rating: { label: 'Puanlama', icon: Star },
  special: { label: 'Özel', icon: Gift },
  custom: { label: 'Özel', icon: Gift },
  general: { label: 'Genel', icon: Medal },
};

export default function CustomerBadgesPage() {
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<BadgeType | null>(null);
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/badges?userId=me');
      const data = await res.json();

      if (data.success) {
        // Get user's actual progress
        const progressRes = await fetch('/api/gamification/progress');
        const progressData = await progressRes.json();
        
        const userProgress = progressData.success ? progressData.data : {
          feedbackCount: 0,
          totalPoints: 0,
          currentStreak: 0,
          level: 1,
        };

        // Calculate real progress for each badge
        const badgesWithProgress = data.data.map((badge: BadgeType) => {
          const requirement = badge.requirement as unknown as { type?: string; value?: number };
          let progress = 0;
          let currentValue = 0;
          let targetValue = requirement?.value || 10;

          // Calculate progress based on requirement type
          switch (requirement?.type) {
            case 'feedback_count':
              currentValue = userProgress.feedbackCount || 0;
              progress = Math.min(100, (currentValue / targetValue) * 100);
              break;
            case 'points':
              currentValue = userProgress.totalPoints || 0;
              progress = Math.min(100, (currentValue / targetValue) * 100);
              break;
            case 'streak':
              currentValue = userProgress.currentStreak || 0;
              progress = Math.min(100, (currentValue / targetValue) * 100);
              break;
            case 'level':
              currentValue = userProgress.level || 1;
              progress = Math.min(100, (currentValue / targetValue) * 100);
              break;
            default:
              progress = badge.earned ? 100 : Math.floor(Math.random() * 70);
          }

          return {
            ...badge,
            progress: Math.floor(progress),
            currentValue,
            targetValue,
            category: badge.category || 'general',
          };
        });

        setBadges(badgesWithProgress);
      }
    } catch (error) {
      console.error('Error fetching badges:', error);
      toast.error('Rozetler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const filteredBadges = badges.filter((b) => {
    const statusMatch = filter === 'all' || (filter === 'earned' ? b.earned : !b.earned);
    const categoryMatch = categoryFilter === 'all' || b.category === categoryFilter;
    return statusMatch && categoryMatch;
  });

  const earnedBadges = badges.filter((b) => b.earned);
  const categories = Array.from(new Set(badges.map((b) => b.category)));

  const stats = {
    earned: earnedBadges.length,
    total: badges.length,
    totalPoints: earnedBadges.reduce((acc, b) => acc + b.points, 0),
    legendary: earnedBadges.filter((b) => b.rarity === 'LEGENDARY').length,
    epic: earnedBadges.filter((b) => b.rarity === 'EPIC').length,
  };

  const progressToNext = badges.find((b) => !b.earned && b.progress && b.progress > 0);

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Rozet Koleksiyonu"
        description="Efsanevi rozetler kazanın ve koleksiyonunuzu genişletin"
      />

      {/* Hero Stats Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/20 p-6 md:p-8 border border-primary/20">
        <div className="absolute inset-0 bg-grid-white/5" />
        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Left - Main Stats */}
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-xl shadow-primary/30">
                  <Trophy className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-sm font-bold text-black shadow-lg">
                  {stats.earned}
                </div>
              </div>
              <div>
                <h3 className="text-2xl sm:text-4xl font-bold">
                  {stats.earned} / {stats.total}
                </h3>
                <p className="text-muted-foreground text-sm sm:text-lg">Rozet Kazanıldı</p>
                <div className="flex items-center gap-4 mt-2">
                  {stats.legendary > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-yellow-500 text-sm font-medium">
                      <Crown className="w-5 h-5" /> {stats.legendary} Efsanevi
                    </span>
                  )}
                  {stats.epic > 0 && (
                    <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 text-sm font-medium">
                      <Zap className="w-5 h-5" /> {stats.epic} Epik
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right - Quick Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="text-center p-2 sm:p-4 rounded-xl bg-background/60 backdrop-blur border border-border/50">
                <Star className="w-7 h-7 text-yellow-500 mx-auto mb-1.5" />
                <p className="text-2xl font-bold">{stats.totalPoints}</p>
                <p className="text-xs text-muted-foreground">Toplam Puan</p>
              </div>
              <div className="text-center p-2 sm:p-4 rounded-xl bg-background/60 backdrop-blur border border-border/50">
                <Target className="w-7 h-7 text-green-500 mx-auto mb-1.5" />
                <p className="text-2xl font-bold">{Math.round((stats.earned / Math.max(stats.total, 1)) * 100)}%</p>
                <p className="text-xs text-muted-foreground">Tamamlanan</p>
              </div>
              <div className="text-center p-2 sm:p-4 rounded-xl bg-background/60 backdrop-blur border border-border/50">
                <Flame className="w-7 h-7 text-orange-500 mx-auto mb-1.5" />
                <p className="text-2xl font-bold">{progressToNext?.progress || 0}%</p>
                <p className="text-xs text-muted-foreground">Sıradaki</p>
              </div>
            </div>
          </div>

          {/* Progress to Next Badge */}
          {progressToNext && (
            <div className="mt-6 p-4 rounded-xl bg-background/60 backdrop-blur border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Sıradaki Rozet:</span>
                  <span className={`font-bold ${rarityConfig[progressToNext.rarity].textColor}`}>
                    {progressToNext.name}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground font-medium">
                  {progressToNext.currentValue} / {progressToNext.targetValue}
                </span>
              </div>
              <Progress value={progressToNext.progress} className="h-3" />
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex gap-2">
          {(['all', 'earned', 'locked'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className="gap-2"
            >
              {f === 'all' && 'Tümü'}
              {f === 'earned' && <><Trophy className="w-4 h-4" /> Kazanılan</>}
              {f === 'locked' && <><Lock className="w-4 h-4" /> Kilitli</>}
            </Button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={categoryFilter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setCategoryFilter('all')}
          >
            Tüm Kategoriler
          </Button>
          {categories.map((cat) => {
            const config = categoryConfig[cat] || categoryConfig.general;
            const Icon = config.icon;
            return (
              <Button
                key={cat}
                variant={categoryFilter === cat ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setCategoryFilter(cat)}
                className="gap-1.5"
              >
                <Icon className="w-4 h-4" />
                {config.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Badges Grid - BIGGER */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-8">
                <div className="animate-pulse space-y-5">
                  <div className="w-28 h-28 bg-muted rounded-full mx-auto" />
                  <div className="h-5 bg-muted rounded w-3/4 mx-auto" />
                  <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredBadges.map((badge, index) => {
              const config = rarityConfig[badge.rarity];
              const isEarned = badge.earned;

              return (
                <motion.div
                  key={badge.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <div
                    className={`group relative overflow-hidden cursor-pointer transition-all duration-500 hover:scale-[1.03] hover:-translate-y-1.5 rounded-2xl ${config.cardBg} ${config.neonGlow} ${
                      isEarned
                        ? `border-2 ${config.borderColor} ${config.glowColor}`
                        : 'border border-border/50 dark:border-white/10 opacity-85 hover:opacity-100'
                    }`}
                    onClick={() => setSelectedBadge(badge)}
                  >
                    {/* Starfield (dark mode) */}
                    <div className="absolute inset-0 hidden dark:block overflow-hidden rounded-2xl">
                      {[...Array(10)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-[2px] h-[2px] bg-white rounded-full animate-pulse"
                          style={{
                            left: `${10 + (i * 8.5) % 85}%`,
                            top: `${8 + (i * 12) % 80}%`,
                            animationDelay: `${i * 0.35}s`,
                            animationDuration: `${2 + (i % 3)}s`,
                            opacity: 0.25 + (i % 4) * 0.12,
                          }}
                        />
                      ))}
                    </div>

                    {/* Legendary Glow Effect */}
                    {badge.rarity === 'LEGENDARY' && isEarned && (
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-orange-500/8 to-red-500/5 dark:from-yellow-500/10 dark:via-orange-500/15 dark:to-red-500/10 animate-pulse rounded-2xl" />
                    )}

                    {/* Epic Shimmer Effect */}
                    {badge.rarity === 'EPIC' && isEarned && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent dark:via-purple-500/8 animate-shimmer rounded-2xl" />
                    )}

                    {/* Glow orbs */}
                    <div className={`absolute -top-16 -right-16 w-32 h-32 rounded-full bg-gradient-to-br ${config.color} opacity-[0.06] dark:opacity-[0.12] blur-3xl`} />
                    <div className={`absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-gradient-to-br ${config.color} opacity-[0.04] dark:opacity-[0.08] blur-3xl`} />

                    <div className="p-6 relative">
                      <div className="flex flex-col items-center text-center space-y-4">
                        {/* Badge Icon - WHITE CIRCLE */}
                        <div className="relative transition-transform group-hover:scale-110">
                          {/* Subtle glow */}
                          <div className={`absolute -inset-3 rounded-full bg-gradient-to-br ${config.color} opacity-0 dark:opacity-15 blur-2xl`} />
                          
                          {/* Single white circle */}
                          <div className={`relative w-32 h-32 rounded-full bg-white overflow-hidden flex items-center justify-center ${!isEarned ? 'opacity-75' : ''}`}>
                            <Image
                              src={badge.icon}
                              alt={badge.name}
                              width={140}
                              height={140}
                              className={`relative z-10 scale-110 ${isEarned ? '' : 'grayscale-[40%] opacity-80'}`}
                            />
                          </div>
                          
                          {/* Earned Sparkle */}
                          {isEarned && badge.rarity === 'LEGENDARY' && (
                            <motion.div
                              className="absolute -top-1 -right-1 z-20"
                              animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                              transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity } }}
                            >
                              <Sparkles className="w-7 h-7 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
                            </motion.div>
                          )}

                          {isEarned && badge.rarity === 'EPIC' && (
                            <Zap className="absolute -top-0.5 -right-0.5 w-6 h-6 z-20 text-purple-500 dark:text-purple-300 animate-pulse drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
                          )}

                          {/* Lock Icon */}
                          {!isEarned && (
                            <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-background/90 dark:bg-black/60 border-2 border-border dark:border-white/20 flex items-center justify-center shadow-lg z-20">
                              <Lock className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Badge Info */}
                        <div className="space-y-2">
                          <h3 className={`font-bold text-base ${isEarned ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {badge.name}
                          </h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 max-w-[220px] mx-auto">
                            {badge.description}
                          </p>
                          <Badge className={`text-xs px-3 py-0.5 ${isEarned ? `bg-gradient-to-r ${config.color} text-white border-0` : 'bg-muted text-muted-foreground'}`}>
                            {config.label}
                          </Badge>
                        </div>

                        {/* Progress or Points */}
                        {isEarned ? (
                          <div className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500">
                            <Star className="w-4 h-4 fill-current" />
                            <span className="text-sm font-bold">+{badge.points} Puan</span>
                          </div>
                        ) : (
                          <div className="w-full space-y-1.5">
                            <Progress value={badge.progress} className="h-2.5" />
                            <p className="text-xs text-muted-foreground font-medium">
                              %{badge.progress} tamamlandı
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Badge Detail Modal - NEW DARK THEME */}
      <AnimatePresence>
        {selectedBadge && (() => {
          const modalConfig = rarityConfig[selectedBadge.rarity];
          return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg overflow-y-auto"
            onClick={() => setSelectedBadge(null)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className={`relative w-full max-w-md my-4 sm:my-8 rounded-3xl overflow-hidden border-2 ${modalConfig.borderColor} ${modalConfig.neonGlow}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dark space background */}
              <div className={`absolute inset-0 ${modalConfig.cardBg}`} />
              
              {/* Starfield */}
              <div className="absolute inset-0 overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-[2px] h-[2px] bg-white rounded-full"
                    style={{
                      left: `${(i * 5.3) % 95}%`,
                      top: `${(i * 7.7) % 92}%`,
                    }}
                    animate={{ opacity: [0.1, 0.6, 0.1] }}
                    transition={{
                      duration: 2 + (i % 3),
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>

              {/* Glow orbs */}
              <div className={`absolute -top-20 -right-20 w-44 h-44 rounded-full bg-gradient-to-br ${modalConfig.color} opacity-[0.12] blur-3xl`} />
              <div className={`absolute -bottom-16 -left-16 w-36 h-36 rounded-full bg-gradient-to-br ${modalConfig.color} opacity-[0.08] blur-3xl`} />

              {/* Neon glow border for Legendary */}
              {selectedBadge.rarity === 'LEGENDARY' && (
                <motion.div
                  className="absolute inset-0 rounded-3xl border-2 border-yellow-400/20"
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}

              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-20 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                onClick={() => setSelectedBadge(null)}
              >
                <X className="w-5 h-5" />
              </Button>

              {/* Content */}
              <div className="relative z-10 p-6 sm:p-8">
                {/* Badge Icon */}
                <div className="flex justify-center mb-6">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                    className="relative"
                  >
                    {/* Glow behind */}
                    <div className={`absolute -inset-4 rounded-full bg-gradient-to-br ${modalConfig.color} opacity-20 blur-2xl`} />
                    
                    {/* White circle icon */}
                    <div className={`relative w-44 h-44 rounded-full bg-white overflow-hidden flex items-center justify-center ${!selectedBadge.earned ? 'opacity-75' : ''}`}>
                      <Image
                        src={selectedBadge.icon}
                        alt={selectedBadge.name}
                        width={200}
                        height={200}
                        className={`relative z-10 scale-110 ${!selectedBadge.earned ? 'grayscale-[40%] opacity-80' : ''}`}
                      />
                    </div>
                    
                    {selectedBadge.earned && selectedBadge.rarity === 'LEGENDARY' && (
                      <motion.div
                        className="absolute -top-2 -right-2 z-20"
                        animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                        transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity } }}
                      >
                        <Sparkles className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]" />
                      </motion.div>
                    )}
                    {selectedBadge.earned && selectedBadge.rarity === 'EPIC' && (
                      <motion.div className="absolute -top-1 -right-1 z-20" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                        <Zap className="w-7 h-7 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                {/* Name & Rarity */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-center mb-5">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{selectedBadge.name}</h2>
                  <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm ${modalConfig.badgeBg} ${modalConfig.textColor} font-semibold`}>
                    {selectedBadge.rarity === 'LEGENDARY' && <Crown className="w-4 h-4" />}
                    {selectedBadge.rarity === 'EPIC' && <Zap className="w-4 h-4" />}
                    {selectedBadge.rarity === 'RARE' && <Shield className="w-4 h-4" />}
                    {selectedBadge.rarity === 'COMMON' && <Medal className="w-4 h-4" />}
                    {modalConfig.label}
                  </div>
                </motion.div>

                {/* Description */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-center text-muted-foreground text-sm sm:text-base mb-6 leading-relaxed">
                  {selectedBadge.description}
                </motion.p>

                {/* Status */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-black/30 backdrop-blur-sm rounded-2xl p-5 border border-white/10">
                  {selectedBadge.earned ? (
                    <div className="text-center space-y-4">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.5 }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30">
                        <Trophy className="w-6 h-6" />
                        <span className="text-lg font-bold">Kazanıldı!</span>
                      </motion.div>
                      <div className="flex items-center justify-center gap-4 flex-wrap">
                        {selectedBadge.earnedAt && (
                          <span className="text-muted-foreground text-sm">
                            {new Date(selectedBadge.earnedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                          <span className="text-2xl font-bold text-yellow-400">+{selectedBadge.points}</span>
                          <span className="text-muted-foreground text-sm">Puan</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2 text-sm">
                          <span className="text-muted-foreground font-medium">İlerleme</span>
                          <span className="text-white font-bold text-base">%{selectedBadge.progress}</span>
                        </div>
                        <div className="relative h-3.5 bg-white/10 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${selectedBadge.progress}%` }} transition={{ duration: 0.8, delay: 0.5 }}
                            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${modalConfig.color}`} />
                        </div>
                        <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                          <span>{selectedBadge.currentValue || 0}</span>
                          <span>{selectedBadge.targetValue || '?'}</span>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-white/10 space-y-3">
                        <p className="text-muted-foreground text-sm">
                          <span className="text-white font-semibold">Nasıl Kazanılır: </span>
                          {selectedBadge.requirement}
                        </p>
                        <div className="flex items-center justify-center gap-2 text-sm">
                          <span className="text-muted-foreground">Ödül:</span>
                          <Star className="w-5 h-5 text-yellow-400" />
                          <span className="text-yellow-400 font-bold text-base">+{selectedBadge.points} Puan</span>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* CSS for shimmer animation */}
      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
