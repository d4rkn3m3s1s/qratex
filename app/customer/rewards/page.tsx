'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Gift,
  Star,
  ShoppingBag,
  Package,
  Sparkles,
  Check,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

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
  const { data: session } = useSession();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [claiming, setClaiming] = useState(false);

  const userPoints = session?.user?.points || 0;

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/rewards');
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
        toast.success('Ödül talep edildi!', {
          description: `${selectedReward.name} başarıyla talep edildi`,
        });
        setSelectedReward(null);
        fetchRewards();
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
    <div className="space-y-6">
      <DashboardHeader
        title="Ödül Mağazası"
        description="Puanlarınızı harika ödüllerle değiştirin"
      />

      {/* User Points */}
      <Card glass className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20" />
        <CardContent className="p-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-yellow-500/20">
                <Star className="h-8 w-8 text-yellow-500 fill-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mevcut Puanınız</p>
                <p className="text-3xl font-bold">{userPoints.toLocaleString()}</p>
              </div>
            </div>
            <Sparkles className="h-12 w-12 text-primary/30" />
          </div>
        </CardContent>
      </Card>

      {/* Rewards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-0">
                <div className="animate-pulse">
                  <div className="h-32 bg-muted" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rewards.length === 0 ? (
        <Card glass>
          <CardContent className="p-8 text-center">
            <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Henüz ödül yok</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((reward, index) => {
            const affordable = canAfford(reward);
            return (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  glass
                  hover
                  className={`cursor-pointer ${!affordable ? 'opacity-75' : ''}`}
                  onClick={() => setSelectedReward(reward)}
                >
                  <CardContent className="p-0">
                    {/* Image */}
                    <div className="relative h-32 bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                      {(reward.icon || reward.image) ? (
                        <Image
                          src={reward.icon || reward.image || ''}
                          alt={reward.name}
                          width={80}
                          height={80}
                          className="object-contain"
                        />
                      ) : (
                        <Gift className="h-12 w-12 text-primary/50" />
                      )}
                      <Badge className={`absolute top-2 right-2 ${typeColors[reward.type]}`}>
                        {typeLabels[reward.type]}
                      </Badge>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-3">
                      <div>
                        <h3 className="font-semibold">{reward.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {reward.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-yellow-500">
                          <Star className="h-4 w-4 fill-yellow-500" />
                          <span className="font-bold">{(reward.cost || 0).toLocaleString()}</span>
                        </div>
                        {(reward.stock ?? -1) > 0 || reward.stock === -1 ? (
                          reward.stock === -1 ? (
                            <Badge variant="outline">Sınırsız</Badge>
                          ) : (
                            <Badge variant="outline">Stok: {reward.stock}</Badge>
                          )
                        ) : (
                          <Badge variant="destructive">Tükendi</Badge>
                        )}
                      </div>

                      <Button
                        className="w-full gap-2"
                        variant={affordable ? 'default' : 'outline'}
                        disabled={!affordable || reward.stock === 0}
                      >
                        {affordable ? (
                          <>
                            <ShoppingBag className="h-4 w-4" />
                            Talep Et
                          </>
                        ) : (
                          <>
                            {(reward.cost || 0) - userPoints} puan eksik
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}

