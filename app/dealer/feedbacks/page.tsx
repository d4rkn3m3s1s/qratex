'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Clock,
  Sparkles,
  Frown,
  Smile,
  Tag,
  Coffee,
  CreditCard,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatRelativeTime, getInitials, formatCurrency } from '@/lib/utils';

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

export default function DealerFeedbacksPage() {
  const [qrFeedbacks, setQRFeedbacks] = useState<QRFeedback[]>([]);
  const [consumptionReviews, setConsumptionReviews] = useState<ConsumptionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('consumption');
  const [reviewStats, setReviewStats] = useState({
    totalReviews: 0,
    avgRating: '0',
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });

  useEffect(() => {
    fetchAllFeedbacks();
  }, [ratingFilter]);

  const fetchAllFeedbacks = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (ratingFilter !== 'all') params.append('rating', ratingFilter);
      
      // Fetch both types in parallel
      const [qrRes, reviewRes] = await Promise.all([
        fetch(`/api/feedbacks?${params}`),
        fetch(`/api/dealer/reviews?${params}`),
      ]);
      
      const qrData = await qrRes.json();
      const reviewData = await reviewRes.json();
      
      if (qrData.success) {
        setQRFeedbacks(qrData.data || []);
      }
      
      if (reviewData.success) {
        setConsumptionReviews(reviewData.reviews || []);
        setReviewStats(reviewData.stats);
      }
    } catch (error) {
      toast.error('Geri bildirimler yüklenemedi');
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
            className={`${sizeClass} ${
              star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'
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
    <div className="space-y-6 pb-8">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 md:p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-white/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <MessageSquare className="w-8 h-8" />
                Geri Bildirimler
              </h1>
              <p className="text-white/70 mt-1">Müşterilerinizden gelen tüm yorumlar ve değerlendirmeler</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-white">
                <span className="text-2xl font-bold">{totalFeedbacks}</span>
                <span className="text-white/70 text-sm ml-2">Toplam</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam', value: totalFeedbacks, icon: MessageSquare, color: 'violet', gradient: 'from-violet-500 to-purple-600' },
          { label: 'Ort. Puan', value: avgRating, icon: Star, color: 'yellow', gradient: 'from-yellow-500 to-orange-500', suffix: '/5' },
          { label: 'Olumlu', value: positiveCount, icon: ThumbsUp, color: 'emerald', gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Olumsuz', value: negativeCount, icon: ThumbsDown, color: 'red', gradient: 'from-red-500 to-rose-600' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="relative overflow-hidden border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-${stat.color}-500/10`}>
                    <stat.icon className={`h-5 w-5 text-${stat.color}-500`} />
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
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Yorum, ürün veya müşteri ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background/50"
              />
            </div>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-[140px] bg-background/50">
                <Star className="h-4 w-4 mr-2 text-yellow-500" />
                <SelectValue placeholder="Puan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Puanlar</SelectItem>
                <SelectItem value="5">⭐ 5 Yıldız</SelectItem>
                <SelectItem value="4">⭐ 4 Yıldız</SelectItem>
                <SelectItem value="3">⭐ 3 Yıldız</SelectItem>
                <SelectItem value="2">⭐ 2 Yıldız</SelectItem>
                <SelectItem value="1">⭐ 1 Yıldız</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="consumption" className="gap-2">
            <Coffee className="h-4 w-4" />
            Tüketim Yorumları ({consumptionReviews.length})
          </TabsTrigger>
          <TabsTrigger value="qr" className="gap-2">
            <QrCode className="h-4 w-4" />
            QR Geri Bildirimleri ({qrFeedbacks.length})
          </TabsTrigger>
        </TabsList>

        {/* Consumption Reviews Tab */}
        <TabsContent value="consumption" className="space-y-3 mt-4">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <Card key={i} className="border-0 bg-card/50 backdrop-blur-sm">
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
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <Coffee className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">Tüketim yorumu bulunamadı</h3>
                <p className="text-muted-foreground">Müşterilerinizden henüz tüketim yorumu almadınız</p>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence>
              {filteredReviews.map((review, index) => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card className="border-0 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <Avatar className="h-12 w-12 border-2 border-background">
                          <AvatarImage src={review.customer?.image || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                            {getInitials(review.customer?.name || 'Müşteri')}
                          </AvatarFallback>
                        </Avatar>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{review.customer?.name || 'Müşteri'}</span>
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
                            {review.text || 'Yorum metni yok'}
                          </p>

                          {/* Dimensions */}
                          {review.dimensions && (
                            <div className="flex flex-wrap gap-2 mb-3">
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
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(review.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        {/* QR Feedbacks Tab */}
        <TabsContent value="qr" className="space-y-3 mt-4">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <Card key={i} className="border-0 bg-card/50 backdrop-blur-sm">
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
            <Card className="border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">QR geri bildirimi bulunamadı</h3>
                <p className="text-muted-foreground">Arama kriterlerinize uygun geri bildirim yok</p>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence>
              {filteredQRFeedbacks.map((feedback, index) => (
                <motion.div
                  key={feedback.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card className="border-0 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <Avatar className="h-12 w-12 border-2 border-background">
                          <AvatarImage src={feedback.user?.image || ''} />
                          <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                            {getInitials(feedback.user?.name || 'Anonim')}
                          </AvatarFallback>
                        </Avatar>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{feedback.user?.name || 'Anonim'}</span>
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
                            {feedback.text || 'Yorum yapılmadı'}
                          </p>
                          
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
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(feedback.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
