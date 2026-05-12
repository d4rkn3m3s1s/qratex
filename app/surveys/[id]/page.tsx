'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ClipboardList, Loader2, CheckCircle, Star, Send } from 'lucide-react';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface SurveyQuestion {
    id: string;
    type: string;
    text: string;
    options: string[] | null;
    required: boolean;
}

interface SurveyData {
    id: string;
    title: string;
    description: string | null;
    business: string | null;
    logo: string | null;
    questions: SurveyQuestion[];
}

export default function FillSurveyPage() {
    const { id } = useParams<{ id: string }>();
    const t = useAppT();
    const { locale } = useAppLocale();
    const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const { data, isLoading, error } = useQuery<{ success: boolean; survey: SurveyData }>({
        queryKey: ['survey-fill', id, locale],
        queryFn: async () => {
            const r = await fetch(`/api/surveys/${id}/fill`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || t('surveyFill.fetchNotFound'));
            return d;
        },
    });

    function setAnswer(qid: string, value: string | string[] | number) {
        setAnswers((prev) => ({ ...prev, [qid]: value }));
    }

    function toggleCheckbox(qid: string, option: string) {
        setAnswers((prev) => {
            const current = (prev[qid] as string[]) || [];
            const next = current.includes(option)
                ? current.filter((o) => o !== option)
                : [...current, option];
            return { ...prev, [qid]: next };
        });
    }

    async function handleSubmit() {
        const survey = data?.survey;
        if (!survey) return;

        const required = survey.questions.filter((q) => q.required);
        const missing = required.find((q) => {
            const a = answers[q.id];
            if (a === undefined || a === '' || (Array.isArray(a) && a.length === 0)) return true;
            return false;
        });
        if (missing) return toast.error(t('surveyFill.requiredQuestions'));

        setSubmitting(true);
        try {
            const payload = {
                answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
            };
            const r = await fetch(`/api/surveys/${id}/fill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || t('surveyFill.submitFailed'));
            setSubmitted(true);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('surveyFill.error'));
        } finally {
            setSubmitting(false);
        }
    }

    if (isLoading) return <InlineLoadingStatus className="py-20" />;
    if (error || !data?.success)
        return (
            <div role="alert" className="py-20 text-center text-muted-foreground">
                {t('surveyFill.notFound')}
            </div>
        );

    const survey = data.survey;

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                    <CheckCircle className="h-20 w-20 text-emerald-500 mx-auto mb-4" />
                </motion.div>
                <h1 className="text-2xl font-bold">{t('surveyFill.thanksTitle')}</h1>
                <p className="text-muted-foreground mt-2">{t('surveyFill.thanksBody')}</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
                <ClipboardList className="h-10 w-10 text-emerald-500 mx-auto" />
                <h1 className="text-2xl font-bold">{survey.title}</h1>
                {survey.description && <p className="text-muted-foreground">{survey.description}</p>}
                {survey.business && <p className="text-sm text-muted-foreground/70">{survey.business}</p>}
            </motion.div>

            {/* Questions */}
            {survey.questions.map((q, i) => (
                <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                    <Card className="rounded-2xl">
                        <CardContent className="p-5 space-y-3">
                            <div className="flex items-start gap-2">
                                <span className="text-sm font-bold text-muted-foreground">{i + 1}.</span>
                                <div className="flex-1">
                                    <p className="font-medium text-sm">
                                        {q.text}
                                        {q.required && <span className="text-red-500 ml-1">*</span>}
                                    </p>
                                </div>
                            </div>

                            {q.type === 'single_choice' && q.options && (
                                <div className="space-y-2">
                                    {q.options.map((opt) => (
                                        <div key={opt} className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name={q.id}
                                                value={opt}
                                                checked={(answers[q.id] as string) === opt}
                                                onChange={() => setAnswer(q.id, opt)}
                                                id={`${q.id}-${opt}`}
                                                className="h-4 w-4 accent-primary"
                                            />
                                            <Label htmlFor={`${q.id}-${opt}`} className="text-sm cursor-pointer">{opt}</Label>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {q.type === 'multiple_choice' && q.options && (
                                <div className="space-y-2">
                                    {q.options.map((opt) => (
                                        <div key={opt} className="flex items-center gap-2">
                                            <Checkbox
                                                checked={((answers[q.id] as string[]) || []).includes(opt)}
                                                onCheckedChange={() => toggleCheckbox(q.id, opt)}
                                                id={`${q.id}-${opt}`}
                                            />
                                            <Label htmlFor={`${q.id}-${opt}`} className="text-sm cursor-pointer">{opt}</Label>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {q.type === 'open_text' && (
                                <Textarea
                                    value={(answers[q.id] as string) || ''}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                    placeholder={t('surveyFill.openTextPlaceholder')}
                                    rows={3}
                                />
                            )}

                            {q.type === 'rating' && (
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <button key={s} type="button" onClick={() => setAnswer(q.id, s)} className="p-1 transition-transform hover:scale-110">
                                            <Star className={`h-7 w-7 ${s <= (answers[q.id] as number || 0) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            ))}

            <div className="flex justify-center pt-4">
                <Button onClick={handleSubmit} disabled={submitting} size="lg" className="rounded-xl gap-2 min-w-48">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t('surveyFill.submit')}
                </Button>
            </div>
        </div>
    );
}
