'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Heart,
    MapPin,
    Store,
    Trash2,
    Star,
    ExternalLink,
    ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';
import { cn } from '@/lib/utils';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';

interface FavoriteDealer {
    dealerId: string;
    addedAt: string;
    businessName: string | null;
    businessLogo: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
}

export default function FavoritesPage() {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<{ success: boolean; data: FavoriteDealer[] }>({
        queryKey: ['customer', 'favorites'],
        queryFn: async () => {
            const res = await fetch('/api/customer/favorites');
            if (!res.ok) throw new Error('Favoriler yüklenemedi');
            return res.json();
        },
        staleTime: 60 * 1000,
    });

    const favorites = data?.data || [];

    const removeMutation = useMutation({
        mutationFn: async (dealerId: string) => {
            const res = await fetch(`/api/customer/favorites?dealerId=${dealerId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Favorilerden kaldırılamadı');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customer', 'favorites'] });
            toast.success('Favorilerden kaldırıldı');
        },
        onError: () => {
            toast.error('Bir hata oluştu');
        }
    });

    return (
        <div className="space-y-6 pb-12 max-w-2xl mx-auto px-4 sm:px-6">
            {/* Header */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm"
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-2xl shrink-0">
                        <Heart className="h-6 w-6 text-primary fill-primary" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-balance">Favori Mekanlar</h1>
                        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">Sevdiğiniz işletmeleri buradan takip edin</p>
                    </div>
                </div>
            </motion.header>

            {isLoading ? (
                <InlineLoadingStatus
                    className="py-20"
                    spinnerClassName="text-primary"
                    description="Mekanlar yükleniyor..."
                />
            ) : favorites.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16 px-4 bg-muted/20 border border-dashed border-border/50 rounded-3xl"
                >
                    <div className="bg-primary/10 p-4 rounded-full w-fit mx-auto mb-4">
                        <Store className="h-8 w-8 text-primary opacity-80" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Henüz favoriniz yok</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mb-6">
                        Ziyaret ettiğiniz veya keşfettiğiniz mekanları favorilerinize ekleyerek burayı doldurabilirsiniz.
                    </p>
                    <Button
                      asChild
                      className={cn(TW_BRAND_CTA_BUTTON, 'rounded-xl px-6 transition-opacity hover:opacity-95')}
                    >
                        <Link href="/customer/nearby">Mekan Keşfet</Link>
                    </Button>
                </motion.div>
            ) : (
                <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                        {favorites.map((fav, i) => (
                            <motion.div
                                key={fav.dealerId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                transition={{ delay: i * 0.05 }}
                                layout
                            >
                                <Card className="overflow-hidden border-border/40 hover:border-primary/30 transition-colors shadow-sm bg-card/60 backdrop-blur-sm group rounded-2xl">
                                    <div className="flex items-start p-4 sm:p-5 gap-4">
                                        <div className="relative shrink-0">
                                            {fav.businessLogo ? (
                                                <div className="h-16 w-16 rounded-xl overflow-hidden border bg-background">
                                                    <Image
                                                        src={fav.businessLogo}
                                                        alt={fav.businessName || 'İşletme'}
                                                        width={64} height={64}
                                                        className="object-cover w-full h-full"
                                                        unoptimized
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-16 w-16 rounded-xl border bg-muted/50 flex items-center justify-center text-muted-foreground">
                                                    <Store className="h-7 w-7 opacity-40" />
                                                </div>
                                            )}
                                            <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-sm border">
                                                <Heart className="h-4 w-4 text-primary fill-primary" />
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0 pr-2 pt-1">
                                            <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">
                                                {fav.businessName || 'İsimsiz İşletme'}
                                            </h3>

                                            <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1.5 line-clamp-2">
                                                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                {fav.address || 'Adres belirtilmemiş'}
                                            </p>

                                            <div className="flex items-center gap-3 mt-3">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="h-8 rounded-lg text-xs"
                                                    asChild
                                                >
                                                    <Link href={`/customer/nearby?dealerId=${fav.dealerId}`}>
                                                        Profili Gör <ChevronRight className="h-3 w-3 ml-1" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="shrink-0 flex flex-col items-center justify-start h-full pt-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                onClick={() => removeMutation.mutate(fav.dealerId)}
                                                disabled={removeMutation.isPending}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
