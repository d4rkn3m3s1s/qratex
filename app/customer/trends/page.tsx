'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Gift,
  MessageSquare,
  Trophy,
  Medal,
  Crown,
  ChevronRight,
  Percent,
  Users,
  CalendarDays,
  Timer,
  Gauge,
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

const rarityColors: Record<string, string> = {
  common: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  rare: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  epic: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  legendary: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export default function CustomerTrendsPage() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrends = async () => {
    try {
      const res = await fetch('/api/customer/trends', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-24 bg-muted rounded" />
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
            <Activity className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
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
  
  // Calculate level progress
  const xpForCurrentLevel = data.summary.currentLevel * 1000;
  const xpProgress = ((data.summary.currentXP - xpForCurrentLevel + 1000) / 1000) * 100;
  
  // Calculate member days
  const memberDays = Math.floor((Date.now() - new Date(data.summary.memberSince).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      <DashboardHeader 
        title="Trend Analizi" 
        description="Son 30 günlük aktivite trendlerinizi detaylı analiz edin"
        actions={
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5 sm:gap-2 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </Button>
        }
      />

      {/* Hero Stats - Ana Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          {
            title: 'Toplam Puan',
            value: data.summary.currentPoints.toLocaleString(),
            icon: Star,
            color: 'from-yellow-500 to-amber-500',
            bgColor: 'from-yellow-500/20 to-amber-500/10',
            borderColor: 'border-yellow-500/30',
            iconBg: 'bg-yellow-500/20',
            iconColor: 'text-yellow-500',
            subtitle: `${data.summary.totalRewards} ödül alındı`,
          },
          {
            title: 'Seviye',
            value: data.summary.currentLevel.toString(),
            icon: Trophy,
            color: 'from-purple-500 to-violet-500',
            bgColor: 'from-purple-500/20 to-violet-500/10',
            borderColor: 'border-purple-500/30',
            iconBg: 'bg-purple-500/20',
            iconColor: 'text-purple-500',
            subtitle: `${data.summary.currentXP.toLocaleString()} XP`,
            progress: xpProgress,
          },
          {
            title: 'Geri Bildirim',
            value: data.summary.totalFeedbacks.toString(),
            icon: MessageSquare,
            color: 'from-blue-500 to-cyan-500',
            bgColor: 'from-blue-500/20 to-cyan-500/10',
            borderColor: 'border-blue-500/30',
            iconBg: 'bg-blue-500/20',
            iconColor: 'text-blue-500',
            subtitle: `Ort. ${data.insights.avgDailyFeedbacks}/gün`,
          },
          {
            title: 'Seri',
            value: `${data.insights.currentStreak}`,
            icon: Flame,
            color: 'from-orange-500 to-red-500',
            bgColor: 'from-orange-500/20 to-red-500/10',
            borderColor: 'border-orange-500/30',
            iconBg: 'bg-orange-500/20',
            iconColor: 'text-orange-500',
            subtitle: `Rekor: ${data.insights.maxStreak} gün`,
            flame: data.insights.currentStreak > 0,
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className={`h-full relative overflow-hidden border ${stat.borderColor} bg-gradient-to-br ${stat.bgColor}`}>
              {/* Background decoration */}
              <div className={`absolute -right-4 -top-4 w-16 sm:w-24 h-16 sm:h-24 rounded-full bg-gradient-to-br ${stat.color} opacity-10 blur-2xl`} />
              
              <CardContent className="p-3 sm:p-4 relative">
                <div className="flex items-start justify-between mb-2 sm:mb-3">
                  <div className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl ${stat.iconBg}`}>
                    <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.iconColor}`} />
                  </div>
                  {stat.flame && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 fill-orange-500" />
                    </motion.div>
                  )}
                </div>
                
                <p className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">{stat.title}</p>
                <p className="text-xl sm:text-3xl font-bold mb-0.5 sm:mb-1">{stat.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.subtitle}</p>
                
                {stat.progress !== undefined && (
                  <div className="mt-2 sm:mt-3">
                    <Progress value={stat.progress} className="h-1 sm:h-1.5" />
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">
                      {data.insights.xpToNextLevel} XP kaldı
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          {
            title: 'Haftalık Değişim',
            value: data.comparisons.feedbackChange,
            icon: isPositive ? TrendingUp : isNegative ? TrendingDown : Minus,
            color: isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500',
            bg: isPositive ? 'bg-green-500/10' : isNegative ? 'bg-red-500/10' : 'bg-gray-500/10',
            detail: `${data.comparisons.thisWeekFeedbacks}`,
          },
          {
            title: 'Duygu Skoru',
            value: `${data.sentiment.score}%`,
            icon: Sparkles,
            color: Number(data.sentiment.score) >= 50 ? 'text-green-500' : 'text-yellow-500',
            bg: Number(data.sentiment.score) >= 50 ? 'bg-green-500/10' : 'bg-yellow-500/10',
            detail: `${data.sentiment.positive} pozitif`,
          },
          {
            title: 'Rozet Sayısı',
            value: data.summary.totalBadges.toString(),
            icon: Medal,
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
            detail: data.badges.length > 0 ? data.badges[0]?.name?.slice(0, 10) : '',
          },
          {
            title: 'Üyelik Süresi',
            value: `${memberDays}`,
            icon: CalendarDays,
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
            detail: 'gün',
          },
        ].map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + index * 0.05 }}
          >
            <Card className="h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-1.5 sm:p-2 rounded-lg ${item.bg}`}>
                    <item.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.title}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base sm:text-xl font-bold">{item.value}</span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{item.detail}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="activity" className="space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-10 sm:h-12">
          <TabsTrigger value="activity" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Aktivite</span>
          </TabsTrigger>
          <TabsTrigger value="sentiment" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <PieChart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Duygu</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">İçgörüler</span>
          </TabsTrigger>
          <TabsTrigger value="achievements" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <Award className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Başarılar</span>
          </TabsTrigger>
        </TabsList>

        {/* Aktivite Tab */}
        <TabsContent value="activity" className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* 30 Günlük Aktivite Grafiği */}
            <Card className="h-full">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-4 sm:pt-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                      <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      Son 30 Gün
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Günlük aktivite</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0">
                    {data.trends.feedbackTrend.reduce((sum, d) => sum + d.count, 0)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
                <div className="flex items-end gap-[2px] sm:gap-0.5 h-32 sm:h-44 px-0.5 sm:px-1">
                  {data.trends.feedbackTrend.slice(-30).map((day, i) => (
                    <div key={day.date} className="flex-1 group relative flex flex-col items-center">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(day.count / maxFeedback) * 100}%` }}
                        transition={{ delay: i * 0.02, duration: 0.4 }}
                        className={`w-full rounded-t-[1px] sm:rounded-t-sm transition-colors cursor-pointer ${
                          day.count > 0 
                            ? 'bg-gradient-to-t from-primary to-primary/60 hover:from-primary/80 hover:to-primary/40' 
                            : 'bg-muted/50'
                        }`}
                        style={{ minHeight: day.count > 0 ? '3px' : '1px' }}
                      />
                      {/* Tooltip - hidden on mobile */}
                      <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-popover/95 backdrop-blur border rounded-lg shadow-lg text-xs opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-10 scale-90 group-hover:scale-100">
                        <p className="font-semibold">{new Date(day.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</p>
                        <p className="text-muted-foreground">{day.count} geri bildirim</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 sm:mt-3 pt-2 sm:pt-3 border-t text-[10px] sm:text-xs text-muted-foreground">
                  <span>30 gün önce</span>
                  <span>Bugün</span>
                </div>
              </CardContent>
            </Card>

            {/* Haftalık Dağılım */}
            <Card className="h-full">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-4 sm:pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2">
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      Haftalık Dağılım
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">En aktif günler</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
                <div className="space-y-2 sm:space-y-3">
                  {data.trends.activityByDayOfWeek.map((day, i) => {
                    const percentage = (day.count / maxDayActivity) * 100;
                    const isTopDay = day.count === maxDayActivity && day.count > 0;
                    return (
                      <div key={day.day} className="group">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className={`w-8 sm:w-10 text-[10px] sm:text-xs font-medium ${isTopDay ? 'text-primary' : 'text-muted-foreground'}`}>
                            {day.day.slice(0, 3)}
                          </span>
                          <div className="flex-1 h-5 sm:h-7 bg-muted/50 rounded-full overflow-hidden relative">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ delay: i * 0.1, duration: 0.5 }}
                              className={`h-full rounded-full ${
                                isTopDay 
                                  ? 'bg-gradient-to-r from-primary to-purple-500' 
                                  : 'bg-gradient-to-r from-emerald-500/80 to-green-400/80'
                              }`}
                            />
                            {isTopDay && (
                              <div className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2">
                                <Badge className="h-5 px-1.5 text-[10px] bg-primary">En Aktif</Badge>
                              </div>
                            )}
                          </div>
                          <span className={`w-6 sm:w-8 text-xs sm:text-sm font-bold text-right ${isTopDay ? 'text-primary' : ''}`}>
                            {day.count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Haftalık Karşılaştırma */}
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-1">Geçen Hafta</p>
                  <p className="text-3xl font-bold">{data.comparisons.lastWeekFeedbacks}</p>
                  <p className="text-xs text-muted-foreground">geri bildirim</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className={`p-4 rounded-full ${isPositive ? 'bg-green-500/20' : isNegative ? 'bg-red-500/20' : 'bg-gray-500/20'}`}>
                    {isPositive ? (
                      <ArrowUpRight className="h-8 w-8 text-green-500" />
                    ) : isNegative ? (
                      <ArrowDownRight className="h-8 w-8 text-red-500" />
                    ) : (
                      <Minus className="h-8 w-8 text-gray-500" />
                    )}
                  </div>
                </div>
                <div className="text-center p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Bu Hafta</p>
                  <p className="text-3xl font-bold text-primary">{data.comparisons.thisWeekFeedbacks}</p>
                  <p className="text-xs text-muted-foreground">geri bildirim</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Duygu Analizi Tab */}
        <TabsContent value="sentiment" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut Chart */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-primary" />
                  Duygu Dağılımı
                </CardTitle>
                <CardDescription>Geri bildirimlerinizin duygu analizi</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-6">
                  <div className="relative w-52 h-52">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="104" cy="104" r="85" fill="none" stroke="currentColor" strokeWidth="28" className="text-muted/30" />
                      {data.sentiment.total > 0 && (
                        <>
                          <motion.circle
                            cx="104" cy="104" r="85"
                            fill="none" stroke="#22c55e" strokeWidth="28" strokeLinecap="round"
                            initial={{ strokeDasharray: '0 534' }}
                            animate={{ strokeDasharray: `${(data.sentiment.positive / data.sentiment.total) * 534} 534` }}
                            transition={{ duration: 1 }}
                          />
                          <motion.circle
                            cx="104" cy="104" r="85"
                            fill="none" stroke="#eab308" strokeWidth="28" strokeLinecap="round"
                            initial={{ strokeDasharray: '0 534', strokeDashoffset: 0 }}
                            animate={{ 
                              strokeDasharray: `${(data.sentiment.neutral / data.sentiment.total) * 534} 534`,
                              strokeDashoffset: -((data.sentiment.positive / data.sentiment.total) * 534)
                            }}
                            transition={{ duration: 1, delay: 0.2 }}
                          />
                          <motion.circle
                            cx="104" cy="104" r="85"
                            fill="none" stroke="#ef4444" strokeWidth="28" strokeLinecap="round"
                            initial={{ strokeDasharray: '0 534', strokeDashoffset: 0 }}
                            animate={{ 
                              strokeDasharray: `${(data.sentiment.negative / data.sentiment.total) * 534} 534`,
                              strokeDashoffset: -(((data.sentiment.positive + data.sentiment.neutral) / data.sentiment.total) * 534)
                            }}
                            transition={{ duration: 1, delay: 0.4 }}
                          />
                        </>
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold">{data.sentiment.total}</span>
                      <span className="text-sm text-muted-foreground">Toplam</span>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { label: 'Pozitif', value: data.sentiment.positive, color: 'bg-green-500', textColor: 'text-green-500' },
                    { label: 'Nötr', value: data.sentiment.neutral, color: 'bg-yellow-500', textColor: 'text-yellow-500' },
                    { label: 'Negatif', value: data.sentiment.negative, color: 'bg-red-500', textColor: 'text-red-500' },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-3 rounded-xl bg-muted/30">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                        <span className="text-xs font-medium">{item.label}</span>
                      </div>
                      <p className={`text-2xl font-bold ${item.textColor}`}>{item.value}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {data.sentiment.total > 0 ? ((item.value / data.sentiment.total) * 100).toFixed(0) : 0}%
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Skor Detayı */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-primary" />
                  Duygu Skoru Analizi
                </CardTitle>
                <CardDescription>Pozitiflik performansınız</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className={`inline-flex items-center justify-center w-36 h-36 rounded-full border-4 ${
                      Number(data.sentiment.score) >= 70 
                        ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/50' 
                        : Number(data.sentiment.score) >= 40
                        ? 'bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border-yellow-500/50'
                        : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/50'
                    }`}
                  >
                    <div className="text-center">
                      <span className="text-4xl font-bold">{data.sentiment.score}</span>
                      <span className="text-lg">%</span>
                    </div>
                  </motion.div>
                  <div className="mt-4">
                    {Number(data.sentiment.score) >= 70 && (
                      <Badge className="bg-green-500 gap-1"><Sparkles className="h-3 w-3" /> Harika! Çok pozitifsiniz!</Badge>
                    )}
                    {Number(data.sentiment.score) >= 40 && Number(data.sentiment.score) < 70 && (
                      <Badge className="bg-yellow-500 gap-1"><TrendingUp className="h-3 w-3" /> İyi gidiyorsunuz!</Badge>
                    )}
                    {Number(data.sentiment.score) < 40 && (
                      <Badge className="bg-red-500 gap-1"><Target className="h-3 w-3" /> Gelişim alanı var</Badge>
                    )}
                  </div>
                </div>

                {/* Progress Bars */}
                <div className="space-y-4">
                  {[
                    { label: 'Pozitiflik Oranı', value: data.sentiment.total > 0 ? (data.sentiment.positive / data.sentiment.total) * 100 : 0, color: 'bg-green-500' },
                    { label: 'Nötr Oranı', value: data.sentiment.total > 0 ? (data.sentiment.neutral / data.sentiment.total) * 100 : 0, color: 'bg-yellow-500' },
                    { label: 'Negatiflik Oranı', value: data.sentiment.total > 0 ? (data.sentiment.negative / data.sentiment.total) * 100 : 0, color: 'bg-red-500' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium">{item.value.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.value}%` }}
                          transition={{ duration: 0.8 }}
                          className={`h-full rounded-full ${item.color}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* İçgörüler Tab */}
        <TabsContent value="insights">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'En Aktif Saat',
                value: data.insights.peakHour,
                icon: Clock,
                color: 'from-blue-500/20 to-cyan-500/10',
                iconBg: 'bg-blue-500/20',
                iconColor: 'text-blue-500',
                description: 'Bu saatlerde en çok geri bildirim veriyorsunuz',
              },
              {
                title: 'Streak Rekoru',
                value: `${data.insights.maxStreak} gün`,
                icon: Flame,
                color: 'from-orange-500/20 to-red-500/10',
                iconBg: 'bg-orange-500/20',
                iconColor: 'text-orange-500',
                description: `Mevcut: ${data.insights.currentStreak} gün ardışık`,
                badge: data.insights.currentStreak > 0 ? '🔥 Aktif' : null,
              },
              {
                title: 'Günlük Ortalama',
                value: data.insights.avgDailyFeedbacks,
                icon: Activity,
                color: 'from-violet-500/20 to-purple-500/10',
                iconBg: 'bg-violet-500/20',
                iconColor: 'text-violet-500',
                description: 'geri bildirim / gün',
              },
              {
                title: 'Kazanılan Rozetler',
                value: data.summary.totalBadges.toString(),
                icon: Award,
                color: 'from-amber-500/20 to-yellow-500/10',
                iconBg: 'bg-amber-500/20',
                iconColor: 'text-amber-500',
                description: data.badges.length > 0 ? `Son: ${data.badges[0]?.name}` : 'Görevleri tamamlayın',
              },
              {
                title: 'Toplam XP',
                value: data.summary.currentXP.toLocaleString(),
                icon: Zap,
                color: 'from-pink-500/20 to-rose-500/10',
                iconBg: 'bg-pink-500/20',
                iconColor: 'text-pink-500',
                description: `Seviye ${data.summary.currentLevel}`,
              },
              {
                title: 'Sonraki Seviye',
                value: data.insights.daysToNextLevel !== null ? `~${data.insights.daysToNextLevel} gün` : '-',
                icon: Target,
                color: 'from-emerald-500/20 to-green-500/10',
                iconBg: 'bg-emerald-500/20',
                iconColor: 'text-emerald-500',
                description: `${data.insights.xpToNextLevel} XP kaldı`,
              },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full bg-gradient-to-br ${item.color}`}>
                  <CardContent className="p-5 flex flex-col items-center text-center h-full">
                    <div className={`p-3 rounded-xl ${item.iconBg} mb-3`}>
                      <item.icon className={`h-7 w-7 ${item.iconColor}`} />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-2xl font-bold text-primary mb-1">{item.value}</p>
                    <p className="text-xs text-muted-foreground flex-1">{item.description}</p>
                    {item.badge && (
                      <Badge className="mt-2 bg-orange-500">{item.badge}</Badge>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Başarılar Tab */}
        <TabsContent value="achievements" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Puan İlerlemesi */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Puan İlerlemesi
                </CardTitle>
                <CardDescription>Son 30 günlük kümülatif puan kazanımı</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative h-48">
                  <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <line key={i} x1="0" y1={i * 37.5} x2="400" y2={i * 37.5} stroke="currentColor" strokeOpacity="0.1" />
                    ))}
                    
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
                        L 400 150 Z
                      `}
                      fill="url(#areaGradient)"
                      fillOpacity="0.4"
                    />
                    
                    <motion.path
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.5 }}
                      d={`M ${data.trends.pointsTrend.map((p, i) => {
                        const x = (i / (data.trends.pointsTrend.length - 1)) * 400;
                        const maxPoints = Math.max(...data.trends.pointsTrend.map(pt => pt.points), 1);
                        const y = 150 - (p.points / maxPoints) * 140;
                        return `${x} ${y}`;
                      }).join(' L ')}`}
                      fill="none"
                      stroke="url(#lineGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />

                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
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
                <div className="flex justify-between mt-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Başlangıç</p>
                    <p className="font-medium">0 puan</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Şu an</p>
                    <p className="font-bold text-primary text-lg">{data.summary.currentPoints.toLocaleString()} puan</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Son Rozetler */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Medal className="h-5 w-5 text-primary" />
                  Son Kazanılan Rozetler
                </CardTitle>
                <CardDescription>En son elde ettiğiniz başarılar</CardDescription>
              </CardHeader>
              <CardContent>
                {data.badges.length > 0 ? (
                  <div className="space-y-3">
                    <AnimatePresence>
                      {data.badges.slice(0, 5).map((badge, i) => (
                        <motion.div
                          key={badge.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="text-3xl">{badge.icon || '🏅'}</div>
                          <div className="flex-1">
                            <p className="font-medium">{badge.name}</p>
                            <Badge 
                              variant="outline" 
                              className={`text-xs mt-1 ${rarityColors[badge.rarity.toLowerCase()] || ''}`}
                            >
                              {badge.rarity}
                            </Badge>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                      <Award className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                    <p className="font-medium mb-1">Henüz rozet kazanmadınız</p>
                    <p className="text-sm text-muted-foreground">Görevleri tamamlayarak rozet kazanın!</p>
                    <Button variant="outline" className="mt-4 gap-2" asChild>
                      <a href="/customer/quests">
                        <Target className="h-4 w-4" />
                        Görevlere Git
                      </a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Achievements Summary */}
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Toplam Puan', value: data.summary.currentPoints.toLocaleString(), icon: Star, color: 'text-yellow-500' },
                  { label: 'Toplam XP', value: data.summary.currentXP.toLocaleString(), icon: Zap, color: 'text-pink-500' },
                  { label: 'Rozetler', value: data.summary.totalBadges.toString(), icon: Medal, color: 'text-amber-500' },
                  { label: 'Ödüller', value: data.summary.totalRewards.toString(), icon: Gift, color: 'text-purple-500' },
                ].map((item) => (
                  <div key={item.label} className="text-center p-4 rounded-xl bg-muted/30">
                    <item.icon className={`h-6 w-6 mx-auto mb-2 ${item.color}`} />
                    <p className="text-2xl font-bold">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
