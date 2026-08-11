'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  MessageSquare,
  Search,
  Star,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Calendar,
  X,
  QrCode,
  Reply,
  Send,
  Bot,
  Loader2,
  CheckCircle2,
  Download,
  Clock,
  Sparkles,
  Frown,
  Smile,
  Tag,
  Coffee,
  CreditCard,
  User,
  ScanLine,
  Plus,
  ChevronLeft,
  ChevronRight,
  Gift,
  AlertCircle,
} from 'lucide-react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/admin-toast';
import {
  exportToCSV,
  exportToPDF,
  feedbackCSVColumns,
  buildFeedbackListPDFContent,
  buildAnalyticsPDFContent,
  type FeedbackExportRow,
} from '@/lib/export-utils';
import { formatRelativeTime, getInitials, formatCurrency } from '@/lib/utils';
import { useAppLocale, useAppT } from '@/lib/app-locale';

// QR Based Feedback
interface QRFeedback {
  id: string;
  rating: number;
  text: string | null;
  sentiment: string | null;
  emotions: string[];
  topics: string[];
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  qrCode: {
    id: string;
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
  customer: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  dealerReply?: string | null;
  dealerRepliedAt?: string | null;
  consumption: {
    id: string;
    amount: number | null;
    createdAt: string;
    product: {
      id: string;
      name: string;
      category: {
        name: string;
        icon: string;
      } | null;
    } | null;
    card: {
      id: string;
      token: string;
    };
  };
}

// Animated Counter
const AnimatedNumber = ({ value }: { value: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const stepValue = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += stepValue;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{count}</span>;
};

const FEEDBACK_PAGE_SIZE = 20;

function DealerFeedbacksContent() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const searchParams = useSearchParams();
  const [qrFeedbacks, setQRFeedbacks] = useState<QRFeedback[]>([]);
  const [consumptionReviews, setConsumptionReviews] = useState<ConsumptionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [needsReview, setNeedsReview] = useState(false); // P2-27: intentScore < 0.7 manuel inceleme
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [feedbackTotalPages, setFeedbackTotalPages] = useState(1);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('consumption');
  const [reviewStats, setReviewStats] = useState({
    totalReviews: 0,
    avgRating: '0',
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });

  // Reply state
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyFeedbackId, setReplyFeedbackId] = useState<string | null>(null);
  const [replyType, setReplyType] = useState<'feedback' | 'review'>('feedback');
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiSugLoading, setAiSugLoading] = useState(false);
  const [remedyModalOpen, setRemedyModalOpen] = useState(false);
  const [remedyModalFeedbackId, setRemedyModalFeedbackId] = useState<string | null>(null);
  const [remedyModalReviewId, setRemedyModalReviewId] = useState<string | null>(null);
  const [remedyModalMessage, setRemedyModalMessage] = useState(t('dealerFeedbacks.remedyDefaultMessage'));
  const [remedyModalSending, setRemedyModalSending] = useState(false);
  const [remedyQueueFirst, setRemedyQueueFirst] = useState(false);

  const openRemedyModal = (feedbackId: string) => {
    setRemedyModalFeedbackId(feedbackId);
    setRemedyModalReviewId(null);
    setRemedyQueueFirst(false);
    setRemedyModalMessage(t('dealerFeedbacks.remedyDefaultMessage'));
    setRemedyModalOpen(true);
    void fetch(`/api/dealer/feedbacks/${feedbackId}/viewed`, { method: 'PATCH' });
  };

  const openRemedyModalConsumption = (reviewId: string) => {
    setRemedyModalFeedbackId(null);
    setRemedyModalReviewId(reviewId);
    setRemedyQueueFirst(false);
    setRemedyModalMessage(t('dealerFeedbacks.remedyDefaultMessage'));
    setRemedyModalOpen(true);
  };

  const sendRemedy = async () => {
    const feedbackId = remedyModalFeedbackId;
    const reviewId = remedyModalReviewId;
    if (!feedbackId && !reviewId) return;
    setRemedyModalSending(true);
    try {
      const url = feedbackId
        ? `/api/dealer/feedbacks/${feedbackId}/remedy`
        : `/api/dealer/consumption-reviews/${reviewId}/remedy`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: remedyModalMessage.trim() || undefined,
          sendNotification: !remedyQueueFirst,
          queueForApproval: remedyQueueFirst,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.queuedForApproval) {
          toast.success(t('dealerFeedbacks.remedyQueued'));
        } else {
          toast.success(
            data.notificationSent
              ? t('dealerFeedbacks.remedySentToCustomer')
              : t('dealerFeedbacks.remedyTriggered')
          );
        }
        setRemedyModalOpen(false);
        setRemedyModalFeedbackId(null);
        setRemedyModalReviewId(null);
        setRemedyQueueFirst(false);
        if (reviewId) fetchAllFeedbacks();
      } else {
        toast.error(data.error || t('dealerFeedbacks.remedySendError'));
      }
    } catch {
      toast.error(t('dealerFeedbacks.connectionError'));
    } finally {
      setRemedyModalSending(false);
    }
  };

  const openReplyDialog = (feedbackId: string, type: 'feedback' | 'review' = 'feedback') => {
    setReplyFeedbackId(feedbackId);
    setReplyType(type);
    setReplyText('');
    setAiSuggestions([]);
    setReplyDialogOpen(true);
    if (type === 'feedback') {
      void fetch(`/api/dealer/feedbacks/${feedbackId}/viewed`, { method: 'PATCH' });
    }
  };

  const sendReply = async () => {
    if (!replyFeedbackId || !replyText.trim()) return;
    setReplySending(true);
    try {
      const res = await fetch(`/api/dealer/feedbacks/${replyFeedbackId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim(), type: replyType }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('dealerFeedbacks.replySent'));
        setReplyDialogOpen(false);
        fetchAllFeedbacks();
      } else {
        toast.error(data.error || t('dealerFeedbacks.replySendError'));
      }
    } catch {
      toast.error(t('dealerFeedbacks.connectionError'));
    } finally {
      setReplySending(false);
    }
  };

  const getAISuggestions = async () => {
    if (!replyFeedbackId) return;
    setAiSugLoading(true);
    try {
      const res = await fetch(`/api/dealer/feedbacks/${replyFeedbackId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', type: replyType }),
      });
      const data = await res.json();
      if (data.success && data.suggestions) {
        setAiSuggestions(data.suggestions);
      }
    } catch {
      toast.error(t('dealerFeedbacks.aiSuggestionsError'));
    } finally {
      setAiSugLoading(false);
    }
  };

  useEffect(() => {
    const q = searchParams?.get('search') ?? '';
    setSearchQuery(q);
  }, [searchParams]);

  useEffect(() => {
    fetchAllFeedbacks();
  }, [ratingFilter, needsReview, feedbackPage]);

  const fetchAllFeedbacks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (ratingFilter !== 'all') params.append('rating', ratingFilter);
      if (needsReview) params.append('needsReview', 'true');
      params.set('page', String(feedbackPage));
      params.set('pageSize', String(FEEDBACK_PAGE_SIZE));
      const [qrRes, reviewRes] = await Promise.all([
        fetch(`/api/feedbacks?${params}`),
        fetch(`/api/dealer/reviews?${params}`),
      ]);
      const qrData = await qrRes.json();
      const reviewData = await reviewRes.json();
      if (qrData.success) {
        setQRFeedbacks(qrData.data || []);
        setFeedbackTotalPages(qrData.totalPages ?? 1);
        setFeedbackTotal(qrData.total ?? 0);
      }
      if (reviewData.success) {
        setConsumptionReviews(reviewData.reviews || []);
        setReviewStats(reviewData.stats);
      }
    } catch (error) {
      toast.error(t('dealerFeedbacks.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const filteredQRFeedbacks = qrFeedbacks.filter((feedback) => {
    const matchesSearch =
      feedback.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.qrCode.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feedback.user?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const filteredReviews = consumptionReviews.filter((review) => {
    const matchesSearch =
      review.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.consumption.product?.name.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const totalFeedbacks = qrFeedbacks.length + consumptionReviews.length;
  const allRatings = [
    ...qrFeedbacks.map(f => f.rating),
    ...consumptionReviews.map(r => r.rating),
  ];
  const avgRating = allRatings.length > 0
    ? (allRatings.reduce((acc, r) => acc + r, 0) / allRatings.length).toFixed(1)
    : '0';

  const positiveCount = qrFeedbacks.filter(f => f.sentiment === 'positive').length +
    consumptionReviews.filter(r => r.rating >= 4).length;
  const negativeCount = qrFeedbacks.filter(f => f.sentiment === 'negative').length +
    consumptionReviews.filter(r => r.rating <= 2).length;

  const renderStars = (rating: number, size: 'sm' | 'lg' = 'sm') => {
    const sizeClass = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClass} ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'
              }`}
          />
        ))}
      </div>
    );
  };

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return <Smile className="h-4 w-4 text-emerald-500" />;
      case 'negative':
        return <Frown className="h-4 w-4 text-red-500" />;
      default:
        return <Meh className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-6 pb-8">
        <DashboardPageHero
          eyebrow={t('dealerFeedbacks.eyebrow')}
          title={t('dealerFeedbacks.title')}
          description={t('dealerFeedbacks.description')}
          icon={<MessageSquare className="h-7 w-7" aria-hidden />}
          tone="auto"
          actions={
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="flex items-baseline justify-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-2 sm:justify-start">
                <span className="text-2xl font-bold tabular-nums">{totalFeedbacks}</span>
                <span className="text-sm text-muted-foreground">{t('dealerFeedbacks.total')}</span>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                  <Button variant="secondary" size="sm" onClick={() => {
                    const allData: FeedbackExportRow[] = [
                      ...qrFeedbacks.map(f => ({
                        createdAt: new Date(f.createdAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US'),
                        userName: f.user?.name || t('common.anonymous'),
                        rating: f.rating,
                        text: f.text || '',
                        sentiment: f.sentiment === 'positive' ? t('dealerFeedbacks.positive') : f.sentiment === 'negative' ? t('dealerFeedbacks.negative') : t('dealerFeedbacks.neutral'),
                        qrName: f.qrCode.name,
                        dealerReply: (f as { dealerReply?: string }).dealerReply || '',
                      })),
                      ...consumptionReviews.map(r => ({
                        createdAt: new Date(r.createdAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US'),
                        userName: r.customer?.name || t('common.anonymous'),
                        rating: r.rating,
                        text: r.text || '',
                        sentiment: r.rating >= 4 ? t('dealerFeedbacks.positive') : r.rating <= 2 ? t('dealerFeedbacks.negative') : t('dealerFeedbacks.neutral'),
                        qrName: r.consumption?.product?.name || t('dealerFeedbacks.product'),
                        dealerReply: (r as { dealerReply?: string }).dealerReply || '',
                      })),
                    ];
                    exportToCSV(allData, 'geri_bildirimler', feedbackCSVColumns);
                    toast.success(t('dealerFeedbacks.csvDownloaded'));
                  }}>
                    <Download className="w-4 h-4 mr-2" />
                    Excel (CSV)
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => {
                    const allData: FeedbackExportRow[] = [
                      ...qrFeedbacks.map(f => ({
                        createdAt: new Date(f.createdAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US'),
                        userName: f.user?.name || t('common.anonymous'),
                        rating: f.rating,
                        text: f.text || '',
                        sentiment: f.sentiment === 'positive' ? t('dealerFeedbacks.positive') : f.sentiment === 'negative' ? t('dealerFeedbacks.negative') : t('dealerFeedbacks.neutral'),
                        qrName: f.qrCode.name,
                        dealerReply: (f as { dealerReply?: string }).dealerReply || '',
                      })),
                      ...consumptionReviews.map(r => ({
                        createdAt: new Date(r.createdAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US'),
                        userName: r.customer?.name || t('common.anonymous'),
                        rating: r.rating,
                        text: r.text || '',
                        sentiment: r.rating >= 4 ? t('dealerFeedbacks.positive') : r.rating <= 2 ? t('dealerFeedbacks.negative') : t('dealerFeedbacks.neutral'),
                        qrName: r.consumption?.product?.name || t('dealerFeedbacks.product'),
                        dealerReply: (r as { dealerReply?: string }).dealerReply || '',
                      })),
                    ];
                    const tableContent = buildFeedbackListPDFContent(allData);
                    const summaryContent = buildAnalyticsPDFContent({
                      totalFeedbacks,
                      avgRating: String(avgRating),
                      sentimentBreakdown: { positive: positiveCount, neutral: totalFeedbacks - positiveCount - negativeCount, negative: negativeCount },
                    });
                    exportToPDF('Geri Bildirimler Raporu', summaryContent + tableContent, 'geri-bildirimler-raporu');
                    toast.success(t('dealerFeedbacks.pdfDownloaded'));
                  }}>
                    <Download className="w-4 h-4 mr-2" />
                    PDF indir
                  </Button>
              </div>
            </div>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Toplam', value: totalFeedbacks, icon: MessageSquare, iconBox: 'bg-primary/10', iconColor: 'text-primary' },
            { label: t('dealerFeedbacks.avgScoreShort'), value: avgRating, icon: Star, iconBox: 'bg-yellow-500/10', iconColor: 'text-yellow-500', suffix: '/5' },
            { label: t('dealerFeedbacks.positive'), value: positiveCount, icon: ThumbsUp, iconBox: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
            { label: t('dealerFeedbacks.negative'), value: negativeCount, icon: ThumbsDown, iconBox: 'bg-red-500/10', iconColor: 'text-red-500' },
          ].map((stat, index) => (
            <m.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="relative overflow-hidden border-border/60 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-xl p-2.5 ${stat.iconBox}`}>
                      <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {typeof stat.value === 'number' ? <AnimatedNumber value={stat.value} /> : stat.value}
                        {stat.suffix && <span className="text-sm text-muted-foreground">{stat.suffix}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('dealerFeedbacks.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background/50"
                />
              </div>
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-[140px] border-border/70 bg-background/80 text-foreground dark:bg-white/15 dark:border-white/30 dark:text-white">
                  <Star className="h-4 w-4 mr-2 text-yellow-500" />
                  <SelectValue placeholder={t('dealerFeedbacks.rating')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('dealerFeedbacks.allRatings')}</SelectItem>
                  <SelectItem value="5">⭐ 5 {t('dealerFeedbacks.stars')}</SelectItem>
                  <SelectItem value="4">⭐ 4 {t('dealerFeedbacks.stars')}</SelectItem>
                  <SelectItem value="3">⭐ 3 {t('dealerFeedbacks.stars')}</SelectItem>
                  <SelectItem value="2">⭐ 2 {t('dealerFeedbacks.stars')}</SelectItem>
                  <SelectItem value="1">⭐ 1 {t('dealerFeedbacks.stars')}</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dealerNeedsReview"
                  checked={needsReview}
                  onCheckedChange={(c) => { setNeedsReview(!!c); setFeedbackPage(1); }}
                />
                <label htmlFor="dealerNeedsReview" className="text-sm font-medium cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  {t('dealerFeedbacks.manualReview')}
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="consumption" className="gap-2">
              <Coffee className="h-4 w-4" />
              {t('dealerFeedbacks.consumptionReviews')} ({consumptionReviews.length})
            </TabsTrigger>
            <TabsTrigger value="qr" className="gap-2">
              <QrCode className="h-4 w-4" />
              {t('dealerFeedbacks.qrFeedbacks')} ({qrFeedbacks.length})
            </TabsTrigger>
          </TabsList>

          {/* Consumption Reviews Tab */}
          <TabsContent value="consumption" className="space-y-3 mt-4">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-5">
                    <div className="animate-pulse flex gap-4">
                      <div className="h-12 w-12 bg-muted rounded-full" />
                      <div className="flex-1 space-y-3">
                        <div className="h-4 bg-muted rounded w-1/4" />
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredReviews.length === 0 ? (
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <Coffee className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">{t('dealerFeedbacks.noConsumptionReviewTitle')}</h3>
                  <p className="text-muted-foreground mb-4">{t('dealerFeedbacks.noConsumptionReviewDescription')}</p>
                  <Button asChild variant="outline" className="gap-2">
                    <Link href="/dealer/scan">
                      <ScanLine className="h-4 w-4" />
                      {t('dealerFeedbacks.scanCard')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <AnimatePresence>
                {filteredReviews.map((review, index) => (
                  <m.div
                    key={review.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 10) * 0.03 }}
                  >
                    <Card className="border-border/60 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          {/* Avatar */}
                          <Avatar className="h-12 w-12 border-2 border-background">
                            <AvatarImage src={review.customer?.image || ''} />
                            <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                              {getInitials(review.customer?.name || t('dealerFeedbacks.customer'))}
                            </AvatarFallback>
                          </Avatar>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{review.customer?.name || t('dealerFeedbacks.customer')}</span>
                                {review.consumption.product && (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    {review.consumption.product.category?.icon} {review.consumption.product.name}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {renderStars(review.rating)}
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground mb-3">
                              {review.text || t('dealerFeedbacks.noReviewText')}
                            </p>

                            {/* Dimensions */}
                            {review.dimensions && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {Object.entries(review.dimensions).map(([key, value]) => (
                                  <Badge key={key} variant="secondary" className="text-xs">
                                    {key === 'taste' ? t('dealerFeedbacks.dimensionTaste') :
                                      key === 'service' ? t('dealerFeedbacks.dimensionService') :
                                        key === 'ambiance' ? t('dealerFeedbacks.dimensionAmbiance') :
                                          key === 'value' ? t('dealerFeedbacks.dimensionValue') : key}: {value as number}/5
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {/* Dealer Reply */}
                            {review.dealerReply && (
                              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                                <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> {t('dealerFeedbacks.businessReply')}
                                </p>
                                <p className="text-sm">{review.dealerReply}</p>
                              </div>
                            )}

                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs gap-1">
                                  <CreditCard className="h-3 w-3" />
                                  •••{review.consumption.card.token.slice(-4)}
                                </Badge>
                                {review.consumption.amount && (
                                  <Badge variant="secondary" className="text-xs">
                                    {formatCurrency(review.consumption.amount)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatRelativeTime(review.createdAt)}
                                </span>
                                {review.dealerReply ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> {t('dealerFeedbacks.replied')}
                                  </Badge>
                                ) : (
                                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openReplyDialog(review.id, 'review'); }}>
                                    <Reply className="h-3 w-3 mr-1" /> {t('dealerFeedbacks.reply')}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                                  onClick={(e) => { e.stopPropagation(); openRemedyModalConsumption(review.id); }}
                                >
                                  <Gift className="h-3 w-3 mr-1" />
                                  {t('dealerFeedbacks.sendRemedy')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </m.div>
                ))}
              </AnimatePresence>
            )}
          </TabsContent>

          {/* QR Feedbacks Tab */}
          <TabsContent value="qr" className="space-y-3 mt-4">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="border-border/60 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-5">
                    <div className="animate-pulse flex gap-4">
                      <div className="h-12 w-12 bg-muted rounded-full" />
                      <div className="flex-1 space-y-3">
                        <div className="h-4 bg-muted rounded w-1/4" />
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredQRFeedbacks.length === 0 ? (
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-12 text-center">
                  <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <h3 className="text-lg font-semibold mb-2">{t('dealerFeedbacks.noQrFeedbackTitle')}</h3>
                  <p className="text-muted-foreground mb-4">{t('dealerFeedbacks.noQrFeedbackDescription')}</p>
                  <Button asChild variant="outline" className="gap-2">
                    <Link href="/dealer/qr-codes">
                      <Plus className="h-4 w-4" />
                      {t('dealerFeedbacks.qrCodes')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <AnimatePresence>
                {filteredQRFeedbacks.map((feedback, index) => (
                  <m.div
                    key={feedback.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 10) * 0.03 }}
                  >
                    <Card className="border-border/60 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          {/* Avatar */}
                          <Avatar className="h-12 w-12 border-2 border-background">
                            <AvatarImage src={feedback.user?.image || ''} />
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {getInitials(feedback.user?.name || t('common.anonymous'))}
                            </AvatarFallback>
                          </Avatar>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{feedback.user?.name || t('common.anonymous')}</span>
                                <Badge variant="outline" className="text-xs gap-1">
                                  <QrCode className="h-3 w-3" />
                                  {feedback.qrCode.name}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                {renderStars(feedback.rating)}
                                {getSentimentIcon(feedback.sentiment)}
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground mb-3">
                              {feedback.text || t('dealerFeedbacks.noComment')}
                            </p>

                            {/* Dealer Reply */}
                            {feedback.dealerReply && (
                              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-3">
                                <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> {t('dealerFeedbacks.businessReply')}
                                </p>
                                <p className="text-sm">{feedback.dealerReply}</p>
                              </div>
                            )}

                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {feedback.topics.slice(0, 3).map((topic) => (
                                  <Badge key={topic} variant="secondary" className="text-xs gap-1">
                                    <Tag className="h-3 w-3" />
                                    {topic}
                                  </Badge>
                                ))}
                                {feedback.topics.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{feedback.topics.length - 3}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatRelativeTime(feedback.createdAt)}
                                </span>
                                {feedback.dealerReply ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> {t('dealerFeedbacks.replied')}
                                  </Badge>
                                ) : (
                                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openReplyDialog(feedback.id); }}>
                                    <Reply className="h-3 w-3 mr-1" /> {t('dealerFeedbacks.reply')}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-7 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                                  onClick={(e) => { e.stopPropagation(); openRemedyModal(feedback.id); }}
                                >
                                  <Gift className="h-3 w-3 mr-1" />
                                  {t('dealerFeedbacks.sendRemedy')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </m.div>
                ))}
              </AnimatePresence>
            )}
            {activeTab === 'qr' && feedbackTotalPages > 1 && !loading && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFeedbackPage((p) => Math.max(1, p - 1))}
                  disabled={feedbackPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('dealerFeedbacks.previous')}
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {t('dealerFeedbacks.page')} {feedbackPage} / {feedbackTotalPages} ({feedbackTotal} {t('dealerFeedbacks.totalLower')})
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFeedbackPage((p) => Math.min(feedbackTotalPages, p + 1))}
                  disabled={feedbackPage >= feedbackTotalPages}
                >
                  {t('dealerFeedbacks.next')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
        {/* Reply Dialog */}
        <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            <div className="grid grid-cols-1 md:grid-cols-3">
              {/* Left Side: Feedback Info & Reply Textarea */}
              <div className="md:col-span-2 p-6 flex flex-col h-full border-r">
                <DialogHeader className="mb-6">
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Reply className="h-5 w-5 text-primary" />
                    </div>
                    {replyType === 'review' ? t('dealerFeedbacks.replyToConsumptionReview') : t('dealerFeedbacks.replyToFeedback')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('dealerFeedbacks.replyDialogDescription')}
                  </DialogDescription>
                </DialogHeader>

                {/* Get exact feedback info if needed, but for now we just show text area */}
                <div className="flex-1">
                  <label className="text-sm font-semibold mb-2 block">{t('dealerFeedbacks.yourReply')}</label>
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('dealerFeedbacks.replyPlaceholder')}
                    className="min-h-[250px] resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 text-right">{replyText.length}/2000</p>
                </div>

                <DialogFooter className="mt-6 pt-4 border-t">
                  <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={sendReply} disabled={replySending || !replyText.trim()} className="gap-2">
                    {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t('dealerFeedbacks.sendReply')}
                  </Button>
                </DialogFooter>
              </div>

              {/* Right Side: AI Sidebar */}
              <div className="p-6 bg-muted/20 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Bot className="h-5 w-5" />
                    {t('dealerFeedbacks.smartSuggestions')}
                  </h3>
                  <Button variant="outline" size="icon" onClick={getAISuggestions} disabled={aiSugLoading} className="h-8 w-8">
                    {aiSugLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>

                {aiSugLoading ? (
                  <InlineLoadingStatus className="py-12" spinnerClassName="text-primary" description={t('dealerFeedbacks.aiAnalyzing')} />
                ) : aiSuggestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center opacity-70">
                    <Bot className="h-12 w-12 text-muted-foreground stroke-1" />
                    <div>
                      <p className="text-sm font-medium">{t('dealerFeedbacks.noSuggestionTitle')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('dealerFeedbacks.noSuggestionDescription')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="scrollbar-thin scrollbar-thumb-primary/20 max-h-[400px] space-y-3 overflow-y-auto pr-2">
                    {aiSuggestions.map((sug, i) => (
                      <button key={i} onClick={() => setReplyText(sug)}
                        className="group w-full rounded-xl border border-border/60 bg-background/50 p-3.5 text-left text-sm shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5"
                      >
                        <span className="block mb-2 text-foreground leading-relaxed">{sug}</span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          <CheckCircle2 className="h-3 w-3" /> {t('dealerFeedbacks.copyToTextbox')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Telafi teklifi modal: müşteriye gidecek mesaj, müşteri tür/miktar seçecek */}
        <Dialog open={remedyModalOpen} onOpenChange={setRemedyModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-amber-500" />
                {t('dealerFeedbacks.sendRemedyTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('dealerFeedbacks.sendRemedyDescription')}
              </DialogDescription>
            </DialogHeader>
            <div>
              <label className="text-sm font-medium mb-2 block">{t('dealerFeedbacks.messageToCustomerOptional')}</label>
              <Textarea
                value={remedyModalMessage}
                onChange={(e) => setRemedyModalMessage(e.target.value)}
                placeholder={t('dealerFeedbacks.remedyMessagePlaceholder')}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex items-center gap-2 py-2">
              <Checkbox
                id="remedy-queue"
                checked={remedyQueueFirst}
                onCheckedChange={(v) => setRemedyQueueFirst(v === true)}
              />
              <label htmlFor="remedy-queue" className="text-sm text-muted-foreground cursor-pointer leading-snug">
                {t('dealerFeedbacks.queueFirstDescription')}
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemedyModalOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={sendRemedy} disabled={remedyModalSending}>
                {remedyModalSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Gift className="h-4 w-4 mr-2" />}
                {remedyQueueFirst ? t('dealerFeedbacks.queue') : t('dealerFeedbacks.send')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LazyMotion>
  );
}

export default function DealerFeedbacksPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[200px] text-muted-foreground">Loading...</div>}>
      <DealerFeedbacksContent />
    </Suspense>
  );
}
