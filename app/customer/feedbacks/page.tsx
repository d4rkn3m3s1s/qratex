'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Star,
  Calendar,
  Building,
  ThumbsUp,
  ThumbsDown,
  Meh,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatRelativeTime, getSentimentColor } from '@/lib/utils';

interface Feedback {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  createdAt: string;
  qrCode: {
    name: string;
    businessName: string;
  };
}

export default function CustomerFeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/feedbacks');
      const data = await res.json();

      if (data.items) {
        // Format data for display
        const formattedFeedbacks = data.items.map((f: {
          id: string;
          rating: number;
          text: string | null;
          sentiment: string | null;
          createdAt: string;
          qrCode: { name: string; code: string };
        }) => ({
          id: f.id,
          rating: f.rating,
          text: f.text,
          sentiment: f.sentiment,
          createdAt: f.createdAt,
          qrCode: {
            name: f.qrCode.name,
            businessName: f.qrCode.name, // QR code name as business name
          },
        }));
        setFeedbacks(formattedFeedbacks);
      }
    } catch (error) {
      toast.error('Geri bildirimler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'
          }`}
        />
      ))}
    </div>
  );

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'negative':
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return <Meh className="h-4 w-4 text-gray-500" />;
    }
  };

  const stats = {
    total: feedbacks.length,
    avgRating:
      feedbacks.length > 0
        ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1)
        : '0',
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Geri Bildirimlerim"
        description="Gönderdiğiniz tüm geri bildirimleri görüntüleyin"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Toplam</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.avgRating}</p>
                <p className="text-xs text-muted-foreground">Ort. Puan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feedbacks List */}
      <div className="space-y-4">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i} glass>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : feedbacks.length === 0 ? (
          <Card glass>
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Henüz geri bildirim göndermediniz</p>
              <p className="text-sm text-muted-foreground mt-2">
                QR kod tarayarak ilk geri bildiriminizi gönderin!
              </p>
            </CardContent>
          </Card>
        ) : (
          feedbacks.map((feedback, index) => (
            <motion.div
              key={feedback.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card glass hover>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{feedback.qrCode.businessName}</span>
                        <Badge variant="outline" className="text-xs">
                          {feedback.qrCode.name}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {renderStars(feedback.rating)}
                        {getSentimentIcon(feedback.sentiment)}
                      </div>
                    </div>

                    {/* Content */}
                    <p className="text-sm text-muted-foreground">
                      {feedback.text || 'Yorum yapılmadı'}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatRelativeTime(feedback.createdAt)}
                      </div>
                      {feedback.sentiment && (
                        <Badge className={getSentimentColor(feedback.sentiment)}>
                          {feedback.sentiment === 'positive'
                            ? 'Olumlu'
                            : feedback.sentiment === 'negative'
                            ? 'Olumsuz'
                            : 'Nötr'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}




