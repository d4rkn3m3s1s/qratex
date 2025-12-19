'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function DealerAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalFeedbacks: 156,
    avgRating: 4.3,
    totalScans: 892,
    conversionRate: 17.5,
    feedbackGrowth: 12.5,
    ratingChange: 0.2,
    sentimentBreakdown: { positive: 68, neutral: 22, negative: 10 },
    topQRCodes: [
      { name: 'Ana Giriş', scans: 234, feedbacks: 45, rating: 4.5 },
      { name: 'Bahçe Masası', scans: 189, feedbacks: 38, rating: 4.2 },
      { name: 'Bar Alanı', scans: 156, feedbacks: 28, rating: 4.4 },
    ],
    topTopics: [
      { name: 'Hizmet Kalitesi', count: 45, sentiment: 'positive' },
      { name: 'Yemek Lezzeti', count: 38, sentiment: 'positive' },
      { name: 'Bekleme Süresi', count: 22, sentiment: 'negative' },
      { name: 'Fiyat', count: 18, sentiment: 'neutral' },
      { name: 'Ambiyans', count: 15, sentiment: 'positive' },
    ],
    ratingDistribution: { 5: 45, 4: 35, 3: 12, 2: 5, 1: 3 },
  });

  useEffect(() => {
    // Simulate loading
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  }, [period]);

  const StatCard = ({
    title,
    value,
    change,
    icon: Icon,
    color,
  }: {
    title: string;
    value: string | number;
    change?: number;
    icon: React.ElementType;
    color: string;
  }) => (
    <Card glass>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{Math.abs(change)}%</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardHeader title="Analitik" description="İşletmenizin performans metrikleri" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-8 bg-muted rounded w-3/4" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <DashboardHeader title="Analitik" description="İşletmenizin performans metrikleri" />
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Son 7 Gün</SelectItem>
            <SelectItem value="30d">Son 30 Gün</SelectItem>
            <SelectItem value="90d">Son 90 Gün</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <StatCard
            title="Geri Bildirim"
            value={data.totalFeedbacks}
            change={data.feedbackGrowth}
            icon={MessageSquare}
            color="bg-primary/10 text-primary"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            title="Ort. Puan"
            value={data.avgRating.toFixed(1)}
            change={data.ratingChange}
            icon={Star}
            color="bg-yellow-500/10 text-yellow-500"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <StatCard
            title="QR Tarama"
            value={data.totalScans}
            icon={Eye}
            color="bg-blue-500/10 text-blue-500"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <StatCard
            title="Dönüşüm"
            value={`%${data.conversionRate}`}
            icon={Users}
            color="bg-green-500/10 text-green-500"
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Breakdown */}
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg">Duygu Analizi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-500">Olumlu</span>
                <span>{data.sentimentBreakdown.positive}%</span>
              </div>
              <Progress value={data.sentimentBreakdown.positive} className="h-3" indicatorClassName="bg-green-500" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Nötr</span>
                <span>{data.sentimentBreakdown.neutral}%</span>
              </div>
              <Progress value={data.sentimentBreakdown.neutral} className="h-3" indicatorClassName="bg-gray-500" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-red-500">Olumsuz</span>
                <span>{data.sentimentBreakdown.negative}%</span>
              </div>
              <Progress value={data.sentimentBreakdown.negative} className="h-3" indicatorClassName="bg-red-500" />
            </div>
          </CardContent>
        </Card>

        {/* Rating Distribution */}
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg">Puan Dağılımı</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[5, 4, 3, 2, 1].map((rating) => (
              <div key={rating} className="flex items-center gap-3">
                <div className="flex items-center gap-1 w-16">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  <span className="text-sm">{rating}</span>
                </div>
                <Progress 
                  value={data.ratingDistribution[rating as keyof typeof data.ratingDistribution]} 
                  className="flex-1 h-3" 
                />
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {data.ratingDistribution[rating as keyof typeof data.ratingDistribution]}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top QR Codes */}
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg">En Aktif QR Kodlar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topQRCodes.map((qr, index) => (
                <div key={qr.name} className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{qr.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {qr.scans} tarama · {qr.feedbacks} geri bildirim
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    <span className="font-medium">{qr.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Topics */}
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg">Popüler Konular</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topTopics.map((topic) => (
                <div key={topic.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{topic.name}</span>
                    <Badge 
                      variant="outline" 
                      className={
                        topic.sentiment === 'positive' ? 'text-green-500 border-green-500/20' :
                        topic.sentiment === 'negative' ? 'text-red-500 border-red-500/20' :
                        'text-gray-500 border-gray-500/20'
                      }
                    >
                      {topic.sentiment === 'positive' ? 'Olumlu' :
                       topic.sentiment === 'negative' ? 'Olumsuz' : 'Nötr'}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">{topic.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


