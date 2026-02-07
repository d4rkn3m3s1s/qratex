'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import {
  QrCode,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Star,
  Plus,
  BarChart3,
  Eye,
  Sparkles,
  Loader2,
  Zap,
  Trophy,
  Target,
  ArrowUpRight,
  ArrowRight,
  Clock,
  Crown,
  Flame,
  Activity,
  Users,
  ChevronRight,
  Award,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';

interface DealerStats {
  stats: {
    totalFeedbacks: number;
    avgRating: string;
    totalQRCodes: number;
    activeQRCodes: number;
    totalScans: number;
    feedbackGrowth: number;
    ratingChange: number;
    weeklyFeedbacks: number;
    conversionRate: string;
  };
  performance: {
    score: number;
    level: string;
    color: string;
  };
  sentimentData: {
    positive: number;
    neutral: number;
    negative: number;
  };
  weeklyData: Array<{
    day: string;
    feedbacks: number;
    avgRating: number;
  }>;
  recentFeedbacks: Array<{
    id: string;
    rating: number;
    text: string | null;
    sentiment: string | null;
    createdAt: string;
    qrName: string;
    userName: string;
    userImage: string | null;
  }>;
  qrCodes: Array<{
    id: string;
    name: string;
    code: string;
    scans: number;
    feedbacks: number;
    avgRating: string;
    isActive: boolean;
  }>;
}

const getSentimentIcon = (sentiment: string | null) => {
  switch (sentiment) {
    case 'positive':
      return <span className="text-lg">😊</span>;
    case 'negative':
      return <span className="text-lg">😔</span>;
    default:
      return <span className="text-lg">😐</span>;
  }
};

const getSentimentBadge = (sentiment: string | null) => {
  switch (sentiment) {
    case 'positive':
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Olumlu</Badge>;
    case 'negative':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Olumsuz</Badge>;
    default:
      return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Nötr</Badge>;
  }
};

// Animated Counter Component
const AnimatedCounter = ({ value, duration = 1.5 }: { value: number; duration?: number }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const end = value;
    const incrementTime = (duration * 1000) / end;
    
    if (end === 0) {
      setCount(0);
      return;
    }
    
    const timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start >= end) clearInterval(timer);
    }, Math.max(incrementTime, 10));
    
    return () => clearInterval(timer);
  }, [value, duration]);
  
  return <span>{count}</span>;
};

// Mini Chart Component
const MiniChart = ({ data }: { data: Array<{ feedbacks: number }> }) => {
  const maxValue = Math.max(...data.map(d => d.feedbacks), 1);
  
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((d, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(d.feedbacks / maxValue) * 100}%` }}
          transition={{ duration: 0.5, delay: i * 0.05 }}
          className="flex-1 bg-gradient-to-t from-primary/60 to-primary rounded-t min-h-[4px]"
        />
      ))}
    </div>
  );
};

// Circular Progress Component
const CircularProgress = ({ 
  value, 
  size = 120, 
  strokeWidth = 10,
  color = 'primary'
}: { 
  value: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  const colorClasses: Record<string, string> = {
    emerald: 'stroke-emerald-500',
    green: 'stroke-green-500',
    yellow: 'stroke-yellow-500',
    orange: 'stroke-orange-500',
    gray: 'stroke-gray-500',
    primary: 'stroke-primary',
  };
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={colorClasses[color] || 'stroke-primary'}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl sm:text-3xl font-bold">{value}</span>
        <span className="text-xs text-muted-foreground">Puan</span>
      </div>
    </div>
  );
};

export default function DealerDashboard() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DealerStats | null>(null);
  const [activeTab, setActiveTab] = useState<'feedbacks' | 'qrcodes'>('feedbacks');

  useEffect(() => {
    fetchStats();
    const pollInterval = setInterval(fetchStats, 30000);
    return () => clearInterval(pollInterval);
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dealer/stats');
      const result = await res.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        toast.error('İstatistikler yüklenemedi');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Günaydın';
    if (hour < 18) return 'İyi Günler';
    return 'İyi Akşamlar';
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="h-12 w-12 text-primary mx-auto" />
          </motion.div>
          <p className="text-muted-foreground">Verileriniz yükleniyor...</p>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    totalFeedbacks: 0,
    avgRating: '0',
    totalQRCodes: 0,
    activeQRCodes: 0,
    totalScans: 0,
    feedbackGrowth: 0,
    ratingChange: 0,
    weeklyFeedbacks: 0,
    conversionRate: '0',
  };

  const performance = data?.performance || { score: 0, level: 'Başlangıç', color: 'gray' };
  const sentimentData = data?.sentimentData || { positive: 0, neutral: 0, negative: 0 };
  const weeklyData = data?.weeklyData || [];
  const recentFeedbacks = data?.recentFeedbacks || [];
  const qrCodes = data?.qrCodes || [];

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-4 sm:p-6 md:p-8"
      >
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-primary/10 dark:bg-black/20 rounded-full blur-3xl" />
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/40 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                opacity: [0.2, 1, 0.2],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2"
            >
              <Crown className="w-6 h-6 text-yellow-300" />
              <span className="text-white/80 text-sm font-medium">Dealer Dashboard</span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl sm:text-3xl md:text-4xl font-bold text-white"
            >
              {greeting}, {session?.user?.name?.split(' ')[0] || 'İşletmeci'}! 👋
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="text-white/70 text-lg"
            >
              İşletmenizin bugünkü performansı harika görünüyor
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-2 sm:gap-4"
          >
            <div className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4">
              <CircularProgress 
                value={performance.score} 
                size={56} 
                strokeWidth={6}
                color={performance.color}
              />
              <div>
                <p className="text-white/60 text-[10px] sm:text-sm">Performans</p>
                <p className="text-white text-sm sm:text-xl font-bold">{performance.level}</p>
              </div>
            </div>
            <Button asChild size="sm" className="bg-white text-purple-600 hover:bg-white/90 text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-4">
              <Link href="/dealer/qr-codes">
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Yeni QR Kod
              </Link>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Toplam Geri Bildirim',
            value: stats.totalFeedbacks,
            change: stats.feedbackGrowth,
            icon: MessageSquare,
            color: 'from-emerald-500 to-teal-600',
            bgColor: 'bg-emerald-500/10',
            iconColor: 'text-emerald-500',
          },
          {
            title: 'Ortalama Puan',
            value: stats.avgRating,
            change: stats.ratingChange,
            suffix: '/5',
            icon: Star,
            color: 'from-yellow-500 to-orange-500',
            bgColor: 'bg-yellow-500/10',
            iconColor: 'text-yellow-500',
          },
          {
            title: 'Aktif QR Kod',
            value: stats.activeQRCodes,
            total: stats.totalQRCodes,
            icon: QrCode,
            color: 'from-violet-500 to-purple-600',
            bgColor: 'bg-violet-500/10',
            iconColor: 'text-violet-500',
          },
          {
            title: 'Dönüşüm Oranı',
            value: stats.conversionRate,
            suffix: '%',
            icon: Target,
            color: 'from-blue-500 to-cyan-500',
            bgColor: 'bg-blue-500/10',
            iconColor: 'text-blue-500',
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-0 bg-card/50 backdrop-blur-sm">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                  </div>
                  {stat.change !== undefined && stat.change !== 0 && (
                    <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                      stat.change >= 0 
                        ? 'bg-emerald-500/10 text-emerald-500' 
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {stat.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(stat.change)}%
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg sm:text-2xl font-bold">
                      {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
                    </span>
                    {stat.suffix && <span className="text-muted-foreground text-sm">{stat.suffix}</span>}
                    {stat.total !== undefined && (
                      <span className="text-muted-foreground text-sm">/ {stat.total}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Weekly Activity & Sentiment */}
        <div className="lg:col-span-5 space-y-6">
          {/* Weekly Activity Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Activity className="w-5 h-5 text-primary" />
                      Haftalık Aktivite
                    </CardTitle>
                    <CardDescription>Son 7 günlük geri bildirimler</CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-lg sm:text-2xl font-bold">{stats.weeklyFeedbacks}</p>
                    <p className="text-xs text-muted-foreground">Bu hafta</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <MiniChart data={weeklyData} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    {weeklyData.map((d, i) => (
                      <span key={i}>{d.day}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sentiment Analysis */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Duygu Analizi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Olumlu', value: sentimentData.positive, color: 'bg-emerald-500', emoji: '😊' },
                  { label: 'Nötr', value: sentimentData.neutral, color: 'bg-gray-400', emoji: '😐' },
                  { label: 'Olumsuz', value: sentimentData.negative, color: 'bg-red-500', emoji: '😔' },
                ].map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span>{item.emoji}</span>
                        <span>{item.label}</span>
                      </div>
                      <span className="font-semibold">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className={`h-full ${item.color} rounded-full`}
                      />
                    </div>
                  </div>
                ))}
                
                <Button asChild variant="outline" className="w-full mt-4">
                  <Link href="/dealer/analytics">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Detaylı Analiz
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Recent Feedbacks & QR Codes */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-0 bg-card/50 backdrop-blur-sm h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTab('feedbacks')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === 'feedbacks'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Son Geri Bildirimler
                    </button>
                    <button
                      onClick={() => setActiveTab('qrcodes')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === 'qrcodes'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      QR Kodlar
                    </button>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={activeTab === 'feedbacks' ? '/dealer/feedbacks' : '/dealer/qr-codes'}>
                      Tümünü Gör
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  {activeTab === 'feedbacks' ? (
                    <motion.div
                      key="feedbacks"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-3"
                    >
                      {recentFeedbacks.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">Henüz geri bildirim yok</p>
                          <p className="text-sm">Müşterileriniz QR kod taradığında burada görünecek</p>
                        </div>
                      ) : (
                        recentFeedbacks.map((feedback, index) => (
                          <motion.div
                            key={feedback.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="group p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all cursor-pointer"
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative">
                                {feedback.userImage ? (
                                  <Image
                                    src={feedback.userImage}
                                    alt={feedback.userName}
                                    width={40}
                                    height={40}
                                    className="rounded-full"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-medium">
                                    {feedback.userName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                                  {getSentimentIcon(feedback.sentiment)}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{feedback.userName}</span>
                                    {getSentimentBadge(feedback.sentiment)}
                                  </div>
                                  <div className="flex items-center text-yellow-500 shrink-0">
                                    {[...Array(5)].map((_, i) => (
                                      <Star 
                                        key={i} 
                                        className={`w-3.5 h-3.5 ${i < feedback.rating ? 'fill-current' : 'opacity-30'}`} 
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {feedback.text || 'Yorum yapılmadı'}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <QrCode className="w-3 h-3" />
                                    {feedback.qrName}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatRelativeTime(feedback.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="qrcodes"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      {qrCodes.length === 0 ? (
                        <div className="col-span-2 text-center py-12">
                          <QrCode className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                          <p className="font-medium text-muted-foreground">Henüz QR kod yok</p>
                          <Button asChild className="mt-4">
                            <Link href="/dealer/qr-codes">
                              <Plus className="h-4 w-4 mr-2" />
                              İlk QR Kodunuzu Oluşturun
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        qrCodes.map((qr, index) => (
                          <motion.div
                            key={qr.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="group p-4 rounded-xl border bg-card hover:shadow-lg hover:border-primary/20 transition-all"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                                <QrCode className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold truncate">{qr.name}</h4>
                                  {qr.isActive ? (
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">{qr.code}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1 sm:gap-2 text-center">
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-lg font-bold">{qr.scans}</p>
                                <p className="text-[10px] text-muted-foreground">Tarama</p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-lg font-bold">{qr.feedbacks}</p>
                                <p className="text-[10px] text-muted-foreground">Geri Bildirim</p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <div className="flex items-center justify-center gap-0.5">
                                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                  <span className="text-lg font-bold">{qr.avgRating}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Puan</p>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-0 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Hızlı İşlemler</h3>
                  <p className="text-sm text-muted-foreground">İşletmenizi yönetin</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/dealer/qr-codes">
                    <QrCode className="w-4 h-4 mr-2" />
                    QR Kodlar
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dealer/feedbacks">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Geri Bildirimler
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dealer/analytics">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Analitik
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dealer/ai-insights">
                    <Sparkles className="w-4 h-4 mr-2" />
                    AI İçgörüler
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
