'use client';

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getRoleLabel } from '../admin-utils';
import type { AnalyticsData } from '../types';

interface AnalyticsSectionProps {
    analyticsData: AnalyticsData;
}

export function AnalyticsSection({ analyticsData }: AnalyticsSectionProps) {
    return (
        <section className="space-y-3 sm:space-y-5">
            <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center shadow-inner">
                    <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight">Analitik özeti</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Son 30 gün kullanıcı, geri bildirim ve puan trendleri</p>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid gap-2 sm:gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kullanıcı büyüme</p>
                        <p className="text-2xl font-bold mt-1">{analyticsData.comparison?.users?.current ?? 0}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Önceki: {analyticsData.comparison?.users?.previous ?? 0}</p>
                        <p className={`text-sm font-semibold mt-1 ${(analyticsData.userGrowth ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {(analyticsData.userGrowth ?? 0) >= 0 ? '+' : ''}{analyticsData.userGrowth ?? 0}%
                        </p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Geri bildirim büyüme</p>
                        <p className="text-2xl font-bold mt-1">{analyticsData.comparison?.feedbacks?.current ?? 0}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Önceki: {analyticsData.comparison?.feedbacks?.previous ?? 0}</p>
                        <p className={`text-sm font-semibold mt-1 ${(analyticsData.feedbackGrowth ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {(analyticsData.feedbackGrowth ?? 0) >= 0 ? '+' : ''}{analyticsData.feedbackGrowth ?? 0}%
                        </p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ortalama puan</p>
                        <p className="text-2xl font-bold mt-1">{analyticsData.avgRating ?? 0} <span className="text-base font-normal text-muted-foreground">/ 5</span></p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <CardContent className="p-3 sm:p-4 md:p-5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kullanıcılar rol bazlı</p>
                        <div className="mt-2 space-y-1 text-sm">
                            {Object.entries(analyticsData.roleDistribution || {}).map(([role, count]) => (
                                <div key={role} className="flex justify-between">
                                    <span className="text-muted-foreground">{getRoleLabel(role)}</span>
                                    <span className="font-medium">{count}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Rating distribution */}
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Puan dağılımı (1-5)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {[5, 4, 3, 2, 1].map((star) => {
                            const count = analyticsData.ratingDistribution?.[star] ?? 0;
                            const total = Object.values(analyticsData.ratingDistribution || {}).reduce((a, b) => a + b, 0) || 1;
                            const pct = Math.round((count / total) * 100);
                            return (
                                <div key={star} className="flex items-center gap-3">
                                    <span className="text-sm font-medium w-14">{star} yıldız</span>
                                    <Progress value={pct} className="h-2.5 flex-1" />
                                    <span className="text-xs text-muted-foreground w-8 tabular-nums">{count}</span>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Daily trend */}
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold">Günlük geri bildirim trendi</CardTitle>
                        <p className="text-xs text-muted-foreground">Son 14 gün · bar = bildirim sayısı</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(() => {
                            const last14 = (analyticsData.dailyData || []).slice(-14);
                            if (!last14.length) {
                                return (
                                    <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground rounded-xl bg-muted/30 border border-dashed border-border">
                                        Henüz günlük veri yok. Geri bildirimler geldikçe trend burada görünecek.
                                    </div>
                                );
                            }
                            const maxF = Math.max(1, ...last14.map((d) => d.feedbacks));
                            const minV = Math.min(...last14.map((d) => d.feedbacks));
                            const maxV = Math.max(...last14.map((d) => d.feedbacks));
                            const total = last14.reduce((s, d) => s + d.feedbacks, 0);
                            return (
                                <>
                                    <div className="flex items-end gap-1.5 h-40">
                                        {last14.map((day) => {
                                            const h = maxF > 0 ? (day.feedbacks / maxF) * 100 : 0;
                                            const heightPct = Math.max(8, h);
                                            return (
                                                <div
                                                    key={day.date}
                                                    className="flex-1 flex flex-col justify-end items-center h-full min-w-0 group"
                                                    title={`${day.label}: ${day.feedbacks} bildirim, ort. puan ${Number(day.avgRating).toFixed(1)}`}
                                                >
                                                    <div
                                                        className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300 min-h-[6px] transition-all duration-300 group-hover:from-blue-500 group-hover:to-blue-400 shadow-sm group-hover:shadow-md group-hover:shadow-blue-500/30"
                                                        style={{ height: `${heightPct}%` }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between gap-1 px-0.5">
                                        {last14.map((day) => (
                                            <span key={day.date} className="flex-1 text-[10px] text-center text-muted-foreground truncate min-w-0" title={day.label}>
                                                {day.label}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/50">
                                        <div className="flex items-center gap-4 text-xs">
                                            <span className="text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{minV}</span> min</span>
                                            <span className="text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{maxV}</span> max</span>
                                            <span className="text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{total}</span> toplam</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">14 günlük özet</span>
                                    </div>
                                </>
                            );
                        })()}
                    </CardContent>
                </Card>
            </div>

            {/* Additional metrics */}
            <div className="grid gap-2 sm:gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-3 sm:mt-4">
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-emerald-500/5 transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Duygu dağılımı (30 gün)</p>
                        <div className="mt-2 space-y-1.5 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-emerald-600 dark:text-emerald-400">Olumlu</span>
                                <span className="font-bold tabular-nums">{analyticsData.sentimentBreakdown?.positive ?? 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Nötr</span>
                                <span className="font-bold tabular-nums">{analyticsData.sentimentBreakdown?.neutral ?? 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-red-600 dark:text-red-400">Olumsuz</span>
                                <span className="font-bold tabular-nums">{analyticsData.sentimentBreakdown?.negative ?? 0}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-blue-500/5 transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Son 7 gün geri bildirim</p>
                        <p className="text-2xl font-bold mt-1 tabular-nums text-foreground">
                            {(analyticsData.dailyData || []).slice(-7).reduce((s, d) => s + d.feedbacks, 0)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">günlük toplam</p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-primary/10 transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Büyüme özeti</p>
                        <p className="text-lg font-bold mt-1 text-green-600 dark:text-green-400 tabular-nums">
                            {(analyticsData.userGrowth ?? 0) >= 0 ? '+' : ''}{analyticsData.userGrowth ?? 0}%
                        </p>
                        <p className="text-xs text-muted-foreground">Kullanıcı</p>
                        <p className="text-lg font-bold mt-0.5 text-green-600 dark:text-green-400 tabular-nums">
                            {(analyticsData.feedbackGrowth ?? 0) >= 0 ? '+' : ''}{analyticsData.feedbackGrowth ?? 0}%
                        </p>
                        <p className="text-xs text-muted-foreground">Geri bildirim</p>
                    </CardContent>
                </Card>
                <Card className="border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-amber-500/5 transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Toplam (30 gün)</p>
                        <p className="text-xl font-bold mt-1 tabular-nums text-foreground">{analyticsData.totalUsers ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Kullanıcı</p>
                        <p className="text-xl font-bold mt-0.5 tabular-nums text-foreground">{analyticsData.totalFeedbacks ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Geri bildirim</p>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-4 flex justify-end">
                <Link href="/admin/analytics">
                    <Button variant="outline" size="sm">Tüm analitik →</Button>
                </Link>
            </div>
        </section>
    );
}
