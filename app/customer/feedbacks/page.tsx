'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  MessageSquare,
  Star,
  Calendar,
  Building,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Coffee,
  Gift,
  TrendingUp,
  Loader2,
  ArrowRight,
  CheckCircle2,
  Store,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatRelativeTime, getSentimentColor, formatCurrency } from '@/lib/utils';

// QR Based Feedback
interface QRFeedback {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  createdAt: string;
  qrCode: {
    name: string;
    businessName: string;
  };
  dealerReply?: string | null;
  dealerRepliedAt?: string | null;
}

// Consumption Review
interface ConsumptionReview {
  id: string;
  rating: number;
  text: string | null;
  dimensions: any | null;
  createdAt: string;
  consumption: {
    id: string;
    amount: number | null;
    createdAt: string;
    dealer: {
      id: string;
      name: string;
      businessName: string | null;
      businessLogo: string | null;
    };
    product: {
      id: string;
      name: string;
      category: {
        name: string;
        icon: string;
      } | null;
    } | null;
  };
}

export default function CustomerFeedbacksPage() {
  const [qrFeedbacks, setQRFeedbacks] = useState<QRFeedback[]>([]);
  const [consumptionReviews, setConsumptionReviews] = useState<ConsumptionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('consumption');

  useEffect(() => {
    fetchAllFeedbacks();
  }, []);

  const fetchAllFeedbacks = async () => {
    try {
      setLoading(true);
      
      // Fetch both types in parallel
      const [qrRes, reviewRes] = await Promise.all([
        fetch('/api/feedbacks'),
        fetch('/api/customer/reviews'),
      ]);
      
      const qrData = await qrRes.json();
      const reviewData = await reviewRes.json();

      if (qrData.items) {
        const formattedFeedbacks = qrData.items.map((f: any) => ({
          id: f.id,
          rating: f.rating,
          text: f.text,
          sentiment: f.sentiment,
          createdAt: f.createdAt,
          qrCode: {
            name: f.qrCode?.name || 'QR',
            businessName: f.qrCode?.name || 'İşletme',
          },
          dealerReply: f.dealerReply || null,
          dealerRepliedAt: f.dealerRepliedAt || null,
        }));
        setQRFeedbacks(formattedFeedbacks);
      }

      if (reviewData.success && reviewData.reviews) {
        setConsumptionReviews(reviewData.reviews);
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

  const totalFeedbacks = qrFeedbacks.length + consumptionReviews.length;
  const allRatings = [
    ...qrFeedbacks.map(f => f.rating),
    ...consumptionReviews.map(r => r.rating),
  ];
  const avgRating = allRatings.length > 0
    ? (allRatings.reduce((acc, r) => acc + r, 0) / allRatings.length).toFixed(1)
    : '0';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Geri Bildirimlerim"
        description="Gönderdiğiniz tüm geri bildirimleri ve yorumları görüntüleyin"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{totalFeedbacks}</p>
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
                <p className="text-lg sm:text-2xl font-bold">{avgRating}</p>
                <p className="text-xs text-muted-foreground">Ort. Puan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card glass>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Gift className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl font-bold">{consumptionReviews.length * 50}+</p>
                <p className="text-xs text-muted-foreground">Kazanılan Puan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="consumption" className="gap-2">
            <Coffee className="h-4 w-4" />
            Tüketim Yorumları ({consumptionReviews.length})
          </TabsTrigger>
          <TabsTrigger value="qr" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            QR Geri Bildirimleri ({qrFeedbacks.length})
          </TabsTrigger>
        </TabsList>

        {/* Consumption Reviews Tab */}
        <TabsContent value="consumption" className="space-y-4 mt-4">
          {consumptionReviews.length === 0 ? (
            <Card glass>
              <CardContent className="p-8 text-center">
                <Coffee className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Henüz tüketim yorumu yapmadınız</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Tüketimlerinize yorum yaparak puan kazanın!
                </p>
                <Button asChild className="mt-4">
                  <Link href="/customer/consumptions?hasReview=false">
                    Yorum Yap
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            consumptionReviews.map((review, index) => (
              <motion.div
                key={review.id}
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
                          <span className="font-medium">
                            {review.consumption.dealer.businessName || review.consumption.dealer.name}
                          </span>
                          {review.consumption.product && (
                            <Badge variant="outline" className="text-xs">
                              {review.consumption.product.category?.icon} {review.consumption.product.name}
                            </Badge>
                          )}
                        </div>
                        {renderStars(review.rating)}
                      </div>

                      {/* Content */}
                      <p className="text-sm text-muted-foreground">
                        {review.text || 'Yorum metni yok'}
                      </p>

                      {/* Dimensions */}
                      {review.dimensions && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(review.dimensions).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key === 'taste' ? 'Lezzet' : 
                               key === 'service' ? 'Servis' : 
                               key === 'ambiance' ? 'Ambiyans' : 
                               key === 'value' ? 'Fiyat/Değer' : key}: {value as number}/5
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatRelativeTime(review.createdAt)}
                        </div>
                        {review.consumption.amount && (
                          <Badge variant="outline">
                            {formatCurrency(review.consumption.amount)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        {/* QR Feedbacks Tab */}
        <TabsContent value="qr" className="space-y-4 mt-4">
          {qrFeedbacks.length === 0 ? (
            <Card glass>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Henüz QR geri bildirimi göndermediniz</p>
                <p className="text-sm text-muted-foreground mt-2">
                  QR kod tarayarak ilk geri bildiriminizi gönderin!
                </p>
              </CardContent>
            </Card>
          ) : (
            qrFeedbacks.map((feedback, index) => (
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

                      {/* Dealer Reply */}
                      {feedback.dealerReply && (
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                            <Store className="h-3 w-3" /> İşletme Yanıtı
                          </p>
                          <p className="text-sm">{feedback.dealerReply}</p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatRelativeTime(feedback.createdAt)}
                        </div>
                        <div className="flex items-center gap-2">
                          {feedback.dealerReply && (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Yanıtlandı
                            </Badge>
                          )}
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
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
