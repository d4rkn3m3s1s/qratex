'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { BarChart3, ChevronLeft, Star } from 'lucide-react';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAppT } from '@/lib/app-locale';

interface QuestionResult {
    questionId: string;
    text: string;
    type: string;
    totalAnswers: number;
    optionCounts?: Record<string, number>;
    avg?: number;
    distribution?: Record<number, number>;
    recentTexts?: string[];
}

export default function SurveyResultsPage() {
    const { id } = useParams<{ id: string }>();
    const t = useAppT();

    const { data, isLoading } = useQuery<{
        success: boolean;
        survey: { id: string; title: string; description: string | null; isActive: boolean };
        totalResponses: number;
        questionResults: QuestionResult[];
    }>({
        queryKey: ['dealer', 'surveys', id, 'results'],
        queryFn: async () => { const r = await fetch(`/api/dealer/surveys/${id}/results`); return r.json(); },
        staleTime: 30_000,
    });

    if (isLoading) return <InlineLoadingStatus className="py-16" label={t('dealerSurveyResults.loading')} />;
    if (!data?.success)
        return (
            <div role="alert" className="py-12 text-center text-muted-foreground">
                {t('dealerSurveyResults.loadFailed')}
            </div>
        );

    const { survey, totalResponses, questionResults } = data;

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center">
                <Button asChild variant="ghost" size="icon" className="rounded-xl shrink-0 touch-manipulation w-fit">
                    <Link href="/dealer/surveys"><ChevronLeft className="h-5 w-5" /></Link>
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-balance">
                        <BarChart3 className="h-5 w-5 shrink-0 text-emerald-500" />
                        {survey.title}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('dealerSurveyResults.totalResponses').replace('{count}', String(totalResponses))}</p>
                </div>
                <Badge variant={survey.isActive ? 'default' : 'secondary'} className="w-fit shrink-0">{survey.isActive ? t('dealerSurveyResults.active') : t('dealerSurveyResults.inactive')}</Badge>
            </div>

            {totalResponses === 0 ? (
                <Card className="rounded-2xl"><CardContent className="py-16 text-center text-muted-foreground">{t('dealerSurveyResults.noResponsesYet')}</CardContent></Card>
            ) : (
                <div className="space-y-4">
                    {questionResults.map((qr, i) => (
                        <motion.div key={qr.questionId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.05 }}>
                            <Card className="rounded-2xl">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">{i + 1}</Badge>
                                        <CardTitle className="text-sm">{qr.text}</CardTitle>
                                        <span className="text-xs text-muted-foreground ml-auto">{t('dealerSurveyResults.answersCount').replace('{count}', String(qr.totalAnswers))}</span>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {(qr.type === 'single_choice' || qr.type === 'multiple_choice') && qr.optionCounts && (
                                        <div className="space-y-2">
                                            {Object.entries(qr.optionCounts).sort((a, b) => b[1] - a[1]).map(([option, count]) => {
                                                const pct = qr.totalAnswers > 0 ? Math.round((count / qr.totalAnswers) * 100) : 0;
                                                return (
                                                    <div key={option} className="space-y-1">
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span>{option}</span>
                                                            <span className="text-muted-foreground text-xs">{count} ({pct}%)</span>
                                                        </div>
                                                        <Progress value={pct} className="h-2" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {qr.type === 'rating' && (
                                        <div className="text-center space-y-3">
                                            <div className="text-4xl font-bold text-amber-500">{qr.avg ?? 0}</div>
                                            <div className="flex items-center justify-center gap-0.5">
                                                {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={`h-5 w-5 ${s <= Math.round(qr.avg ?? 0) ? 'text-amber-500 fill-amber-500' : 'text-muted/30'}`} />)}
                                            </div>
                                            {qr.distribution && (
                                                <div className="flex justify-center gap-3 text-xs text-muted-foreground">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <span key={s}>{s}★: {qr.distribution![s] || 0}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {qr.type === 'open_text' && qr.recentTexts && (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {qr.recentTexts.map((snippet, j) => (
                                                <div key={j} className="p-2 rounded-lg bg-muted/30 text-sm">{snippet}</div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
