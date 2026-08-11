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
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero, DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { exportToCSV, exportToPDF, buildAnalyticsPDFContent } from '@/lib/export-utils';
import { CHART_BRAND, CHART_HEX } from '@/lib/chart-palette';
import Link from 'next/link';
import { useAppT } from '@/lib/app-locale';

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
  color = 'hsl(var(--primary))',
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
  const t = useAppT();
  const maxValue = Math.max(...data.flat(), 1);
  const days = [t('dealerAnalytics.daySun'), t('dealerAnalytics.dayMon'), t('dealerAnalytics.dayTue'), t('dealerAnalytics.dayWed'), t('dealerAnalytics.dayThu'), t('dealerAnalytics.dayFri'), t('dealerAnalytics.daySat')];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const getColor = (value: number) => {
    const intensity = value / maxValue;
    if (intensity === 0) return 'bg-muted/30';
    if (intensity < 0.25) return 'bg-primary/20';
    if (intensity < 0.5) return 'bg-primary/40';
    if (intensity < 0.75) return 'bg-primary/60';
    return 'bg-primary';
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
                className={`aspect-square flex-1 cursor-pointer rounded-sm ${getColor(data[dayIndex]?.[hour] || 0)} hover:ring-1 hover:ring-primary`}
                title={`${day} ${hour}:00 - ${data[dayIndex]?.[hour] || 0} ${t('dealerAnalytics.feedback')}`}
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
  const t = useAppT();
  const normalizedData = data.map((segment) => ({
    ...segment,
    value: Number.isFinite(Number(segment.value)) ? Math.max(0, Number(segment.value)) : 0,
  }));
  const total = normalizedData.reduce((acc, d) => acc + d.value, 0) || 1;
  const hasData = normalizedData.some((d) => d.value > 0);
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
      {!hasData && (
        <>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CHART_HEX.slate200}
            strokeWidth={10}
          />
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            {t('dealerAnalytics.noDataShort')}
          </text>
        </>
      )}
      {normalizedData.map((segment, i) => {
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

const SentimentTrendBars = ({
  data,
}: {
  data: Array<{ label: string; positive: number; neutral: number; negative: number }>;
}) => {
  const t = useAppT();
  return (
    <div className="space-y-2">
      {data.slice(-7).map((d, i) => {
        const total = d.positive + d.neutral + d.negative;
        const pos = total > 0 ? Math.round((d.positive / total) * 100) : 0;
        const neu = total > 0 ? Math.round((d.neutral / total) * 100) : 0;
        const neg = Math.max(0, 100 - pos - neu);
        return (
          <motion.div
            key={`${d.label}-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.05 }}
            className="space-y-1"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-medium">{total} {t('dealerAnalytics.records')}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/40">
              <div className="bg-emerald-500" style={{ width: `${pos}%` }} />
              <div className="bg-blue-400" style={{ width: `${neu}%` }} />
              <div className="bg-red-500" style={{ width: `${neg}%` }} />
            </div>
          </motion.div>
        );
      })}
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
}) => {
  const t = useAppT();
  return (
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
      <span>{t('dealerAnalytics.previousPeriod')}:</span>
      <span className="font-medium">{previous}{suffix}</span>
    </div>
  </div>
  );
};

export default function DealerAnalyticsPage() {
  const t = useAppT();
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
        toast.error(t('dealerAnalytics.loadError'));
      }
    } catch (error) {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = useMemo(() => {
    switch (period) {
      case '7d': return t('dealerAnalytics.period7d');
      case '90d': return t('dealerAnalytics.period90d');
      default: return t('dealerAnalytics.period30d');
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
            <p className="text-muted-foreground">{t('dealerAnalytics.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 pb-8">
        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-12 text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-lg font-semibold mb-2">{t('dealerAnalytics.noDataTitle')}</h3>
            <p className="text-muted-foreground mb-4">{t('dealerAnalytics.noDataDescription')}</p>
            <Button onClick={fetchAnalytics}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sentimentChartData = [
    { label: t('dealerAnalytics.positive'), value: Number(data.sentimentBreakdown.positive) || 0, color: CHART_HEX.emerald },
    { label: t('dealerAnalytics.neutral'), value: Number(data.sentimentBreakdown.neutral) || 0, color: CHART_HEX.neutral },
    { label: t('dealerAnalytics.negative'), value: Number(data.sentimentBreakdown.negative) || 0, color: CHART_HEX.red },
  ];

  const ratingChartData = [
    { label: `5 ${t('dealerAnalytics.stars')}`, value: data.ratingDistribution[5], color: 'bg-gradient-to-r from-yellow-400 to-yellow-500' },
    { label: `4 ${t('dealerAnalytics.stars')}`, value: data.ratingDistribution[4], color: 'bg-gradient-to-r from-emerald-400 to-emerald-500' },
    { label: `3 ${t('dealerAnalytics.stars')}`, value: data.ratingDistribution[3], color: 'bg-gradient-to-r from-blue-400 to-blue-500' },
    { label: `2 ${t('dealerAnalytics.stars')}`, value: data.ratingDistribution[2], color: 'bg-gradient-to-r from-orange-400 to-orange-500' },
    { label: `1 ${t('dealerAnalytics.stars')}`, value: data.ratingDistribution[1], color: 'bg-gradient-to-r from-red-400 to-red-500' },
  ];

  return (
    <div className="space-y-6 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerAnalytics.eyebrow')}
        title={t('dealerAnalytics.title')}
        description={t('dealerAnalytics.description')}
        icon={<BarChart3 className="h-7 w-7" aria-hidden />}
        tone="auto"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px] border-border/70 bg-background/80 text-foreground dark:bg-white/15 dark:border-white/30 dark:text-white">
                <Calendar className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t('dealerAnalytics.period7d')}</SelectItem>
                <SelectItem value="30d">{t('dealerAnalytics.period30d')}</SelectItem>
                <SelectItem value="90d">{t('dealerAnalytics.period90d')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={fetchAnalytics}
              aria-label={t('common.refresh')}
              className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { title: t('dealerAnalytics.totalFeedback'), value: data.totalFeedbacks, change: data.feedbackGrowth, icon: MessageSquare, iconBox: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
          { title: t('dealerAnalytics.averageRating'), value: data.avgRating, change: data.ratingChange, suffix: '/5', icon: Star, iconBox: 'bg-yellow-500/10', iconColor: 'text-yellow-500' },
          { title: t('dealerAnalytics.conversionRate'), value: data.conversionRate, suffix: '%', icon: Target, iconBox: 'bg-primary/10', iconColor: 'text-primary' },
          { title: t('dealerAnalytics.responseRate'), value: data.responseRate, suffix: '%', icon: Activity, iconBox: 'bg-blue-500/10', iconColor: 'text-blue-500' },
        ].map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={stat.title === t('dealerAnalytics.averageRating') ? 'col-span-2 lg:col-span-1' : ''}
          >
            <Card className="border-border/60 bg-card/50 backdrop-blur-sm group hover:shadow-lg transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`rounded-xl p-2.5 ${stat.iconBox}`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                  {stat.change !== undefined && (
                    <Badge className={`border-0 ${stat.change >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {stat.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      {Math.abs(stat.change)}%
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                <p className={stat.title === t('dealerAnalytics.averageRating') ? 'text-2xl sm:text-3xl font-bold' : 'text-lg sm:text-2xl font-bold'}>
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
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" aria-hidden />
                  {t('dealerAnalytics.aiTrend')}
                </CardTitle>
                <CardDescription>{periodLabel} {t('dealerAnalytics.changesInPeriod')}</CardDescription>
              </div>
              <div className="flex gap-2">
                {[
                  { key: 'feedbacks', label: t('dealerAnalytics.feedback'), activeClass: 'bg-primary hover:bg-primary/90' },
                  { key: 'rating', label: t('dealerAnalytics.rating'), activeClass: 'bg-yellow-500 hover:bg-yellow-600' },
                  { key: 'sentiment', label: t('dealerAnalytics.sentiment'), activeClass: 'bg-emerald-500 hover:bg-emerald-600' },
                ].map((tab) => (
                  <Button
                    key={tab.key}
                    variant={chartView === tab.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartView(tab.key as typeof chartView)}
                    className={chartView === tab.key ? tab.activeClass : ''}
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
                color={chartView === 'rating' ? CHART_HEX.yellow : chartView === 'sentiment' ? CHART_HEX.emerald : CHART_BRAND}
                height={220}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Duygu Analizi Trendi */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('dealerAnalytics.sentimentChartTitle')}
            </CardTitle>
            <CardDescription>{t('dealerAnalytics.sentimentChartDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <SentimentTrendBars data={data.dailyData} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Comparison & Insights */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Period Comparison */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                {t('dealerAnalytics.periodComparison')}
              </CardTitle>
              <CardDescription>{t('dealerAnalytics.compareWithPrevious')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ComparisonCard
                title={t('dealerAnalytics.feedback')}
                current={data.comparison.feedbacks.current}
                previous={data.comparison.feedbacks.previous}
                change={data.comparison.feedbacks.change}
                icon={MessageSquare}
                color="bg-emerald-500/10 text-emerald-500"
              />
              <ComparisonCard
                title={t('dealerAnalytics.averageRating')}
                current={data.comparison.rating.current}
                previous={data.comparison.rating.previous}
                change={data.comparison.rating.change}
                suffix="/5"
                icon={Star}
                color="bg-yellow-500/10 text-yellow-500"
              />
              <ComparisonCard
                title={t('dealerAnalytics.positiveRate')}
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
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Flame className="w-5 h-5 text-orange-500" />
                {t('dealerAnalytics.activityHeatmap')}
              </CardTitle>
              <CardDescription>{t('dealerAnalytics.weeklyFeedbackDensity')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Heatmap data={data.heatmapData} />
              <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
                <span>{t('dealerAnalytics.low')}</span>
                <div className="flex gap-0.5">
                  <div className="w-3 h-3 rounded-sm bg-muted/30" />
                  <div className="h-3 w-3 rounded-sm bg-primary/20" />
                  <div className="h-3 w-3 rounded-sm bg-primary/40" />
                  <div className="h-3 w-3 rounded-sm bg-primary/60" />
                  <div className="h-3 w-3 rounded-sm bg-primary" />
                </div>
                <span>{t('dealerAnalytics.high')}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Sentiment & Rating */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sentiment */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                {t('dealerAnalytics.sentimentAnalysis')}
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-[240px]">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-around sm:gap-6">
                <div className="shrink-0">
                  <DonutChart data={sentimentChartData} size={180} />
                </div>
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
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                {t('dealerAnalytics.ratingDistribution')}
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
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <Zap className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="font-semibold">{t('dealerAnalytics.quickInsights')}</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">{t('dealerAnalytics.peakHour')}</p>
                <p className="font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  {data.insights.peakHour}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">{t('dealerAnalytics.peakDay')}</p>
                <p className="font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  {data.insights.peakDay}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">{t('dealerAnalytics.bestQr')}</p>
                <p className="font-semibold flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary" aria-hidden />
                  {data.insights.bestQR || t('dealerAnalytics.notYet')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background/50">
                <p className="text-xs text-muted-foreground mb-1">{t('dealerAnalytics.needsAttention')}</p>
                <p className="font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-orange-500" />
                  {data.insights.worstTopic || t('dealerAnalytics.noIssue')}
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
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" aria-hidden />
                {t('dealerAnalytics.topQrCodes')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topQRCodes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <QrCode className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{t('dealerAnalytics.noDataShort')}</p>
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
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                        index === 0
                          ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white'
                          : index === 1
                            ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-slate-900'
                            : index === 2
                              ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white'
                              : 'bg-primary text-primary-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{qr.name}</p>
                        <p className="text-xs text-muted-foreground">{qr.scans} {t('dealerAnalytics.scans')} · {qr.feedbacks} {t('dealerAnalytics.feedback')}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-bold">{qr.rating}</span>
                        </div>
                        <p className="text-xs text-emerald-500">{qr.positiveRate}% {t('dealerAnalytics.positiveLower')}</p>
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
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-500" />
                {t('dealerAnalytics.popularTopics')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topTopics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>{t('dealerAnalytics.noDataShort')}</p>
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
                            {topic.sentiment === 'positive' ? t('dealerAnalytics.positive') : topic.sentiment === 'negative' ? t('dealerAnalytics.negative') : t('dealerAnalytics.neutral')}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg sm:text-2xl font-bold">{topic.count}</p>
                        <p className="text-xs text-muted-foreground">{t('dealerAnalytics.mentions')}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">{t('dealerAnalytics.advancedAi')}</h3>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        <DashboardPageHeroChrome tone="auto" padded={false}>
          <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-border/60 bg-primary/10 p-3 text-primary">
                <Sparkles className="h-8 w-8 shrink-0" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-foreground">{t('dealerAnalytics.aiInsights')}</h3>
                <p className="text-pretty text-muted-foreground">
                  {t('dealerAnalytics.aiInsightsDescription')}
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/dealer/ai-insights">
                {t('dealerAnalytics.viewAiInsights')}
                <ArrowUpRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </DashboardPageHeroChrome>
      </motion.div>
    </div>
  );
}
