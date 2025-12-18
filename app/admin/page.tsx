'use client';

import { motion } from 'framer-motion';
import {
  Users,
  MessageSquare,
  QrCode,
  TrendingUp,
  Trophy,
  Gift,
  Activity,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { getInitials, formatRelativeTime } from '@/lib/utils';

// Demo data
const stats = [
  {
    title: 'Toplam Kullanıcı',
    value: 12543,
    change: 12,
    icon: Users,
    iconColor: 'text-blue-500',
    iconBgColor: 'bg-blue-500/10',
  },
  {
    title: 'Geri Bildirim',
    value: 45231,
    change: 8,
    icon: MessageSquare,
    iconColor: 'text-green-500',
    iconBgColor: 'bg-green-500/10',
  },
  {
    title: 'Aktif QR Kod',
    value: 3452,
    change: 23,
    icon: QrCode,
    iconColor: 'text-purple-500',
    iconBgColor: 'bg-purple-500/10',
  },
  {
    title: 'Dönüşüm Oranı',
    value: '68%',
    change: 5,
    icon: TrendingUp,
    iconColor: 'text-orange-500',
    iconBgColor: 'bg-orange-500/10',
  },
];

const recentUsers = [
  { id: 1, name: 'Ahmet Yılmaz', email: 'ahmet@email.com', role: 'DEALER', createdAt: new Date() },
  { id: 2, name: 'Elif Demir', email: 'elif@email.com', role: 'CUSTOMER', createdAt: new Date(Date.now() - 3600000) },
  { id: 3, name: 'Mehmet Kaya', email: 'mehmet@email.com', role: 'CUSTOMER', createdAt: new Date(Date.now() - 7200000) },
  { id: 4, name: 'Ayşe Şahin', email: 'ayse@email.com', role: 'DEALER', createdAt: new Date(Date.now() - 86400000) },
];

const recentFeedbacks = [
  { id: 1, text: 'Harika bir deneyimdi!', rating: 5, sentiment: 'positive', createdAt: new Date() },
  { id: 2, text: 'Servis biraz yavaştı', rating: 3, sentiment: 'neutral', createdAt: new Date(Date.now() - 1800000) },
  { id: 3, text: 'Çok memnun kaldım', rating: 5, sentiment: 'positive', createdAt: new Date(Date.now() - 3600000) },
  { id: 4, text: 'Beklentilerimi karşılamadı', rating: 2, sentiment: 'negative', createdAt: new Date(Date.now() - 7200000) },
];

const topDealers = [
  { id: 1, name: 'Demo Cafe', feedbacks: 1234, rating: 4.8 },
  { id: 2, name: 'Lezzet Durağı', feedbacks: 987, rating: 4.6 },
  { id: 3, name: 'Kahve Evi', feedbacks: 756, rating: 4.5 },
  { id: 4, name: 'Tatlı Köşe', feedbacks: 543, rating: 4.3 },
];

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case 'positive': return 'success';
    case 'negative': return 'destructive';
    default: return 'secondary';
  }
};

const getRoleColor = (role: string) => {
  switch (role) {
    case 'ADMIN': return 'destructive';
    case 'DEALER': return 'default';
    default: return 'secondary';
  }
};

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-2xl font-bold">Hoş Geldiniz, Admin 👋</h2>
        <p className="text-muted-foreground">
          İşte platformunuzun genel durumu
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
        ))}
      </div>

      {/* Charts & Tables */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Activity Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Aktivite Grafiği
            </CardTitle>
            <CardDescription>
              Son 30 günlük geri bildirim ve kullanıcı aktivitesi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Grafik verisi yükleniyor...</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Dealers */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              En İyi İşletmeler
            </CardTitle>
            <CardDescription>
              En çok geri bildirim alan işletmeler
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topDealers.map((dealer, index) => (
                <div key={dealer.id} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{dealer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {dealer.feedbacks} geri bildirim
                    </p>
                  </div>
                  <Badge variant="secondary">
                    ⭐ {dealer.rating}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Data */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Son Kayıt Olan Kullanıcılar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={getRoleColor(user.role) as "default" | "secondary" | "destructive"}>
                      {user.role}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(user.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Feedbacks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-500" />
              Son Geri Bildirimler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentFeedbacks.map((feedback) => (
                <div key={feedback.id} className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{feedback.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-yellow-500">
                        {'⭐'.repeat(feedback.rating)}
                      </span>
                      <Badge variant={getSentimentColor(feedback.sentiment) as "success" | "destructive" | "secondary"}>
                        {feedback.sentiment === 'positive' ? 'Olumlu' : 
                         feedback.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(feedback.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Sistem Durumu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'API Uptime', value: 99.9, color: 'bg-green-500' },
              { label: 'Veritabanı', value: 98.5, color: 'bg-green-500' },
              { label: 'AI Servisi', value: 95.2, color: 'bg-yellow-500' },
              { label: 'Storage', value: 72, color: 'bg-blue-500' },
            ].map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-sm text-muted-foreground">{item.value}%</span>
                </div>
                <Progress value={item.value} indicatorClassName={item.color} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

