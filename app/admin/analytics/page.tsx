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

interface AnalyticsData {
  totalUsers: number;
  totalFeedbacks: number;
  totalQRCodes: number;
  avgRating: number;
  userGrowth: number;
  feedbackGrowth: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topDealers: Array<{
    id: string;
    name: string;
    feedbackCount: number;
    avgRating: number;
  }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData>({
    totalUsers: 0,
    totalFeedbacks: 0,
    totalQRCodes: 0,
    avgRating: 0,
    userGrowth: 0,
    feedbackGrowth: 0,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    topDealers: [],
    recentActivity: [],
  });

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    setLoading(true);
    // Simulated data - replace with actual API call
    setTimeout(() => {
      setData({
        totalUsers: 1234,
        totalFeedbacks: 5678,
        totalQRCodes: 89,
        avgRating: 4.2,
        userGrowth: 12.5,
        feedbackGrowth: 8.3,
        sentimentBreakdown: { positive: 65, neutral: 25, negative: 10 },
        topDealers: [
          { id: '1', name: 'Cafe Merkez', feedbackCount: 456, avgRating: 4.5 },
          { id: '2', name: 'Restaurant A', feedbackCount: 321, avgRating: 4.3 },
          { id: '3', name: 'Otel B', feedbackCount: 234, avgRating: 4.1 },
          { id: '4', name: 'Market C', feedbackCount: 189, avgRating: 4.0 },
          { id: '5', name: 'Spa D', feedbackCount: 156, avgRating: 4.6 },
        ],
        recentActivity: [
          { type: 'user', description: 'Yeni kullanıcı kaydı', timestamp: '2 dk önce' },
          { type: 'feedback', description: 'Yeni geri bildirim', timestamp: '5 dk önce' },
          { type: 'qr', description: 'QR kod tarandı', timestamp: '8 dk önce' },
          { type: 'reward', description: 'Ödül talep edildi', timestamp: '12 dk önce' },
          { type: 'badge', description: 'Rozet kazanıldı', timestamp: '15 dk önce' },
        ],
      });
      setLoading(false);
    }, 1000);
  };

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
                {change >= 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                <span>{Math.abs(change)}%</span>
                <span className="text-muted-foreground">bu dönem</span>
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
        <DashboardHeader title="Analitik" description="Platform istatistikleri ve raporları" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-8 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/3" />
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
        <DashboardHeader title="Analitik" description="Platform istatistikleri ve raporları" />
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
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
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            title="Toplam Kullanıcı"
            value={data.totalUsers.toLocaleString()}
            change={data.userGrowth}
            icon={Users}
            color="bg-blue-500/10 text-blue-500"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            title="Geri Bildirim"
            value={data.totalFeedbacks.toLocaleString()}
            change={data.feedbackGrowth}
            icon={MessageSquare}
            color="bg-green-500/10 text-green-500"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <StatCard
            title="QR Kodlar"
            value={data.totalQRCodes}
            icon={QrCode}
            color="bg-purple-500/10 text-purple-500"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <StatCard
            title="Ortalama Puan"
            value={data.avgRating.toFixed(1)}
            icon={Star}
            color="bg-yellow-500/10 text-yellow-500"
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sentiment Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card glass>
            <CardHeader>
              <CardTitle className="text-lg">Duygu Dağılımı</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-green-500">Olumlu</span>
                  <span>{data.sentimentBreakdown.positive}%</span>
                </div>
                <Progress value={data.sentimentBreakdown.positive} className="h-2" indicatorClassName="bg-green-500" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Nötr</span>
                  <span>{data.sentimentBreakdown.neutral}%</span>
                </div>
                <Progress value={data.sentimentBreakdown.neutral} className="h-2" indicatorClassName="bg-gray-500" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-red-500">Olumsuz</span>
                  <span>{data.sentimentBreakdown.negative}%</span>
                </div>
                <Progress value={data.sentimentBreakdown.negative} className="h-2" indicatorClassName="bg-red-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Dealers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card glass>
            <CardHeader>
              <CardTitle className="text-lg">En İyi Bayiler</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.topDealers.map((dealer, index) => (
                  <div key={dealer.id} className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{dealer.name}</p>
                      <p className="text-sm text-muted-foreground">{dealer.feedbackCount} geri bildirim</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">{dealer.avgRating.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg">Son Aktiviteler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    {activity.type === 'user' && <Users className="h-4 w-4 text-primary" />}
                    {activity.type === 'feedback' && <MessageSquare className="h-4 w-4 text-primary" />}
                    {activity.type === 'qr' && <QrCode className="h-4 w-4 text-primary" />}
                    {activity.type === 'reward' && <Star className="h-4 w-4 text-primary" />}
                    {activity.type === 'badge' && <TrendingUp className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{activity.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}




