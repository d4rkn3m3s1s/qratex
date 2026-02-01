'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Star,
  Store,
  Calendar,
  CreditCard,
  MessageSquare,
  Loader2,
  CheckCircle2,
  Sparkles,
  ThumbsUp,
  Utensils,
  Users,
  Palette,
  Coins,
  Sparkle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { formatDate, formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Consumption {
  id: string;
  amount: number | null;
  note: string | null;
  createdAt: string;
  dealer: {
    id: string;
    name: string;
    businessName: string | null;
    businessLogo: string | null;
    businessDesc: string | null;
    image: string | null;
  };
  product: {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    image: string | null;
    category: {
      id: string;
      name: string;
      icon: string;
    };
  } | null;
  card: {
    id: string;
    token: string;
  };
  review: {
    id: string;
    rating: number;
    text: string | null;
    dimensions: Record<string, number> | null;
    createdAt: string;
  } | null;
}

const ratingDimensions = [
  { key: 'taste', label: 'Lezzet', icon: Utensils },
  { key: 'service', label: 'Hizmet', icon: Users },
  { key: 'ambiance', label: 'Ortam', icon: Palette },
  { key: 'value', label: 'Fiyat/Performans', icon: Coins },
];

export default function ConsumptionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [consumption, setConsumption] = useState<Consumption | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Review form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchConsumption();
  }, [params.id]);

  const fetchConsumption = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/customer/consumptions/${params.id}`);
      const data = await res.json();

      if (data.success) {
        setConsumption(data.consumption);
        if (data.consumption.review) {
          setRating(data.consumption.review.rating);
          setReviewText(data.consumption.review.text || '');
          setDimensions(data.consumption.review.dimensions || {});
        }
      } else {
        toast.error(data.error);
        router.push('/customer/consumptions');
      }
    } catch (err) {
      toast.error('Tüketim bilgisi alınamadı');
      router.push('/customer/consumptions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (rating === 0) {
      toast.error('Lütfen bir puan verin');
      return;
    }

    setSubmitting(true);
    try {
      const method = consumption?.review ? 'PUT' : 'POST';
      const res = await fetch(`/api/customer/consumptions/${params.id}/review`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          text: reviewText || undefined,
          dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error);
        return;
      }

      setSubmitted(true);
      toast.success(data.message);
      
      if (data.rewards) {
        setTimeout(() => {
          toast.success(`+${data.rewards.points} puan kazandınız!`, {
            icon: '🎉',
          });
        }, 500);
      }

      // Refresh data
      fetchConsumption();
    } catch (err) {
      toast.error('Yorum kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!consumption) return null;

  const hasReview = !!consumption.review;

  return (
    <div className="space-y-6 pb-8">
      {/* Back button */}
      <Button variant="ghost" asChild className="gap-2">
        <Link href="/customer/consumptions">
          <ArrowLeft className="w-4 h-4" />
          Geri
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Consumption Details */}
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5" />
              Tüketim Detayı
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dealer info */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                {consumption.dealer.businessLogo ? (
                  <img 
                    src={consumption.dealer.businessLogo} 
                    alt={consumption.dealer.businessName || ''} 
                    className="w-full h-full rounded-xl object-cover"
                  />
                ) : (
                  <Store className="w-8 h-8 text-violet-500" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {consumption.dealer.businessName || consumption.dealer.name}
                </h3>
                {consumption.dealer.businessDesc && (
                  <p className="text-sm text-muted-foreground">
                    {consumption.dealer.businessDesc}
                  </p>
                )}
              </div>
            </div>

            {/* Product info */}
            {consumption.product && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Ürün</Label>
                <div className="p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{consumption.product.category.icon}</span>
                    <div>
                      <p className="font-medium">{consumption.product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {consumption.product.category.name}
                      </p>
                    </div>
                  </div>
                  {consumption.product.description && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {consumption.product.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/50">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">Tarih</span>
                </div>
                <p className="font-medium">{formatDate(consumption.createdAt)}</p>
              </div>
              {consumption.amount && (
                <div className="p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Coins className="w-4 h-4" />
                    <span className="text-xs">Tutar</span>
                  </div>
                  <p className="font-medium">{formatCurrency(consumption.amount)}</p>
                </div>
              )}
            </div>

            {consumption.note && (
              <div className="p-4 rounded-xl bg-muted/50">
                <Label className="text-muted-foreground text-xs">İşletme Notu</Label>
                <p className="text-sm mt-1">{consumption.note}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Section */}
        <Card className="border-0 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {hasReview ? 'Yorumunuz' : 'Yorum Yap'}
            </CardTitle>
            <CardDescription>
              {hasReview 
                ? 'Yorumunuzu güncelleyebilirsiniz' 
                : 'Deneyiminizi puanlayın ve yorum yazın'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Star Rating */}
            <div className="space-y-2">
              <Label>Genel Puan</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="focus:outline-none"
                  >
                    <Star
                      className={cn(
                        'w-10 h-10 transition-all',
                        (hoverRating || rating) >= star
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-muted-foreground'
                      )}
                    />
                  </motion.button>
                ))}
                <span className="ml-2 text-2xl font-bold">{rating || '-'}/5</span>
              </div>
            </div>

            <Separator />

            {/* Dimension Ratings */}
            <div className="space-y-4">
              <Label>Detaylı Puanlama (Opsiyonel)</Label>
              <div className="grid grid-cols-2 gap-3">
                {ratingDimensions.map((dim) => (
                  <div key={dim.key} className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <dim.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{dim.label}</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setDimensions(prev => ({ ...prev, [dim.key]: star }))}
                          className="focus:outline-none"
                        >
                          <Star
                            className={cn(
                              'w-5 h-5 transition-all',
                              (dimensions[dim.key] || 0) >= star
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-muted-foreground/30'
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Review Text */}
            <div className="space-y-2">
              <Label>Yorumunuz (Opsiyonel)</Label>
              <Textarea
                placeholder="Deneyiminizi paylaşın... (50+ karakter için bonus puan!)"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {reviewText.length}/2000 karakter
                {reviewText.length >= 50 && (
                  <span className="text-emerald-500 ml-2">
                    <Sparkle className="w-3 h-3 inline mr-1" />
                    Detaylı yorum bonusu!
                  </span>
                )}
              </p>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmitReview}
              disabled={rating === 0 || submitting}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 h-12"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Gönderiliyor...
                </>
              ) : hasReview ? (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Yorumu Güncelle
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Yorum Gönder & Puan Kazan
                </>
              )}
            </Button>

            {/* Reward info */}
            {!hasReview && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                <div className="flex items-center gap-2 text-amber-500 mb-2">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium">Kazanacağınız Ödüller</span>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Yorum için: <span className="text-amber-500 font-medium">+50 puan</span></li>
                  <li>• 50+ karakter yorum için: <span className="text-amber-500 font-medium">+100 puan</span></li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
