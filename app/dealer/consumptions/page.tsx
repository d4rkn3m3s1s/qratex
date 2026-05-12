'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { CreditCard, ShoppingBag, History, User, Star, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import Image from 'next/image';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface Consumption {
    id: string;
    amount: number | null;
    note: string | null;
    createdAt: string;
    card: { token: string };
    customer: { name: string | null; email: string | null; image: string | null };
    product: { name: string; price: number; category: { name: string; icon: string } | null } | null;
    review: { rating: number; text: string | null } | null;
}

interface Pagination {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export default function DealerConsumptionsPage() {
    const { data: session } = useSession();
    const t = useAppT();
    const { locale } = useAppLocale();
    const [consumptions, setConsumptions] = useState<Consumption[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    useEffect(() => {
        async function fetchConsumptions() {
            if (!session?.user?.id) return;
            try {
                setLoading(true);
                const res = await fetch(`/api/dealer/consumptions?page=${page}&pageSize=15`);
                const data = await res.json();
                if (data.success) {
                    setConsumptions(data.items);
                    setPagination(data.pagination);
                }
            } catch (err) {
                console.error('Failed to fetch consumptions', err);
            } finally {
                setLoading(false);
            }
        }
        fetchConsumptions();
    }, [session, page]);

    return (
        <LazyMotion features={domAnimation} strict>
            <div className="space-y-6 pb-10">
                <m.header
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/10 via-teal-600/10 to-cyan-600/5 p-6 border border-emerald-500/10 shadow-sm ring-1 ring-emerald-500/15"
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                                <History className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-2xl font-bold tracking-tight text-balance">{t('dealerConsumptions.title')}</h1>
                                <p className="text-sm text-muted-foreground text-pretty leading-relaxed">{t('dealerConsumptions.description')}</p>
                            </div>
                        </div>
                        {pagination && (
                            <div className="hidden sm:block text-right shrink-0">
                                <p className="text-sm text-muted-foreground uppercase tracking-widest font-medium">{t('dealerConsumptions.totalTransactions')}</p>
                                <p className="text-3xl font-bold tabular-nums text-emerald-600">{pagination.total}</p>
                            </div>
                        )}
                    </div>
                </m.header>

                <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
                    <CardHeader className="border-b bg-muted/20">
                        <CardTitle className="text-lg">{t('dealerConsumptions.transactionList')}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="divide-y">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="p-4 flex items-center gap-4">
                                        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-1/4" />
                                            <Skeleton className="h-3 w-1/3" />
                                        </div>
                                        <Skeleton className="h-8 w-20 rounded-md" />
                                    </div>
                                ))}
                            </div>
                        ) : consumptions.length === 0 ? (
                            <div className="py-16 flex flex-col items-center justify-center text-muted-foreground text-center">
                                <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
                                <p className="font-medium text-lg text-foreground">{t('dealerConsumptions.emptyTitle')}</p>
                                <p className="text-sm mt-1">{t('dealerConsumptions.emptyDescription')}</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {consumptions.map((item, i) => (
                                    <m.div
                                        key={item.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className="p-4 sm:px-6 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row gap-4 sm:items-center justify-between"
                                    >
                                        <div className="flex items-start gap-4 flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden font-medium text-primary shadow-sm ring-1 ring-primary/20">
                                                {item.customer.image ? (
                                                    <Image src={item.customer.image} alt={item.customer.name || t('dealerConsumptions.customerAvatarAlt')} width={40} height={40} />
                                                ) : (
                                                    item.customer.name ? item.customer.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-sm sm:text-base truncate">
                                                    {item.customer.name || t('dealerConsumptions.unnamedCustomer')}
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded-md text-foreground/70 font-mono">
                                                        <CreditCard className="w-3 h-3" /> ...{item.card.token.substring(item.card.token.length - 4)}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{new Date(item.createdAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    {item.product && (
                                                        <Badge variant="outline" className="bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 font-normal shadow-sm">
                                                            {item.product.name}
                                                        </Badge>
                                                    )}
                                                    {item.note && (
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground italic bg-muted/50 px-2 py-0.5 rounded-md">
                                                            <FileText className="w-3 h-3" />
                                                            "{item.note}"
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0 border-t pt-3 sm:border-0 sm:pt-0">
                                            <div className="font-semibold text-base sm:text-lg tabular-nums">
                                                {item.amount ? (
                                                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-xl">
                                                        {formatCurrency(item.amount)}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </div>

                                            {item.review ? (
                                                <div className="flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
                                                    <Star className="w-3 h-3 fill-amber-500" /> {item.review.rating} {t('dealerConsumptions.points')}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">{t('dealerConsumptions.noRating')}</span>
                                            )}
                                        </div>
                                    </m.div>
                                ))}
                            </div>
                        )}
                    </CardContent>

                    {pagination && pagination.totalPages > 1 && (
                        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <p className="text-sm text-muted-foreground">
                                {t('dealerConsumptions.pageOf').replace('{page}', String(page)).replace('{totalPages}', String(pagination.totalPages))}
                            </p>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page === 1}
                                    onClick={() => setPage(page - 1)}
                                    className="flex-1 sm:flex-none rounded-xl"
                                >
                                    {t('dealerConsumptions.previous')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page === pagination.totalPages}
                                    onClick={() => setPage(page + 1)}
                                    className="flex-1 sm:flex-none rounded-xl"
                                >
                                    {t('dealerConsumptions.next')}
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </LazyMotion>
    );
}
