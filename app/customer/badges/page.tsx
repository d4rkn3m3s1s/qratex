'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Trophy,
  Lock,
  Sparkles,
  Star,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { getRarityColor, getRarityBgColor } from '@/lib/utils';

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  points: number;
  requirement: string;
  earned?: boolean;
  earnedAt?: string;
  progress?: number;
}

const rarityLabels = {
  COMMON: 'Yaygın',
  RARE: 'Nadir',
  EPIC: 'Epik',
  LEGENDARY: 'Efsanevi',
};

export default function CustomerBadgesPage() {
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gamification/badges?userId=me');
      const data = await res.json();

      if (data.success) {
        // Add progress simulation
        const badgesWithProgress = data.data.map((badge: BadgeType, index: number) => ({
          ...badge,
          earned: index < 3, // First 3 earned
          progress: index < 3 ? 100 : Math.floor(Math.random() * 80),
        }));
        setBadges(badgesWithProgress);
      }
    } catch (error) {
      toast.error('Rozetler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);

  const stats = {
    earned: earnedBadges.length,
    total: badges.length,
    totalPoints: earnedBadges.reduce((acc, b) => acc + b.points, 0),
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Rozetlerim"
        description="Kazandığınız ve kazanabileceğiniz rozetler"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.earned}</p>
                <p className="text-xs text-muted-foreground">Kazanılan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/10">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total - stats.earned}</p>
                <p className="text-xs text-muted-foreground">Kilitli</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalPoints}</p>
                <p className="text-xs text-muted-foreground">Puan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="w-16 h-16 bg-muted rounded-full mx-auto" />
                  <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
                  <div className="h-3 bg-muted rounded w-1/2 mx-auto" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Earned Badges */}
          {earnedBadges.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Kazanılan Rozetler
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {earnedBadges.map((badge, index) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card glass hover className="relative overflow-hidden">
                      {badge.rarity === 'LEGENDARY' && (
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 animate-gradient-x" />
                      )}
                      <CardContent className="p-6 relative">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className={`relative p-4 rounded-full ${getRarityBgColor(badge.rarity)}`}>
                            <Image
                              src={badge.icon}
                              alt={badge.name}
                              width={48}
                              height={48}
                              className="relative z-10"
                            />
                            {badge.rarity === 'LEGENDARY' && (
                              <Sparkles className="absolute top-0 right-0 h-4 w-4 text-yellow-500 animate-pulse" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold">{badge.name}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {badge.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getRarityColor(badge.rarity)}>
                              {rarityLabels[badge.rarity]}
                            </Badge>
                            <Badge variant="outline" className="gap-1">
                              <Star className="h-3 w-3" />
                              {badge.points}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Locked Badges */}
          {lockedBadges.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                Kilitli Rozetler
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {lockedBadges.map((badge, index) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card glass className="opacity-75">
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="relative p-4 rounded-full bg-muted">
                            <Image
                              src={badge.icon}
                              alt={badge.name}
                              width={48}
                              height={48}
                              className="grayscale opacity-50"
                            />
                            <Lock className="absolute bottom-0 right-0 h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{badge.name}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {badge.requirement}
                            </p>
                          </div>
                          <div className="w-full space-y-1">
                            <Progress value={badge.progress} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              %{badge.progress} tamamlandı
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

