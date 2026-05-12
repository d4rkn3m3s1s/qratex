'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Trash2, ChevronLeft, Loader2,
    ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

interface Question {
    id: string;
    type: 'multiple_choice' | 'single_choice' | 'open_text' | 'rating';
    text: string;
    options: string[];
    required: boolean;
}

const QUESTION_TYPE_KEYS: Record<Question['type'], string> = {
    single_choice: 'dealerSurveyCreate.typeSingleChoice',
    multiple_choice: 'dealerSurveyCreate.typeMultipleChoice',
    open_text: 'dealerSurveyCreate.typeOpenText',
    rating: 'dealerSurveyCreate.typeRating',
};

let nextId = 1;

export default function CreateSurveyPage() {
    const t = useAppT();
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);

    function addQuestion() {
        setQuestions((prev) => [
            ...prev,
            { id: `q-${nextId++}`, type: 'single_choice', text: '', options: ['', ''], required: true },
        ]);
    }

    function updateQuestion(id: string, updates: Partial<Question>) {
        setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
    }

    function removeQuestion(id: string) {
        setQuestions((prev) => prev.filter((q) => q.id !== id));
    }

    function addOption(qid: string) {
        setQuestions((prev) =>
            prev.map((q) => (q.id === qid ? { ...q, options: [...q.options, ''] } : q))
        );
    }

    function updateOption(qid: string, idx: number, val: string) {
        setQuestions((prev) =>
            prev.map((q) => {
                if (q.id !== qid) return q;
                const opts = [...q.options];
                opts[idx] = val;
                return { ...q, options: opts };
            })
        );
    }

    function removeOption(qid: string, idx: number) {
        setQuestions((prev) =>
            prev.map((q) => {
                if (q.id !== qid) return q;
                return { ...q, options: q.options.filter((_, i) => i !== idx) };
            })
        );
    }

    async function handleSave() {
        if (!title.trim()) return toast.error(t('dealerSurveyCreate.toastTitleRequired'));
        if (questions.length === 0) return toast.error(t('dealerSurveyCreate.toastMinQuestions'));

        const invalid = questions.find((q) => !q.text.trim());
        if (invalid) return toast.error(t('dealerSurveyCreate.toastFillQuestions'));

        setSaving(true);
        try {
            const res = await fetch('/api/dealer/surveys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    questions: questions.map((q, i) => ({
                        type: q.type,
                        text: q.text.trim(),
                        options: (q.type === 'single_choice' || q.type === 'multiple_choice')
                            ? q.options.filter((o) => o.trim())
                            : undefined,
                        required: q.required,
                        order: i,
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('dealerSurveyCreate.toastCreateFailed'));
            toast.success(t('dealerSurveyCreate.toastCreated'));
            router.push('/dealer/surveys');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('dealerSurveyCreate.toastGenericError'));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center">
                <Button asChild variant="ghost" size="icon" className="rounded-xl shrink-0 touch-manipulation w-fit">
                    <Link href="/dealer/surveys"><ChevronLeft className="h-5 w-5" /></Link>
                </Button>
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
                        <ClipboardList className="h-6 w-6 shrink-0 text-emerald-500" />
                        {t('dealerSurveyCreate.title')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">{t('dealerSurveyCreate.subtitle')}</p>
                </div>
            </div>

            {/* Title & Description */}
            <Card className="rounded-2xl">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <Label>{t('dealerSurveyCreate.labelTitleRequired')}</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('dealerSurveyCreate.placeholderTitle')} className="mt-1" />
                    </div>
                    <div>
                        <Label>{t('dealerSurveyCreate.labelDescription')}</Label>
                        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('dealerSurveyCreate.placeholderDescription')} rows={2} className="mt-1" />
                    </div>
                </CardContent>
            </Card>

            {/* Questions */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{t('dealerSurveyCreate.questionsHeading').replace('{count}', String(questions.length))}</h2>
                    <Button
                        onClick={addQuestion}
                        variant="outline"
                        size="sm"
                        className="gap-2 rounded-xl border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                    >
                        <Plus className="h-4 w-4" /> {t('dealerSurveyCreate.addQuestion')}
                    </Button>
                </div>

                <AnimatePresence mode="popLayout">
                    {questions.map((q, i) => (
                            <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} layout>
                                <Card className="rounded-2xl">
                                    <CardContent className="p-4 space-y-3">
                                        <div className="flex items-start gap-3">
                                            <Badge variant="outline" className="text-xs shrink-0 mt-1">{i + 1}</Badge>
                                            <div className="flex-1 space-y-3">
                                                <div className="flex gap-3">
                                                    <Input value={q.text} onChange={(e) => updateQuestion(q.id, { text: e.target.value })} placeholder={t('dealerSurveyCreate.placeholderQuestion')} className="flex-1" />
                                                    <Select value={q.type} onValueChange={(v) => updateQuestion(q.id, { type: v as Question['type'] })}>
                                                        <SelectTrigger className="w-40 border-border/70 bg-background/80 text-foreground dark:bg-white/15 dark:border-white/30 dark:text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(Object.keys(QUESTION_TYPE_KEYS) as Question['type'][]).map((k) => (
                                                                <SelectItem key={k} value={k}>{t(QUESTION_TYPE_KEYS[k])}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                                                    <div className="space-y-2 pl-2">
                                                        {q.options.map((opt, oi) => (
                                                            <div key={oi} className="flex items-center gap-2">
                                                                <span className="text-xs text-muted-foreground w-4">{String.fromCharCode(65 + oi)}</span>
                                                                <Input value={opt} onChange={(e) => updateOption(q.id, oi, e.target.value)} placeholder={t('dealerSurveyCreate.optionPlaceholder').replace('{n}', String(oi + 1))} className="flex-1 h-8 text-sm" />
                                                                {q.options.length > 2 && (
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOption(q.id, oi)}>
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => addOption(q.id)}>
                                                            <Plus className="h-3 w-3 mr-1" /> {t('dealerSurveyCreate.addOption')}
                                                        </Button>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-4">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Switch checked={q.required} onCheckedChange={(v) => updateQuestion(q.id, { required: v })} />
                                                        <span className="text-muted-foreground text-xs">{t('dealerSurveyCreate.required')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeQuestion(q.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                    ))}
                </AnimatePresence>

                {questions.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p>{t('dealerSurveyCreate.emptyHint')}</p>
                    </div>
                )}
            </div>

            {/* Save */}
            <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" asChild className="rounded-xl">
                    <Link href="/dealer/surveys">{t('dealerSurveyCreate.cancel')}</Link>
                </Button>
                <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('dealerSurveyCreate.submit')}
                </Button>
            </div>
        </div>
    );
}
