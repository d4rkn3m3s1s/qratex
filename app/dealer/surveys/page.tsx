'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ClipboardList, Plus, Trash2, BarChart3, Power,
    Link as LinkIcon, Copy, ExternalLink,
} from 'lucide-react';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

interface SurveyItem {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    _count: { responses: number; questions: number };
}

export default function DealerSurveysPage() {
    const t = useAppT();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<{ success: boolean; surveys: SurveyItem[] }>({
        queryKey: ['dealer', 'surveys'],
        queryFn: async () => { const r = await fetch('/api/dealer/surveys'); return r.json(); },
        staleTime: 30_000,
    });

    const toggleMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            const r = await fetch(`/api/dealer/surveys/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive }),
            });
            if (!r.ok) throw new Error(t('dealerSurveys.errorToggleFailed'));
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dealer', 'surveys'] }),
        onError: (e: Error) => toast.error(e.message),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const r = await fetch(`/api/dealer/surveys/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(t('dealerSurveys.errorDeleteFailed'));
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dealer', 'surveys'] }); toast.success(t('dealerSurveys.toastDeleted')); },
        onError: (e: Error) => toast.error(e.message),
    });

    const copyLink = (id: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/surveys/${id}`);
        toast.success(t('dealerSurveys.toastLinkCopied'));
    };

    const surveys = data?.surveys ?? [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
                        <ClipboardList className="h-6 w-6 shrink-0 text-emerald-500" />
                        {t('dealerSurveys.title')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1.5 text-pretty leading-relaxed">{t('dealerSurveys.description')}</p>
                </div>
                <Button asChild className="gap-2 rounded-xl shrink-0 touch-manipulation w-full sm:w-auto">
                    <Link href="/dealer/surveys/create"><Plus className="h-4 w-4 shrink-0" /> {t('dealerSurveys.newSurvey')}</Link>
                </Button>
            </div>

            {isLoading ? (
                <InlineLoadingStatus className="py-16" label={t('dealerSurveys.loading')} />
            ) : surveys.length === 0 ? (
                <Card className="rounded-2xl">
                    <CardContent className="py-16 text-center">
                        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-lg font-medium text-muted-foreground">{t('dealerSurveys.emptyTitle')}</p>
                        <Button asChild variant="outline" className="mt-4 rounded-xl gap-2">
                            <Link href="/dealer/surveys/create"><Plus className="h-4 w-4" /> {t('dealerSurveys.emptyCta')}</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {surveys.map((s, i) => (
                            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ delay: Math.min(i, 10) * 0.03 }} layout>
                                <Card className={`rounded-2xl transition-all ${s.isActive ? 'border-emerald-500/20' : 'opacity-60'}`}>
                                    <CardContent className="p-4 sm:p-5">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-2.5 rounded-xl shrink-0 ${s.isActive ? 'bg-emerald-500/15' : 'bg-muted'}`}>
                                                <ClipboardList className={`h-5 w-5 ${s.isActive ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-semibold">{s.title}</h3>
                                                    <Badge variant="secondary" className="text-xs">{t('dealerSurveys.questionsBadge').replace('{count}', String(s._count.questions))}</Badge>
                                                    <Badge variant={s._count.responses > 0 ? 'default' : 'outline'} className="text-xs">{t('dealerSurveys.responsesBadge').replace('{count}', String(s._count.responses))}</Badge>
                                                </div>
                                                {s.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{s.description}</p>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(s.id)} title={t('dealerSurveys.copyLinkAria')}>
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                                <Button asChild variant="ghost" size="icon" className="h-8 w-8" title={t('dealerSurveys.resultsAria')}>
                                                    <Link href={`/dealer/surveys/${s.id}/results`}><BarChart3 className="h-4 w-4" /></Link>
                                                </Button>
                                                <Switch checked={s.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, isActive: v })} />
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(s.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
