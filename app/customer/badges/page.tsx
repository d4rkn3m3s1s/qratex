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
  Search,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { BADGE_RARITY_DARK } from '@/lib/badge-rarity-surfaces';
import { TW_BRAND_GRADIENT_STOPS_SOFT } from '@/lib/tw-brand-classes';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { CharacterCard } from '@/components/customer/character-card';
import { CharacterLeaderboard } from '@/components/customer/character-leaderboard';

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  category: string;
  points: number;
  pointCost?: number | null;
  requirement: string;
  earned?: boolean;
  earnedAt?: string;
  progress?: number;
  currentValue?: number;
  targetValue?: number;
}

const rarityConfig = {
  COMMON: {
    labelKey: 'customerBadges.rarity.common',
    color: 'from-gray-400 to-gray-600',
    cardBg: `bg-gradient-to-br from-slate-50 via-white to-slate-100 ${BADGE_RARITY_DARK.slate}`,
    borderColor: 'border-slate-300/80 dark:border-slate-500/40',
    textColor: 'text-slate-700 dark:text-gray-400',
    glowColor: 'shadow-gray-400/20 dark:shadow-slate-400/20',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(148,163,184,0.15),0_0_30px_rgba(148,163,184,0.08)]',
    badgeBg: 'bg-slate-100 dark:bg-gray-700/50',
    icon: Medal,
  },
  RARE: {
    labelKey: 'customerBadges.rarity.rare',
    color: 'from-blue-400 to-cyan-500',
    cardBg: `bg-gradient-to-br from-sky-50/90 via-white to-blue-100/90 ${BADGE_RARITY_DARK.blue}`,
    borderColor: 'border-sky-300/90 dark:border-cyan-500/40',
    textColor: 'text-sky-700 dark:text-cyan-400',
    glowColor: 'shadow-blue-400/20 dark:shadow-cyan-500/30',
    neonGlow: 'dark:shadow-[0_0_15px_rgba(34,211,238,0.2),0_0_40px_rgba(34,211,238,0.1)]',
    badgeBg: 'bg-sky-100 dark:bg-cyan-900/40',
    icon: Shield,
  },
  EPIC: {
    labelKey: 'customerBadges.rarity.epic',
    color: TW_BRAND_GRADIENT_STOPS_SOFT,
    cardBg: `bg-gradient-to-br from-primary/[0.06] via-white to-primary/10 ${BADGE_RARITY_DARK.epic}`,
    borderColor: 'border-primary/40 dark:border-primary/50',
    textColor: 'text-primary dark:text-primary',
    glowColor: 'shadow-primary/20 dark:shadow-primary/30',
    neonGlow: 'dark:shadow-[0_0_15px_hsl(var(--primary)_/_0.25),0_0_40px_hsl(var(--primary)_/_0.12)]',
    badgeBg: 'bg-primary/15 dark:bg-primary/25',
    icon: Zap,
  },
  LEGENDARY: {
    labelKey: 'customerBadges.rarity.legendary',
    color: 'from-yellow-400 via-orange-500 to-red-500',
    cardBg: `bg-gradient-to-br from-amber-50/90 via-white to-orange-100/90 ${BADGE_RARITY_DARK.ember}`,
    borderColor: 'border-amber-400/90 dark:border-yellow-500/50',
    textColor: 'text-amber-700 dark:text-yellow-400',
    glowColor: 'shadow-yellow-400/30 dark:shadow-yellow-500/50',
    neonGlow: 'dark:shadow-[0_0_20px_rgba(250,204,21,0.2),0_0_50px_rgba(250,204,21,0.1)]',
    badgeBg: 'bg-yellow-100 dark:bg-amber-900/40',
    icon: Crown,
  },
};

const categoryConfig: Record<string, { labelKey: string; icon: typeof Trophy }> = {
  dizi: { labelKey: 'customerBadges.category.dizi', icon: Sparkles },
  diger: { labelKey: 'customerBadges.category.diger', icon: Gift },
  etkinlik: { labelKey: 'customerBadges.category.etkinlik', icon: Target },
  sadakat: { labelKey: 'customerBadges.category.sadakat', icon: Heart },
  feedback: { labelKey: 'customerBadges.category.feedback', icon: Target },
  engagement: { labelKey: 'customerBadges.category.engagement', icon: Heart },
  streak: { labelKey: 'customerBadges.category.streak', icon: Flame },
  speed: { labelKey: 'customerBadges.category.speed', icon: Clock },
  exploration: { labelKey: 'customerBadges.category.exploration', icon: MapPin },
  expertise: { labelKey: 'customerBadges.category.expertise', icon: Coffee },
  rating: { labelKey: 'customerBadges.category.rating', icon: Star },
  special: { labelKey: 'customerBadges.category.special', icon: Gift },
  custom: { labelKey: 'customerBadges.category.custom', icon: Gift },
  general: { labelKey: 'customerBadges.category.general', icon: Medal },
};

const CATEGORY_DISPLAY_ORDER = [
  'feedback', 'engagement', 'speed', 'exploration', 'streak', 'rating', 'expertise', 'special', 'general',
  'dizi', 'etkinlik', 'sadakat', 'diger', 'custom',
];

export default function CustomerBadgesPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeType | null>(null);
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    fetchBadges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBadges = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/badges?userId=me');
      const data = await res.json();

      if (data.success) {
        setUserPoints(typeof data.userPoints === 'number' ? data.userPoints : 0);
        const badgesWithProgress = data.data.map((badge: BadgeType) => {
          const normalizedCategory = badge.category || 'general';
          return {
            ...badge,
            // Boş/eksik ikon next/image'i patlatır (boş src) ve önizleme görünmez kalırdı.
            icon: typeof badge.icon === 'string' && badge.icon.trim() !== '' ? badge.icon : '/logo/logo.png',
            progress: typeof badge.progress === 'number' ? Math.floor(badge.progress) : (badge.earned ? 100 : 0),
            currentValue: typeof badge.currentValue === 'number' ? badge.currentValue : 0,
            targetValue: typeof badge.targetValue === 'number' ? badge.targetValue : 10,
            category: normalizedCategory,
          };
        });

        setBadges(badgesWithProgress);
      }
    } catch (error) {
      console.error('Error fetching badges:', error);
      toast.error(t('customerBadges.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const filteredBadges = badges.filter((b) => {
    const statusMatch = filter === 'all' || (filter === 'earned' ? b.earned : !b.earned);
    const categoryMatch = categoryFilter === 'all' || b.category === categoryFilter;
    const q = searchQuery.trim().toLowerCase();
    const searchMatch =
      q === '' ||
      b.name.toLowerCase().includes(q) ||
      (b.description?.toLowerCase().includes(q) ?? false);
    return statusMatch && categoryMatch && searchMatch;
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
  const getCategoryLabel = (category: string) => t((categoryConfig[category] || categoryConfig.general).labelKey);
  const getRarityLabel = (rarity: BadgeType['rarity']) => t(rarityConfig[rarity].labelKey);

  const handleUnlockWithPoints = async (badge: BadgeType) => {
    const cost = badge.pointCost ?? 0;
    if (cost <= 0 || userPoints < cost) return;
    setUnlockingId(badge.id);
    try {
      const res = await fetch(`/api/gamification/badges/${badge.id}/unlock`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUserPoints(data.data?.newPoints ?? userPoints - cost);
        await fetchBadges();
        toast.success(`${badge.name} ${t('customerBadges.unlockSuccessSuffix')}`);
      } else {
        toast.error(data.error || t('customerBadges.unlockError'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setUnlockingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title={t('customerBadges.title')}
        description={t('customerBadges.description')}
      />

      {/* AI karakter rozeti — yorumlara göre atanan dizi/film karakteri */}
      <CharacterCard />

      {/* Karakter liderliği — en nadir karakterler / bu hafta en çok kazananlar */}
      <CharacterLeaderboard />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('customerBadges.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {t('customerBadges.description')}
        </p>
      </div>

      {/* How to earn badges */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 sm:p-5">
          <h3 className="font-semibold text-sm sm:text-base mb-2 flex items-center gap-2 text-balance">
            <Sparkles className="w-4 h-4 shrink-0 text-primary" />
            {t('customerBadges.howToEarnTitle')}
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li><strong className="text-foreground">{t('customerBadges.autoEarnLabel')}:</strong> {t('customerBadges.autoEarnDescription')}</li>
            <li><strong className="text-foreground">{t('customerBadges.unlockWithPointsLabel')}:</strong> {t('customerBadges.unlockWithPointsDescription')}</li>
          </ul>
        </CardContent>
      </Card>

      <DashboardPageHeroChrome tone="auto" padded={false}>
        <div className="relative space-y-6 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Left - Main Stats */}
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-xl shadow-primary/30 sm:h-28 sm:w-28">
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
                <p className="text-muted-foreground text-sm sm:text-lg">{t('customerBadges.badgesEarned')}</p>
                <div className="flex items-center gap-4 mt-2">
                  {stats.legendary > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-yellow-500 text-sm font-medium">
                      <Crown className="w-5 h-5" /> {stats.legendary} {t('customerBadges.rarity.legendary')}
                    </span>
                  )}
                  {stats.epic > 0 && (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                      <Zap className="w-5 h-5" /> {stats.epic} {t('customerBadges.rarity.epic')}
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
                <p className="text-xs text-muted-foreground">{t('customerBadges.totalPoints')}</p>
              </div>
              <div className="text-center p-2 sm:p-4 rounded-xl bg-background/60 backdrop-blur border border-border/50">
                <Target className="w-7 h-7 text-green-500 mx-auto mb-1.5" />
                <p className="text-2xl font-bold">{Math.round((stats.earned / Math.max(stats.total, 1)) * 100)}%</p>
                <p className="text-xs text-muted-foreground">{t('customerBadges.completed')}</p>
              </div>
              <div className="text-center p-2 sm:p-4 rounded-xl bg-background/60 backdrop-blur border border-border/50">
                <Flame className="w-7 h-7 text-orange-500 mx-auto mb-1.5" />
                <p className="text-2xl font-bold">{progressToNext?.progress || 0}%</p>
                <p className="text-xs text-muted-foreground">{t('customerBadges.next')}</p>
              </div>
            </div>
          </div>

          {/* Progress to Next Badge */}
          {progressToNext && (
            <div className="rounded-xl border border-border/50 bg-background/60 p-4 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('customerBadges.nextBadge')}:</span>
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
      </DashboardPageHeroChrome>

      {/* Arama */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('customerBadges.searchPlaceholder')}
          aria-label={t('customerBadges.searchPlaceholder')}
          className="flex h-10 w-full rounded-md border border-border/80 bg-background pl-9 pr-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/25 dark:bg-white/[0.07]"
        />
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
              className={`gap-2 min-h-10 touch-manipulation ${filter !== f ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 dark:bg-transparent dark:border-border dark:text-inherit' : ''}`}
            >
              {f === 'all' && t('common.all')}
              {f === 'earned' && <><Trophy className="w-4 h-4" /> {t('customerBadges.earned')}</>}
              {f === 'locked' && <><Lock className="w-4 h-4" /> {t('customerBadges.locked')}</>}
            </Button>
          ))}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={categoryFilter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setCategoryFilter('all')}
            className={categoryFilter === 'all' ? 'min-h-10 touch-manipulation' : 'min-h-10 touch-manipulation bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 dark:bg-transparent dark:border-0'}
          >
            {t('customerBadges.allCategories')}
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
                className={`gap-1.5 min-h-10 touch-manipulation ${categoryFilter !== cat ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 dark:bg-transparent dark:border-0' : ''}`}
              >
                <Icon className="w-4 h-4" />
                {getCategoryLabel(cat)}
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
      ) : categoryFilter === 'all' ? (
        /* Kategoriler halinde gruplu liste */
        <div className="space-y-10">
          {[
            ...CATEGORY_DISPLAY_ORDER,
            ...Array.from(new Set(filteredBadges.map((b) => b.category))).filter((c) => !CATEGORY_DISPLAY_ORDER.includes(c)),
          ].filter((cat) => filteredBadges.some((b) => b.category === cat)).map((cat) => {
            const catBadges = filteredBadges.filter((b) => b.category === cat);
            const config = categoryConfig[cat] || categoryConfig.general;
            const Icon = config.icon;
            return (
              <div key={cat}>
                <h3 className="flex items-center gap-2 text-lg font-semibold mb-4 text-foreground">
                  <Icon className="w-5 h-5 text-primary" />
                  {getCategoryLabel(cat)}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence mode="popLayout">
                    {catBadges.map((badge, index) => {
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
                              isEarned ? `border-2 ${config.borderColor} ${config.glowColor}` : 'border-2 border-slate-300/70 dark:border-white/10 bg-slate-50/80 dark:bg-transparent shadow-sm'
                            }`}
                            onClick={() => setSelectedBadge(badge)}
                          >
                            <div className="absolute inset-0 hidden dark:block overflow-hidden rounded-2xl">
                              {[...Array(10)].map((_, i) => (
                                <div key={i} className="absolute w-[2px] h-[2px] bg-white rounded-full animate-pulse" style={{ left: `${10 + (i * 8.5) % 85}%`, top: `${8 + (i * 12) % 80}%`, animationDelay: `${i * 0.35}s`, animationDuration: `${2 + (i % 3)}s`, opacity: 0.25 + (i % 4) * 0.12 }} />
                              ))}
                            </div>
                            {badge.rarity === 'LEGENDARY' && isEarned && <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-orange-500/8 to-red-500/5 dark:from-yellow-500/10 dark:via-orange-500/15 dark:to-red-500/10 animate-pulse rounded-2xl" />}
                            {badge.rarity === 'EPIC' && isEarned && <div className="absolute inset-0 animate-shimmer rounded-2xl bg-gradient-to-r from-transparent via-primary/5 to-transparent dark:via-primary/[0.08]" />}
                            <div className={`absolute -top-16 -right-16 w-32 h-32 rounded-full bg-gradient-to-br ${config.color} opacity-[0.06] dark:opacity-[0.12] blur-3xl`} />
                            <div className={`absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-gradient-to-br ${config.color} opacity-[0.04] dark:opacity-[0.08] blur-3xl`} />
                            <div className="p-6 relative">
                              <div className="flex flex-col items-center text-center space-y-4">
                                <div className="relative transition-transform group-hover:scale-110">
                                  <div className={`absolute -inset-3 rounded-full bg-gradient-to-br ${config.color} opacity-0 dark:opacity-15 blur-2xl`} />
                                  <div className={`relative w-32 h-32 rounded-full bg-slate-100 dark:bg-white overflow-hidden flex items-center justify-center ring-2 ring-slate-200/80 dark:ring-white/15 shadow-[inset_0_2px_10px_rgba(15,23,42,0.08)] ${!isEarned ? 'opacity-80' : ''}`}>
                                    <Image src={badge.icon} alt={badge.name} width={140} height={140} className={`relative z-10 scale-110 drop-shadow-sm dark:drop-shadow-none ${isEarned ? '' : 'grayscale-[40%] opacity-80'}`} />
                                  </div>
                                  {isEarned && badge.rarity === 'LEGENDARY' && <motion.div className="absolute -top-1 -right-1 z-20" animate={{ rotate: 360, scale: [1, 1.2, 1] }} transition={{ rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity } }}><Sparkles className="w-7 h-7 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]" /></motion.div>}
                                  {isEarned && badge.rarity === 'EPIC' && <Zap className="absolute -right-0.5 -top-0.5 z-20 h-6 w-6 animate-pulse text-primary drop-shadow-[0_0_6px_hsl(var(--primary)_/_0.45)]" />}
                                  {!isEarned && <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-slate-100 dark:bg-black/60 border-2 border-slate-400/60 dark:border-white/20 flex items-center justify-center shadow-md z-20"><Lock className="w-4 h-4 text-muted-foreground" /></div>}
                                </div>
                                <div className="space-y-2">
                                  <h3 className={`font-bold text-base ${isEarned ? 'text-foreground' : 'text-slate-600 dark:text-muted-foreground'}`}>{badge.name}</h3>
                                  <p className="text-xs text-slate-500 dark:text-muted-foreground line-clamp-2 max-w-[220px] mx-auto leading-relaxed">{badge.description}</p>
                                  <Badge className={`text-xs px-3 py-0.5 ${isEarned ? `bg-gradient-to-r ${config.color} text-white border-0` : 'bg-muted text-muted-foreground'}`}>{getRarityLabel(badge.rarity)}</Badge>
                                  <div className="pt-1"><Badge variant="outline" className="text-[10px]">{getCategoryLabel(badge.category)}</Badge></div>
                                </div>
                                {isEarned ? (
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-100 text-amber-700 dark:bg-yellow-500/10 dark:text-yellow-500"><Star className="w-4 h-4 fill-current" /><span className="text-sm font-bold">+{badge.points} {t('customerBadges.points')}</span></div>
                                ) : (
                                  <div className="w-full space-y-1.5">
                                    {badge.pointCost != null && badge.pointCost > 0 ? (
                                      <>
                                        <Button size="sm" variant="secondary" className="w-full gap-1.5 min-h-10 touch-manipulation" disabled={userPoints < badge.pointCost || unlockingId === badge.id} onClick={(e) => { e.stopPropagation(); handleUnlockWithPoints(badge); }}><Gift className="w-4 h-4" />{unlockingId === badge.id ? t('customerBadges.unlocking') : `${badge.pointCost} ${t('customerBadges.unlockWithPointsSuffix')}`}</Button>
                                        {userPoints < badge.pointCost && <p className="text-xs text-muted-foreground">{badge.pointCost - userPoints} {t('customerBadges.pointsMoreNeeded')}</p>}
                                      </>
                                    ) : (
                                      <>
                                        <Progress value={badge.progress} className="h-2.5 bg-slate-300/80 dark:bg-secondary" indicatorClassName="bg-gradient-to-r from-primary to-primary/75" />
                                        <p className="text-xs text-slate-600 dark:text-muted-foreground font-medium">%{badge.progress} {t('customerBadges.completedLower')}</p>
                                      </>
                                    )}
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
              </div>
            );
          })}
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
                        : 'border-2 border-slate-300/70 dark:border-white/10 bg-slate-50/80 dark:bg-transparent shadow-sm'
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
                      <div className="absolute inset-0 animate-shimmer rounded-2xl bg-gradient-to-r from-transparent via-primary/5 to-transparent dark:via-primary/[0.08]" />
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
                          
                          {/* Light mode: bg-slate-100 + ring so SVG contrasts; dark: white circle */}
                          <div className={`relative w-32 h-32 rounded-full bg-slate-100 dark:bg-white overflow-hidden flex items-center justify-center ring-2 ring-slate-200/80 dark:ring-white/15 shadow-[inset_0_2px_10px_rgba(15,23,42,0.08)] ${!isEarned ? 'opacity-80' : ''}`}>
                            <Image
                              src={badge.icon}
                              alt={badge.name}
                              width={140}
                              height={140}
                              className={`relative z-10 scale-110 drop-shadow-sm dark:drop-shadow-none ${isEarned ? '' : 'grayscale-[40%] opacity-80'}`}
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
                            <Zap className="absolute -right-0.5 -top-0.5 z-20 h-6 w-6 animate-pulse text-primary drop-shadow-[0_0_6px_hsl(var(--primary)_/_0.45)]" />
                          )}

                          {/* Lock Icon */}
                          {!isEarned && (
                            <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-slate-100 dark:bg-black/60 border-2 border-slate-400/60 dark:border-white/20 flex items-center justify-center shadow-md z-20">
                              <Lock className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Badge Info */}
                        <div className="space-y-2">
                          <h3 className={`font-bold text-base ${isEarned ? 'text-foreground' : 'text-slate-600 dark:text-muted-foreground'}`}>
                            {badge.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-muted-foreground line-clamp-2 max-w-[220px] mx-auto leading-relaxed">
                            {badge.description}
                          </p>
                          <Badge className={`text-xs px-3 py-0.5 ${isEarned ? `bg-gradient-to-r ${config.color} text-white border-0` : 'bg-muted text-muted-foreground'}`}>
                            {getRarityLabel(badge.rarity)}
                          </Badge>
                          <div className="pt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {getCategoryLabel(badge.category)}
                            </Badge>
                          </div>
                        </div>

                        {/* Progress or Points */}
                        {isEarned ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-100 text-amber-700 dark:bg-yellow-500/10 dark:text-yellow-500">
                            <Star className="w-4 h-4 fill-current" />
                            <span className="text-sm font-bold">+{badge.points} {t('customerBadges.points')}</span>
                          </div>
                        ) : (
                          <div className="w-full space-y-1.5">
                            {badge.pointCost != null && badge.pointCost > 0 ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="w-full gap-1.5 min-h-10 touch-manipulation"
                                  disabled={userPoints < badge.pointCost || unlockingId === badge.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnlockWithPoints(badge);
                                  }}
                                >
                                  <Gift className="w-4 h-4" />
                                  {unlockingId === badge.id ? t('customerBadges.unlocking') : `${badge.pointCost} ${t('customerBadges.unlockWithPointsSuffix')}`}
                                </Button>
                                {userPoints < badge.pointCost && (
                                  <p className="text-xs text-muted-foreground">
                                    {badge.pointCost - userPoints} {t('customerBadges.pointsMoreNeeded')}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <Progress
                                  value={badge.progress}
                                  className="h-2.5 bg-slate-300/80 dark:bg-secondary"
                                  indicatorClassName="bg-gradient-to-r from-primary to-primary/75"
                                />
                                <p className="text-xs text-slate-600 dark:text-muted-foreground font-medium">
                                  %{badge.progress} {t('customerBadges.completedLower')}
                                </p>
                              </>
                            )}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/85 backdrop-blur-md overflow-y-auto"
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
              <div className="absolute inset-0 overflow-hidden hidden dark:block">
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
                className="absolute top-4 right-4 z-20 text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-full"
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
                    
                    {/* Light: slate-100 + ring for contrast; dark: white */}
                    <div className={`relative w-44 h-44 rounded-full bg-slate-100 dark:bg-white overflow-hidden flex items-center justify-center ring-2 ring-slate-200/80 dark:ring-white/20 ${!selectedBadge.earned ? 'opacity-75' : ''}`}>
                      <Image
                        src={selectedBadge.icon}
                        alt={selectedBadge.name}
                        width={200}
                        height={200}
                        className={`relative z-10 scale-110 drop-shadow-sm dark:drop-shadow-none ${!selectedBadge.earned ? 'grayscale-[40%] opacity-80' : ''}`}
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
                        <Zap className="h-7 w-7 text-primary drop-shadow-[0_0_8px_hsl(var(--primary)_/_0.4)]" />
                      </motion.div>
                    )}
                  </motion.div>
                </div>

                {/* Name & Rarity */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-center mb-5">
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">{selectedBadge.name}</h2>
                  <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm ${modalConfig.badgeBg} ${modalConfig.textColor} font-semibold`}>
                    {selectedBadge.rarity === 'LEGENDARY' && <Crown className="w-4 h-4" />}
                    {selectedBadge.rarity === 'EPIC' && <Zap className="w-4 h-4" />}
                    {selectedBadge.rarity === 'RARE' && <Shield className="w-4 h-4" />}
                    {selectedBadge.rarity === 'COMMON' && <Medal className="w-4 h-4" />}
                    {getRarityLabel(selectedBadge.rarity)}
                  </div>
                </motion.div>

                {/* Description */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-center text-muted-foreground text-sm sm:text-base mb-6 leading-relaxed">
                  {selectedBadge.description}
                </motion.p>

                {/* Status */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white/90 dark:bg-black/30 backdrop-blur-sm rounded-2xl p-5 border border-slate-300/90 dark:border-white/10 shadow-sm">
                  {selectedBadge.earned ? (
                    <div className="text-center space-y-4">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.5 }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30">
                        <Trophy className="w-6 h-6" />
                        <span className="text-lg font-bold">{t('customerBadges.earnedStatus')}</span>
                      </motion.div>
                      <div className="flex items-center justify-center gap-4 flex-wrap">
                        {selectedBadge.earnedAt && (
                          <span className="text-muted-foreground text-sm">
                            {new Date(selectedBadge.earnedAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                          <span className="text-2xl font-bold text-yellow-400">+{selectedBadge.points}</span>
                          <span className="text-muted-foreground text-sm">{t('customerBadges.points')}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-2 text-sm">
                          <span className="text-muted-foreground font-medium">{t('customerBadges.progress')}</span>
                          <span className="text-slate-900 dark:text-white font-bold text-base">%{selectedBadge.progress}</span>
                        </div>
                        <div className="relative h-3.5 bg-slate-300/90 dark:bg-white/10 rounded-full overflow-hidden">
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
                          <span className="text-slate-900 dark:text-white font-semibold">{t('customerBadges.howToEarn')}:</span>
                          {selectedBadge.requirement}
                        </p>
                        <div className="flex items-center justify-center gap-2 text-sm">
                          <span className="text-muted-foreground">{t('customerBadges.reward')}:</span>
                          <Star className="w-5 h-5 text-yellow-400" />
                          <span className="text-yellow-400 font-bold text-base">+{selectedBadge.points} {t('customerBadges.points')}</span>
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
