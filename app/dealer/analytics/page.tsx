'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Star,
  MessageSquare,
  QrCode,
  Calendar,
  Eye,
  Users,
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
  Info,
  ChevronRight,
  Flame,
  ThumbsUp,
  ThumbsDown,
  Minus,
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
import Link from 'next/link';

interface AnalyticsData {
  totalFeedbacks: number;
  avgRating: string;
  totalScans: number;
  conversionRate: string;
  feedbackGrowth: number;
  ratingChange: number;
  responseRate: number;
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
  topQRCodes: Array<{
    name: string;
    scans: number;
    feedbacks: number;
    rating: string;
    positiveRate: number;
  }>;
  topTopics: Array<{
    name: string;
    count: number;
    sentiment: string;
  }>;
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
  hourlyData: number[];
  dayOfWeekData: Array<{ day: string; count: number }>;
  comparison: {
    feedbacks: { current: number; previous: number; change: number };
    rating: { current: string; previous: string; change: number };
    positive: { current: number; previous: number; change: number };
  };
  insights: {
    peakHour: string;
    peakDay: string;
    bestQR: string | null;
    worstTopic: string | null;
  };
}

// Animated Counter
const AnimatedNumber = ({ value, decimals = 0 }: { value: number; decimals?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1500;
    const steps = 60;
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
  
  return <span>{decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue)}</span>;
};

// Line Chart Component
const LineChart = ({ 
  data, 
  dataKey = 'feedbacks',
  color = '#8b5cf6',
  height = 200,
  showArea = true,
}: { 
  data: Array<{ label: string; [key: string]: number | string }>;
  dataKey?: string;
  color?: string;
  height?: number;
  showArea?: boolean;
}) => {
  const values = data.map(d => Number(d[dataKey]) || 0);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - ((Number(d[dataKey]) - minValue) / range) * 100;
    return { x, y, value: Number(d[dataKey]), label: d.label };
  });
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L 100 100 L 0 100 Z`;
  
  return (
    <div style={{ height }} className="relative">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeWidth="0.2" className="text-muted/30" />
        ))}
        
        {/* Area */}
        {showArea && (
          <motion.path
            d={areaD}
            fill={`url(#gradient-${dataKey})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ duration: 1 }}
          />
        )}
        
        {/* Line */}
        <motion.path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
        
        {/* Points */}
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.5"
            fill={color}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + i * 0.05 }}
            className="cursor-pointer hover:r-2"
          />
        ))}
        
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-muted-foreground">
        {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1).map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
};

// Heatmap Component
const Heatmap = ({ data }: { data: number[][] }) => {
  const maxValue = Math.max(...data.flat(), 1);
  const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return 'bg-muted/30';
    if (intensity < 0.25) return 'bg-violet-500/20';
    if (intensity < 0.5) return 'bg-violet-500/40';
    if (intensity < 0.75) return 'bg-violet-500/60';
    return 'bg-violet-500/90';
  };
  
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <div className="w-8" />
        {hours.filter((_, i) => i % 4 === 0).map(h => (
          <div key={h} className="flex-1 text-[10px] text-muted-foreground text-center">
            {h}:00
          </div>
        ))}
      </div>
      {days.map((day, dayIndex) => (
        <div key={day} className="flex gap-1 items-center">
          <div className="w-8 text-[10px] text-muted-foreground">{day}</div>
          <div className="flex-1 flex gap-0.5">
            {hours.map(hour => (
              <motion.div
                key={hour}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: (dayIndex * 24 + hour) * 0.002 }}
                className={`flex-1 aspect-square rounded-sm ${getColor(data[dayIndex]?.[hour] || 0)} cursor-pointer hover:ring-1 hover:ring-violet-500`}
                title={`${day} ${hour}:00 - ${data[dayIndex]?.[hour] || 0} geri bildirim`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Donut Chart Component
const DonutChart = ({ 
  data, 
  size = 160 
}: { 
  data: { label: string; value: number; color: string }[];
  size?: number;
}) => {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  let currentAngle = -90;
  
  const radius = size / 2 - 15;
  const innerRadius = radius * 0.65;
  
  const getPath = (startAngle: number, endAngle: number, r: number, ir: number) => {
    const start = {
      x: size / 2 + r * Math.cos((startAngle * Math.PI) / 180),
      y: size / 2 + r * Math.sin((startAngle * Math.PI) / 180),
    };
    const end = {
      x: size / 2 + r * Math.cos((endAngle * Math.PI) / 180),
      y: size / 2 + r * Math.sin((endAngle * Math.PI) / 180),
    };
    const innerStart = {
      x: size / 2 + ir * Math.cos((endAngle * Math.PI) / 180),
      y: size / 2 + ir * Math.sin((endAngle * Math.PI) / 180),
    };
    const innerEnd = {
      x: size / 2 + ir * Math.cos((startAngle * Math.PI) / 180),
      y: size / 2 + ir * Math.sin((startAngle * Math.PI) / 180),
    };
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} L ${innerStart.x} ${innerStart.y} A ${ir} ${ir} 0 ${largeArcFlag} 0 ${innerEnd.x} ${innerEnd.y} Z`;
  };
  
  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      {data.map((segment, i) => {
        const angle = (segment.value / total) * 360;
        if (angle === 0) return null;
        const path = getPath(currentAngle, currentAngle + angle, radius, innerRadius);
        currentAngle += angle;
        
        return (
          <motion.path
            key={i}
            d={path}
            fill={segment.color}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15, duration: 0.5 }}
            className="hover:opacity-80 transition-opacity cursor-pointer"
          />
        );
      })}
    </svg>
  );
};

// Bar Chart for Distribution
const DistributionBar = ({ 
  data 
}: { 
  data: { label: string; value: number; color: string }[] 
}) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              {item.label}
            </span>
            <span className="font-semibold">{item.value}%</span>
          </div>
          <div className="h-2.5 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${item.value}%` }}
              transition={{ duration: 0.8, delay: i * 0.1 }}
              className={`h-full rounded-full ${item.color}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// Comparison Card
const ComparisonCard = ({ 
  title, 
  current, 
  previous, 
  change, 
  suffix = '',
  icon: Icon,
  color,
}: { 
  title: string;
  current: string | number;
  previous: string | number;
  change: number;
  suffix?: string;
  icon: React.ElementType;
  color: string;
}) => (
  <div className="p-4 rounded-xl bg-muted/30 space-y-3">
    <div className="flex items-center justify-between">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <Badge className={change >= 0 ? 'bg-emerald-500/10 text-emerald-500 border-0' : 'bg-red-500/10 text-red-500 border-0'}>
        {change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
        {Math.abs(change)}%
      </Badge>
    </div>
    <div>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg sm:text-2xl font-bold">{current}{suffix}</p>
    </div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Önceki dönem:</span>
      <span className="font-medium">{previous}{suffix}</span>
    </div>
  </div>
);

export default function DealerAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [chartView, setChartView] = useState<'feedbacks' | 'rating' | 'sentiment'>('feedbacks');

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dealer/analytics?period=${period}`);
      const result = await res.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        toast.error('Analitik verileri yüklenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = useMemo(() => {
    switch (period) {
      case '7d': return 'Son 7 Gün';
      case '90d': return 'Son 90 Gün';
      default: return 'Son 30 Gün';
    }
  }, [period]);

  if (loading) {
    return (
      <div className="space-y-6 pb-8">
        <div className="flex items-center justify-center min-h-[600px]">
          <div className="text-center space-y-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="h-12 w-12 text-primary mx-auto" />
            </motion.div>
            <p className="text-muted-foreground">Analitik verileriniz yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 pb-8">
        <Card className="border-0 bg-card/50">
          <CardContent className="p-12 text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-lg font-semibold mb-2">Veri Bulunamadı</h3>
            <p className="text-muted-foreground mb-4">Analitik verileri yüklenemedi.</p>
            <Button onClick={fetchAnalytics}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sentimentChartData = [
    { label: 'Olumlu', value: data.sentimentBreakdown.positive, color: '#10b981' },
    { label: 'Nötr', value: data.sentimentBreakdown.neutral, color: '#6b7280' },
    { label: 'Olumsuz', value: data.sentimentBreakdown.negative, color: '#ef4444' },
  ];

  const ratingChartData = [
    { label: '5 Yıldız', value: data.ratingDistribution[5], color: 'bg-gradient-to-r from-yellow-400 to-yellow-500' },
    { label: '4 Yıldız', value: data.ratingDistribution[4], color: 'bg-gradient-to-r from-emerald-400 to-emerald-500' },
    { label: '3 Yıldız', value: data.ratingDistribution[3], color: 'bg-gradient-to-r from-blue-400 to-blue-500' },
    { label: '2 Yıldız', value: data.ratingDistribution[2], color: 'bg-gradient-to-r from-orange-400 to-orange-500' },
    { label: '1 Yıldız', value: data.ratingDistribution[1], color: 'bg-gradient-to-r from-red-400 to-red-500' },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-4 sm:p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          {[...Array(20)].map((_, i) => (
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
              Analitik Paneli
            </h1>
            <p className="text-white/70 mt-1">Detaylı performans analizi ve içgörüler</p>
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
              </SelectContent>
            </Select>
            <Button variant="secondary" size="icon" onClick={fetchAnalytics}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { title: 'Toplam Geri Bildirim', value: data.totalFeedbacks, change: data.feedbackGrowth, icon: MessageSquare, color: 'emerald' },
          { title: 'Ortalama Puan', value: data.avgRating, change: data.ratingChange, suffix: '/5', icon: Star, color: 'yellow' },
          { title: 'Dönüşüm Oranı', value: data.conversionRate, suffix: '%', icon: Target, color: 'violet' },
          { title: 'Yanıt Oranı', value: data.responseRate, suffix: '%', icon: Activity, color: 'blue' },
        ].map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
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
                <p className="text-lg sm:text-2xl font-bold">
                  {typeof stat.value === 'number' ? <AnimatedNumber value={stat.value} /> : stat.value}
                  {stat.suffix && <span className="text-sm text-muted-foreground ml-1">{stat.suffix}</span>}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Trend Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-violet-500" />
                  Trend Analizi
                </CardTitle>
                <CardDescription>{periodLabel} içindeki değişimler</CardDescription>
              </div>
              <div className="flex gap-2">
                {[
                  { key: 'feedbacks', label: 'Geri Bildirim', color: 'violet' },
                  { key: 'rating', label: 'Puan', color: 'yellow' },
                  { key: 'sentiment', label: 'Duygu', color: 'emerald' },
                ].map((tab) => (
                  <Button
                    key={tab.key}
                    variant={chartView === tab.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartView(tab.key as typeof chartView)}
                    className={chartView === tab.key ? `bg-${tab.color}-500 hover:bg-${tab.color}-600` : ''}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <LineChart
                data={data.dailyData}
                dataKey={chartView === 'rating' ? 'avgRating' : chartView === 'sentiment' ? 'positive' : 'feedbacks'}
                color={chartView === 'rating' ? '#eab308' : chartView === 'sentiment' ? '#10b981' : '#8b5cf6'}
                height={220}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Comparison & Insights */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Period Comparison */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Dönem Karşılaştırması
              </CardTitle>
              <CardDescription>Önceki dönemle karşılaştırma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ComparisonCard
                title="Geri Bildirim"
                current={data.comparison.feedbacks.current}
                previous={data.comparison.feedbacks.previous}
                change={data.comparison.feedbacks.change}
                icon={MessageSquare}
                color="bg-emerald-500/10 text-emerald-500"
              />
              <ComparisonCard
                title="Ortalama Puan"
                current={data.comparison.rating.current}
                previous={data.comparison.rating.previous}
                change={data.comparison.rating.change}
                suffix="/5"
                icon={Star}
                color="bg-yellow-500/10 text-yellow-500"
              />
              <ComparisonCard
                title="Olumlu Oran"
                current={data.comparison.positive.current}
                previous={data.comparison.positive.previous}
                change={data.comparison.positive.change}
                suffix="%"
                icon={ThumbsUp}
                color="bg-blue-500/10 text-blue-500"
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Heatmap */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2">
          <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Flame className="w-5 h-5 text-orange-500" />
                Aktivite Isı Haritası
              </CardTitle>
              <CardDescription>Haftalık geri bildirim yoğunluğu</CardDescription>
            </CardHeader>
            <CardContent>
              <Heatmap data={data.heatmapData} />
              <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
                <span>Az</span>
                <div className="flex gap-0.5">
                  <div className="w-3 h-3 rounded-sm bg-muted/30" />
                  <div className="w-3 h-3 rounded-sm bg-violet-500/20" />
                  <div className="w-3 h-3 rounded-sm bg-violet-500/40" />
                  <div className="w-3 h-3 rounded-sm bg-violet-500/60" />
                  <div className="w-3 h-3 rounded-sm bg-violet-500/90" />
                </div>
                <span>Çok</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Sentiment & Rating */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sentiment */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Duygu Analizi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around">
                <DonutChart data={sentimentChartData} size={150} />
                <div className="space-y-3">
                  {sentimentChartData.map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xl font-bold">{item.value}%</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Rating Distribution */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                Puan Dağılımı
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBar data={ratingChartData} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Insights */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="border-0 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/20">
                <Zap className="w-5 h-5 text-violet-500" />
              </div>
              <h3 className="font-semibold">Hızlı İçgörüler</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">En Yoğun Saat</p>
                <p className="font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  {data.insights.peakHour}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">En Yoğun Gün</p>
                <p className="font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  {data.insights.peakDay}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">En İyi QR</p>
                <p className="font-semibold flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-violet-500" />
                  {data.insights.bestQR || 'Henüz yok'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">Dikkat Edilmeli</p>
                <p className="font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-orange-500" />
                  {data.insights.worstTopic || 'Sorun yok'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top QR & Topics */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top QR Codes */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-violet-500" />
                En Aktif QR Kodlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topQRCodes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <QrCode className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Henüz veri yok</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.topQRCodes.map((qr, index) => (
                    <motion.div
                      key={qr.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + index * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm ${
                        index === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                        index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                        index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                        'bg-violet-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{qr.name}</p>
                        <p className="text-xs text-muted-foreground">{qr.scans} tarama · {qr.feedbacks} geri bildirim</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold">{qr.rating}</span>
                        </div>
                        <p className="text-xs text-emerald-500">{qr.positiveRate}% olumlu</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Topics */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-500" />
                Popüler Konular
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topTopics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Henüz veri yok</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.topTopics.map((topic, index) => (
                    <motion.div
                      key={topic.name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + index * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          topic.sentiment === 'positive' ? 'bg-emerald-500/20' :
                          topic.sentiment === 'negative' ? 'bg-red-500/20' : 'bg-gray-500/20'
                        }`}>
                          {topic.sentiment === 'positive' ? <ThumbsUp className="w-4 h-4 text-emerald-500" /> :
                           topic.sentiment === 'negative' ? <ThumbsDown className="w-4 h-4 text-red-500" /> :
                           <Minus className="w-4 h-4 text-gray-500" />}
                        </div>
                        <div>
                          <p className="font-medium">{topic.name}</p>
                          <Badge variant="outline" className={`text-xs ${
                            topic.sentiment === 'positive' ? 'text-emerald-500 border-emerald-500/30' :
                            topic.sentiment === 'negative' ? 'text-red-500 border-red-500/30' : 'text-gray-500 border-gray-500/30'
                          }`}>
                            {topic.sentiment === 'positive' ? 'Olumlu' : topic.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg sm:text-2xl font-bold">{topic.count}</p>
                        <p className="text-xs text-muted-foreground">bahsetme</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* AI Insights CTA */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        <Card className="border-0 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white overflow-hidden">
          <CardContent className="p-6 relative">
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(15)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-white/30 rounded-full"
                  style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                  animate={{ opacity: [0.2, 0.8, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }}
                />
              ))}
            </div>
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-white/20">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">AI İçgörüler</h3>
                  <p className="text-white/70">Yapay zeka destekli detaylı analiz ve kişiselleştirilmiş öneriler</p>
                </div>
              </div>
              <Button asChild size="lg" className="bg-white text-purple-600 hover:bg-white/90">
                <Link href="/dealer/ai-insights">
                  AI İçgörüleri Gör
                  <ArrowUpRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
