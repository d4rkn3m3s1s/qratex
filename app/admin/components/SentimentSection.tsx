'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { MessageSquare, Smile, Meh, Frown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DashboardData } from '../types';

export function SentimentSection({ data }: { data: DashboardData }) {
    const router = useRouter();
    const totalSentiment = data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative;
    const rawPosPct = totalSentiment > 0 ? (data.sentiment.positive / totalSentiment) * 100 : 33.33;
    const rawNeuPct = totalSentiment > 0 ? (data.sentiment.neutral / totalSentiment) * 100 : 33.33;
    const rawNegPct = totalSentiment > 0 ? (data.sentiment.negative / totalSentiment) * 100 : 33.34;
    const rounded = [
        { key: 'positive', raw: rawPosPct, base: Math.floor(rawPosPct), frac: rawPosPct - Math.floor(rawPosPct) },
        { key: 'neutral', raw: rawNeuPct, base: Math.floor(rawNeuPct), frac: rawNeuPct - Math.floor(rawNeuPct) },
        { key: 'negative', raw: rawNegPct, base: Math.floor(rawNegPct), frac: rawNegPct - Math.floor(rawNegPct) },
    ].sort((a, b) => b.frac - a.frac);
    let remainder = 100 - rounded.reduce((sum, item) => sum + item.base, 0);
    const pctMap: Record<string, number> = {};
    for (const item of rounded) {
        const plus = remainder > 0 ? 1 : 0;
        pctMap[item.key] = item.base + plus;
        if (plus) remainder -= 1;
    }
    const posPct = pctMap.positive ?? Math.round(rawPosPct);
    const neuPct = pctMap.neutral ?? Math.round(rawNeuPct);
    const negPct = pctMap.negative ?? Math.round(rawNegPct);

    return (
        <section className="space-y-3 sm:space-y-5">
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-600/20 flex items-center justify-center shadow-inner">
                    <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Duygu dağılımı</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Geri bildirimlerin duygu analizi özeti</p>
                </div>
            </div>
            <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
                <CardContent className="pt-6 pb-6 space-y-5">
                    <div className="flex h-14 rounded-2xl overflow-hidden bg-muted/80 border border-border/50 shadow-inner ring-2 ring-inset ring-black/5 dark:ring-white/5">
                        <Motion.button
                            type="button"
                            onClick={() => router.push('/admin/feedbacks?sentiment=positive')}
                            className="h-full bg-green-500 flex items-center justify-center min-w-[2rem] cursor-pointer"
                            initial={{ width: 0 }}
                            animate={{ width: `${rawPosPct}%` }}
                            transition={{ duration: 0.6 }}
                        >
                            {rawPosPct >= 15 && <span className="text-xs font-bold text-white drop-shadow">{posPct}%</span>}
                        </Motion.button>
                        <Motion.button
                            type="button"
                            onClick={() => router.push('/admin/feedbacks?sentiment=neutral')}
                            className="h-full bg-zinc-400 dark:bg-zinc-500 flex items-center justify-center min-w-[2rem] cursor-pointer"
                            initial={{ width: 0 }}
                            animate={{ width: `${rawNeuPct}%` }}
                            transition={{ duration: 0.6 }}
                        >
                            {rawNeuPct >= 15 && <span className="text-xs font-bold text-white drop-shadow">{neuPct}%</span>}
                        </Motion.button>
                        <Motion.button
                            type="button"
                            onClick={() => router.push('/admin/feedbacks?sentiment=negative')}
                            className="h-full bg-red-500 flex items-center justify-center min-w-[2rem] cursor-pointer"
                            initial={{ width: 0 }}
                            animate={{ width: `${rawNegPct}%` }}
                            transition={{ duration: 0.6 }}
                        >
                            {rawNegPct >= 15 && <span className="text-xs font-bold text-white drop-shadow">{negPct}%</span>}
                        </Motion.button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <Link href="/admin/feedbacks?sentiment=positive" className="block">
                        <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-green-500/15 to-emerald-600/10 border border-green-500/30 shadow-sm hover:shadow-md hover:scale-[1.01] transition">
                            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                                <Smile className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-foreground">Olumlu</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{data.sentiment.positive} adet · %{posPct}</p>
                            </div>
                        </div>
                        </Link>
                        <Link href="/admin/feedbacks?sentiment=neutral" className="block">
                        <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-muted/50 border border-border/50 hover:shadow-md hover:scale-[1.01] transition">
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                                <Meh className="h-6 w-6 text-muted-foreground shrink-0" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-foreground">Nötr</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{data.sentiment.neutral} adet · %{neuPct}</p>
                            </div>
                        </div>
                        </Link>
                        <Link href="/admin/feedbacks?sentiment=negative" className="block">
                        <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-red-500/15 to-red-600/10 border border-red-500/30 shadow-sm hover:shadow-md hover:scale-[1.01] transition">
                            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                                <Frown className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-foreground">Olumsuz</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{data.sentiment.negative} adet · %{negPct}</p>
                            </div>
                        </div>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
