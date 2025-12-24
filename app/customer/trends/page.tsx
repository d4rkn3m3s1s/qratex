'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  Clock,
  Flame,
  Target,
  Award,
  Zap,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface TrendData {
  summary: {
    totalFeedbacks: number;
    totalBadges: number;
    totalRewards: number;
    currentPoints: number;
    currentXP: number;
    currentLevel: number;
    memberSince: string;
  };
  trends: {
    feedbackTrend: { date: string; count: number; avgRating: number | null }[];
    pointsTrend: { date: string; points: number }[];
    activityByDayOfWeek: { day: string; count: number }[];
  };
  comparisons: {
    thisWeekFeedbacks: number;
    lastWeekFeedbacks: number;
    feedbackChange: string;
  };
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
    score: string;
    total: number;
  };
  insights: {
    peakHour: string;
    currentStreak: number;
    maxStreak: number;
    daysToNextLevel: number | null;
    xpToNextLevel: number;
    avgDailyFeedbacks: string;
  };
  badges: { id: string; name: string; icon: string; rarity: string }[];
}

export default function CustomerTrendsPage() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrends = async () => {
    try {
      const res = await fetch('/api/customer/trends');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Error fetching trends:', error);
      toast.error('Trend verileri yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTrends();
    toast.success('Veriler güncellendi');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Trend Analizi" description="Aktivite trendlerinizi analiz edin" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Trend Analizi" description="Aktivite trendlerinizi analiz edin" />
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Veriler yüklenemedi</p>
            <Button onClick={handleRefresh} className="mt-4">Tekrar Dene</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxFeedback = Math.max(...data.trends.feedbackTrend.map(t => t.count), 1);
  const maxDayActivity = Math.max(...data.trends.activityByDayOfWeek.map(d => d.count), 1);

  const changeValue = parseFloat(data.comparisons.feedbackChange);
  const isPositive = changeValue > 0;
  const isNegative = changeValue < 0;

  return (
    <div className="space-y-6">
      <DashboardHeader 
        title="Trend Analizi" 
        description="Son 30 günlük aktivite trendlerinizi analiz edin"
        actions={
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      {/* Özet Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Toplam Geri Bildirim</p>
                  <p className="text-2xl font-bold">{data.summary.totalFeedbacks}</p>
                </div>
                <div className="p-3 rounded-full bg-violet-500/20">
                  <Activity className="h-5 w-5 text-violet-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Mevcut Streak</p>
                  <p className="text-2xl font-bold flex items-center gap-1">
                    {data.insights.currentStreak}
                    <Flame className="h-5 w-5 text-orange-500" />
                  </p>
                </div>
                <div className="p-3 rounded-full bg-amber-500/20">
                  <Flame className="h-5 w-5 text-amber-500" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rekor: {data.insights.maxStreak} gün
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Duygu Skoru</p>
                  <p className="text-2xl font-bold">{data.sentiment.score}%</p>
                </div>
                <div className="p-3 rounded-full bg-emerald-500/20">
                  <Sparkles className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pozitiflik oranı
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Haftalık Değişim</p>
                  <p className="text-2xl font-bold flex items-center gap-1">
                    {data.comparisons.feedbackChange}
                    {isPositive && <ArrowUpRight className="h-5 w-5 text-green-500" />}
                    {isNegative && <ArrowDownRight className="h-5 w-5 text-red-500" />}
                    {!isPositive && !isNegative && <Minus className="h-5 w-5 text-gray-500" />}
                  </p>
                </div>
                <div className="p-3 rounded-full bg-blue-500/20">
                  {isPositive ? <TrendingUp className="h-5 w-5 text-green-500" /> : 
                   isNegative ? <TrendingDown className="h-5 w-5 text-red-500" /> :
                   <Minus className="h-5 w-5 text-blue-500" />}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs defaultValue="activity" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="activity" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Aktivite</span>
          </TabsTrigger>
          <TabsTrigger value="sentiment" className="gap-2">
            <PieChart className="h-4 w-4" />
            <span className="hidden sm:inline">Duygu</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">İçgörüler</span>
          </TabsTrigger>
          <TabsTrigger value="progress" className="gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">İlerleme</span>
          </TabsTrigger>
        </TabsList>

        {/* Aktivite Tab */}
        <TabsContent value="activity">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Son 30 Gün Grafiği */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Son 30 Gün Aktivite
                </CardTitle>
                <CardDescription>Günlük geri bildirim sayıları</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-40">
                  {data.trends.feedbackTrend.slice(-30).map((day, i) => (
                    <div
                      key={day.date}
                      className="flex-1 group relative"
                    >
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(day.count / maxFeedback) * 100}%` }}
                        transition={{ delay: i * 0.02, duration: 0.3 }}
                        className={`w-full rounded-t transition-colors ${
                          day.count > 0 
                            ? 'bg-gradient-to-t from-violet-600 to-violet-400 hover:from-violet-500 hover:to-violet-300' 
                            : 'bg-muted'
                        }`}
                        style={{ minHeight: day.count > 0 ? '4px' : '2px' }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border rounded shadow-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        <p className="font-medium">{new Date(day.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</p>
                        <p>{day.count} geri bildirim</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>30 gün önce</span>
                  <span>Bugün</span>
                </div>
              </CardContent>
            </Card>

            {/* Haftalık Aktivite */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Haftalık Dağılım
                </CardTitle>
                <CardDescription>En aktif olduğunuz günler</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.trends.activityByDayOfWeek.map((day, i) => (
                    <div key={day.day} className="flex items-center gap-3">
                      <span className="w-20 text-sm text-muted-foreground">{day.day}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(day.count / maxDayActivity) * 100}%` }}
                          transition={{ delay: i * 0.1, duration: 0.5 }}
                          className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full"
                        />
                      </div>
                      <span className="w-8 text-sm font-medium text-right">{day.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Duygu Analizi Tab */}
        <TabsContent value="sentiment">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-primary" />
                  Duygu Dağılımı
                </CardTitle>
                <CardDescription>Geri bildirimlerinizin duygu analizi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-8">
                  <div className="relative w-48 h-48">
                    {/* Donut Chart */}
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="96"
                        cy="96"
                        r="80"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="24"
                        className="text-muted"
                      />
                      {data.sentiment.total > 0 && (
                        <>
                          {/* Positive */}
                          <motion.circle
                            cx="96"
                            cy="96"
                            r="80"
                            fill="none"
                            stroke="#22c55e"
                            strokeWidth="24"
                            strokeLinecap="round"
                            initial={{ strokeDasharray: '0 502.4' }}
                            animate={{ 
                              strokeDasharray: `${(data.sentiment.positive / data.sentiment.total) * 502.4} 502.4` 
                            }}
                            transition={{ duration: 1 }}
                          />
                          {/* Neutral */}
                          <motion.circle
                            cx="96"
                            cy="96"
                            r="80"
                            fill="none"
                            stroke="#eab308"
                            strokeWidth="24"
                            strokeLinecap="round"
                            initial={{ strokeDasharray: '0 502.4', strokeDashoffset: 0 }}
                            animate={{ 
                              strokeDasharray: `${(data.sentiment.neutral / data.sentiment.total) * 502.4} 502.4`,
                              strokeDashoffset: -((data.sentiment.positive / data.sentiment.total) * 502.4)
                            }}
                            transition={{ duration: 1, delay: 0.2 }}
                          />
                          {/* Negative */}
                          <motion.circle
                            cx="96"
                            cy="96"
                            r="80"
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="24"
                            strokeLinecap="round"
                            initial={{ strokeDasharray: '0 502.4', strokeDashoffset: 0 }}
                            animate={{ 
                              strokeDasharray: `${(data.sentiment.negative / data.sentiment.total) * 502.4} 502.4`,
                              strokeDashoffset: -(((data.sentiment.positive + data.sentiment.neutral) / data.sentiment.total) * 502.4)
                            }}
                            transition={{ duration: 1, delay: 0.4 }}
                          />
                        </>
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold">{data.sentiment.total}</span>
                      <span className="text-sm text-muted-foreground">Toplam</span>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-center p-3 rounded-lg bg-green-500/10">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-sm font-medium">Pozitif</span>
                    </div>
                    <p className="text-2xl font-bold text-green-500">{data.sentiment.positive}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span className="text-sm font-medium">Nötr</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-500">{data.sentiment.neutral}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-500/10">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm font-medium">Negatif</span>
                    </div>
                    <p className="text-2xl font-bold text-red-500">{data.sentiment.negative}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Duygu Skoru Detayı
                </CardTitle>
                <CardDescription>Pozitiflik performansınız</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${
                      Number(data.sentiment.score) >= 50 
                        ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-500/30' 
                        : Number(data.sentiment.score) >= 0
                        ? 'bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border-2 border-yellow-500/30'
                        : 'bg-gradient-to-br from-red-500/20 to-rose-500/20 border-2 border-red-500/30'
                    }`}
                  >
                    <span className="text-4xl font-bold">{data.sentiment.score}%</span>
                  </motion.div>
                  <p className="mt-4 text-muted-foreground">
                    {Number(data.sentiment.score) >= 70 && '🎉 Harika! Çok pozitifsiniz!'}
                    {Number(data.sentiment.score) >= 50 && Number(data.sentiment.score) < 70 && '👍 İyi gidiyorsunuz!'}
                    {Number(data.sentiment.score) >= 0 && Number(data.sentiment.score) < 50 && '💪 Gelişim alanı var'}
                    {Number(data.sentiment.score) < 0 && '🤔 Daha pozitif olmaya çalışın'}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Pozitiflik Oranı</span>
                    <span className="font-medium text-green-500">
                      {data.sentiment.total > 0 
                        ? ((data.sentiment.positive / data.sentiment.total) * 100).toFixed(0) 
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={data.sentiment.total > 0 ? (data.sentiment.positive / data.sentiment.total) * 100 : 0} 
                    className="h-2 bg-muted" 
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* İçgörüler Tab */}
        <TabsContent value="insights">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 mb-4">
                    <Clock className="h-8 w-8 text-blue-500" />
                  </div>
                  <h3 className="font-semibold mb-1">En Aktif Saat</h3>
                  <p className="text-2xl font-bold text-primary">{data.insights.peakHour}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Bu saatlerde en çok geri bildirim veriyorsunuz
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 mb-4">
                    <Flame className="h-8 w-8 text-orange-500" />
                  </div>
                  <h3 className="font-semibold mb-1">Streak Rekoru</h3>
                  <p className="text-2xl font-bold text-primary">{data.insights.maxStreak} gün</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Mevcut: {data.insights.currentStreak} gün ardışık
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 mb-4">
                    <Activity className="h-8 w-8 text-violet-500" />
                  </div>
                  <h3 className="font-semibold mb-1">Günlük Ortalama</h3>
                  <p className="text-2xl font-bold text-primary">{data.insights.avgDailyFeedbacks}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    geri bildirim / gün
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Card className="h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-emerald-500/20 to-green-500/20 mb-4">
                    <Award className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="font-semibold mb-1">Kazanılan Rozetler</h3>
                  <p className="text-2xl font-bold text-primary">{data.summary.totalBadges}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {data.badges.length > 0 && `Son: ${data.badges[0]?.name}`}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 mb-4">
                    <Zap className="h-8 w-8 text-pink-500" />
                  </div>
                  <h3 className="font-semibold mb-1">Toplam XP</h3>
                  <p className="text-2xl font-bold text-primary">{data.summary.currentXP}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Seviye {data.summary.currentLevel}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card className="h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="p-4 rounded-full bg-gradient-to-br from-yellow-500/20 to-amber-500/20 mb-4">
                    <Target className="h-8 w-8 text-yellow-500" />
                  </div>
                  <h3 className="font-semibold mb-1">Sonraki Seviye</h3>
                  <p className="text-2xl font-bold text-primary">
                    {data.insights.daysToNextLevel !== null ? `~${data.insights.daysToNextLevel} gün` : '-'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {data.insights.xpToNextLevel} XP kaldı
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>

        {/* İlerleme Tab */}
        <TabsContent value="progress">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Puan İlerlemesi
                </CardTitle>
                <CardDescription>Son 30 günlük kümülatif puan kazanımı</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative h-48">
                  {/* Line Chart */}
                  <svg className="w-full h-full" viewBox="0 0 400 150">
                    {/* Grid lines */}
                    {[0, 1, 2, 3, 4].map((i) => (
                      <line
                        key={i}
                        x1="0"
                        y1={i * 37.5}
                        x2="400"
                        y2={i * 37.5}
                        stroke="currentColor"
                        strokeOpacity="0.1"
                      />
                    ))}
                    
                    {/* Area */}
                    <motion.path
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.5 }}
                      d={`
                        M 0 150
                        ${data.trends.pointsTrend.map((p, i) => {
                          const x = (i / (data.trends.pointsTrend.length - 1)) * 400;
                          const maxPoints = Math.max(...data.trends.pointsTrend.map(pt => pt.points), 1);
                          const y = 150 - (p.points / maxPoints) * 140;
                          return `L ${x} ${y}`;
                        }).join(' ')}
                        L 400 150
                        Z
                      `}
                      fill="url(#gradient)"
                      fillOpacity="0.3"
                    />
                    
                    {/* Line */}
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.5 }}
                      d={`
                        M ${data.trends.pointsTrend.map((p, i) => {
                          const x = (i / (data.trends.pointsTrend.length - 1)) * 400;
                          const maxPoints = Math.max(...data.trends.pointsTrend.map(pt => pt.points), 1);
                          const y = 150 - (p.points / maxPoints) * 140;
                          return `${x} ${y}`;
                        }).join(' L ')}
                      `}
                      fill="none"
                      stroke="url(#lineGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />

                    <defs>
                      <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#d946ef" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="flex justify-between mt-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Başlangıç</p>
                    <p className="font-medium">0 puan</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground">Şu an</p>
                    <p className="font-medium text-primary">{data.summary.currentPoints} puan</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  Son Kazanılan Rozetler
                </CardTitle>
                <CardDescription>En son elde ettiğiniz başarılar</CardDescription>
              </CardHeader>
              <CardContent>
                {data.badges.length > 0 ? (
                  <div className="space-y-3">
                    {data.badges.map((badge, i) => (
                      <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        <div className="text-2xl">{badge.icon || '🏅'}</div>
                        <div className="flex-1">
                          <p className="font-medium">{badge.name}</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {badge.rarity}
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Henüz rozet kazanmadınız</p>
                    <p className="text-sm mt-1">Görevleri tamamlayarak rozet kazanın!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

