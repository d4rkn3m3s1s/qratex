'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Plus, Trash2, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PageHeader, SectionCard, EmptyState, InlineError } from '@/components/states';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { isChoiceType, SURVEY_LIMITS, SURVEY_QUESTION_TYPES, type SurveyQuestionType } from '@/lib/survey-schema';
import {
    mapIssuesToDraftErrors,
    buildSurveyPayload,
    validateSurveyDraft,
    type DraftErrors,
    type DraftQuestion,
} from '@/lib/survey-draft';

const QUESTION_TYPE_KEYS: Record<SurveyQuestionType, string> = {
    single_choice: 'dealerSurveyCreate.typeSingleChoice',
    multiple_choice: 'dealerSurveyCreate.typeMultipleChoice',
    open_text: 'dealerSurveyCreate.typeOpenText',
    rating: 'dealerSurveyCreate.typeRating',
};

const EMPTY_ERRORS: DraftErrors = { byQuestion: {}, count: 0 };

function uid(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankOption() {
    return { id: uid('o'), value: '' };
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return {};
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function CreateSurveyPage() {
    const t = useAppT();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questions, setQuestions] = useState<DraftQuestion[]>([]);
    /** İlk kaydetme denemesinden sonra hatalar canlı gösterilir. */
    const [showErrors, setShowErrors] = useState(false);
    /** Sunucudan gelen (istemcinin yakalayamadığı) hatalar — taslak değişince temizlenir. */
    const [serverErrors, setServerErrors] = useState<DraftErrors | null>(null);
    const formRef = useRef<HTMLDivElement>(null);

    const draft = useMemo(() => ({ title, description, questions }), [title, description, questions]);
    const liveErrors = useMemo(() => (showErrors ? validateSurveyDraft(draft).errors : EMPTY_ERRORS), [draft, showErrors]);
    const errors = serverErrors ?? liveErrors;

    const mutate = (fn: (prev: DraftQuestion[]) => DraftQuestion[]) => {
        setServerErrors(null);
        setQuestions(fn);
    };

    function addQuestion() {
        if (questions.length >= SURVEY_LIMITS.questionsMax) return;
        mutate((prev) => [
            ...prev,
            { id: uid('q'), type: 'single_choice', text: '', options: [blankOption(), blankOption()], required: true },
        ]);
    }

    function updateQuestion(id: string, updates: Partial<DraftQuestion>) {
        mutate((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
    }

    function changeType(id: string, type: SurveyQuestionType) {
        mutate((prev) =>
            prev.map((q) => {
                if (q.id !== id) return q;
                // Seçim tipine geçerken en az iki seçenek satırı hazır olsun.
                const options = isChoiceType(type) && q.options.length < SURVEY_LIMITS.optionsMin
                    ? [...q.options, ...Array.from({ length: SURVEY_LIMITS.optionsMin - q.options.length }, blankOption)]
                    : q.options;
                return { ...q, type, options };
            })
        );
    }

    function removeQuestion(id: string) {
        mutate((prev) => prev.filter((q) => q.id !== id));
    }

    function addOption(qid: string) {
        mutate((prev) =>
            prev.map((q) => (q.id === qid && q.options.length < SURVEY_LIMITS.optionsMax ? { ...q, options: [...q.options, blankOption()] } : q))
        );
    }

    function updateOption(qid: string, oid: string, value: string) {
        mutate((prev) =>
            prev.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, value } : o)) } : q))
        );
    }

    function removeOption(qid: string, oid: string) {
        mutate((prev) => prev.map((q) => (q.id === qid ? { ...q, options: q.options.filter((o) => o.id !== oid) } : q)));
    }

    function focusFirstInvalid() {
        requestAnimationFrame(() => {
            const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
            el?.focus();
            el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    async function handleSave() {
        setShowErrors(true);
        setServerErrors(null);
        // Sunucuyla BİREBİR aynı şema (lib/survey-schema.ts): boş seçenekli seçim sorusu,
        // yinelenen seçenek, uzunluk ve adet sınırları kaydetmeden önce yakalanır.
        const result = validateSurveyDraft(draft);
        if (!result.ok) {
            toast.error(result.firstMessage ?? t('dealerSurveyCreate.toastFixErrors'));
            focusFirstInvalid();
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/dealer/surveys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.payload),
            });
            const data = await readJsonSafe(res);
            if (!res.ok) {
                if (Array.isArray(data.issues)) {
                    const { optionIds } = buildSurveyPayload(draft);
                    setServerErrors(mapIssuesToDraftErrors(data.issues as { path: (string | number)[]; message: string }[], draft, optionIds));
                    focusFirstInvalid();
                }
                throw new Error(typeof data.error === 'string' ? data.error : t('dealerSurveyCreate.toastCreateFailed'));
            }
            await queryClient.invalidateQueries({ queryKey: ['dealer', 'surveys'] });
            toast.success(t('dealerSurveyCreate.toastCreated'));
            router.push('/dealer/surveys');
        } catch (e: unknown) {
            toast.error(e instanceof Error && e.message ? e.message : t('dealerSurveyCreate.toastGenericError'));
        } finally {
            setSaving(false);
        }
    }

    const atQuestionLimit = questions.length >= SURVEY_LIMITS.questionsMax;

    return (
        <div ref={formRef} className="mx-auto max-w-3xl space-y-6">
            <PageHeader
                icon={<ClipboardList />}
                title={t('dealerSurveyCreate.title')}
                description={t('dealerSurveyCreate.subtitle')}
                back={{ href: '/dealer/surveys', label: t('dealerSurveyCreate.backAria') }}
            />

            {/* Başlık ve açıklama */}
            <SectionCard>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="survey-title">{t('dealerSurveyCreate.labelTitleRequired')}</Label>
                        <Input
                            id="survey-title"
                            value={title}
                            maxLength={SURVEY_LIMITS.titleMax}
                            onChange={(e) => { setServerErrors(null); setTitle(e.target.value); }}
                            placeholder={t('dealerSurveyCreate.placeholderTitle')}
                            aria-invalid={errors.title ? true : undefined}
                            aria-describedby={errors.title ? 'survey-title-error' : undefined}
                        />
                        {errors.title && <InlineError id="survey-title-error">{errors.title}</InlineError>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="survey-description">{t('dealerSurveyCreate.labelDescription')}</Label>
                        <Textarea
                            id="survey-description"
                            value={description}
                            maxLength={SURVEY_LIMITS.descriptionMax}
                            onChange={(e) => { setServerErrors(null); setDescription(e.target.value); }}
                            placeholder={t('dealerSurveyCreate.placeholderDescription')}
                            rows={2}
                            aria-invalid={errors.description ? true : undefined}
                        />
                        {errors.description && <InlineError>{errors.description}</InlineError>}
                    </div>
                </div>
            </SectionCard>

            {/* Sorular */}
            <section aria-labelledby="survey-questions-heading" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="survey-questions-heading" className="qx-h3 text-fg">
                            {t('dealerSurveyCreate.questionsHeading', { count: questions.length })}
                        </h2>
                        <p className="qx-caption text-fg-muted">
                            {t('dealerSurveyCreate.questionLimit', { count: questions.length, max: SURVEY_LIMITS.questionsMax })}
                        </p>
                    </div>
                    <Button onClick={addQuestion} variant="outline" size="sm" className="gap-2" disabled={atQuestionLimit}>
                        <Plus className="h-4 w-4" aria-hidden /> {t('dealerSurveyCreate.addQuestion')}
                    </Button>
                </div>

                {errors.questions && <InlineError variant="banner">{errors.questions}</InlineError>}

                <AnimatePresence initial={false}>
                    {questions.map((q, i) => {
                        const qe = errors.byQuestion[q.id] ?? {};
                        const n = i + 1;
                        const textId = `${q.id}-text`;
                        const hasError = !!(qe.text || qe.options || qe.type || qe.other || (qe.option && Object.keys(qe.option).length));
                        return (
                            <Motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                                <fieldset
                                    className={cn(
                                        'min-w-0 rounded-card border bg-surface-1 p-4 qx-elevation-1',
                                        hasError && 'border-danger-border'
                                    )}
                                >
                                    <legend className="sr-only">{t('dealerSurveyCreate.questionLegend', { n })}</legend>
                                    <div className="flex items-start gap-3">
                                        <span aria-hidden className="qx-caption mt-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-chip bg-surface-muted font-semibold text-fg-muted">
                                            {n}
                                        </span>
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <Label htmlFor={textId} className="sr-only">{t('dealerSurveyCreate.questionLegend', { n })}</Label>
                                                    <Input
                                                        id={textId}
                                                        value={q.text}
                                                        maxLength={SURVEY_LIMITS.questionTextMax}
                                                        onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                                                        placeholder={t('dealerSurveyCreate.placeholderQuestion')}
                                                        aria-invalid={qe.text ? true : undefined}
                                                        aria-describedby={qe.text ? `${textId}-error` : undefined}
                                                    />
                                                    {qe.text && <InlineError id={`${textId}-error`}>{qe.text}</InlineError>}
                                                </div>
                                                <Select value={q.type} onValueChange={(v) => changeType(q.id, v as SurveyQuestionType)}>
                                                    <SelectTrigger className="w-full sm:w-44" aria-label={t('dealerSurveyCreate.questionTypeAria', { n })}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {SURVEY_QUESTION_TYPES.map((k) => (
                                                            <SelectItem key={k} value={k}>{t(QUESTION_TYPE_KEYS[k])}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {isChoiceType(q.type) && (
                                                <div className="space-y-2 sm:pl-1">
                                                    <p className={cn('qx-caption', qe.options ? 'text-danger' : 'text-fg-muted')}>
                                                        {t('dealerSurveyCreate.optionsHint')}
                                                    </p>
                                                    {q.options.map((opt, oi) => {
                                                        const optError = qe.option?.[opt.id];
                                                        const optId = `${q.id}-${opt.id}`;
                                                        return (
                                                            <div key={opt.id} className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span aria-hidden className="qx-caption w-5 shrink-0 text-right text-fg-muted">{oi + 1}.</span>
                                                                    <Label htmlFor={optId} className="sr-only">
                                                                        {t('dealerSurveyCreate.optionPlaceholder', { n: oi + 1 })}
                                                                    </Label>
                                                                    <Input
                                                                        id={optId}
                                                                        value={opt.value}
                                                                        maxLength={SURVEY_LIMITS.optionMax}
                                                                        onChange={(e) => updateOption(q.id, opt.id, e.target.value)}
                                                                        placeholder={t('dealerSurveyCreate.optionPlaceholder', { n: oi + 1 })}
                                                                        className="h-9 flex-1 text-sm"
                                                                        aria-invalid={optError || (qe.options && !opt.value.trim()) ? true : undefined}
                                                                    />
                                                                    {q.options.length > SURVEY_LIMITS.optionsMin && (
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            onClick={() => removeOption(q.id, opt.id)}
                                                                            aria-label={t('dealerSurveyCreate.removeOptionAria', { n: oi + 1 })}
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                                {optError && <InlineError className="pl-7">{optError}</InlineError>}
                                                            </div>
                                                        );
                                                    })}
                                                    {qe.options && (
                                                        <InlineError>{qe.options}</InlineError>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 text-xs"
                                                        onClick={() => addOption(q.id)}
                                                        disabled={q.options.length >= SURVEY_LIMITS.optionsMax}
                                                    >
                                                        <Plus className="mr-1 h-3 w-3" aria-hidden /> {t('dealerSurveyCreate.addOption')}
                                                    </Button>
                                                </div>
                                            )}

                                            {(qe.type || qe.other) && <InlineError>{qe.type ?? qe.other}</InlineError>}

                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id={`${q.id}-required`}
                                                    checked={q.required}
                                                    onCheckedChange={(v) => updateQuestion(q.id, { required: v })}
                                                    aria-label={t('dealerSurveyCreate.requiredAria', { n })}
                                                />
                                                <Label htmlFor={`${q.id}-required`} className="qx-caption cursor-pointer text-fg-muted">
                                                    {t('dealerSurveyCreate.required')}
                                                </Label>
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="shrink-0 text-danger hover:text-danger"
                                            onClick={() => removeQuestion(q.id)}
                                            aria-label={t('dealerSurveyCreate.removeQuestionAria', { n })}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden />
                                        </Button>
                                    </div>
                                </fieldset>
                            </Motion.div>
                        );
                    })}
                </AnimatePresence>

                {questions.length === 0 && (
                    <EmptyState
                        icon={ClipboardList}
                        title={t('dealerSurveyCreate.emptyHint')}
                        description={null}
                        compact
                        action={
                            <Button onClick={addQuestion} variant="outline" size="sm" className="gap-2">
                                <Plus className="h-4 w-4" aria-hidden /> {t('dealerSurveyCreate.addQuestion')}
                            </Button>
                        }
                    />
                )}
            </section>

            {/* Kaydet */}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <Button variant="outline" asChild>
                    <Link href="/dealer/surveys">{t('dealerSurveyCreate.cancel')}</Link>
                </Button>
                <Button onClick={handleSave} loading={saving}>
                    {t('dealerSurveyCreate.submit')}
                </Button>
            </div>
        </div>
    );
}
