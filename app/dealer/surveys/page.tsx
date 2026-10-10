'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ClipboardList, Plus, Trash2, BarChart3, Copy, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PageHeader, QueryState, ConfirmAction, TONE_CHIP } from '@/components/states';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';

interface SurveyItem {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    _count: { responses: number; questions: number };
    /** Eski şemayla kaydedilmiş, müşteriye gösterilemeyen soru sayısı. */
    unanswerableQuestions?: number;
}

type ListResponse = { success: boolean; surveys: SurveyItem[] };

class HttpError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) {
        super(message);
    }
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return {};
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

const LIST_KEY = ['dealer', 'surveys'] as const;

export default function DealerSurveysPage() {
    const t = useAppT();
    const queryClient = useQueryClient();

    // Hata artık "Henüz anket yok" gibi görünmez: !ok → fırlat → QueryState hata kartı + yeniden dene.
    const query = useQuery<ListResponse, HttpError>({
        queryKey: LIST_KEY,
        queryFn: async () => {
            const r = await fetch('/api/dealer/surveys');
            const d = await readJsonSafe(r);
            if (!r.ok || d.success !== true) {
                throw new HttpError(typeof d.error === 'string' ? d.error : t('dealerSurveys.errorLoad'), r.status, typeof d.code === 'string' ? d.code : undefined);
            }
            return d as unknown as ListResponse;
        },
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
        // İyimser güncelleme + hata halinde geri alma.
        onMutate: async ({ id, isActive }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const prev = queryClient.getQueryData<ListResponse>(LIST_KEY);
            if (prev) {
                queryClient.setQueryData<ListResponse>(LIST_KEY, {
                    ...prev,
                    surveys: prev.surveys.map((s) => (s.id === id ? { ...s, isActive } : s)),
                });
            }
            return { prev };
        },
        onError: (e: Error, _vars, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(LIST_KEY, ctx.prev);
            toast.error(e.message);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
    });

    async function deleteSurvey(id: string) {
        const r = await fetch(`/api/dealer/surveys/${id}`, { method: 'DELETE' });
        if (!r.ok) {
            const d = await readJsonSafe(r);
            throw new Error(typeof d.error === 'string' ? d.error : t('dealerSurveys.errorDeleteFailed'));
        }
        await queryClient.invalidateQueries({ queryKey: LIST_KEY });
        toast.success(t('dealerSurveys.toastDeleted'));
    }

    async function copyLink(s: SurveyItem) {
        const url = `${window.location.origin}/surveys/${s.id}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('dealerSurveys.toastLinkCopied'), s.isActive ? undefined : { description: t('dealerSurveys.pausedCopyWarning') });
        } catch {
            toast.error(t('dealerSurveys.toastCopyFailed', { url }), { duration: 10_000 });
        }
    }

    const newSurveyButton = (
        <Button asChild className="w-full gap-2 sm:w-auto">
            <Link href="/dealer/surveys/create"><Plus className="h-4 w-4 shrink-0" aria-hidden /> {t('dealerSurveys.newSurvey')}</Link>
        </Button>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<ClipboardList />}
                title={t('dealerSurveys.title')}
                description={t('dealerSurveys.description')}
                actions={newSurveyButton}
            />

            <QueryState
                query={query}
                skeleton="list"
                loadingLabel={t('dealerSurveys.loading')}
                isEmpty={(d) => d.surveys.length === 0}
                errorKind={query.error?.status === 401 || query.error?.status === 403 ? 'forbidden' : undefined}
                error={{ title: t('dealerSurveys.errorLoad') }}
                empty={{
                    icon: ClipboardList,
                    title: t('dealerSurveys.emptyTitle'),
                    description: null,
                    action: (
                        <Button asChild variant="outline" className="gap-2">
                            <Link href="/dealer/surveys/create"><Plus className="h-4 w-4" aria-hidden /> {t('dealerSurveys.emptyCta')}</Link>
                        </Button>
                    ),
                }}
            >
                {(d) => (
                    <ul className="space-y-3">
                        <AnimatePresence initial={false}>
                            {d.surveys.map((s, i) => {
                                const broken = s.unanswerableQuestions ?? 0;
                                const deleteImpact = {
                                    items: [
                                        { label: t('dealerSurveys.impactResponses'), value: s._count.responses, emphasis: s._count.responses > 0 },
                                        { label: t('dealerSurveys.impactQuestions'), value: s._count.questions },
                                    ],
                                    warning: s._count.responses > 0 ? t('dealerSurveys.impactWarning') : undefined,
                                };
                                return (
                                    <Motion.li
                                        key={s.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                                        className="min-w-0 rounded-card border bg-surface-1 p-4 qx-elevation-1 sm:p-5"
                                    >
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                            <div className="flex min-w-0 flex-1 items-start gap-4">
                                                <div aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-control', s.isActive ? TONE_CHIP.success : TONE_CHIP.neutral)}>
                                                    <ClipboardList className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h2 className="qx-body min-w-0 break-words font-semibold text-fg">{s.title}</h2>
                                                        <span className={cn('qx-caption rounded-chip px-2 py-0.5 font-medium', s.isActive ? TONE_CHIP.success : TONE_CHIP.neutral)}>
                                                            {s.isActive ? t('dealerSurveys.statusLive') : t('dealerSurveys.statusPaused')}
                                                        </span>
                                                        <Badge variant="secondary" className="text-xs">{t('dealerSurveys.questionsBadge', { count: s._count.questions })}</Badge>
                                                        <Badge variant={s._count.responses > 0 ? 'default' : 'outline'} className="text-xs">{t('dealerSurveys.responsesBadge', { count: s._count.responses })}</Badge>
                                                    </div>
                                                    {s.description && <p className="qx-small mt-1 line-clamp-1 text-fg-muted">{s.description}</p>}
                                                    {broken > 0 && (
                                                        <p className={cn('qx-caption mt-2 inline-flex items-start gap-1.5 rounded-chip px-2 py-1', TONE_CHIP.warning)}>
                                                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                                                            <span>
                                                                <strong className="font-semibold">{t('dealerSurveys.unanswerableBadge', { count: broken })}</strong>
                                                                {' · '}
                                                                {t('dealerSurveys.unanswerableHint')}
                                                            </span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap items-center gap-1 sm:gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => void copyLink(s)} aria-label={t('dealerSurveys.copyLinkAria')}>
                                                    <Copy className="h-4 w-4" aria-hidden />
                                                </Button>
                                                <Button asChild variant="ghost" size="icon" aria-label={t('dealerSurveys.resultsAria')}>
                                                    <Link href={`/dealer/surveys/${s.id}/results`}><BarChart3 className="h-4 w-4" aria-hidden /></Link>
                                                </Button>
                                                <div className="grid h-11 place-items-center px-1">
                                                    <Switch
                                                        checked={s.isActive}
                                                        disabled={toggleMutation.isPending && toggleMutation.variables?.id === s.id}
                                                        onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, isActive: v })}
                                                        aria-label={t('dealerSurveys.toggleAria', { title: s.title })}
                                                    />
                                                </div>
                                                {/* Tek tıkla kalıcı silme yok: etki önizlemeli onay; yanıtı olan ankette başlığı yazdırarak. */}
                                                <ConfirmAction
                                                    trigger={
                                                        <Button variant="ghost" size="icon" className="text-danger hover:text-danger" aria-label={t('dealerSurveys.deleteAria', { title: s.title })}>
                                                            <Trash2 className="h-4 w-4" aria-hidden />
                                                        </Button>
                                                    }
                                                    tone="danger"
                                                    title={t('dealerSurveys.deleteTitle')}
                                                    description={t('dealerSurveys.deleteDescription', { title: s.title })}
                                                    impact={deleteImpact}
                                                    confirmPhrase={s._count.responses > 0 ? s.title : undefined}
                                                    confirmLabel={t('dealerSurveys.deleteConfirm')}
                                                    onConfirm={() => deleteSurvey(s.id)}
                                                />
                                            </div>
                                        </div>
                                    </Motion.li>
                                );
                            })}
                        </AnimatePresence>
                    </ul>
                )}
            </QueryState>
        </div>
    );
}
