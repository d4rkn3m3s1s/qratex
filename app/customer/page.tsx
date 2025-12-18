'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import {
  Trophy,
  Target,
  Gift,
  Star,
  QrCode,
  MessageSquare,
  ChevronRight,
  Zap,
  Medal,
  Crown,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, calculateLevelProgress, getLeague, formatNumber, getRarityColor, getRarityBgColor } from '@/lib/utils';

// Gerçek rozet verileri
const userBadges = [
  { id: 1, name: 'İlk Adım', icon: '/images/badges/YENİ SES.svg', rarity: 'common', earnedAt: new Date() },
  { id: 2, name: 'Yardımsever', icon: '/images/badges/İLHAM KAYNAĞI.svg', rarity: 'rare', earnedAt: new Date() },
  { id: 3, name: 'Erken Kuş', icon: '/images/badges/EFSANE.svg', rarity: 'legendary', earnedAt: new Date() },
];

const activeQuests = [
  {
    id: 1,
    name: 'Günlük Geri Bildirim',
    description: 'Bugün 1 geri bildirim gönderin',
    icon: '/images/badges/YORUM MAKİNESİ.svg',
    progress: 0,
    target: 1,
    reward: { points: 50, xp: 25 },
    type: 'daily',
  },
  {
    id: 2,
    name: 'Fotoğraflı Geri Bildirim',
    description: 'Fotoğraf içeren bir geri bildirim gönderin',
    icon: '/images/badges/EMOJİ USTASI.svg',
    progress: 0,
    target: 1,
    reward: { points: 75, xp: 40 },
    type: 'daily',
  },
  {
    id: 3,
    name: 'Haftalık Kaşif',
    description: 'Bu hafta 5 farklı işletmeyi ziyaret edin',
    icon: '/images/badges/TUR REHBERİ.svg',
    progress: 2,
    target: 5,
    reward: { points: 200, xp: 100 },
    type: 'weekly',
  },
];

const recentFeedbacks = [
  { id: 1, business: 'Demo Cafe', rating: 5, points: 50, createdAt: new Date() },
  { id: 2, business: 'Lezzet Durağı', rating: 4, points: 50, createdAt: new Date(Date.now() - 86400000) },
];

const leaderboard = [
  { rank: 1, name: 'Ahmet Y.', points: 15420, level: 24, avatar: '/images/avatar/AVATAR ERKEK 1.svg' },
  { rank: 2, name: 'Elif K.', points: 12350, level: 21, avatar: '/images/avatar/AVATAR KADIN 1.svg' },
  { rank: 3, name: 'Mehmet D.', points: 11200, level: 19, avatar: '/images/avatar/AVATAR ERKEK 2.svg' },
  { rank: 4, name: 'Siz', points: 350, level: 2, isCurrentUser: true },
];

const rewards = [
  { id: 1, name: 'Ücretsiz Kahve', icon: '/images/avatar/COFFFE.svg', cost: 500 },
  { id: 2, name: '%10 İndirim', icon: '/images/badges/sürpriz kutusu.svg', cost: 300 },
  { id: 3, name: 'VIP Rozet', icon: '/images/badges/TAHT SAHİBİ.svg', cost: 1000 },
];

export default function CustomerDashboard() {
  const { data: session } = useSession();
  const user = session?.user;
  
  const levelProgress = calculateLevelProgress(user?.points || 350);
  const league = getLeague(user?.level || 2);

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-gradient-to-br from-violet-600/20 via-purple-600/10 to-fuchsia-600/20 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative">
                <Avatar className="w-24 h-24 ring-4 ring-primary/30">
                  <AvatarImage src={user?.image || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white text-2xl">
                    {getInitials(user?.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold shadow-lg">
                  {user?.level || 2}
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-2xl font-bold">{user?.name || 'Kullanıcı'}</h2>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                  <Badge variant="secondary" className="gap-1">
                    <Medal className="w-3 h-3" />
                    {league} Lig
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Flame className="w-3 h-3 text-orange-500" />
                    3 günlük seri
                  </Badge>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Seviye İlerlemesi</span>
                    <span className="text-primary font-medium">
                      {formatNumber(user?.points || 350)} / {formatNumber(1000)} XP
                    </span>
                  </div>
                  <Progress value={levelProgress} className="h-3" />
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{formatNumber(user?.points || 150)}</p>
                  <p className="text-sm text-muted-foreground">Puan</p>
                </div>
                <Button asChild variant="gradient" size="sm">
                  <Link href="/customer/scan">
                    <QrCode className="w-4 h-4 mr-2" />
                    QR Tara
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[
          { href: '/customer/scan', icon: QrCode, label: 'QR Tara', color: 'from-violet-500 to-purple-600' },
          { href: '/customer/quests', icon: Target, label: 'Görevler', color: 'from-orange-500 to-amber-600' },
          { href: '/customer/badges', icon: Trophy, label: 'Rozetler', color: 'from-yellow-500 to-orange-600' },
          { href: '/customer/rewards', icon: Gift, label: 'Ödüller', color: 'from-pink-500 to-rose-600' },
        ].map((action, index) => (
          <motion.div
            key={action.href}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link href={action.href}>
              <Card hover className="text-center p-4 group">
                <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-lg`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium">{action.label}</span>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Active Quests */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-orange-500" />
                Aktif Görevler
              </CardTitle>
              <CardDescription>
                Görevleri tamamlayarak ödül kazanın
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/customer/quests">
                Tümü
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeQuests.map((quest) => (
              <div
                key={quest.id}
                className="p-4 rounded-lg border bg-card hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden">
                    <Image
                      src={quest.icon}
                      alt={quest.name}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{quest.name}</h4>
                      <Badge variant={quest.type === 'daily' ? 'secondary' : 'outline'}>
                        {quest.type === 'daily' ? 'Günlük' : 'Haftalık'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {quest.description}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Progress
                          value={(quest.progress / quest.target) * 100}
                          className="h-2"
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {quest.progress}/{quest.target}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {quest.reward.points} puan
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-500" />
                        {quest.reward.xp} XP
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Badges & Leaderboard */}
        <div className="lg:col-span-3 space-y-6">
          {/* Badges */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Rozetlerim
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/customer/badges">Tümü</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {userBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`flex flex-col items-center p-3 rounded-lg ${getRarityBgColor(badge.rarity)}`}
                  >
                    <div className="w-12 h-12 mb-1">
                      <Image
                        src={badge.icon}
                        alt={badge.name}
                        width={48}
                        height={48}
                        className="object-contain"
                      />
                    </div>
                    <span className={`text-xs font-medium ${getRarityColor(badge.rarity)}`}>
                      {badge.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                Liderlik Tablosu
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/customer/leaderboard">Tümü</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center gap-3 p-2 rounded-lg ${
                      entry.isCurrentUser ? 'bg-primary/10 border border-primary/20' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      entry.rank === 1 ? 'bg-yellow-500 text-white' :
                      entry.rank === 2 ? 'bg-gray-400 text-white' :
                      entry.rank === 3 ? 'bg-orange-600 text-white' :
                      'bg-muted'
                    }`}>
                      {entry.rank}
                    </div>
                    {entry.avatar ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted">
                        <Image
                          src={entry.avatar}
                          alt={entry.name}
                          width={32}
                          height={32}
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user?.image || ''} />
                        <AvatarFallback className="text-xs bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                          {getInitials(entry.name)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${entry.isCurrentUser ? 'text-primary' : ''}`}>
                        {entry.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Seviye {entry.level}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {formatNumber(entry.points)} puan
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity & Rewards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Feedbacks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-500" />
              Son Geri Bildirimlerim
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentFeedbacks.map((feedback) => (
                <div
                  key={feedback.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex-1">
                    <p className="font-medium">{feedback.business}</p>
                    <p className="text-sm text-yellow-500">
                      {'⭐'.repeat(feedback.rating)}
                    </p>
                  </div>
                  <Badge variant="success">+{feedback.points} puan</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Available Rewards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-pink-500" />
              Ödül Mağazası
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/customer/rewards">Tümü</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center gap-4 p-3 rounded-lg border"
                >
                  <div className="w-10 h-10">
                    <Image
                      src={reward.icon}
                      alt={reward.name}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{reward.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {reward.cost} puan
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={150 < reward.cost}>
                    Al
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
