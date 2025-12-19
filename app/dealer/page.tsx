'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  QrCode,
  MessageSquare,
  TrendingUp,
  Star,
  Plus,
  BarChart3,
  Eye,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatsCard } from '@/components/dashboard/stats-card';
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
  };
  sentimentData: {
    positive: number;
    neutral: number;
    negative: number;
  };
  recentFeedbacks: Array<{
    id: string;
    rating: number;
    text: string | null;
    sentiment: string | null;
    createdAt: string;
    qrName: string;
    userName: string;
  }>;
  qrCodes: Array<{
    id: string;
    name: string;
    code: string;
    scans: number;
    feedbacks: number;
  }>;
}

const getSentimentBadge = (sentiment: string | null) => {
  switch (sentiment) {
    case 'positive':
      return <Badge variant="success">Olumlu</Badge>;
    case 'negative':
      return <Badge variant="destructive">Olumsuz</Badge>;
    default:
      return <Badge variant="secondary">Nötr</Badge>;
  }
};

export default function DealerDashboard() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DealerStats | null>(null);

  useEffect(() => {
    fetchStats();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = data?.stats || {
    totalFeedbacks: 0,
    avgRating: '0',
    totalQRCodes: 0,
    activeQRCodes: 0,
    totalScans: 0,
  };

  const sentimentData = data?.sentimentData || { positive: 0, neutral: 0, negative: 0 };
  const recentFeedbacks = data?.recentFeedbacks || [];
  const qrCodes = data?.qrCodes || [];

  const statsCards = [
    {
      title: 'Toplam Geri Bildirim',
      value: stats.totalFeedbacks,
      change: 0,
      icon: MessageSquare,
      iconColor: 'text-green-500',
      iconBgColor: 'bg-green-500/10',
    },
    {
      title: 'Ortalama Puan',
      value: stats.avgRating,
      change: 0,
      icon: Star,
      iconColor: 'text-yellow-500',
      iconBgColor: 'bg-yellow-500/10',
    },
    {
      title: 'Aktif QR Kod',
      value: stats.activeQRCodes,
      icon: QrCode,
      iconColor: 'text-purple-500',
      iconBgColor: 'bg-purple-500/10',
    },
    {
      title: 'QR Tarama',
      value: stats.totalScans,
      change: 0,
      icon: Eye,
      iconColor: 'text-blue-500',
      iconBgColor: 'bg-blue-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-bold">Hoş Geldiniz, {session?.user?.name || 'İşletme Sahibi'} 👋</h2>
          <p className="text-muted-foreground">
            İşletmenizin performansını takip edin
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Button asChild variant="gradient">
            <Link href="/dealer/qr-codes">
              <Plus className="w-4 h-4 mr-2" />
              Yeni QR Kod
            </Link>
          </Button>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <StatsCard key={stat.title} {...stat} delay={index * 0.1} />
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Sentiment Analysis */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Duygu Analizi
            </CardTitle>
            <CardDescription>
              Geri bildirimlerin genel duygu dağılımı
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    Olumlu
                  </span>
                  <span className="font-medium">{sentimentData.positive}%</span>
                </div>
                <Progress value={sentimentData.positive} indicatorClassName="bg-green-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Nötr
                  </span>
                  <span className="font-medium">{sentimentData.neutral}%</span>
                </div>
                <Progress value={sentimentData.neutral} indicatorClassName="bg-yellow-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Olumsuz
                  </span>
                  <span className="font-medium">{sentimentData.negative}%</span>
                </div>
                <Progress value={sentimentData.negative} indicatorClassName="bg-red-500" />
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button asChild variant="outline" className="w-full">
                <Link href="/dealer/analytics">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Detaylı Analiz
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Feedbacks */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-500" />
                Son Geri Bildirimler
              </CardTitle>
              <CardDescription>
                Müşterilerinizden gelen son yorumlar
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dealer/feedbacks">Tümünü Gör</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentFeedbacks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Henüz geri bildirim yok</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentFeedbacks.map((feedback) => (
                  <div
                    key={feedback.id}
                    className="flex gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-500">
                          {'⭐'.repeat(feedback.rating)}
                          {'☆'.repeat(5 - feedback.rating)}
                        </span>
                        {getSentimentBadge(feedback.sentiment)}
                      </div>
                      <p className="text-sm mb-2 line-clamp-2">{feedback.text || 'Yorum yapılmadı'}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <QrCode className="w-3 h-3" />
                        <span>{feedback.qrName}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(feedback.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* QR Codes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-purple-500" />
              QR Kodlarınız
            </CardTitle>
            <CardDescription>
              En aktif QR kodlarınız
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dealer/qr-codes">Tümünü Gör</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {qrCodes.length === 0 ? (
            <div className="text-center py-8">
              <QrCode className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">Henüz QR kod oluşturmadınız</p>
              <Button asChild>
                <Link href="/dealer/qr-codes">
                  <Plus className="h-4 w-4 mr-2" />
                  İlk QR Kodunuzu Oluşturun
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {qrCodes.map((qr) => (
                <div
                  key={qr.id}
                  className="p-4 rounded-lg border bg-card hover:shadow-lg transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                      <QrCode className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium">{qr.name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">{qr.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Eye className="w-4 h-4" />
                      <span>{qr.scans} tarama</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MessageSquare className="w-4 h-4" />
                      <span>{qr.feedbacks} geri bildirim</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
