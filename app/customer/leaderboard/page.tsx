'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Medal,
  Crown,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Flame,
  Zap,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getInitials, getLeague, formatNumber } from '@/lib/utils';

interface LeaderboardUser {
  id: string;
  name: string | null;
  image: string | null;
  points: number;
  level: number;
  rank: number;
  change: number;
  isCurrentUser?: boolean;
}

// Avatar listesi
const defaultAvatars = [
  '/images/avatar/AVATAR ERKEK 1.svg',
  '/images/avatar/AVATAR KADIN 1.svg',
  '/images/avatar/AVATAR ERKEK 2.svg',
  '/images/avatar/AVATAR KADIN 2.svg',
  '/images/avatar/LİON.svg',
  '/images/avatar/TİGER.svg',
  '/images/avatar/PANDA.svg',
  '/images/avatar/KOALA.svg',
];

export default function CustomerLeaderboardPage() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [period]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${period}&limit=50`);
      const data = await res.json();
      
      if (data.success && data.data.leaderboard) {
        // Assign random avatars if no image
        const withAvatars = data.data.leaderboard.map((user: LeaderboardUser, i: number) => ({
          ...user,
          image: user.image || defaultAvatars[i % defaultAvatars.length],
        }));
        setLeaderboard(withAvatars);
        setUserRank(data.data.userRank);
      }
    } catch (error) {
      console.error('Leaderboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const userLeague = getLeague(session?.user?.level || 1);

  // Top 3 için özel renkler
  const podiumColors = {
    1: {
      bg: 'from-yellow-400/30 via-amber-300/20 to-yellow-500/30',
      border: 'border-yellow-500/50',
      ring: 'ring-yellow-400/50',
      text: 'text-yellow-500',
      icon: Crown,
      glow: 'shadow-[0_0_30px_rgba(234,179,8,0.3)]',
    },
    2: {
      bg: 'from-slate-300/30 via-gray-200/20 to-slate-400/30',
      border: 'border-slate-400/50',
      ring: 'ring-slate-300/50',
      text: 'text-slate-400',
      icon: Medal,
      glow: 'shadow-[0_0_20px_rgba(148,163,184,0.3)]',
    },
    3: {
      bg: 'from-amber-600/30 via-orange-500/20 to-amber-700/30',
      border: 'border-amber-600/50',
      ring: 'ring-amber-500/50',
      text: 'text-amber-600',
      icon: Medal,
      glow: 'shadow-[0_0_20px_rgba(217,119,6,0.3)]',
    },
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Liderlik Tablosu"
        description="Rekabet et, yüksel, zirveye ulaş!"
      />

      {/* User Stats Banner */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="relative overflow-hidden border-primary/20">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 via-purple-600/10 to-fuchsia-600/20" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-3xl" />
          <CardContent className="p-6 relative">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20 ring-4 ring-primary/30">
                    <AvatarImage src={session?.user?.image || ''} />
                    <AvatarFallback className="text-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                      {getInitials(session?.user?.name || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5 shadow-lg">
                    <Zap className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold">{session?.user?.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="gap-1">
                      <Star className="h-3 w-3" />
                      Seviye {session?.user?.level || 1}
                    </Badge>
                    <Badge className="bg-gradient-to-r from-violet-600 to-fuchsia-600 gap-1">
                      <Sparkles className="h-3 w-3" />
                      {userLeague}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Sıralamanız</p>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-bold text-primary">#{userRank || '?'}</span>
                    {userRank && userRank <= 10 && (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Flame className="h-6 w-6 text-orange-500" />
                      </motion.div>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Toplam Puan</p>
                  <div className="flex items-center gap-1">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <span className="text-2xl font-bold">{formatNumber(session?.user?.points || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="weekly" className="gap-2 text-sm">
            <Flame className="h-4 w-4" />
            Haftalık
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-2 text-sm">
            <Trophy className="h-4 w-4" />
            Aylık
          </TabsTrigger>
          <TabsTrigger value="alltime" className="gap-2 text-sm">
            <Crown className="h-4 w-4" />
            Tüm Zamanlar
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
              {/* Podium - Top 3 */}
              {leaderboard.length >= 3 && (
                <div className="flex items-end justify-center gap-3 md:gap-6 mb-8 px-4">
                  {/* 2nd Place */}
                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="order-1"
                  >
                    <Card className={`relative overflow-hidden w-32 md:w-40 bg-gradient-to-b ${podiumColors[2].bg} ${podiumColors[2].border} ${podiumColors[2].glow}`}>
                      <div className="absolute top-2 right-2">
                        <Medal className={`h-6 w-6 ${podiumColors[2].text}`} />
                      </div>
                      <CardContent className="pt-8 pb-4 px-3 text-center">
                        <div className={`relative mx-auto mb-3 ring-4 ${podiumColors[2].ring} rounded-full`}>
                          <Avatar className="h-16 w-16 md:h-20 md:w-20">
                            <AvatarImage src={leaderboard[1]?.image || ''} />
                            <AvatarFallback className="bg-slate-500 text-white">
                              {getInitials(leaderboard[1]?.name || '')}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <p className="font-bold truncate text-sm">{leaderboard[1]?.name}</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold text-lg">{formatNumber(leaderboard[1]?.points || 0)}</span>
                        </div>
                        <Badge variant="outline" className="mt-2 text-xs">
                          Lv. {leaderboard[1]?.level}
                        </Badge>
                        <div className={`mt-3 py-2 px-4 rounded-lg bg-slate-500/20 ${podiumColors[2].text} font-bold text-2xl`}>
                          2
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* 1st Place */}
                  <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                    className="order-0 md:order-1"
                  >
                    <Card className={`relative overflow-hidden w-36 md:w-44 bg-gradient-to-b ${podiumColors[1].bg} ${podiumColors[1].border} ${podiumColors[1].glow}`}>
                      <div className="absolute inset-0 bg-gradient-to-t from-yellow-400/10 to-transparent" />
                      <motion.div 
                        className="absolute top-3 left-1/2 -translate-x-1/2"
                        animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Crown className={`h-8 w-8 ${podiumColors[1].text} drop-shadow-lg`} />
                      </motion.div>
                      <CardContent className="pt-14 pb-4 px-3 text-center relative">
                        <div className={`relative mx-auto mb-3 ring-4 ${podiumColors[1].ring} rounded-full`}>
                          <Avatar className="h-20 w-20 md:h-24 md:w-24">
                            <AvatarImage src={leaderboard[0]?.image || ''} />
                            <AvatarFallback className="bg-yellow-500 text-white text-xl">
                              {getInitials(leaderboard[0]?.name || '')}
                            </AvatarFallback>
                          </Avatar>
                          <motion.div
                            className="absolute -top-1 -right-1"
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <Sparkles className="h-5 w-5 text-yellow-400" />
                          </motion.div>
                        </div>
                        <p className="font-bold truncate">{leaderboard[0]?.name}</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold text-xl">{formatNumber(leaderboard[0]?.points || 0)}</span>
                        </div>
                        <Badge className="mt-2 bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                          Lv. {leaderboard[0]?.level}
                        </Badge>
                        <div className={`mt-3 py-3 px-4 rounded-lg bg-yellow-500/20 ${podiumColors[1].text} font-bold text-3xl`}>
                          1
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* 3rd Place */}
                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="order-2"
                  >
                    <Card className={`relative overflow-hidden w-32 md:w-40 bg-gradient-to-b ${podiumColors[3].bg} ${podiumColors[3].border} ${podiumColors[3].glow}`}>
                      <div className="absolute top-2 right-2">
                        <Medal className={`h-6 w-6 ${podiumColors[3].text}`} />
                      </div>
                      <CardContent className="pt-8 pb-4 px-3 text-center">
                        <div className={`relative mx-auto mb-3 ring-4 ${podiumColors[3].ring} rounded-full`}>
                          <Avatar className="h-16 w-16 md:h-20 md:w-20">
                            <AvatarImage src={leaderboard[2]?.image || ''} />
                            <AvatarFallback className="bg-amber-600 text-white">
                              {getInitials(leaderboard[2]?.name || '')}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <p className="font-bold truncate text-sm">{leaderboard[2]?.name}</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold text-lg">{formatNumber(leaderboard[2]?.points || 0)}</span>
                        </div>
                        <Badge variant="outline" className="mt-2 text-xs">
                          Lv. {leaderboard[2]?.level}
                        </Badge>
                        <div className={`mt-3 py-2 px-4 rounded-lg bg-amber-600/20 ${podiumColors[3].text} font-bold text-2xl`}>
                          3
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              )}

              {/* Rest of Leaderboard */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    Sıralama
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    <AnimatePresence>
                      {leaderboard.slice(3).map((user, index) => (
                        <motion.div
                          key={user.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={`flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${
                            user.isCurrentUser ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                          }`}
                        >
                          {/* Rank */}
                          <div className="w-10 text-center">
                            <span className={`text-lg font-bold ${
                              user.rank <= 10 ? 'text-primary' : 'text-muted-foreground'
                            }`}>
                              #{user.rank}
                            </span>
                          </div>

                          {/* Avatar */}
                          <Avatar className="h-12 w-12 ring-2 ring-border">
                            <AvatarImage src={user.image || ''} />
                            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                              {getInitials(user.name || '')}
                            </AvatarFallback>
                          </Avatar>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${user.isCurrentUser ? 'text-primary' : ''}`}>
                              {user.isCurrentUser ? `${user.name} (Siz)` : user.name}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs h-5">
                                Lv. {user.level}
                              </Badge>
                              <span>{getLeague(user.level)}</span>
                            </div>
                          </div>

                          {/* Change */}
                          <div className="flex items-center gap-1">
                            {getChangeIcon(user.change)}
                            {user.change !== 0 && (
                              <span className={`text-xs ${user.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {Math.abs(user.change)}
                              </span>
                            )}
                          </div>

                          {/* Points */}
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              <span className="font-bold">{formatNumber(user.points)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>

              {/* Empty State */}
              {leaderboard.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <Trophy className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">Henüz sıralama verisi yok</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Geri bildirim göndererek puan kazanın ve sıralamaya girin!
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
