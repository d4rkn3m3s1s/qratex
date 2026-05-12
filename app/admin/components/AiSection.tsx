'use client';

import Link from 'next/link';
import { Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatRelativeTime } from '@/lib/utils';
import { getSentimentColor } from '../admin-utils';
import type { AiStats } from '../types';

export function AiSection({ aiStats }: { aiStats: AiStats }) {
    return (
        <section className="space-y-3 sm:space-y-5">
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/30 shadow-inner sm:h-12 sm:w-12 sm:rounded-2xl">
                    <Brain className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                </div>
                <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">AI özeti</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Yapay zeka analizleri, niyet ve aciliyet dağılımı</p>
                </div>
            </div>
            <div className="grid gap-2 sm:gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border border-border bg-card/80 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 dark:bg-card/90">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI ile analiz edilen</p>
                        <p className="text-2xl font-bold mt-1">{aiStats.analyzedCount}</p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Acil</p>
                        <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{aiStats.urgentCount}</p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Toksik</p>
                        <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{aiStats.toxicCount}</p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Churn riski</p>
                        <p className="text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400">{aiStats.churnCount}</p>
                    </CardContent>
                </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Intent dağılımı</CardTitle>
                        <p className="text-xs text-muted-foreground">Tespit edilen niyet türleri</p>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const entries = Object.entries(aiStats.intentDist || {});
                            const total = entries.reduce((s, [, c]) => s + c, 0) || 1;
                            return (
                                <div className="space-y-3">
                                    {entries.map(([intent, count]) => {
                                        const pct = Math.round((count / total) * 100);
                                        return (
                                            <div key={intent} className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground capitalize">{intent}</span>
                                                    <span className="font-medium tabular-nums">{count} (%{pct})</span>
                                                </div>
                                                <Progress value={pct} className="h-2" />
                                            </div>
                                        );
                                    })}
                                    {entries.length === 0 && <p className="text-sm text-muted-foreground py-2">Henüz intent verisi yok</p>}
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Son AI analizleri</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ul className="divide-y max-h-72 overflow-y-auto">
                            {(aiStats.recentAnalyses || []).slice(0, 15).map((a) => (
                                <li key={a.feedbackId} className="border-l-2 border-transparent px-4 py-3.5 transition-colors hover:border-primary/50 hover:bg-muted/50">
                                    <p className="text-sm line-clamp-2 text-foreground">{a.text}</p>
                                    <div className="flex flex-wrap gap-2 mt-2 text-xs items-center">
                                        <Badge variant={getSentimentColor(a.sentiment) as 'success' | 'destructive' | 'secondary'} className="text-[10px]">{a.sentiment}</Badge>
                                        <span className="text-muted-foreground">{a.intent}</span>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="text-muted-foreground truncate max-w-[120px]" title={a.dealerName}>{a.dealerName}</span>
                                        <span className="text-amber-600 dark:text-amber-400 font-medium">Acil %{Math.round((a.urgency || 0) * 100)}</span>
                                        <span className="text-muted-foreground ml-auto">{formatRelativeTime(a.createdAt)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
            <div className="mt-4 flex justify-end">
                <Link href="/admin/ai-dashboard">
                    <Button variant="outline" size="sm">AI Kontrol Merkezi →</Button>
                </Link>
            </div>
        </section>
    );
}
