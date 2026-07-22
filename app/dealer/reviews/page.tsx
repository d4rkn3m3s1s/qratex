'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Star, MessageSquare, Clock, Tag, Gift } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/utils';
import Image from 'next/image';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface Review {
    id: string;
    rating: number;
    /** DB alanı `text` (Prisma ConsumptionReview) */
    text?: string | null;
    comment?: string;
    createdAt: string;
    customer: {
        name: string | null;
        email: string | null;
        image: string | null;
    };
    consumption: {
        amount: number;
        product: {
            name: string;
            category: {
                name: string;
            } | null;
        } | null;
    };
    dealerReply?: string | null;
    dealerRepliedAt?: string | null;
}

interface Stats {
    totalReviews: number;
    avgRating: string;
    ratingDistribution: Record<string, number>;
}

export default function DealerReviewsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const t = useAppT();
    const { locale } = useAppLocale();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterRating, setFilterRating] = useState<string>('all');
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [savingReplyForId, setSavingReplyForId] = useState<string | null>(null);
    const [aiReplies, setAiReplies] = useState<Record<string, string[]>>({});
    const reviewsFetchRef = useRef<AbortController | null>(null);

    const handleUseAiReply = async (reviewId: string, replyText: string) => {
        const trimmed = replyText.trim();
        if (!trimmed) return;
        try {
            setSavingReplyForId(reviewId);
            const res = await fetch(`/api/dealer/feedbacks/${reviewId}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ reply: trimmed, type: 'review' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                toast.error(typeof data.error === 'string' ? data.error : t('dealerReviews.toastReplySaveFailed'));
                return;
            }
            const review = data.review as { dealerReply?: string | null; dealerRepliedAt?: string | Date | null };
            setReviews((prev) =>
                prev.map((r) =>
                    r.id === reviewId
                        ? {
                              ...r,
                              dealerReply: review.dealerReply ?? trimmed,
                              dealerRepliedAt:
                                  review.dealerRepliedAt != null
                                      ? String(review.dealerRepliedAt)
                                      : new Date().toISOString(),
                          }
                        : r
                )
            );
            setAiReplies((prev) => {
                const next = { ...prev };
                delete next[reviewId];
                return next;
            });
            toast.success(t('dealerReviews.toastReplySaved'));
            router.refresh();
        } catch {
            toast.error(t('dealerReviews.toastReplySaveFailed'));
        } finally {
            setSavingReplyForId(null);
        }
    };

    const handleGenerateAiReply = async (reviewId: string) => {
        try {
            setGeneratingId(reviewId);
            const res = await fetch('/api/ai/generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ consumptionReviewId: reviewId }),
            });

            if (!res.ok) throw new Error('AI reply failed');

            const data = await res.json();
            setAiReplies(prev => ({ ...prev, [reviewId]: data.replies }));
            toast.success(t('dealerReviews.toastRepliesGenerated'));
        } catch (err) {
            toast.error(t('dealerReviews.toastReplyFailed'));
        } finally {
            setGeneratingId(null);
        }
    };

    useEffect(() => {
        async function fetchReviews() {
            if (!session?.user?.id) return;
            reviewsFetchRef.current?.abort();
            const ac = new AbortController();
            reviewsFetchRef.current = ac;
            try {
                setLoading(true);
                const res = await fetch(`/api/dealer/reviews?rating=${filterRating}`, {
                    credentials: 'same-origin',
                    signal: ac.signal,
                });
                const data = await res.json().catch(() => ({}));
                if (reviewsFetchRef.current !== ac) return;
                if (!res.ok || !data.success) {
                    toast.error(
                        typeof data.error === 'string' ? data.error : t('dealerReviews.loadError')
                    );
                    setReviews([]);
                    setStats(null);
                    return;
                }
                setReviews(data.reviews);
                setStats(data.stats);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                if (reviewsFetchRef.current !== ac) return;
                console.error('Failed to fetch reviews', err);
                toast.error(t('dealerReviews.loadError'));
                setReviews([]);
                setStats(null);
            } finally {
                if (reviewsFetchRef.current === ac) {
                    reviewsFetchRef.current = null;
                    setLoading(false);
                }
            }
        }
        void fetchReviews();
        return () => {
            reviewsFetchRef.current?.abort();
        };
    }, [session, filterRating, t]);

    return (
        <LazyMotion features={domAnimation} strict>
            <div className="space-y-6 pb-10">
                <m.header
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-border/60 bg-card/50 p-6 shadow-sm backdrop-blur-sm"
                >
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                            <MessageSquare className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-2xl font-bold tracking-tight text-balance">{t('dealerReviews.title')}</h1>
                            <p className="text-sm text-muted-foreground text-pretty leading-relaxed">{t('dealerReviews.description')}</p>
                        </div>
                        {/* Telafi merkezi köprüsü: yorumları telafi akışıyla aynı yerden yönet */}
                        <a
                            href="/dealer/remedy-queue"
                            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                            <Gift className="h-4 w-4" />
                            Telafi Merkezi →
                        </a>
                    </div>
                </m.header>

                <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
                    {/* Stats & Filters (Sidebar) */}
                    <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-20 lg:z-10">
                        <Card className="rounded-2xl border-border/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-lg">{t('dealerReviews.ratingSummaryTitle')}</CardTitle>
                                <CardDescription>{t('dealerReviews.ratingSummaryDescription')}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading && !stats ? (
                                    <div className="space-y-4 pt-2">
                                        <Skeleton className="h-20 w-20 rounded-full mx-auto" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-full" />
                                    </div>
                                ) : stats ? (
                                    <div className="flex flex-col gap-6 pt-2">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="text-5xl font-bold tracking-tighter text-amber-500 mb-2">{stats.avgRating}</div>
                                            <div className="flex items-center text-amber-500 gap-1 mb-1">
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <Star key={star} className={`w-4 h-4 ${star <= Math.round(Number(stats.avgRating)) ? 'fill-current' : 'opacity-30'}`} />
                                                ))}
                                            </div>
                                            <p className="text-sm text-muted-foreground">{t('dealerReviews.reviewCount').replace('{count}', String(stats.totalReviews))}</p>
                                        </div>

                                        <div className="space-y-2">
                                            {[5, 4, 3, 2, 1].map(stars => {
                                                const count = stats.ratingDistribution[stars.toString()] || 0;
                                                const percentage = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
                                                const isActive = filterRating === stars.toString();
                                                return (
                                                    <button
                                                        key={stars}
                                                        onClick={() => setFilterRating(isActive ? 'all' : stars.toString())}
                                                        className={`w-full flex items-center gap-3 p-1.5 rounded-lg transition-colors hover:bg-muted/50 ${isActive ? 'bg-primary/10 border border-primary/20' : 'border border-transparent'}`}
                                                    >
                                                        <div className="flex items-center gap-1 w-8 text-sm font-medium">
                                                            {stars} <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                                        </div>
                                                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${percentage}%` }} />
                                                        </div>
                                                        <div className="w-8 text-right text-xs text-muted-foreground">{count}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {filterRating !== 'all' && (
                                            <Button variant="outline" size="sm" onClick={() => setFilterRating('all')} className="w-full rounded-xl">
                                                {t('dealerReviews.clearFilter')}
                                            </Button>
                                        )}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Reviews List — masaüstünde sabit yükseklik + kaydırma; mobilde normal sayfa kaydırması */}
                    <div className="lg:col-span-8 min-h-0 space-y-4 lg:max-h-[min(72vh,calc(100vh-11rem))] lg:overflow-y-auto lg:overscroll-contain lg:rounded-2xl lg:border lg:border-border/40 lg:bg-muted/10 lg:p-3 xl:p-4 lg:[scrollbar-gutter:stable]">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <Card key={i} className="rounded-2xl border-border/50 shadow-sm">
                                    <CardContent className="p-5 flex gap-4">
                                        <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                                        <div className="space-y-2 flex-1">
                                            <Skeleton className="h-4 w-1/3" />
                                            <Skeleton className="h-3 w-1/4" />
                                            <Skeleton className="h-16 w-full mt-4" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        ) : reviews.length === 0 ? (
                            <Card className="rounded-2xl border-dashed bg-muted/30">
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                    <MessageSquare className="w-12 h-12 opacity-20 mb-4" />
                                    <p className="font-medium text-lg text-foreground">{t('dealerReviews.emptyTitle')}</p>
                                    <p className="text-sm mt-1">{t('dealerReviews.emptyDescription')}</p>
                                </CardContent>
                            </Card>
                        ) : (
                            reviews.map((review, i) => (
                                <m.div
                                    key={review.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden">
                                        <CardContent className="p-0">
                                            <div className="p-5 flex gap-4">
                                                {/* Avatar */}
                                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden text-primary font-bold">
                                                    {review.customer.image ? (
                                                        <Image src={review.customer.image} alt={review.customer.name || t('dealerReviews.customerAvatarAlt')} width={48} height={48} />
                                                    ) : (
                                                        review.customer.name ? review.customer.name.charAt(0).toUpperCase() : 'M'
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                                                        <div>
                                                            <h3 className="font-semibold text-base">{review.customer.name || t('dealerReviews.unnamedCustomer')}</h3>
                                                            <p className="text-xs text-muted-foreground">{review.customer.email}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex text-amber-500">
                                                                {[1, 2, 3, 4, 5].map(star => (
                                                                    <Star key={star} className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-current' : 'opacity-30'}`} />
                                                                ))}
                                                            </div>
                                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {formatRelativeTime(review.createdAt, locale === 'tr' ? 'tr' : 'en')}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const written =
                                                            (review.text && review.text.trim()) ||
                                                            (review.comment && review.comment.trim());
                                                        return written ? (
                                                            <p className="text-sm text-foreground/90 mt-3 bg-muted/30 p-3 rounded-xl leading-relaxed">
                                                                {written}
                                                            </p>
                                                        ) : (
                                                            <p className="text-sm italic text-muted-foreground mt-3">
                                                                {t('dealerReviews.noWrittenComment')}
                                                            </p>
                                                        );
                                                    })()}

                                                    {review.dealerReply && (
                                                        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
                                                            <p className="text-xs font-medium text-primary mb-1.5">
                                                                {t('dealerReviews.yourReplyTitle')}
                                                            </p>
                                                            <p className="text-sm text-foreground/95 whitespace-pre-wrap">{review.dealerReply}</p>
                                                            {review.dealerRepliedAt && (
                                                                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {t('dealerReviews.repliedAt')}:{' '}
                                                                    {formatRelativeTime(review.dealerRepliedAt, locale === 'tr' ? 'tr' : 'en')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {review.consumption.product && (
                                                        <div className="mt-4 flex items-center gap-2">
                                                            <Badge variant="secondary" className="rounded-lg font-normal text-xs text-primary bg-primary/10">
                                                                <Tag className="w-3 h-3 mr-1" />
                                                                {review.consumption.product.name}
                                                            </Badge>
                                                            <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-md">
                                                                {review.consumption.amount} ₺
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* AI Reply System */}
                                                    <div className="mt-6 pt-4 border-t border-border/40">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <h4 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                                <Sparkles className="h-4 w-4 text-primary" /> {t('dealerReviews.aiAssistantTitle')}
                                                            </h4>
                                                            {!aiReplies[review.id] && !review.dealerReply && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-8 rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                                                                    onClick={() => handleGenerateAiReply(review.id)}
                                                                    disabled={generatingId === review.id}
                                                                >
                                                                    {generatingId === review.id ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Sparkles className="w-3 h-3 mr-2" />}
                                                                    {t('dealerReviews.generateReply')}
                                                                </Button>
                                                            )}
                                                        </div>

                                                        {aiReplies[review.id] && (
                                                            <div className="space-y-2 mt-3">
                                                                {aiReplies[review.id].map((reply, idx) => (
                                                                    <div key={idx} className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                                                                        <p className="text-foreground/90 italic">"{reply}"</p>
                                                                        <div className="flex justify-end mt-1">
                                                                            <Button
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="h-7 rounded-lg border-border/70 bg-background/90 text-xs text-foreground shadow-sm hover:bg-accent dark:border-white/25 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                                                                                disabled={savingReplyForId === review.id}
                                                                                onClick={() => handleUseAiReply(review.id, reply)}
                                                                            >
                                                                                {savingReplyForId === review.id ? (
                                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                                ) : (
                                                                                    t('dealerReviews.useThisReply')
                                                                                )}
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="w-full text-xs text-muted-foreground hover:text-foreground mt-2"
                                                                    onClick={() => setAiReplies(prev => { const n = { ...prev }; delete n[review.id]; return n; })}
                                                                >
                                                                    {t('dealerReviews.discardDrafts')}
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>

                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </m.div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </LazyMotion>
    );
}
