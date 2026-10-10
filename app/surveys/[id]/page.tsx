'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { ClipboardList, CheckCircle, Star, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ErrorState, InlineError, SkeletonForm } from '@/components/states';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { isBlankAnswer, SURVEY_LIMITS, type PublicSurveyQuestion, type SurveyAnswerValue } from '@/lib/survey-schema';

interface SurveyData {
    id: string;
    title: string;
    description: string | null;
    business: string | null;
    logo: string | null;
    questions: PublicSurveyQuestion[];
}

type FillResponse = { success: boolean; survey: SurveyData; alreadyResponded?: boolean };

class SurveyFetchError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) {
        super(message);
    }
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return {};
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

const RATINGS = Array.from({ length: SURVEY_LIMITS.ratingMax - SURVEY_LIMITS.ratingMin + 1 }, (_, i) => SURVEY_LIMITS.ratingMin + i);

export default function FillSurveyPage() {
    const { id } = useParams<{ id: string }>();
    const t = useAppT();
    const [answers, setAnswers] = useState<Record<string, SurveyAnswerValue>>({});
    const [submitted, setSubmitted] = useState(false);
    const [alreadyAnswered, setAlreadyAnswered] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
    const listRef = useRef<HTMLDivElement>(null);

    const query = useQuery<FillResponse, SurveyFetchError>({
        queryKey: ['survey-fill', id],
        queryFn: async () => {
            const r = await fetch(`/api/surveys/${id}/fill`);
            const d = await readJsonSafe(r);
            if (!r.ok) {
                throw new SurveyFetchError(
                    typeof d.error === 'string' ? d.error : t('surveyFill.fetchNotFound'),
                    r.status,
                    typeof d.code === 'string' ? d.code : undefined,
                );
            }
            return d as unknown as FillResponse;
        },
        // 404 kalıcıdır: boşuna yeniden denenmez.
        retry: (count, err) => err.status !== 404 && count < 1,
    });

    function setAnswer(qid: string, value: SurveyAnswerValue) {
        setAnswers((prev) => ({ ...prev, [qid]: value }));
        setQuestionErrors((prev) => {
            if (!prev[qid]) return prev;
            const next = { ...prev };
            delete next[qid];
            return next;
        });
    }

    function toggleCheckbox(qid: string, option: string) {
        const current = Array.isArray(answers[qid]) ? (answers[qid] as string[]) : [];
        setAnswer(qid, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
    }

    function focusQuestion(qid: string) {
        requestAnimationFrame(() => {
            const el = listRef.current?.querySelector<HTMLElement>(`[data-question-id="${qid}"]`);
            el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el?.querySelector<HTMLElement>('input, textarea, button, [tabindex="0"]')?.focus();
        });
    }

    function onRatingKey(e: KeyboardEvent<HTMLDivElement>, qid: string) {
        const current = typeof answers[qid] === 'number' ? (answers[qid] as number) : 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            setAnswer(qid, Math.min(SURVEY_LIMITS.ratingMax, current + 1 || SURVEY_LIMITS.ratingMin));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            setAnswer(qid, Math.max(SURVEY_LIMITS.ratingMin, current - 1 || SURVEY_LIMITS.ratingMin));
        }
    }

    async function handleSubmit() {
        const survey = query.data?.survey;
        if (!survey || submitting) return;

        const missing = survey.questions.filter((q) => q.required && isBlankAnswer(answers[q.id]));
        if (missing.length > 0) {
            setQuestionErrors(Object.fromEntries(missing.map((q) => [q.id, t('surveyFill.requiredQuestions')])));
            toast.error(t('surveyFill.requiredQuestions'));
            focusQuestion(missing[0].id);
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                answers: survey.questions
                    .filter((q) => !isBlankAnswer(answers[q.id]))
                    .map((q) => ({ questionId: q.id, value: typeof answers[q.id] === 'string' ? (answers[q.id] as string).trim() : answers[q.id] })),
            };
            const r = await fetch(`/api/surveys/${id}/fill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const d = await readJsonSafe(r);
            if (r.status === 409 && d.code === 'ALREADY_RESPONDED') {
                setAlreadyAnswered(true);
                return;
            }
            if (!r.ok) {
                const message = typeof d.error === 'string' ? d.error : t('surveyFill.submitFailed');
                if (typeof d.questionId === 'string') {
                    setQuestionErrors({ [d.questionId]: message });
                    focusQuestion(d.questionId);
                }
                throw new Error(message);
            }
            setSubmitted(true);
        } catch (e: unknown) {
            toast.error(e instanceof Error && e.message ? e.message : t('surveyFill.error'));
        } finally {
            setSubmitting(false);
        }
    }

    if (query.isLoading) {
        return (
            <div className="mx-auto max-w-2xl px-4 py-8" role="status" aria-busy="true">
                <SkeletonForm />
            </div>
        );
    }

    if (query.isError || !query.data?.success) {
        const notFound = query.error?.status === 404;
        return (
            <div className="mx-auto max-w-2xl px-4 py-16">
                <ErrorState
                    kind={notFound ? 'notFound' : 'generic'}
                    title={notFound ? t('surveyFill.notFound') : t('surveyFill.loadFailed')}
                    onRetry={notFound ? undefined : () => query.refetch()}
                />
            </div>
        );
    }

    const survey = query.data.survey;

    if (submitted || alreadyAnswered || query.data.alreadyResponded) {
        const thanks = submitted && !alreadyAnswered;
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center" role="status">
                <Motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
                    <CheckCircle className="mx-auto mb-4 h-20 w-20 text-success" aria-hidden />
                </Motion.div>
                <h1 className="qx-h2 text-fg">{thanks ? t('surveyFill.thanksTitle') : t('surveyFill.alreadyTitle')}</h1>
                <p className="qx-body mt-2 max-w-md text-fg-muted">{thanks ? t('surveyFill.thanksBody') : t('surveyFill.alreadyBody')}</p>
                {survey.business && <p className="qx-small mt-4 text-fg-subtle">{survey.business}</p>}
            </div>
        );
    }

    const answeredCount = survey.questions.filter((q) => !isBlankAnswer(answers[q.id])).length;

    return (
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
            {/* Başlık: işletme kimliği önce, sonra anket */}
            <Motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 text-center">
                {survey.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={survey.logo} alt="" className="mx-auto h-14 w-14 rounded-control object-cover" />
                ) : (
                    <ClipboardList className="mx-auto h-10 w-10 text-brand" aria-hidden />
                )}
                {survey.business && <p className="qx-small font-medium text-fg-muted">{survey.business}</p>}
                <h1 className="qx-h2 text-fg">{survey.title}</h1>
                {survey.description && <p className="qx-body text-fg-muted">{survey.description}</p>}
            </Motion.header>

            {survey.questions.length === 0 ? (
                <p role="status" className="qx-body rounded-card border bg-surface-1 p-6 text-center text-fg-muted">
                    {t('surveyFill.noQuestions')}
                </p>
            ) : (
                <>
                    <p className="qx-caption text-center text-fg-muted" aria-live="polite">
                        {t('surveyFill.progress', { done: answeredCount, total: survey.questions.length })}
                    </p>

                    <div ref={listRef} className="space-y-4">
                        {survey.questions.map((q, i) => {
                            const err = questionErrors[q.id];
                            const errId = `${q.id}-error`;
                            const legendId = `${q.id}-legend`;
                            return (
                                <Motion.fieldset
                                    key={q.id}
                                    data-question-id={q.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 + Math.min(i, 8) * 0.04 }}
                                    aria-describedby={err ? errId : undefined}
                                    aria-invalid={err ? true : undefined}
                                    className={cn('min-w-0 space-y-3 rounded-card border bg-surface-1 p-5 qx-elevation-1', err && 'border-danger-border')}
                                >
                                    <legend id={legendId} className="qx-body float-left mb-3 w-full font-medium text-fg">
                                        <span className="mr-1.5 text-fg-muted">{i + 1}.</span>
                                        {q.text}
                                        {q.required && (
                                            <>
                                                <span aria-hidden className="ml-1 text-danger">*</span>
                                                <span className="sr-only"> {t('surveyFill.requiredSr')}</span>
                                            </>
                                        )}
                                    </legend>

                                    <div className="clear-both">
                                        {q.type === 'single_choice' && q.options && (
                                            <div className="space-y-1" role="radiogroup" aria-labelledby={legendId} aria-required={q.required || undefined}>
                                                {q.options.map((opt, oi) => {
                                                    const optId = `${q.id}-o${oi}`;
                                                    return (
                                                        <div key={optId} className="flex min-h-11 items-center gap-3">
                                                            <input
                                                                type="radio"
                                                                name={q.id}
                                                                value={opt}
                                                                checked={answers[q.id] === opt}
                                                                onChange={() => setAnswer(q.id, opt)}
                                                                id={optId}
                                                                className="h-5 w-5 accent-[hsl(var(--brand))]"
                                                            />
                                                            <Label htmlFor={optId} className="qx-body flex-1 cursor-pointer py-2">{opt}</Label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {q.type === 'multiple_choice' && q.options && (
                                            <div className="space-y-1" role="group" aria-labelledby={legendId}>
                                                {q.options.map((opt, oi) => {
                                                    const optId = `${q.id}-o${oi}`;
                                                    const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt);
                                                    return (
                                                        <div key={optId} className="flex min-h-11 items-center gap-3">
                                                            <Checkbox checked={selected} onCheckedChange={() => toggleCheckbox(q.id, opt)} id={optId} />
                                                            <Label htmlFor={optId} className="qx-body flex-1 cursor-pointer py-2">{opt}</Label>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {q.type === 'open_text' && (
                                            <div className="space-y-1">
                                                <Textarea
                                                    aria-labelledby={legendId}
                                                    aria-required={q.required || undefined}
                                                    value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                                    placeholder={t('surveyFill.openTextPlaceholder')}
                                                    maxLength={SURVEY_LIMITS.openTextMax}
                                                    rows={3}
                                                />
                                                <p className="qx-caption text-right text-fg-subtle" aria-hidden>
                                                    {(typeof answers[q.id] === 'string' ? (answers[q.id] as string).length : 0)}/{SURVEY_LIMITS.openTextMax}
                                                </p>
                                            </div>
                                        )}

                                        {q.type === 'rating' && (
                                            <div
                                                role="radiogroup"
                                                aria-labelledby={legendId}
                                                aria-required={q.required || undefined}
                                                className="flex items-center gap-1"
                                                onKeyDown={(e) => onRatingKey(e, q.id)}
                                            >
                                                {RATINGS.map((s) => {
                                                    const value = typeof answers[q.id] === 'number' ? (answers[q.id] as number) : 0;
                                                    const checked = value === s;
                                                    const focusable = value ? checked : s === SURVEY_LIMITS.ratingMin;
                                                    return (
                                                        <button
                                                            key={s}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={checked}
                                                            aria-label={t('surveyFill.ratingAria', { n: s })}
                                                            tabIndex={focusable ? 0 : -1}
                                                            onClick={() => setAnswer(q.id, s)}
                                                            className="grid h-11 w-11 place-items-center rounded-control transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
                                                        >
                                                            <Star
                                                                aria-hidden
                                                                className={cn('h-7 w-7', s <= value ? 'fill-warning text-warning' : 'text-fg-subtle')}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {err && <InlineError id={errId}>{err}</InlineError>}
                                </Motion.fieldset>
                            );
                        })}
                    </div>

                    <div className="flex justify-center pt-2">
                        <Button onClick={handleSubmit} loading={submitting} size="lg" className="min-w-48 gap-2">
                            {!submitting && <Send className="h-4 w-4" aria-hidden />}
                            {t('surveyFill.submit')}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
