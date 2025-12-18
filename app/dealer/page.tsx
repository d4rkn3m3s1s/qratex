'use client';

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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Progress } from '@/components/ui/progress';
import { formatRelativeTime } from '@/lib/utils';

const stats = [
  {
    title: 'Toplam Geri Bildirim',
    value: 1234,
    change: 15,
    icon: MessageSquare,
    iconColor: 'text-green-500',
    iconBgColor: 'bg-green-500/10',
  },
  {
    title: 'Ortalama Puan',
    value: '4.6',
    change: 3,
    icon: Star,
    iconColor: 'text-yellow-500',
    iconBgColor: 'bg-yellow-500/10',
  },
  {
    title: 'Aktif QR Kod',
    value: 8,
    icon: QrCode,
    iconColor: 'text-purple-500',
    iconBgColor: 'bg-purple-500/10',
  },
  {
    title: 'QR Tarama',
    value: 542,
    change: 28,
    icon: Eye,
    iconColor: 'text-blue-500',
    iconBgColor: 'bg-blue-500/10',
  },
];

const recentFeedbacks = [
  {
    id: 1,
    rating: 5,
    text: 'Harika bir deneyimdi! Kahve muhteşemdi.',
    sentiment: 'positive',
    createdAt: new Date(),
    qrName: 'Ana Masa QR',
  },
  {
    id: 2,
    rating: 4,
    text: 'Ortam güzel ama biraz kalabalıktı.',
    sentiment: 'positive',
    createdAt: new Date(Date.now() - 3600000),
    qrName: 'Teras QR',
  },
  {
    id: 3,
    rating: 3,
    text: 'Servis biraz yavaştı.',
    sentiment: 'neutral',
    createdAt: new Date(Date.now() - 7200000),
    qrName: 'Ana Masa QR',
  },
];

const qrCodes = [
  { id: 1, name: 'Ana Masa QR', code: 'DEMO-001', scans: 245, feedbacks: 89 },
  { id: 2, name: 'Teras QR', code: 'DEMO-002', scans: 187, feedbacks: 56 },
  { id: 3, name: 'Bahçe QR', code: 'DEMO-003', scans: 110, feedbacks: 34 },
];

const sentimentData = {
  positive: 72,
  neutral: 18,
  negative: 10,
};

const getSentimentBadge = (sentiment: string) => {
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
  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-2xl font-bold">Hoş Geldiniz, İşletme Sahibi 👋</h2>
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
            <Link href="/dealer/qr-codes/new">
              <Plus className="w-4 h-4 mr-2" />
              Yeni QR Kod
            </Link>
          </Button>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
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
              <h4 className="text-sm font-medium mb-3">Popüler Konular</h4>
              <div className="flex flex-wrap gap-2">
                {['Servis', 'Kalite', 'Fiyat', 'Atmosfer', 'Temizlik'].map((topic) => (
                  <Badge key={topic} variant="outline">
                    {topic}
                  </Badge>
                ))}
              </div>
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
                    <p className="text-sm mb-2">{feedback.text}</p>
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
              Tüm QR kodlarınızı yönetin
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dealer/qr-codes">Tümünü Gör</Link>
          </Button>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}

