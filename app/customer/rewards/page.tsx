'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift,
  Star,
  ShoppingBag,
  Package,
  Sparkles,
  Check,
  Copy,
  Ticket,
  Clock,
  CheckCircle,
  Store,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
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
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

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
    type: string;
    cost: number;
  };
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
  VIP: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  physical: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  digital: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  coupon: 'bg-green-500/10 text-green-500 border-green-500/20',
};

export default function CustomerRewardsPage() {
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
    } catch (error) {
      toast.error('Ödüller yüklenemedi');
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
    toast.success('Kupon kodu kopyalandı!', {
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
        toast.success('🎁 Ödül talep edildi!', {
          description: `Kupon kodunuz: ${data.data?.couponCode}`,
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
      } else {
        toast.error(data.error || 'Ödül talep edilemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setClaiming(false);
    }
  };

  const canAfford = (reward: Reward) => userPoints >= (reward.cost || 0);

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      <DashboardHeader
        title="Ödül Mağazası"
        description="Puanlarınızı harika ödüllerle değiştirin"
      />

      {/* User Points & Stats */}
      <Card className="relative overflow-hidden border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20" />
        <CardContent className="p-3 sm:p-4 md:p-6 relative">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2.5 sm:p-3 rounded-full bg-yellow-500/20">
                <Star className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500 fill-yellow-500" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Mevcut Puanınız</p>
                <p className="text-2xl sm:text-3xl font-bold">{userPoints.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold text-primary">{myRewards.length}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Toplam Ödül</p>
              </div>
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-bold text-green-500">{myRewards.filter(r => !r.isUsed).length}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Kullanılabilir</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-2 h-11 sm:h-12">
          <TabsTrigger value="store" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Mağaza
          </TabsTrigger>
          <TabsTrigger value="myRewards" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Ticket className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Ödüllerim
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
            <p className="text-muted-foreground text-sm sm:text-base">Henüz ödül yok</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {rewards.map((reward, index) => {
            const affordable = canAfford(reward);
            const gradients = [
              'from-violet-500/20 via-purple-500/10 to-fuchsia-500/20',
              'from-blue-500/20 via-cyan-500/10 to-teal-500/20',
              'from-orange-500/20 via-amber-500/10 to-yellow-500/20',
              'from-pink-500/20 via-rose-500/10 to-red-500/20',
              'from-emerald-500/20 via-green-500/10 to-lime-500/20',
              'from-indigo-500/20 via-blue-500/10 to-sky-500/20',
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
                  <div className={`relative h-28 sm:h-36 bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden`}>
                    {/* Decorative circles */}
                    <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-white/5 rounded-full blur-xl" />
                    <div className="absolute bottom-0 left-0 w-12 sm:w-16 h-12 sm:h-16 bg-white/5 rounded-full blur-xl" />
                    
                    {(reward.icon || reward.image) ? (
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                      >
                        <Image
                          src={reward.icon || reward.image || ''}
                          alt={reward.name}
                          width={90}
                          height={90}
                          className="object-contain drop-shadow-lg w-16 h-16 sm:w-[90px] sm:h-[90px]"
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
                      className={`w-full gap-1.5 sm:gap-2 h-9 sm:h-10 text-xs sm:text-sm ${affordable ? 'bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90' : ''}`}
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
                <Button onClick={() => setActiveTab('store')} className="gap-2 h-10">
                  <Store className="h-4 w-4" />
                  Mağazaya Git
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              <AnimatePresence>
                {myRewards.map((myReward, index) => (
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
                                  className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
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
                            {formatDistanceToNow(new Date(myReward.redeemedAt), { addSuffix: true, locale: tr })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-yellow-500" />
                            {myReward.reward.cost}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
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
                <div className="p-3 rounded-lg bg-primary/10">
                  <Gift className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{selectedReward.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedReward.description}</p>
                </div>
              </div>

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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReward(null)}>
              İptal
            </Button>
            <Button
              onClick={handleClaimReward}
              disabled={claiming || (selectedReward ? !canAfford(selectedReward) : false)}
              className="gap-2"
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
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
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
                      className="w-full gap-2" 
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
            <Button onClick={() => setSelectedMyReward(null)} className="w-full">
              Tamam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

