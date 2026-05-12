'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Footprints,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/lib/admin-toast';
import { formatRelativeTime, getSentimentColor, formatCurrency } from '@/lib/utils';
import { useCustomerT } from '@/lib/use-customer-locale';

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

// Remedy offer (telafi teklifi) – Geri bildirim / tüketim yorumu ile eşleştirmek için
interface RemedyOfferItem {
  id: string;
  status: string;
  message?: string;
  createdAt?: string;
  dealer?: { id: string; name: string | null; businessName: string | null };
  feedback?: { id: string };
  consumptionReview?: { id: string };
}

// Consumption Review
interface ConsumptionReview {
  id: string;
  rating: number;
  text: string | null;
  dimensions: any | null;
  dealerReply?: string | null;
  dealerRepliedAt?: string | null;
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

function CustomerFeedbacksContent() {
  const tc = useCustomerT();
  const searchParams = useSearchParams();
  const [qrFeedbacks, setQRFeedbacks] = useState<QRFeedback[]>([]);
  const [consumptionReviews, setConsumptionReviews] = useState<ConsumptionReview[]>([]);
  const [remedyOffers, setRemedyOffers] = useState<RemedyOfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('consumption');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const q = searchParams?.get('search') ?? '';
    setSearchQuery(q);
  }, [searchParams]);

  useEffect(() => {
    fetchAllFeedbacks();
  }, []);

  const fetchAllFeedbacks = async () => {
    try {
      setLoading(true);

      const [qrRes, reviewRes, remedyRes] = await Promise.all([
        fetch('/api/feedbacks'),
        fetch('/api/customer/reviews'),
        fetch('/api/customer/remedy'),
      ]);

      const qrData = await qrRes.json();
      const reviewData = await reviewRes.json();
      const remedyData = await remedyRes.json();

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

      if (remedyData.offers && Array.isArray(remedyData.offers)) {
        setRemedyOffers(remedyData.offers);
      }
    } catch (error) {
      toast.error(tc('customerFeedbacks.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const { offerByFeedbackId, offerByReviewId } = useMemo(() => {
    const byFeedback: Record<string, RemedyOfferItem> = {};
    const byReview: Record<string, RemedyOfferItem> = {};
    (remedyOffers || []).forEach((o) => {
      const fid = o.feedback?.id;
      const rid = o.consumptionReview?.id;
      if (fid) byFeedback[fid] = o;
      if (rid) byReview[rid] = o;
    });
    return { offerByFeedbackId: byFeedback, offerByReviewId: byReview };
  }, [remedyOffers]);

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

  const filteredQRFeedbacks = useMemo(() => {
    if (!searchQuery.trim()) return qrFeedbacks;
    const q = searchQuery.toLowerCase();
    return qrFeedbacks.filter(f =>
      f.text?.toLowerCase().includes(q) ||
      f.qrCode?.name?.toLowerCase().includes(q) ||
      f.qrCode?.businessName?.toLowerCase().includes(q)
    );
  }, [qrFeedbacks, searchQuery]);

  const filteredConsumptionReviews = useMemo(() => {
    if (!searchQuery.trim()) return consumptionReviews;
    const q = searchQuery.toLowerCase();
    return consumptionReviews.filter(r =>
      r.text?.toLowerCase().includes(q) ||
      r.consumption?.dealer?.businessName?.toLowerCase().includes(q) ||
      r.consumption?.dealer?.name?.toLowerCase().includes(q) ||
      r.consumption?.product?.name?.toLowerCase().includes(q)
    );
  }, [consumptionReviews, searchQuery]);

  const totalFeedbacks = filteredQRFeedbacks.length + filteredConsumptionReviews.length;
  const allRatings = [
    ...filteredQRFeedbacks.map(f => f.rating),
    ...filteredConsumptionReviews.map(r => r.rating),
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
      <DashboardPageHeading
        title={tc('customerFeedbacks.title')}
        description={tc('customerFeedbacks.description')}
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{tc('customerFeedbacks.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {tc('customerFeedbacks.description')}
        </p>
      </div>

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
                <p className="text-xs text-muted-foreground">{tc('customerFeedbacks.total')}</p>
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
                <p className="text-xs text-muted-foreground">{tc('customerFeedbacks.avgRating')}</p>
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
                <p className="text-xs text-muted-foreground">{tc('customerFeedbacks.earnedPoints')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Telafi tekliflerim — geri bildirimler sayfası içinde özet */}
      <Card glass className="border-amber-500/20">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-amber-500/15 p-2">
                <Gift className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="font-semibold text-sm sm:text-base">{tc('customerFeedbacks.remedyTitle')}</h2>
                <p className="text-xs text-muted-foreground">
                  {tc('customerFeedbacks.remedyDesc')}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/customer/remedy">
                {tc('customerFeedbacks.seeAll')}
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
          {remedyOffers.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {tc('customerFeedbacks.noRemedy')}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {remedyOffers.slice(0, 8).map((o) => {
                const biz =
                  o.dealer?.businessName || o.dealer?.name || 'İşletme';
                const label =
                  o.status === 'accepted'
                    ? 'Kabul edildi'
                    : o.status === 'pending'
                      ? 'Bekliyor'
                      : o.status;
                return (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span className="font-medium truncate">{biz}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className={
                          o.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : ''
                        }
                      >
                        {label}
                      </Badge>
                      <Link
                        href={`/customer/remedy/${o.id}`}
                        className="text-primary text-xs font-medium inline-flex items-center gap-0.5 hover:underline"
                      >
                        {tc('customerFeedbacks.open')}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {remedyOffers.length > 8 && (
            <p className="mt-2 text-xs text-muted-foreground text-center">
              +{remedyOffers.length - 8} {tc('customerFeedbacks.moreOffers')} —{' '}
              <Link href="/customer/remedy" className="text-primary font-medium hover:underline">
                {tc('customerFeedbacks.remedyTitle')}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 h-auto min-h-12 gap-1 p-1">
          <TabsTrigger value="consumption" className="gap-1.5 py-3 px-2 text-left justify-start items-start sm:items-center sm:justify-center text-[11px] sm:text-sm leading-tight touch-manipulation">
            <Coffee className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <span className="sm:hidden">Tüketim ({filteredConsumptionReviews.length})</span>
              <span className="hidden sm:inline">Tüketim Yorumları ({filteredConsumptionReviews.length})</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="qr" className="gap-1.5 py-3 px-2 text-left justify-start items-start sm:items-center sm:justify-center text-[11px] sm:text-sm leading-tight touch-manipulation">
            <MessageSquare className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <span className="sm:hidden">QR ({filteredQRFeedbacks.length})</span>
              <span className="hidden sm:inline">QR Geri Bildirimleri ({filteredQRFeedbacks.length})</span>
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Consumption Reviews Tab */}
        <TabsContent value="consumption" className="space-y-4 mt-4">
          {filteredConsumptionReviews.length === 0 ? (
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
            filteredConsumptionReviews.map((review, index) => (
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

                      {/* Dealer Reply */}
                      {review.dealerReply && (
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-2">
                          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                            <Store className="h-3 w-3" /> İşletme Yanıtı
                          </p>
                          <p className="text-sm">{review.dealerReply}</p>
                        </div>
                      )}

                      {/* Telafi teklifi (remedy) – bu yoruma bağlı teklif varsa göster */}
                      {offerByReviewId[review.id] && (
                        <div className="pt-2 border-t border-border/50">
                          <Link
                            href={`/customer/remedy/${offerByReviewId[review.id].id}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            <Gift className="h-4 w-4" />
                            {offerByReviewId[review.id].status === 'accepted'
                              ? 'Telafi teklifini kabul ettiniz'
                              : 'Telafi teklifi var – tür ve miktar seçin'}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatRelativeTime(review.createdAt)}
                        </div>
                        <div className="flex items-center gap-1">
                          {review.dealerReply && (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] mr-1">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Yanıtlandı
                            </Badge>
                          )}
                          {review.consumption.amount && (
                            <Badge variant="outline">
                              {formatCurrency(review.consumption.amount)}
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

        {/* QR Feedbacks Tab */}
        <TabsContent value="qr" className="space-y-4 mt-4">
          {filteredQRFeedbacks.length === 0 ? (
            <Card glass>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Henüz QR geri bildirimi göndermediniz</p>
                <p className="text-sm text-muted-foreground mt-2 mb-4">
                  QR kod tarayarak ilk geri bildiriminizi gönderin!
                </p>
                <Button asChild variant="outline" className="gap-2">
                  <Link href="/customer/scan">
                    QR Tara
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredQRFeedbacks.map((feedback, index) => (
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

                      {/* Telafi teklifi (remedy) – bu QR geri bildirime bağlı teklif varsa göster */}
                      {offerByFeedbackId[feedback.id] && (
                        <div className="pt-2 border-t border-border/50">
                          <Link
                            href={`/customer/remedy/${offerByFeedbackId[feedback.id].id}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            <Gift className="h-4 w-4" />
                            {offerByFeedbackId[feedback.id].status === 'accepted'
                              ? 'Telafi teklifini kabul ettiniz'
                              : 'Telafi teklifi var – tür ve miktar seçin'}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatRelativeTime(feedback.createdAt)}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" asChild>
                            <Link href={`/customer/feedbacks/${feedback.id}/journey`}>
                              <Footprints className="h-3.5 w-3.5" />
                              Yolculuk
                            </Link>
                          </Button>
                          {feedback.dealerReply && (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Yanıtlandı
                            </Badge>
                          )}
                          {feedback.sentiment && (
                            <Badge className={getSentimentColor(feedback.sentiment || 'neutral')}>
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

export default function CustomerFeedbacksPage() {
  return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-[200px] text-muted-foreground">Loading...</div>}>
      <CustomerFeedbacksContent />
    </Suspense>
  );
}
