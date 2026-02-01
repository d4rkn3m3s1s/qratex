'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Star,
  Calendar,
  Loader2,
  Sparkles,
  Target,
  Zap,
  Award,
  Activity,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Download,
  RefreshCw,
  Flame,
  Coffee,
  ShoppingBag,
  Utensils,
  MapPin,
  CreditCard,
  Crown,
  Gift,
  Heart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface CustomerAnalytics {
  summary: {
    totalConsumptions: number;
    totalSpent: number;
    totalPoints: number;
    currentStreak: number;
    avgSpentPerVisit: number;
    favoriteCategory: string;
    vipTier: string;
    memberSince: string;
  };
  trends: {
    consumptionGrowth: number;
    pointsGrowth: number;
    spendingTrend: string;
  };
  categoryBreakdown: Array<{
    name: string;
    count: number;
    percentage: number;
    icon: string;
  }>;
  weeklyPattern: Array<{
    day: string;
    visits: number;
    avgSpent: number;
  }>;
  hourlyPattern: Array<{
    hour: number;
    visits: number;
  }>;
  topProducts: Array<{
    name: string;
    count: number;
    totalSpent: number;
  }>;
  favoriteDealers: Array<{
    name: string;
    visits: number;
    avgRating: number;
  }>;
  monthlyData: Array<{
    month: string;
    consumptions: number;
    spent: number;
    points: number;
  }>;
  achievements: {
    totalBadges: number;
    recentBadges: Array<{ name: string; icon: string; date: string }>;
    nextMilestone: { name: string; progress: number; target: number };
  };
  rewards: {
    totalRedeemed: number;
    pointsSaved: number;
    nextReward: { name: string; pointsNeeded: number };
  };
}

export default function CustomerAnalyticsPage() {
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customer/analytics?period=${period}`);
      const data = await res.json();

      if (data.success) {
        setAnalytics(data.analytics);
      } else {
        // Mock data for demo
        setAnalytics({
          summary: {
            totalConsumptions: 47,
            totalSpent: 2847.50,
            totalPoints: 7670,
            currentStreak: 5,
            avgSpentPerVisit: 60.58,
            favoriteCategory: 'Kahve & İçecek',
            vipTier: 'Gold',
            memberSince: '2024-01-15',
          },
          trends: {
            consumptionGrowth: 23,
            pointsGrowth: 45,
            spendingTrend: 'up',
          },
          categoryBreakdown: [
            { name: 'Kahve & İçecek', count: 28, percentage: 60, icon: '☕' },
            { name: 'Yemek', count: 12, percentage: 25, icon: '🍽️' },
            { name: 'Tatlı', count: 5, percentage: 11, icon: '🍰' },
            { name: 'Diğer', count: 2, percentage: 4, icon: '📦' },
          ],
          weeklyPattern: [
            { day: 'Pzt', visits: 8, avgSpent: 45 },
            { day: 'Sal', visits: 6, avgSpent: 52 },
            { day: 'Çar', visits: 9, avgSpent: 48 },
            { day: 'Per', visits: 7, avgSpent: 55 },
            { day: 'Cum', visits: 12, avgSpent: 68 },
            { day: 'Cmt', visits: 3, avgSpent: 85 },
            { day: 'Paz', visits: 2, avgSpent: 78 },
          ],
          hourlyPattern: [
            { hour: 8, visits: 5 },
            { hour: 9, visits: 12 },
            { hour: 10, visits: 8 },
            { hour: 11, visits: 4 },
            { hour: 12, visits: 15 },
            { hour: 13, visits: 10 },
            { hour: 14, visits: 6 },
            { hour: 15, visits: 8 },
            { hour: 16, visits: 4 },
            { hour: 17, visits: 7 },
            { hour: 18, visits: 3 },
          ],
          topProducts: [
            { name: 'Caffè Latte', count: 18, totalSpent: 540 },
            { name: 'Cappuccino', count: 12, totalSpent: 324 },
            { name: 'Kola', count: 8, totalSpent: 120 },
            { name: 'Cheesecake', count: 5, totalSpent: 225 },
          ],
          favoriteDealers: [
            { name: 'Demo Cafe', visits: 35, avgRating: 4.8 },
            { name: 'Kahve Dünyası', visits: 8, avgRating: 4.5 },
            { name: 'Starbucks', visits: 4, avgRating: 4.2 },
          ],
          monthlyData: [
            { month: 'Eyl', consumptions: 8, spent: 420, points: 840 },
            { month: 'Eki', consumptions: 12, spent: 680, points: 1360 },
            { month: 'Kas', consumptions: 15, spent: 890, points: 1780 },
            { month: 'Ara', consumptions: 12, spent: 857, points: 1714 },
          ],
          achievements: {
            totalBadges: 12,
            recentBadges: [
              { name: 'Sadık Müşteri', icon: '🏆', date: '2024-01-20' },
              { name: '50 Yorum', icon: '💬', date: '2024-01-15' },
              { name: 'Kahve Uzmanı', icon: '☕', date: '2024-01-10' },
            ],
            nextMilestone: { name: '100 Ziyaret', progress: 47, target: 100 },
          },
          rewards: {
            totalRedeemed: 5,
            pointsSaved: 2500,
            nextReward: { name: 'Ücretsiz Kahve', pointsNeeded: 330 },
          },
        });
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Analitik verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) return null;

  const maxWeeklyVisits = Math.max(...analytics.weeklyPattern.map(d => d.visits));
  const maxHourlyVisits = Math.max(...analytics.hourlyPattern.map(d => d.visits));

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            Kişisel Analitiğim
          </h1>
          <p className="text-muted-foreground mt-1">Tüketim alışkanlıklarınızı ve istatistiklerinizi görün</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Son 7 Gün</SelectItem>
              <SelectItem value="30">Son 30 Gün</SelectItem>
              <SelectItem value="90">Son 3 Ay</SelectItem>
              <SelectItem value="365">Son 1 Yıl</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAnalytics}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Toplam Tüketim',
            value: analytics.summary.totalConsumptions,
            icon: ShoppingBag,
            color: 'from-violet-500 to-purple-600',
            change: analytics.trends.consumptionGrowth,
          },
          {
            label: 'Toplam Harcama',
            value: `₺${analytics.summary.totalSpent.toLocaleString()}`,
            icon: CreditCard,
            color: 'from-emerald-500 to-green-600',
            change: null,
          },
          {
            label: 'Toplam Puan',
            value: analytics.summary.totalPoints.toLocaleString(),
            icon: Sparkles,
            color: 'from-amber-500 to-orange-600',
            change: analytics.trends.pointsGrowth,
          },
          {
            label: 'Günlük Seri',
            value: `${analytics.summary.currentStreak} gün`,
            icon: Flame,
            color: 'from-rose-500 to-red-600',
            change: null,
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.color}`}>
                    <stat.icon className="h-5 w-5 text-white" />
                  </div>
                  {stat.change !== null && (
                    <Badge variant={stat.change >= 0 ? 'default' : 'destructive'} className="text-xs">
                      {stat.change >= 0 ? '+' : ''}{stat.change}%
                    </Badge>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* VIP & Next Reward */}
      <div className="grid md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <Card className="border-0 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border border-amber-500/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
                  <Crown className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Mevcut Seviye</p>
                  <h3 className="text-2xl font-bold text-amber-500">{analytics.summary.vipTier}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ortalama harcama: ₺{analytics.summary.avgSpentPerVisit.toFixed(2)}/ziyaret
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Favori Kategori</p>
                  <p className="font-medium">{analytics.summary.favoriteCategory}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center">
                  <Gift className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Sonraki Ödül</p>
                  <h3 className="text-xl font-bold">{analytics.rewards.nextReward.name}</h3>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{analytics.summary.totalPoints} puan</span>
                      <span>{analytics.rewards.nextReward.pointsNeeded} puan gerekli</span>
                    </div>
                    <Progress 
                      value={(analytics.summary.totalPoints / (analytics.summary.totalPoints + analytics.rewards.nextReward.pointsNeeded)) * 100} 
                      className="h-2"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Category Breakdown & Top Products */}
      <div className="grid md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-primary" />
                Kategori Dağılımı
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analytics.categoryBreakdown.map((cat, index) => (
                <div key={cat.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon}</span>
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{cat.count} ({cat.percentage}%)</span>
                  </div>
                  <Progress value={cat.percentage} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" />
                En Çok Tüketilen Ürünler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analytics.topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? 'bg-amber-500/20 text-amber-500' :
                      index === 1 ? 'bg-slate-400/20 text-slate-400' :
                      index === 2 ? 'bg-orange-500/20 text-orange-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.count} kez</p>
                    </div>
                  </div>
                  <span className="font-semibold">₺{product.totalSpent}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Weekly & Hourly Patterns */}
      <div className="grid md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Haftalık Dağılım
              </CardTitle>
              <CardDescription>Hangi günler daha aktifsiniz?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-2 h-32">
                {analytics.weeklyPattern.map((day) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                    <div 
                      className="w-full bg-gradient-to-t from-primary/80 to-primary rounded-t transition-all"
                      style={{ height: `${(day.visits / maxWeeklyVisits) * 100}%`, minHeight: '4px' }}
                    />
                    <span className="text-xs text-muted-foreground">{day.day}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Saatlik Dağılım
              </CardTitle>
              <CardDescription>En yoğun saatleriniz</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-11 gap-1">
                {analytics.hourlyPattern.map((hour) => {
                  const intensity = hour.visits / maxHourlyVisits;
                  return (
                    <div key={hour.hour} className="flex flex-col items-center gap-1">
                      <div 
                        className="w-full h-8 rounded transition-all"
                        style={{ 
                          backgroundColor: `rgba(139, 92, 246, ${0.2 + intensity * 0.8})`,
                        }}
                        title={`${hour.hour}:00 - ${hour.visits} ziyaret`}
                      />
                      <span className="text-[10px] text-muted-foreground">{hour.hour}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                En yoğun saat: {analytics.hourlyPattern.reduce((a, b) => a.visits > b.visits ? a : b).hour}:00
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Favorite Dealers */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              Favori İşletmelerim
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              {analytics.favoriteDealers.map((dealer, index) => (
                <div key={dealer.name} className="p-4 rounded-lg bg-muted/50 text-center">
                  <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3 ${
                    index === 0 ? 'bg-gradient-to-br from-amber-500 to-yellow-500' :
                    index === 1 ? 'bg-gradient-to-br from-slate-400 to-slate-500' :
                    'bg-gradient-to-br from-orange-500 to-amber-500'
                  }`}>
                    <span className="text-white font-bold">{index + 1}</span>
                  </div>
                  <h4 className="font-semibold">{dealer.name}</h4>
                  <p className="text-sm text-muted-foreground">{dealer.visits} ziyaret</p>
                  <div className="flex items-center justify-center gap-1 mt-2">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                    <span className="font-medium">{dealer.avgRating}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Monthly Trends */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Aylık Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-3">Ay</th>
                    <th className="pb-3 text-center">Tüketim</th>
                    <th className="pb-3 text-center">Harcama</th>
                    <th className="pb-3 text-center">Puan</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.monthlyData.map((month) => (
                    <tr key={month.month} className="border-t border-border/50">
                      <td className="py-3 font-medium">{month.month}</td>
                      <td className="py-3 text-center">{month.consumptions}</td>
                      <td className="py-3 text-center">₺{month.spent}</td>
                      <td className="py-3 text-center text-primary font-medium">+{month.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Achievements */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Başarılarım
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">{analytics.achievements.totalBadges}</span>
                  </div>
                  <div>
                    <p className="font-semibold">Toplam Rozet</p>
                    <p className="text-sm text-muted-foreground">Kazanılan başarılar</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {analytics.achievements.recentBadges.map((badge) => (
                    <div key={badge.name} className="flex items-center gap-2 text-sm">
                      <span>{badge.icon}</span>
                      <span>{badge.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                <h4 className="font-semibold mb-2">Sonraki Hedef</h4>
                <p className="text-lg font-bold text-cyan-500">{analytics.achievements.nextMilestone.name}</p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span>{analytics.achievements.nextMilestone.progress}</span>
                    <span>{analytics.achievements.nextMilestone.target}</span>
                  </div>
                  <Progress 
                    value={(analytics.achievements.nextMilestone.progress / analytics.achievements.nextMilestone.target) * 100} 
                    className="h-3"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {analytics.achievements.nextMilestone.target - analytics.achievements.nextMilestone.progress} kaldı
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
