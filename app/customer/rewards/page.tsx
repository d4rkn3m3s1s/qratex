'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift,
  Star,
  ShoppingBag,
  Sparkles,
  Check,
  Copy,
  Ticket,
  Clock,
  CheckCircle,
  Store,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { formatDistanceToNow } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';
import { getLeagueMeta, type LeagueKey } from '@/lib/utils';
import { useCustomerLocale, useCustomerT } from '@/lib/use-customer-locale';
import { resolveRewardDisplayImage } from '@/lib/reward-display-image';

const SurpriseEggThreeModal = dynamic(
  () => import('@/components/rewards/surprise-egg-three-modal').then((m) => m.SurpriseEggThreeModal),
  { ssr: false, loading: () => null }
);

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  image?: string | null;
  cost: number;
  stock: number;
  type: 'PHYSICAL' | 'DIGITAL' | 'COUPON' | 'VIP' | 'physical' | 'digital' | 'coupon';
}

interface MyReward {
  id: string;
  code: string | null;
  redeemedAt: string;
  claimedAt: string | null;
  isUsed: boolean;
  reward: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    image?: string | null;
    type: string;
    cost: number;
  };
}

function RewardTilePreview(props: {
  id: string;
  icon: string | null;
  image?: string | null;
  label?: string;
}) {
  const src = resolveRewardDisplayImage(props);
  const alt = props.label ?? '';
  if (src) {
    return (
      <div className="shrink-0 rounded-xl bg-background p-2 ring-1 ring-border/70 shadow-sm">
        <Image src={src} alt={alt} width={72} height={72} className="h-[72px] w-[72px] object-contain" />
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-lg bg-primary/10 p-3">
      <Gift className="h-8 w-8 text-primary" />
    </div>
  );
}

const typeLabels: Record<string, string> = {
  PHYSICAL: 'Fiziksel',
  DIGITAL: 'Dijital',
  COUPON: 'Kupon',
  VIP: 'VIP',
  physical: 'Fiziksel',
  digital: 'Dijital',
  coupon: 'Kupon',
};

const typeColors: Record<string, string> = {
  PHYSICAL: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  DIGITAL: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  COUPON: 'bg-green-500/10 text-green-500 border-green-500/20',
  VIP: 'border-primary/20 bg-primary/10 text-primary',
  physical: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  digital: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  coupon: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export default function CustomerRewardsPage() {
  const locale = useCustomerLocale();
  const tc = useCustomerT();
  const dateLocale = locale === 'en' ? enUS : tr;
  const { data: session, update: updateSession } = useSession();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [myRewards, setMyRewards] = useState<MyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMyRewards, setLoadingMyRewards] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [selectedMyReward, setSelectedMyReward] = useState<MyReward | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [userPoints, setUserPoints] = useState(0);
  const [activeTab, setActiveTab] = useState('store');
  const [surpriseOpen, setSurpriseOpen] = useState(false);
  const [surpriseTitle, setSurpriseTitle] = useState('Sürpriz Ödül Açıldı!');
  const [surpriseCouponCode, setSurpriseCouponCode] = useState<string | null>(null);
  const [surpriseLeagueKey, setSurpriseLeagueKey] = useState<LeagueKey>('BASLANGIC');

  // Fetch user's current points from API
  const fetchUserPoints = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/stats', {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && data.data?.stats?.points !== undefined) {
        setUserPoints(data.data.stats.points);
      } else {
        setUserPoints(session?.user?.points || 0);
      }
    } catch {
      setUserPoints(session?.user?.points || 0);
    }
  }, [session?.user?.points]);

  useEffect(() => {
    fetchRewards();
    fetchMyRewards();
    fetchUserPoints();
  }, [fetchUserPoints]);

  const fetchRewards = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/rewards', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();

      if (data.success) {
        setRewards(data.data);
      }
    } catch {
      toast.error(tc('customerRewards.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRewards = async () => {
    try {
      setLoadingMyRewards(true);
      const res = await fetch('/api/gamification/rewards?myRewards=true', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();

      if (data.success) {
        setMyRewards(data.data);
      }
    } catch (error) {
      console.error('My rewards fetch error:', error);
    } finally {
      setLoadingMyRewards(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(tc('customerRewards.codeCopied'), {
      description: code,
    });
  };

  const handleClaimReward = async () => {
    if (!selectedReward) return;

    setClaiming(true);
    try {
      const res = await fetch('/api/gamification/rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: selectedReward.id }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(tc('customerRewards.claimSuccess'), {
          description: `${tc('customerRewards.couponCode')}: ${data.data?.couponCode}`,
          duration: 10000,
        });
        
        // Update local state immediately
        setUserPoints(data.data?.newBalance || userPoints - selectedReward.cost);
        
        // Update session
        await updateSession({ points: data.data?.newBalance });
        
        setSelectedReward(null);
        
        // Refresh rewards list (stock may have changed)
        fetchRewards();
        fetchMyRewards();
        
        // Switch to my rewards tab
        setActiveTab('myRewards');

        // Reward claim akisini bozmadan, animasyonu son adim olarak ac
        const leagueMeta = getLeagueMeta((session?.user as { points?: number })?.points ?? 0);
        setSurpriseLeagueKey(leagueMeta.key);
        setSurpriseTitle(`${selectedReward.name} ödülünü kazandınız!`);
        setSurpriseCouponCode(data.data?.couponCode || null);
        setSurpriseOpen(true);
      } else {
        toast.error(data.error || tc('customerRewards.claimError'));
      }
    } catch {
      toast.error(tc('common.error'));
    } finally {
      setClaiming(false);
    }
  };

  const canAfford = (reward: Reward) => userPoints >= (reward.cost || 0);

  return (
    <div className="space-y-4 md:space-y-6 pb-6 md:pb-6">
      <DashboardPageHeading
        title={tc('customerRewards.title')}
        description={tc('customerRewards.description')}
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{tc('customerRewards.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {tc('customerRewards.description')}
        </p>
      </div>

      <DashboardPageHeroChrome tone="auto" padded={false}>
        <div className="relative p-3 sm:p-4 md:p-6">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="shrink-0 rounded-full bg-yellow-500/15 p-2.5 sm:p-3">
                <Star className="h-6 w-6 fill-yellow-500 text-yellow-500 sm:h-8 sm:w-8" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground sm:text-sm">{tc('customerRewards.currentPoints')}</p>
                <p className="text-2xl font-bold tabular-nums sm:text-3xl">{userPoints.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-xl font-bold text-primary sm:text-2xl">{myRewards.length}</p>
                <p className="text-[10px] text-muted-foreground sm:text-xs">{tc('customerRewards.totalRewards')}</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600 dark:text-green-500 sm:text-2xl">
                  {myRewards.filter((r) => !r.isUsed).length}
                </p>
                <p className="text-[10px] text-muted-foreground sm:text-xs">{tc('customerRewards.available')}</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardPageHeroChrome>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-2 h-11 sm:h-12">
          <TabsTrigger value="store" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {tc('customerRewards.store')}
          </TabsTrigger>
          <TabsTrigger value="myRewards" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Ticket className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {tc('customerRewards.myRewards')}
            {myRewards.filter(r => !r.isUsed).length > 0 && (
              <Badge className="ml-1 h-5 px-1.5 bg-green-500 text-[10px]">{myRewards.filter(r => !r.isUsed).length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Store Tab */}
        <TabsContent value="store" className="space-y-4 md:space-y-6">
          {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-0">
                <div className="animate-pulse">
                  <div className="h-28 sm:h-32 bg-muted" />
                  <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rewards.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8 text-center">
            <Gift className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <h3 className="font-semibold text-sm sm:text-base mb-1">Henüz ödül yok</h3>
            <p className="text-muted-foreground text-xs sm:text-sm mb-4">
              Mağazaya yeni ödüller eklendiğinde burada listelenecek. Puan biriktirmek için tüketim yapıp geri bildirim verebilirsiniz.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 w-full max-w-md mx-auto">
              <Button asChild variant="outline" size="sm" className="gap-1.5 w-full min-h-10 touch-manipulation sm:flex-1">
                <Link href="/customer/consumptions">Tüketimlerim</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5 w-full min-h-10 touch-manipulation sm:flex-1">
                <Link href="/customer/feedbacks">Geri Bildirimlerim</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {rewards.map((reward, index) => {
            const affordable = canAfford(reward);
            const displayImage = resolveRewardDisplayImage({
              id: reward.id,
              icon: reward.icon,
              image: reward.image,
            });
            const gradients = [
              'from-primary/20 via-primary/10 to-primary/15',
              'from-blue-500/20 via-cyan-500/10 to-teal-500/20',
              'from-orange-500/20 via-amber-500/10 to-yellow-500/20',
              'from-violet-500/20 via-primary/10 to-red-500/20',
              'from-emerald-500/20 via-green-500/10 to-lime-500/20',
              'from-primary/20 via-blue-500/10 to-sky-500/20',
            ];
            const gradient = gradients[index % gradients.length];
            
            return (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -4 }}
                className="h-full"
              >
                <Card
                  className={`h-full flex flex-col overflow-hidden border-border/50 bg-card active:scale-[0.98] hover:shadow-xl hover:border-primary/30 transition-all duration-300 cursor-pointer ${!affordable ? 'opacity-70' : ''}`}
                  onClick={() => setSelectedReward(reward)}
                >
                  {/* Image Section */}
                  <div className={`relative h-32 sm:h-40 bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden ring-1 ring-inset ring-white/10`}>
                    {/* Decorative circles */}
                    <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-white/5 rounded-full blur-xl" />
                    <div className="absolute bottom-0 left-0 w-12 sm:w-16 h-12 sm:h-16 bg-white/5 rounded-full blur-xl" />
                    
                    {displayImage ? (
                      <motion.div
                        className="relative z-[1] rounded-2xl bg-black/10 p-2 shadow-lg ring-1 ring-white/15 backdrop-blur-[2px]"
                        whileHover={{ scale: 1.06, rotate: 2 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                      >
                        <Image
                          src={displayImage}
                          alt={reward.name}
                          width={112}
                          height={112}
                          className="object-contain drop-shadow-xl w-[72px] h-[72px] sm:w-[100px] sm:h-[100px] rounded-xl"
                        />
                      </motion.div>
                    ) : (
                      <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-sm">
                        <Gift className="h-8 w-8 sm:h-12 sm:w-12 text-white/70" />
                      </div>
                    )}
                    
                    {/* Type Badge */}
                    <Badge className={`absolute top-2 right-2 sm:top-3 sm:right-3 text-[10px] sm:text-xs ${typeColors[reward.type]} backdrop-blur-sm`}>
                      {typeLabels[reward.type]}
                    </Badge>
                    
                    {/* Stock Badge */}
                    {reward.stock === 0 && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Badge variant="destructive" className="text-xs sm:text-sm">Tükendi</Badge>
                      </div>
                    )}
                  </div>

                  {/* Content Section */}
                  <div className="flex-1 p-3 sm:p-4 flex flex-col">
                    {/* Title & Description */}
                    <div className="flex-1">
                      <h3 className="font-bold text-sm sm:text-base mb-0.5 sm:mb-1 line-clamp-1">{reward.name}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 min-h-[32px] sm:min-h-[40px]">
                        {reward.description}
                      </p>
                    </div>

                    {/* Price & Stock */}
                    <div className="flex items-center justify-between py-2 sm:py-3 my-2 sm:my-3 border-y border-border/50">
                      <div className="flex items-center gap-1">
                        <div className="p-0.5 sm:p-1 rounded-full bg-yellow-500/20">
                          <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 fill-yellow-500" />
                        </div>
                        <span className="font-bold text-base sm:text-lg">{(reward.cost || 0).toLocaleString()}</span>
                      </div>
                      {reward.stock === -1 ? (
                        <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2">∞</Badge>
                      ) : reward.stock > 0 ? (
                        <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2">
                          {reward.stock}
                        </Badge>
                      ) : null}
                    </div>

                    {/* Action Button */}
                    <Button
                      className={`min-h-10 h-auto w-full gap-1.5 touch-manipulation text-xs sm:text-sm ${affordable ? 'bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70' : ''}`}
                      variant={affordable ? 'default' : 'outline'}
                      disabled={!affordable || reward.stock === 0}
                    >
                      {affordable ? (
                        <>
                          <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          Talep Et
                        </>
                      ) : (
                        <span className="text-muted-foreground text-[10px] sm:text-xs">
                          {((reward.cost || 0) - userPoints).toLocaleString()} eksik
                        </span>
                      )}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          </div>
        )}
        </TabsContent>

        {/* My Rewards Tab */}
        <TabsContent value="myRewards" className="space-y-4 md:space-y-6">
          {loadingMyRewards ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <div className="animate-pulse">
                      <div className="h-20 sm:h-24 bg-muted" />
                      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-6 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : myRewards.length === 0 ? (
            <Card>
              <CardContent className="p-8 sm:p-12 text-center">
                <Ticket className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground/30 mx-auto mb-3 sm:mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">Henüz ödül almadınız</h3>
                <p className="text-sm text-muted-foreground mb-4">Mağazadan ödül talep ederek kupon kazanın!</p>
                <Button onClick={() => setActiveTab('store')} className="gap-2 min-h-10 touch-manipulation w-full sm:w-auto">
                  <Store className="h-4 w-4" />
                  Mağazaya Git
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              <AnimatePresence>
                {myRewards.map((myReward, index) => {
                  const myThumb = resolveRewardDisplayImage({
                    id: myReward.reward.id,
                    icon: myReward.reward.icon,
                    image: myReward.reward.image,
                  });
                  return (
                  <motion.div
                    key={myReward.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ y: -2 }}
                  >
                    <Card 
                      className={`overflow-hidden cursor-pointer active:scale-[0.98] hover:shadow-lg transition-all ${myReward.isUsed ? 'opacity-60' : 'border-green-500/30'}`}
                      onClick={() => setSelectedMyReward(myReward)}
                    >
                      <CardContent className="p-0">
                        {/* Header */}
                        <div className={`p-3 sm:p-4 ${myReward.isUsed ? 'bg-muted/50' : 'bg-gradient-to-r from-green-500/20 to-emerald-500/10'}`}>
                          <div className="flex items-start gap-3">
                            {myThumb ? (
                              <div className="shrink-0 rounded-xl bg-background/80 p-1.5 ring-1 ring-border/60 shadow-sm">
                                <Image
                                  src={myThumb}
                                  alt={myReward.reward.name}
                                  width={48}
                                  height={48}
                                  className="h-11 w-11 sm:h-12 sm:w-12 object-contain rounded-lg"
                                />
                              </div>
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                                <Badge className={`text-[10px] sm:text-xs ${typeColors[myReward.reward.type]}`}>
                                  {typeLabels[myReward.reward.type]}
                                </Badge>
                                {myReward.isUsed ? (
                                  <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs">
                                    <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                    Kullanıldı
                                  </Badge>
                                ) : (
                                  <Badge className="bg-green-500 gap-1 text-[10px] sm:text-xs">
                                    <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                    Aktif
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-bold text-sm sm:text-base">{myReward.reward.name}</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{myReward.reward.description}</p>
                            </div>
                          </div>
                        </div>

                        {/* Coupon Code */}
                        {myReward.code && (
                          <div className="p-3 sm:p-4 border-t border-dashed border-border">
                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 sm:mb-2">Kupon Kodu</p>
                            <div className="flex items-center gap-2">
                              <code className={`flex-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-mono font-bold ${myReward.isUsed ? 'bg-muted text-muted-foreground line-through' : 'bg-green-500/10 text-green-500'}`}>
                                {myReward.code}
                              </code>
                              {!myReward.isUsed && (
                                <Button 
                                  size="icon" 
                                  variant="outline" 
                                  className="h-10 w-10 min-h-10 min-w-10 sm:h-9 sm:w-9 sm:min-h-9 sm:min-w-9 shrink-0 touch-manipulation"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(myReward.code!);
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-muted/30 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            {formatDistanceToNow(new Date(myReward.redeemedAt), { addSuffix: true, locale: dateLocale })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-yellow-500" />
                            {myReward.reward.cost}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödül Talep Et</DialogTitle>
            <DialogDescription>
              Bu ödülü talep etmek istediğinizden emin misiniz?
            </DialogDescription>
          </DialogHeader>
          {selectedReward && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <RewardTilePreview
                  id={selectedReward.id}
                  icon={selectedReward.icon}
                  image={selectedReward.image}
                  label={selectedReward.name}
                />
                <div className="flex-1">
                  <h3 className="font-semibold">{selectedReward.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedReward.description}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Bu ödülü almak için <strong className="text-foreground">{(selectedReward.cost || 0).toLocaleString()} puan</strong> gerekir. Mevcut puanınız: <strong className="text-foreground">{userPoints.toLocaleString()}</strong>.
              </p>
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <span>Maliyet</span>
                <div className="flex items-center gap-1 text-yellow-500">
                  <Star className="h-4 w-4 fill-yellow-500" />
                  <span className="font-bold">{(selectedReward.cost || 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <span>Kalan Puan</span>
                <span className="font-bold">
                  {(userPoints - (selectedReward.cost || 0)).toLocaleString()}
                </span>
              </div>
              {selectedReward.stock >= 0 && (
                <p className="text-xs text-muted-foreground">
                  Stok: {selectedReward.stock === -1 ? 'Sınırsız' : selectedReward.stock}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setSelectedReward(null)} className="w-full min-h-10 touch-manipulation sm:w-auto">
              İptal
            </Button>
            <Button
              onClick={handleClaimReward}
              disabled={claiming || (selectedReward ? !canAfford(selectedReward) : false)}
              className="gap-2 w-full min-h-10 touch-manipulation sm:w-auto"
            >
              {claiming ? (
                'İşleniyor...'
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Onayla
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* My Reward Detail Dialog */}
      <Dialog open={!!selectedMyReward} onOpenChange={() => setSelectedMyReward(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Kupon Detayı
            </DialogTitle>
          </DialogHeader>
          {selectedMyReward && (
            <div className="space-y-4">
              {/* Reward Info */}
              <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/15 p-4">
                <div className="flex items-start gap-3">
                  <RewardTilePreview
                    id={selectedMyReward.reward.id}
                    icon={selectedMyReward.reward.icon}
                    image={selectedMyReward.reward.image}
                    label={selectedMyReward.reward.name}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={typeColors[selectedMyReward.reward.type]}>
                        {typeLabels[selectedMyReward.reward.type]}
                      </Badge>
                      {selectedMyReward.isUsed ? (
                        <Badge variant="secondary">Kullanıldı</Badge>
                      ) : (
                        <Badge className="bg-green-500">Aktif</Badge>
                      )}
                    </div>
                    <h3 className="font-bold text-lg">{selectedMyReward.reward.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{selectedMyReward.reward.description}</p>
                  </div>
                </div>
              </div>

              {/* Coupon Code */}
              {selectedMyReward.code && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Kupon Kodu</p>
                  <div className={`p-4 rounded-lg border-2 border-dashed text-center ${selectedMyReward.isUsed ? 'border-muted bg-muted/30' : 'border-green-500 bg-green-500/10'}`}>
                    <code className={`text-2xl font-mono font-bold tracking-wider ${selectedMyReward.isUsed ? 'text-muted-foreground line-through' : 'text-green-500'}`}>
                      {selectedMyReward.code}
                    </code>
                  </div>
                  {!selectedMyReward.isUsed && (
                    <Button 
                      className="w-full gap-2 min-h-10 touch-manipulation" 
                      variant="outline"
                      onClick={() => copyToClipboard(selectedMyReward.code!)}
                    >
                      <Copy className="h-4 w-4" />
                      Kodu Kopyala
                    </Button>
                  )}
                </div>
              )}

              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground text-xs">Talep Tarihi</p>
                  <p className="font-medium">
                    {new Date(selectedMyReward.redeemedAt).toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground text-xs">Harcanan Puan</p>
                  <p className="font-medium flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    {selectedMyReward.reward.cost}
                  </p>
                </div>
              </div>

              {/* Usage Instructions */}
              {!selectedMyReward.isUsed && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    <strong>Kullanım:</strong> Bu kupon kodunu ilgili işletmede göstererek ödülünüzü alabilirsiniz.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelectedMyReward(null)} className="w-full min-h-10 touch-manipulation">
              Tamam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {surpriseOpen ? (
        <SurpriseEggThreeModal
          open
          title={surpriseTitle}
          couponCode={surpriseCouponCode}
          leagueKey={surpriseLeagueKey}
          onClose={() => setSurpriseOpen(false)}
        />
      ) : null}
    </div>
  );
}

