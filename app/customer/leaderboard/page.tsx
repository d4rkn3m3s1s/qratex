'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Medal,
  Crown,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getInitials, getLeague } from '@/lib/utils';

interface LeaderboardUser {
  id: string;
  name: string | null;
  image: string | null;
  points: number;
  level: number;
  rank: number;
  change: number; // rank change from last week
}

export default function CustomerLeaderboardPage() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);

  useEffect(() => {
    fetchLeaderboard();
  }, [period]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    // Simulated data
    setTimeout(() => {
      setLeaderboard([
        { id: '1', name: 'Ahmet Yılmaz', image: '/images/avatar/avatar1.svg', points: 15240, level: 25, rank: 1, change: 0 },
        { id: '2', name: 'Elif Kaya', image: '/images/avatar/avatar2.svg', points: 14850, level: 24, rank: 2, change: 1 },
        { id: '3', name: 'Mehmet Demir', image: '/images/avatar/avatar3.svg', points: 13920, level: 23, rank: 3, change: -1 },
        { id: '4', name: 'Ayşe Çelik', image: '/images/avatar/avatar4.svg', points: 12100, level: 21, rank: 4, change: 2 },
        { id: '5', name: 'Can Öztürk', image: '/images/avatar/avatar5.svg', points: 11500, level: 20, rank: 5, change: 0 },
        { id: '6', name: 'Zeynep Aydın', image: null, points: 10800, level: 19, rank: 6, change: -2 },
        { id: '7', name: 'Burak Şahin', image: null, points: 9500, level: 17, rank: 7, change: 1 },
        { id: '8', name: 'Selin Yıldız', image: null, points: 8900, level: 16, rank: 8, change: 0 },
        { id: '9', name: 'Emre Koç', image: null, points: 8200, level: 15, rank: 9, change: 3 },
        { id: '10', name: 'Deniz Arslan', image: null, points: 7800, level: 14, rank: 10, change: -1 },
      ]);
      setLoading(false);
    }, 500);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-6 w-6 text-yellow-500" />;
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 3:
        return <Medal className="h-6 w-6 text-amber-600" />;
      default:
        return <span className="text-lg font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const userRank = 42; // Simulated user rank
  const userLeague = getLeague(session?.user?.points || 0);

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Liderlik Tablosu"
        description="En yüksek puanlı kullanıcıları görün"
      />

      {/* User Stats */}
      <Card glass className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20" />
        <CardContent className="p-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary">
                <AvatarImage src={session?.user?.image || ''} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                  {getInitials(session?.user?.name || '')}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">{session?.user?.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Seviye {session?.user?.level || 1}</Badge>
                  <Badge className="bg-gradient-to-r from-primary to-purple-500">
                    {userLeague}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Sıralamanız</p>
              <p className="text-3xl font-bold">#{userRank}</p>
              <div className="flex items-center gap-1 justify-end text-green-500">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">+5 bu hafta</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="weekly">Haftalık</TabsTrigger>
          <TabsTrigger value="monthly">Aylık</TabsTrigger>
          <TabsTrigger value="alltime">Tüm Zamanlar</TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="mt-6">
          {/* Top 3 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* 2nd Place */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="order-1"
            >
              {leaderboard[1] && (
                <Card glass className="text-center pt-8">
                  <CardContent className="p-4">
                    <div className="relative inline-block">
                      <Avatar className="h-16 w-16 border-4 border-gray-400">
                        <AvatarImage src={leaderboard[1].image || ''} />
                        <AvatarFallback>{getInitials(leaderboard[1].name || '')}</AvatarFallback>
                      </Avatar>
                      <Medal className="absolute -top-2 -right-2 h-8 w-8 text-gray-400" />
                    </div>
                    <p className="font-semibold mt-2 truncate">{leaderboard[1].name}</p>
                    <div className="flex items-center justify-center gap-1 text-yellow-500">
                      <Star className="h-4 w-4 fill-yellow-500" />
                      <span className="font-bold">{leaderboard[1].points.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>

            {/* 1st Place */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="order-0 md:order-1 col-span-3 md:col-span-1"
            >
              {leaderboard[0] && (
                <Card glass className="text-center pt-4 border-yellow-500/50">
                  <CardContent className="p-4">
                    <Crown className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <div className="relative inline-block">
                      <Avatar className="h-20 w-20 border-4 border-yellow-500">
                        <AvatarImage src={leaderboard[0].image || ''} />
                        <AvatarFallback>{getInitials(leaderboard[0].name || '')}</AvatarFallback>
                      </Avatar>
                    </div>
                    <p className="font-semibold text-lg mt-2 truncate">{leaderboard[0].name}</p>
                    <div className="flex items-center justify-center gap-1 text-yellow-500">
                      <Star className="h-5 w-5 fill-yellow-500" />
                      <span className="font-bold text-xl">{leaderboard[0].points.toLocaleString()}</span>
                    </div>
                    <Badge className="mt-2">Lv. {leaderboard[0].level}</Badge>
                  </CardContent>
                </Card>
              )}
            </motion.div>

            {/* 3rd Place */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="order-2"
            >
              {leaderboard[2] && (
                <Card glass className="text-center pt-8">
                  <CardContent className="p-4">
                    <div className="relative inline-block">
                      <Avatar className="h-16 w-16 border-4 border-amber-600">
                        <AvatarImage src={leaderboard[2].image || ''} />
                        <AvatarFallback>{getInitials(leaderboard[2].name || '')}</AvatarFallback>
                      </Avatar>
                      <Medal className="absolute -top-2 -right-2 h-8 w-8 text-amber-600" />
                    </div>
                    <p className="font-semibold mt-2 truncate">{leaderboard[2].name}</p>
                    <div className="flex items-center justify-center gap-1 text-yellow-500">
                      <Star className="h-4 w-4 fill-yellow-500" />
                      <span className="font-bold">{leaderboard[2].points.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </div>

          {/* Rest of Leaderboard */}
          <Card glass>
            <CardHeader>
              <CardTitle className="text-lg">Sıralama</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                [...Array(7)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-4 p-3">
                    <div className="h-8 w-8 bg-muted rounded" />
                    <div className="h-10 w-10 bg-muted rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-1/4" />
                    </div>
                  </div>
                ))
              ) : (
                leaderboard.slice(3).map((user, index) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
                      user.id === session?.user?.id ? 'bg-primary/10 border border-primary/20' : ''
                    }`}
                  >
                    <div className="w-8 text-center">{getRankIcon(user.rank)}</div>
                    <Avatar>
                      <AvatarImage src={user.image || ''} />
                      <AvatarFallback>{getInitials(user.name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.name}</p>
                      <p className="text-sm text-muted-foreground">Lv. {user.level}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getChangeIcon(user.change)}
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-yellow-500">
                          <Star className="h-4 w-4 fill-yellow-500" />
                          <span className="font-bold">{user.points.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

