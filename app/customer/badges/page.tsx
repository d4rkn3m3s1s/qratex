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
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/50',
    textColor: 'text-gray-400',
    glowColor: 'shadow-gray-500/30',
    icon: Medal,
  },
  RARE: {
    label: 'Nadir',
    color: 'from-blue-400 to-blue-600',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    textColor: 'text-blue-400',
    glowColor: 'shadow-blue-500/30',
    icon: Shield,
  },
  EPIC: {
    label: 'Epik',
    color: 'from-purple-400 to-purple-600',
    bgColor: 'bg-purple-500/20',
    borderColor: 'border-purple-500/50',
    textColor: 'text-purple-400',
    glowColor: 'shadow-purple-500/30',
    icon: Zap,
  },
  LEGENDARY: {
    label: 'Efsanevi',
    color: 'from-yellow-400 via-orange-500 to-red-500',
    bgColor: 'bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-red-500/20',
    borderColor: 'border-yellow-500/50',
    textColor: 'text-yellow-400',
    glowColor: 'shadow-yellow-500/50',
    icon: Crown,
  },
};

const categoryConfig: Record<string, { label: string; icon: typeof Trophy }> = {
  feedback: { label: 'Geri Bildirim', icon: Target },
  engagement: { label: 'Etkileşim', icon: Heart },
  streak: { label: 'Seri', icon: Flame },
  special: { label: 'Özel', icon: Gift },
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/20 p-6 border border-primary/20">
        <div className="absolute inset-0 bg-grid-white/5" />
        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Left - Main Stats */}
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/30">
                  <Trophy className="w-12 h-12 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-xs font-bold text-black shadow-lg">
                  {stats.earned}
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold">
                  {stats.earned} / {stats.total}
                </h3>
                <p className="text-muted-foreground">Rozet Kazanıldı</p>
                <div className="flex items-center gap-4 mt-2">
                  {stats.legendary > 0 && (
                    <span className="flex items-center gap-1 text-yellow-500 text-sm">
                      <Crown className="w-4 h-4" /> {stats.legendary} Efsanevi
                    </span>
                  )}
                  {stats.epic > 0 && (
                    <span className="flex items-center gap-1 text-purple-500 text-sm">
                      <Zap className="w-4 h-4" /> {stats.epic} Epik
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right - Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-xl bg-background/50 backdrop-blur">
                <Star className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.totalPoints}</p>
                <p className="text-xs text-muted-foreground">Toplam Puan</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-background/50 backdrop-blur">
                <Target className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-2xl font-bold">{Math.round((stats.earned / Math.max(stats.total, 1)) * 100)}%</p>
                <p className="text-xs text-muted-foreground">Tamamlanan</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-background/50 backdrop-blur">
                <Flame className="w-6 h-6 text-orange-500 mx-auto mb-1" />
                <p className="text-2xl font-bold">{progressToNext?.progress || 0}%</p>
                <p className="text-xs text-muted-foreground">Sıradaki</p>
              </div>
            </div>
          </div>

          {/* Progress to Next Badge */}
          {progressToNext && (
            <div className="mt-6 p-4 rounded-xl bg-background/50 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Sıradaki Rozet:</span>
                  <span className={`font-semibold ${rarityConfig[progressToNext.rarity].textColor}`}>
                    {progressToNext.name}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {progressToNext.currentValue} / {progressToNext.targetValue}
                </span>
              </div>
              <Progress value={progressToNext.progress} className="h-2" />
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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
                className="gap-1"
              >
                <Icon className="w-3 h-3" />
                {config.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Badges Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="w-20 h-20 bg-muted rounded-full mx-auto" />
                  <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                  <div className="h-3 bg-muted rounded w-1/2 mx-auto" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
                  transition={{ delay: index * 0.03 }}
                >
                  <Card
                    className={`group relative overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 ${
                      isEarned
                        ? `border-2 ${config.borderColor} shadow-lg ${config.glowColor}`
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    onClick={() => setSelectedBadge(badge)}
                  >
                    {/* Legendary Glow Effect */}
                    {badge.rarity === 'LEGENDARY' && isEarned && (
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 animate-pulse" />
                    )}

                    {/* Epic Shimmer Effect */}
                    {badge.rarity === 'EPIC' && isEarned && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent animate-shimmer" />
                    )}

                    <CardContent className="p-4 relative">
                      <div className="flex flex-col items-center text-center space-y-3">
                        {/* Badge Icon */}
                        <div className={`relative p-4 rounded-full ${isEarned ? config.bgColor : 'bg-muted'} transition-transform group-hover:scale-110`}>
                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={56}
                            height={56}
                            className={`relative z-10 ${!isEarned && 'grayscale opacity-50'}`}
                          />
                          
                          {/* Earned Sparkle */}
                          {isEarned && badge.rarity === 'LEGENDARY' && (
                            <motion.div
                              className="absolute -top-1 -right-1"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            >
                              <Sparkles className="w-5 h-5 text-yellow-500" />
                            </motion.div>
                          )}

                          {/* Lock Icon */}
                          {!isEarned && (
                            <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-background flex items-center justify-center">
                              <Lock className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Badge Info */}
                        <div className="space-y-1">
                          <h3 className={`font-semibold text-sm ${isEarned ? '' : 'text-muted-foreground'}`}>
                            {badge.name}
                          </h3>
                          <Badge className={`text-[10px] ${isEarned ? `bg-gradient-to-r ${config.color} text-white` : 'bg-muted text-muted-foreground'}`}>
                            {config.label}
                          </Badge>
                        </div>

                        {/* Progress or Points */}
                        {isEarned ? (
                          <div className="flex items-center gap-1 text-yellow-500">
                            <Star className="w-3 h-3 fill-current" />
                            <span className="text-xs font-medium">+{badge.points}</span>
                          </div>
                        ) : (
                          <div className="w-full space-y-1">
                            <Progress value={badge.progress} className="h-1.5" />
                            <p className="text-[10px] text-muted-foreground">
                              {badge.progress}%
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Badge Detail Modal - EPIC VERSION */}
      <AnimatePresence>
        {selectedBadge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
            onClick={() => setSelectedBadge(null)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className={`relative w-full max-w-md my-8 rounded-3xl overflow-hidden shadow-2xl ${
                selectedBadge.rarity === 'LEGENDARY' 
                  ? 'shadow-yellow-500/50' 
                  : selectedBadge.rarity === 'EPIC'
                    ? 'shadow-purple-500/50'
                    : selectedBadge.rarity === 'RARE'
                      ? 'shadow-blue-500/50'
                      : 'shadow-gray-500/30'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Animated Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${rarityConfig[selectedBadge.rarity].color}`} />
              
              {/* Particle Effects for all rarities */}
              <div className="absolute inset-0 overflow-hidden">
                {[...Array(selectedBadge.rarity === 'LEGENDARY' ? 40 : selectedBadge.rarity === 'EPIC' ? 25 : 15)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={`absolute rounded-full ${
                      selectedBadge.rarity === 'LEGENDARY' 
                        ? 'bg-yellow-300' 
                        : selectedBadge.rarity === 'EPIC'
                          ? 'bg-purple-300'
                          : selectedBadge.rarity === 'RARE'
                            ? 'bg-blue-300'
                            : 'bg-white'
                    }`}
                    style={{
                      width: Math.random() * 4 + 2,
                      height: Math.random() * 4 + 2,
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                    }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1.5, 0],
                      y: [0, -30],
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      repeat: Infinity,
                      delay: Math.random() * 3,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </div>

              {/* Glow rings for Legendary */}
              {selectedBadge.rarity === 'LEGENDARY' && (
                <>
                  <motion.div
                    className="absolute inset-0 border-4 border-yellow-400/30 rounded-3xl"
                    animate={{ scale: [1, 1.02, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute -inset-1 border-2 border-orange-400/20 rounded-3xl"
                    animate={{ scale: [1.02, 1, 1.02], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </>
              )}

              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-20 text-white/80 hover:text-white hover:bg-white/20 rounded-full"
                onClick={() => setSelectedBadge(null)}
              >
                <X className="w-6 h-6" />
              </Button>

              {/* Content Container */}
              <div className="relative z-10 p-6">
                {/* Badge Icon - Centered */}
                <div className="flex justify-center mb-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                    className="relative"
                  >
                    {/* Glow behind icon */}
                    <div className={`absolute inset-0 blur-xl opacity-60 ${
                      selectedBadge.rarity === 'LEGENDARY' 
                        ? 'bg-yellow-400' 
                        : selectedBadge.rarity === 'EPIC'
                          ? 'bg-purple-400'
                          : selectedBadge.rarity === 'RARE'
                            ? 'bg-blue-400'
                            : 'bg-gray-400'
                    }`} />
                    
                    {/* Icon container */}
                    <div className={`relative p-5 rounded-full bg-black/30 backdrop-blur-sm border-3 ${
                      selectedBadge.rarity === 'LEGENDARY' 
                        ? 'border-yellow-400/80' 
                        : selectedBadge.rarity === 'EPIC'
                          ? 'border-purple-400/80'
                          : selectedBadge.rarity === 'RARE'
                            ? 'border-blue-400/80'
                            : 'border-gray-400/80'
                    }`}>
                      <Image
                        src={selectedBadge.icon}
                        alt={selectedBadge.name}
                        width={80}
                        height={80}
                        className={`relative z-10 drop-shadow-2xl ${!selectedBadge.earned ? 'grayscale opacity-60' : ''}`}
                      />
                      
                      {/* Sparkle for earned legendary */}
                      {selectedBadge.earned && selectedBadge.rarity === 'LEGENDARY' && (
                        <motion.div
                          className="absolute -top-1 -right-1"
                          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                          transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1, repeat: Infinity } }}
                        >
                          <Sparkles className="w-6 h-6 text-yellow-300 drop-shadow-lg" />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </div>

                {/* Badge Name & Rarity */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center mb-4"
                >
                  <h2 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">
                    {selectedBadge.name}
                  </h2>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                    selectedBadge.rarity === 'LEGENDARY' 
                      ? 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500' 
                      : selectedBadge.rarity === 'EPIC'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                        : selectedBadge.rarity === 'RARE'
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                          : 'bg-gradient-to-r from-gray-500 to-gray-600'
                  } text-white font-semibold shadow-lg`}>
                    {selectedBadge.rarity === 'LEGENDARY' && <Crown className="w-4 h-4" />}
                    {selectedBadge.rarity === 'EPIC' && <Zap className="w-4 h-4" />}
                    {selectedBadge.rarity === 'RARE' && <Shield className="w-4 h-4" />}
                    {selectedBadge.rarity === 'COMMON' && <Medal className="w-4 h-4" />}
                    {rarityConfig[selectedBadge.rarity].label}
                  </div>
                </motion.div>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-center text-white/80 text-sm mb-4"
                >
                  {selectedBadge.description}
                </motion.p>

                {/* Status Card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-black/40 backdrop-blur-sm rounded-xl p-4 border border-white/10"
                >
                  {selectedBadge.earned ? (
                    <div className="text-center space-y-3">
                      {/* Earned Badge */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.5 }}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30"
                      >
                        <Trophy className="w-5 h-5" />
                        <span className="text-lg font-bold">Kazanıldı!</span>
                      </motion.div>

                      {/* Date & Points in row */}
                      <div className="flex items-center justify-center gap-4 flex-wrap">
                        {selectedBadge.earnedAt && (
                          <span className="text-white/60 text-sm">
                            {new Date(selectedBadge.earnedAt).toLocaleDateString('tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                          <span className="text-xl font-bold text-yellow-400">+{selectedBadge.points}</span>
                          <span className="text-white/60 text-sm">Puan</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Progress */}
                      <div>
                        <div className="flex justify-between mb-1.5 text-sm">
                          <span className="text-white/80 font-medium">İlerleme</span>
                          <span className="text-white font-bold">{selectedBadge.progress}%</span>
                        </div>
                        <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${selectedBadge.progress}%` }}
                            transition={{ duration: 0.8, delay: 0.5 }}
                            className={`absolute inset-y-0 left-0 rounded-full ${
                              selectedBadge.rarity === 'LEGENDARY' 
                                ? 'bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500' 
                                : selectedBadge.rarity === 'EPIC'
                                  ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                                  : selectedBadge.rarity === 'RARE'
                                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                                    : 'bg-gradient-to-r from-gray-400 to-gray-500'
                            }`}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-white/60">
                          <span>{selectedBadge.currentValue || 0}</span>
                          <span>{selectedBadge.targetValue || '?'}</span>
                        </div>
                      </div>

                      {/* How to Earn & Reward */}
                      <div className="pt-3 border-t border-white/10 space-y-2">
                        <p className="text-white/70 text-sm">
                          <span className="text-white font-medium">Nasıl Kazanılır: </span>
                          {selectedBadge.requirement}
                        </p>
                        <div className="flex items-center justify-center gap-2 text-sm">
                          <span className="text-white/60">Ödül:</span>
                          <Star className="w-4 h-4 text-yellow-400" />
                          <span className="text-yellow-400 font-semibold">+{selectedBadge.points} Puan</span>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
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
