'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  MessageSquare,
  QrCode,
  TrendingUp,
  Trophy,
  Activity,
  Clock,
  RefreshCw,
  LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';

interface DashboardStats {
  title: string;
  value: number | string;
  change: number;
  icon: string;
  iconColor: string;
  iconBgColor: string;
}

interface RecentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: 'ADMIN' | 'DEALER' | 'CUSTOMER';
  createdAt: string;
}

interface RecentFeedback {
  id: string;
  text: string;
  rating: number;
  sentiment: string;
  createdAt: string;
  userName: string;
  businessName: string;
}

interface TopDealer {
  id: string;
  name: string;
  feedbacks: number;
  rating: number;
}

interface DashboardData {
  stats: DashboardStats[];
  recentUsers: RecentUser[];
  recentFeedbacks: RecentFeedback[];
  topDealers: TopDealer[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  totals: {
    users: number;
    feedbacks: number;
    qrCodes: number;
    activeQRCodes: number;
    scans: number;
  };
}

const iconMap: Record<string, LucideIcon> = {
  Users,
  MessageSquare,
  QrCode,
  TrendingUp,
};

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

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'ADMIN': return 'Admin';
    case 'DEALER': return 'Bayi';
    default: return 'Müşteri';
  }
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/dashboard');
      const result = await res.json();
      
      if (result.success) {
        setData(result);
      } else {
        toast.error('Dashboard verileri yüklenemedi');
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      toast.error('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Activity className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Veriler yüklenemedi</h3>
        <p className="text-muted-foreground mb-4">Lütfen tekrar deneyin</p>
        <Button onClick={fetchDashboard}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold">Hoş Geldiniz, Admin 👋</h2>
          <p className="text-muted-foreground">
            İşte platformunuzun genel durumu
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDashboard}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {data.stats.map((stat, index) => {
          const IconComponent: LucideIcon = iconMap[stat.icon] || Activity;
          return (
            <StatsCard 
              key={stat.title} 
              title={stat.title}
              value={stat.value}
              change={stat.change}
              icon={IconComponent}
              iconColor={stat.iconColor}
              iconBgColor={stat.iconBgColor}
              delay={index * 0.1} 
            />
          );
        })}
      </div>

      {/* Charts & Tables */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Sentiment Distribution */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Duygu Dağılımı
            </CardTitle>
            <CardDescription>
              Tüm geri bildirimlerin duygu analizi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 rounded-lg bg-green-500/10">
                  <p className="text-3xl font-bold text-green-500">{data.sentiment.positive}</p>
                  <p className="text-sm text-muted-foreground">Olumlu</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-500/10">
                  <p className="text-3xl font-bold text-gray-500">{data.sentiment.neutral}</p>
                  <p className="text-sm text-muted-foreground">Nötr</p>
                </div>
                <div className="p-4 rounded-lg bg-red-500/10">
                  <p className="text-3xl font-bold text-red-500">{data.sentiment.negative}</p>
                  <p className="text-sm text-muted-foreground">Olumsuz</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Olumlu</span>
                  <span>{data.totals.feedbacks > 0 ? Math.round((data.sentiment.positive / data.totals.feedbacks) * 100) : 0}%</span>
                </div>
                <Progress 
                  value={data.totals.feedbacks > 0 ? (data.sentiment.positive / data.totals.feedbacks) * 100 : 0} 
                  indicatorClassName="bg-green-500" 
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Nötr</span>
                  <span>{data.totals.feedbacks > 0 ? Math.round((data.sentiment.neutral / data.totals.feedbacks) * 100) : 0}%</span>
                </div>
                <Progress 
                  value={data.totals.feedbacks > 0 ? (data.sentiment.neutral / data.totals.feedbacks) * 100 : 0} 
                  indicatorClassName="bg-gray-500" 
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Olumsuz</span>
                  <span>{data.totals.feedbacks > 0 ? Math.round((data.sentiment.negative / data.totals.feedbacks) * 100) : 0}%</span>
                </div>
                <Progress 
                  value={data.totals.feedbacks > 0 ? (data.sentiment.negative / data.totals.feedbacks) * 100 : 0} 
                  indicatorClassName="bg-red-500" 
                />
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
            {data.topDealers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Henüz işletme yok</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.topDealers.map((dealer, index) => (
                  <motion.div 
                    key={dealer.id} 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-4"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                      index === 1 ? 'bg-gray-400/20 text-gray-400' :
                      index === 2 ? 'bg-orange-600/20 text-orange-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{dealer.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {dealer.feedbacks} geri bildirim
                      </p>
                    </div>
                    <Badge variant="secondary">
                      ⭐ {dealer.rating.toFixed(1)}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            )}
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
            {data.recentUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Henüz kullanıcı yok</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentUsers.map((user, index) => (
                  <motion.div 
                    key={user.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-4"
                  >
                    <Avatar>
                      <AvatarImage src={user.image || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                        {getInitials(user.name || user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.name || 'İsimsiz'}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={getRoleColor(user.role) as "default" | "secondary" | "destructive"}>
                        {getRoleLabel(user.role)}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(user.createdAt)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
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
            {data.recentFeedbacks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Henüz geri bildirim yok</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentFeedbacks.map((feedback, index) => (
                  <motion.div 
                    key={feedback.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {feedback.userName} • {feedback.businessName}
                        </span>
                      </div>
                      <p className="text-sm truncate">{feedback.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-yellow-500 text-sm">
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
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Platform Özeti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="p-4 rounded-lg bg-blue-500/10 text-center">
              <Users className="h-6 w-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{data.totals.users}</p>
              <p className="text-xs text-muted-foreground">Toplam Kullanıcı</p>
            </div>
            <div className="p-4 rounded-lg bg-green-500/10 text-center">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{data.totals.feedbacks}</p>
              <p className="text-xs text-muted-foreground">Toplam Geri Bildirim</p>
            </div>
            <div className="p-4 rounded-lg bg-purple-500/10 text-center">
              <QrCode className="h-6 w-6 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">{data.totals.qrCodes}</p>
              <p className="text-xs text-muted-foreground">Toplam QR Kod</p>
            </div>
            <div className="p-4 rounded-lg bg-orange-500/10 text-center">
              <QrCode className="h-6 w-6 mx-auto mb-2 text-orange-500" />
              <p className="text-2xl font-bold">{data.totals.activeQRCodes}</p>
              <p className="text-xs text-muted-foreground">Aktif QR Kod</p>
            </div>
            <div className="p-4 rounded-lg bg-cyan-500/10 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 text-cyan-500" />
              <p className="text-2xl font-bold">{data.totals.scans}</p>
              <p className="text-xs text-muted-foreground">Toplam Tarama</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
