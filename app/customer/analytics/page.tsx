'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
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
  MessageSquare,
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
import { toast } from '@/lib/admin-toast';
import { useCustomerT } from '@/lib/use-customer-locale';

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
  branchComparison: Array<{
    dealerId: string;
    dealerName: string;
    visits: number;
    avgRating: number;
    estimatedWaitMinutes: number;
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
  const tc = useCustomerT();
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

      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      } else {
        // Sahte demo verisi GÖSTERMİYORUZ — başarısızlıkta gerçek veri yokmuş
        // gibi görünüp kullanıcıyı yanıltmamak için boş/hata durumu gösterilir.
        setAnalytics(null);
        if (!data.success) toast.error(tc('customerAnalytics.loadError'));
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setAnalytics(null);
      toast.error(tc('customerAnalytics.loadError'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] text-center gap-3 px-6">
        <p className="text-lg font-semibold">Henüz analiz verisi yok</p>
        <p className="text-sm text-muted-foreground max-w-md">
          İşletmeleri ziyaret edip kart okuttukça burada tüketim, puan ve alışkanlık analizlerin görünecek.
        </p>
      </div>
    );
  }

  const maxWeeklyVisits = Math.max(...analytics.weeklyPattern.map(d => d.visits));
  const maxHourlyVisits = Math.max(...analytics.hourlyPattern.map(d => d.visits));

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <Motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-balance">
            <BarChart3 className="h-7 w-7 shrink-0 text-primary" />
            {tc('customerAnalytics.title')}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-pretty leading-relaxed">{tc('customerAnalytics.description')}</p>
        </div>
        <div className="flex w-full sm:w-auto items-stretch sm:items-center gap-2 shrink-0">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full min-h-11 sm:min-h-10 sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{tc('customerAnalytics.period7')}</SelectItem>
              <SelectItem value="30">{tc('customerAnalytics.period30')}</SelectItem>
              <SelectItem value="90">{tc('customerAnalytics.period90')}</SelectItem>
              <SelectItem value="365">{tc('customerAnalytics.period365')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-11 w-11 min-h-11 min-w-11 shrink-0 touch-manipulation" onClick={fetchAnalytics} aria-label={tc('customerAnalytics.refresh')}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Motion.div>

      {/* Tüketimler & geri bildirimler — kişisel analitik içinde hızlı erişim */}
      <Motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Link
          href="/customer/consumptions"
          className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-card/80"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Coffee className="h-6 w-6" />
          </div>
          <div className="min-w-0 text-left">
            <p className="font-semibold">{tc('customerAnalytics.consumptions')}</p>
            <p className="text-sm text-muted-foreground">{tc('customerAnalytics.consumptionsDesc')}</p>
            <span className="mt-1 inline-flex items-center text-xs font-medium text-primary group-hover:underline">
              {tc('customerAnalytics.go')} <ArrowUpRight className="ml-0.5 h-3 w-3" />
            </span>
          </div>
        </Link>
        <Link
          href="/customer/feedbacks"
          className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-card/80"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div className="min-w-0 text-left">
            <p className="font-semibold">{tc('customerAnalytics.feedbacks')}</p>
            <p className="text-sm text-muted-foreground">{tc('customerAnalytics.feedbacksDesc')}</p>
            <span className="mt-1 inline-flex items-center text-xs font-medium text-primary group-hover:underline">
              {tc('customerAnalytics.go')} <ArrowUpRight className="ml-0.5 h-3 w-3" />
            </span>
          </div>
        </Link>
      </Motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Toplam Tüketim',
            value: analytics.summary.totalConsumptions,
            icon: ShoppingBag,
            color: 'from-primary to-primary/80',
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
            color: 'from-red-500 to-red-700',
            change: null,
          },
        ].map((stat, index) => (
          <Motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
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
          </Motion.div>
        ))}
      </div>

      {/* VIP & Next Reward */}
      <div className="grid md:grid-cols-2 gap-4">
        <Motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
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
        </Motion.div>

        <Motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
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
        </Motion.div>
      </div>

      {/* Category Breakdown & Top Products */}
      <div className="grid md:grid-cols-2 gap-4">
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
        </Motion.div>

        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
        </Motion.div>
      </div>

      {/* Weekly & Hourly Patterns */}
      <div className="grid md:grid-cols-2 gap-4">
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
        </Motion.div>

        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
        </Motion.div>
      </div>

      {/* Favorite Dealers */}
      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
      </Motion.div>

      {/* Şube bazlı deneyim karşılaştırması */}
      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Şube Bazlı Deneyim Karşılaştırması
            </CardTitle>
            <CardDescription>
              Memnuniyet puanınız ve tahmini bekleme süresi karşılaştırması
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.branchComparison.length > 0 ? (
              analytics.branchComparison.map((branch) => (
                <div
                  key={branch.dealerId}
                  className="rounded-lg border border-border/60 bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{branch.dealerName}</p>
                    <Badge variant="secondary">{branch.visits} ziyaret</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-background/70 p-2">
                      <p className="text-xs text-muted-foreground">Ortalama memnuniyet</p>
                      <p className="font-semibold">{branch.avgRating > 0 ? `${branch.avgRating}/5` : 'Yeterli veri yok'}</p>
                    </div>
                    <div className="rounded-md bg-background/70 p-2">
                      <p className="text-xs text-muted-foreground">Tahmini bekleme</p>
                      <p className="font-semibold">{branch.estimatedWaitMinutes} dk</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Karşılaştırma için en az iki farklı şube verisi gerekiyor.
              </p>
            )}
          </CardContent>
        </Card>
      </Motion.div>

      {/* Monthly Trends */}
      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
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
      </Motion.div>

      {/* Achievements */}
      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Başarılarım
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {analytics.achievements.totalBadges}
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

              <div className="rounded-lg border border-border/60 bg-card/60 p-4">
                <h4 className="mb-2 font-semibold">Sonraki Hedef</h4>
                <p className="text-lg font-bold text-primary">{analytics.achievements.nextMilestone.name}</p>
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
      </Motion.div>
    </div>
  );
}
