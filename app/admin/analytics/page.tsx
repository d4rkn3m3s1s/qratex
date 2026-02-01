'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  QrCode,
  Star,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  RefreshCw,
  Loader2,
  Activity,
  Eye,
  Flame,
  Target,
  Zap,
  Download,
  PieChart,
  Clock,
  Building2,
  ShoppingBag,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Shield,
  UserCheck,
  Store,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AnalyticsData {
  totalUsers: number;
  totalFeedbacks: number;
  totalQRCodes: number;
  avgRating: number;
  userGrowth: number;
  feedbackGrowth: number;
  totalScans: number;
  activeQRCodes: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  dailyData: Array<{
    date: string;
    label: string;
    feedbacks: number;
    avgRating: number;
    positive: number;
    negative: number;
    neutral: number;
  }>;
  heatmapData: number[][];
  topDealers: Array<{
    id: string;
    name: string;
    feedbackCount: number;
    avgRating: number;
    positiveRate: number;
  }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  cardStats: {
    total: number;
    activated: number;
    unused: number;
    blocked: number;
    consumptions: number;
    reviews: number;
  };
  comparison: {
    feedbacks: { current: number; previous: number; change: number };
    rating: { current: string; previous: string; change: number };
    users: { current: number; previous: number; change: number };
  };
  roleDistribution: {
    ADMIN?: number;
    DEALER?: number;
    CUSTOMER?: number;
  };
  totals: any;
}

// Animated Counter
const AnimatedNumber = ({ value, decimals = 0 }: { value: number; decimals?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1200;
    const steps = 40;
    const stepValue = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(current);
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue).toLocaleString()}</span>;
};

// Mini Line Chart
const MiniLineChart = ({ data, color = '#8b5cf6', height = 60 }: { data: number[]; color?: string; height?: number }) => {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - (v / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1 }}
      />
      <motion.polygon
        fill={`url(#gradient-${color})`}
        points={`0,100 ${points} 100,100`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      />
    </svg>
  );
};

// Heatmap Component
const Heatmap = ({ data }: { data: number[][] }) => {
  const maxValue = Math.max(...data.flat(), 1);
  const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  
  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return 'bg-muted/30';
    if (intensity < 0.25) return 'bg-primary/20';
    if (intensity < 0.5) return 'bg-primary/40';
    if (intensity < 0.75) return 'bg-primary/60';
    return 'bg-primary/90';
  };
  
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <div className="w-8" />
        {[0, 6, 12, 18, 23].map(h => (
          <div key={h} className="flex-1 text-[10px] text-muted-foreground text-center">
            {h}:00
          </div>
        ))}
      </div>
      {days.map((day, dayIndex) => (
        <div key={day} className="flex gap-1 items-center">
          <div className="w-8 text-[10px] text-muted-foreground">{day}</div>
          <div className="flex-1 flex gap-0.5">
            {Array.from({ length: 24 }, (_, hour) => (
              <motion.div
                key={hour}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: (dayIndex * 24 + hour) * 0.002 }}
                className={`flex-1 aspect-square rounded-sm ${getColor(data[dayIndex]?.[hour] || 0)} cursor-pointer hover:ring-1 hover:ring-primary`}
                title={`${day} ${hour}:00 - ${data[dayIndex]?.[hour] || 0} geri bildirim`}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 mt-2 text-xs text-muted-foreground">
        <span>Az</span>
        <div className="flex gap-0.5">
          {['bg-muted/30', 'bg-primary/20', 'bg-primary/40', 'bg-primary/60', 'bg-primary/90'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
        </div>
        <span>Çok</span>
      </div>
    </div>
  );
};

// Donut Chart
const DonutChart = ({ data, size = 140 }: { data: { label: string; value: number; color: string }[]; size?: number }) => {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  let currentAngle = -90;
  const radius = size / 2 - 12;
  const innerRadius = radius * 0.65;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {data.map((segment, i) => {
          if (segment.value === 0) return null;
          const angle = (segment.value / total) * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          currentAngle = endAngle;
          
          const x1 = size/2 + radius * Math.cos((startAngle * Math.PI) / 180);
          const y1 = size/2 + radius * Math.sin((startAngle * Math.PI) / 180);
          const x2 = size/2 + radius * Math.cos((endAngle * Math.PI) / 180);
          const y2 = size/2 + radius * Math.sin((endAngle * Math.PI) / 180);
          const ix1 = size/2 + innerRadius * Math.cos((endAngle * Math.PI) / 180);
          const iy1 = size/2 + innerRadius * Math.sin((endAngle * Math.PI) / 180);
          const ix2 = size/2 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
          const iy2 = size/2 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
          
          const largeArc = angle > 180 ? 1 : 0;
          
          return (
            <motion.path
              key={i}
              d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`}
              fill={segment.color}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="hover:opacity-80 transition-opacity cursor-pointer"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-muted-foreground">Toplam</p>
        </div>
      </div>
    </div>
  );
};

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?period=${period}`);
      const result = await res.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        toast.error('Analitik verileri yüklenemedi');
      }
    } catch (error) {
      toast.error('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = {
    '7d': 'Son 7 Gün',
    '30d': 'Son 30 Gün',
    '90d': 'Son 90 Gün',
    '1y': 'Son 1 Yıl',
  }[period] || 'Son 30 Gün';

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Analitik" description="Platform istatistikleri ve raporları" />
        <div className="flex items-center justify-center min-h-[500px]">
          <div className="text-center space-y-4">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
              <Loader2 className="h-12 w-12 text-primary mx-auto" />
            </motion.div>
            <p className="text-muted-foreground">Analitik veriler yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Analitik" description="Platform istatistikleri ve raporları" />
        <Card className="border-0 bg-card/50">
          <CardContent className="p-12 text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-lg font-semibold mb-2">Veri Bulunamadı</h3>
            <Button onClick={fetchAnalytics}><RefreshCw className="w-4 h-4 mr-2" />Tekrar Dene</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sentimentChartData = [
    { label: 'Olumlu', value: data.sentimentBreakdown.positive, color: '#22c55e' },
    { label: 'Nötr', value: data.sentimentBreakdown.neutral, color: '#6b7280' },
    { label: 'Olumsuz', value: data.sentimentBreakdown.negative, color: '#ef4444' },
  ];

  const roleChartData = [
    { label: 'Müşteri', value: data.roleDistribution.CUSTOMER || 0, color: '#8b5cf6' },
    { label: 'Bayi', value: data.roleDistribution.DEALER || 0, color: '#f59e0b' },
    { label: 'Admin', value: data.roleDistribution.ADMIN || 0, color: '#06b6d4' },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/40 rounded-full"
              style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8" />
              Platform Analitikleri
            </h1>
            <p className="text-white/70 mt-1">{periodLabel} - Detaylı performans analizi</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] bg-white/10 border-white/20 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Son 7 Gün</SelectItem>
                <SelectItem value="30d">Son 30 Gün</SelectItem>
                <SelectItem value="90d">Son 90 Gün</SelectItem>
                <SelectItem value="1y">Son 1 Yıl</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="icon" onClick={fetchAnalytics}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Toplam Kullanıcı', value: data.totalUsers, change: data.userGrowth, icon: Users, color: 'blue', trend: data.dailyData.map(d => d.feedbacks) },
          { title: 'Geri Bildirim', value: data.totalFeedbacks, change: data.feedbackGrowth, icon: MessageSquare, color: 'green', trend: data.dailyData.map(d => d.feedbacks) },
          { title: 'QR Tarama', value: data.totalScans, icon: Eye, color: 'purple', trend: data.dailyData.map(d => d.feedbacks) },
          { title: 'Ortalama Puan', value: data.avgRating, suffix: '/5', icon: Star, color: 'yellow', change: data.comparison.rating.change },
        ].map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl bg-${stat.color}-500/10`}>
                    <stat.icon className={`w-5 h-5 text-${stat.color}-500`} />
                  </div>
                  {stat.change !== undefined && (
                    <Badge className={`border-0 ${stat.change >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {stat.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {Math.abs(stat.change)}%
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                <p className="text-2xl font-bold">
                  {typeof stat.value === 'number' && !stat.suffix ? <AnimatedNumber value={stat.value} /> : stat.value}
                  {stat.suffix && <span className="text-sm text-muted-foreground ml-1">{stat.suffix}</span>}
                </p>
                {stat.trend && (
                  <div className="mt-3 -mx-1">
                    <MiniLineChart data={stat.trend} color={stat.color === 'blue' ? '#3b82f6' : stat.color === 'green' ? '#22c55e' : stat.color === 'purple' ? '#8b5cf6' : '#eab308'} height={40} />
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-12">
          <TabsTrigger value="overview" className="gap-2"><BarChart3 className="w-4 h-4" /><span className="hidden sm:inline">Genel Bakış</span></TabsTrigger>
          <TabsTrigger value="trends" className="gap-2"><TrendingUp className="w-4 h-4" /><span className="hidden sm:inline">Trendler</span></TabsTrigger>
          <TabsTrigger value="dealers" className="gap-2"><Store className="w-4 h-4" /><span className="hidden sm:inline">Bayiler</span></TabsTrigger>
          <TabsTrigger value="cards" className="gap-2"><CreditCard className="w-4 h-4" /><span className="hidden sm:inline">Kart Sistemi</span></TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Sentiment Chart */}
            <Card className="border-0 bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-primary" />
                  Duygu Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-around">
                  <DonutChart data={sentimentChartData} />
                  <div className="space-y-3">
                    {sentimentChartData.map((item, i) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-lg font-bold">{item.value}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rating Distribution */}
            <Card className="border-0 bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  Puan Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[5, 4, 3, 2, 1].map(rating => {
                  const count = data.ratingDistribution[rating as keyof typeof data.ratingDistribution] || 0;
                  const total = Object.values(data.ratingDistribution).reduce((a, b) => a + b, 0) || 1;
                  const percentage = Math.round((count / total) * 100);
                  return (
                    <div key={rating} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1">
                          {rating} <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        </span>
                        <span className="font-medium">{count} ({percentage}%)</span>
                      </div>
                      <Progress value={percentage} className="h-2" indicatorClassName={rating >= 4 ? 'bg-green-500' : rating === 3 ? 'bg-yellow-500' : 'bg-red-500'} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* User Distribution */}
            <Card className="border-0 bg-card/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Kullanıcı Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-around">
                  <DonutChart data={roleChartData} />
                  <div className="space-y-3">
                    {[
                      { label: 'Müşteri', value: data.roleDistribution.CUSTOMER || 0, icon: UserCheck, color: 'text-purple-500' },
                      { label: 'Bayi', value: data.roleDistribution.DEALER || 0, icon: Store, color: 'text-amber-500' },
                      { label: 'Admin', value: data.roleDistribution.ADMIN || 0, icon: Shield, color: 'text-cyan-500' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3">
                        <item.icon className={`w-4 h-4 ${item.color}`} />
                        <div>
                          <p className="text-sm text-muted-foreground">{item.label}</p>
                          <p className="font-bold">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: 'Geri Bildirim', data: data.comparison.feedbacks, icon: MessageSquare, color: 'emerald' },
              { title: 'Ortalama Puan', data: data.comparison.rating, icon: Star, color: 'yellow', suffix: '/5' },
              { title: 'Yeni Kullanıcı', data: data.comparison.users, icon: Users, color: 'blue' },
            ].map((item, i) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className="border-0 bg-card/50">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2 rounded-lg bg-${item.color}-500/10`}>
                        <item.icon className={`w-4 h-4 text-${item.color}-500`} />
                      </div>
                      <Badge className={`border-0 ${item.data.change >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {item.data.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {Math.abs(item.data.change)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.title}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-bold">{item.data.current}{item.suffix}</span>
                      <span className="text-sm text-muted-foreground">vs {item.data.previous}{item.suffix}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          {/* Daily Trend Chart */}
          <Card className="border-0 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Günlük Trend
              </CardTitle>
              <CardDescription>{periodLabel} içindeki geri bildirim sayısı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <div className="flex items-end gap-1 h-full">
                  {data.dailyData.map((day, i) => {
                    const maxFeedbacks = Math.max(...data.dailyData.map(d => d.feedbacks), 1);
                    const height = (day.feedbacks / maxFeedbacks) * 100;
                    return (
                      <motion.div
                        key={day.date}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: i * 0.02 }}
                        className="flex-1 bg-gradient-to-t from-primary to-primary/60 rounded-t hover:from-primary/80 hover:to-primary/40 cursor-pointer group relative"
                        style={{ minHeight: day.feedbacks > 0 ? '4px' : '2px' }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border rounded-lg shadow-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          <p className="font-semibold">{day.label}</p>
                          <p>{day.feedbacks} geri bildirim</p>
                          <p>Ort. {day.avgRating} puan</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{data.dailyData[0]?.label}</span>
                  <span>{data.dailyData[data.dailyData.length - 1]?.label}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card className="border-0 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Aktivite Isı Haritası
              </CardTitle>
              <CardDescription>Haftalık geri bildirim yoğunluğu (gün x saat)</CardDescription>
            </CardHeader>
            <CardContent>
              <Heatmap data={data.heatmapData} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dealers Tab */}
        <TabsContent value="dealers" className="space-y-6">
          <Card className="border-0 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                En İyi Bayiler
              </CardTitle>
              <CardDescription>Geri bildirim sayısına göre sıralanmış</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topDealers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Store className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Henüz bayi verisi yok</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.topDealers.map((dealer, index) => (
                    <motion.div
                      key={dealer.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white ${
                        index === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                        index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                        index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                        'bg-primary'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{dealer.name}</p>
                        <p className="text-sm text-muted-foreground">{dealer.feedbackCount} geri bildirim</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold">{dealer.avgRating}</span>
                        </div>
                        <p className="text-xs text-emerald-500">{dealer.positiveRate}% olumlu</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cards Tab */}
        <TabsContent value="cards" className="space-y-6">
          {data.cardStats.total > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { title: 'Toplam Kart', value: data.cardStats.total, icon: CreditCard, color: 'bg-cyan-500/10 text-cyan-500' },
                  { title: 'Aktif', value: data.cardStats.activated, icon: UserCheck, color: 'bg-green-500/10 text-green-500' },
                  { title: 'Boş', value: data.cardStats.unused, icon: CreditCard, color: 'bg-gray-500/10 text-gray-500' },
                  { title: 'Bloklu', value: data.cardStats.blocked, icon: Shield, color: 'bg-red-500/10 text-red-500' },
                  { title: 'Tüketim', value: data.cardStats.consumptions, icon: ShoppingBag, color: 'bg-orange-500/10 text-orange-500' },
                  { title: 'Yorum', value: data.cardStats.reviews, icon: MessageSquare, color: 'bg-purple-500/10 text-purple-500' },
                ].map((stat, i) => (
                  <motion.div key={stat.title} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                    <Card className="border-0 bg-card/50 text-center">
                      <CardContent className="p-4">
                        <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                          <stat.icon className="w-5 h-5" />
                        </div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.title}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Card Stats Visualization */}
              <Card className="border-0 bg-card/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Kart Durumları
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label: 'Aktif Kartlar', value: data.cardStats.activated, total: data.cardStats.total, color: 'bg-green-500' },
                      { label: 'Boş Kartlar', value: data.cardStats.unused, total: data.cardStats.total, color: 'bg-gray-500' },
                      { label: 'Bloklu Kartlar', value: data.cardStats.blocked, total: data.cardStats.total, color: 'bg-red-500' },
                    ].map(item => (
                      <div key={item.label} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>{item.label}</span>
                          <span className="font-medium">{item.value} / {item.total} ({item.total > 0 ? Math.round((item.value / item.total) * 100) : 0}%)</span>
                        </div>
                        <Progress value={item.total > 0 ? (item.value / item.total) * 100 : 0} className="h-2" indicatorClassName={item.color} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-0 bg-card/50">
              <CardContent className="p-12 text-center">
                <CreditCard className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-lg font-semibold mb-2">Kart Sistemi Aktif Değil</h3>
                <p className="text-muted-foreground">Henüz fiziksel kart oluşturulmamış.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Recent Activity */}
      <Card className="border-0 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Son Aktiviteler
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Henüz aktivite yok</p>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((activity, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${
                    activity.type === 'user' ? 'bg-blue-500/10 text-blue-500' :
                    activity.type === 'consumption' ? 'bg-orange-500/10 text-orange-500' :
                    activity.type === 'feedback' ? 'bg-green-500/10 text-green-500' :
                    'bg-primary/10 text-primary'
                  }`}>
                    {activity.type === 'user' && <Users className="w-4 h-4" />}
                    {activity.type === 'consumption' && <ShoppingBag className="w-4 h-4" />}
                    {activity.type === 'feedback' && <MessageSquare className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{activity.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
