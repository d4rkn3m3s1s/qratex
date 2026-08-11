'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Trash2, Pencil, Power, PowerOff, Zap, AlertTriangle,
    Star, MessageSquare, Search, ChevronLeft, Loader2, Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { useAppT } from '@/lib/app-locale';

// ─── Types ──────────────────────────────────────────────────
interface Condition {
    field: 'rating' | 'sentiment' | 'text';
    op: 'lte' | 'gte' | 'eq' | 'contains';
    value: string | number;
}

interface AutoReplyRule {
    id: string;
    name: string;
    isActive: boolean;
    priority: number;
    condition: Condition;
    action: 'reply' | 'incident';
    template: string;
    tone: string | null;
    createdAt: string;
}

const FIELD_LABEL_KEYS: Record<Condition['field'], string> = {
    rating: 'dealerAutoReplies.fieldRating',
    sentiment: 'dealerAutoReplies.fieldSentiment',
    text: 'dealerAutoReplies.fieldText',
};

const OP_LABEL_KEYS: Record<Condition['op'], string> = {
    lte: 'dealerAutoReplies.opLabelLte',
    gte: 'dealerAutoReplies.opLabelGte',
    eq: 'dealerAutoReplies.opLabelEq',
    contains: 'dealerAutoReplies.opLabelContains',
};

const FIELD_ICONS: Record<string, typeof Star> = {
    rating: Star,
    sentiment: MessageSquare,
    text: Search,
};

// ─── Page ───────────────────────────────────────────────────
export default function AutoRepliesPage() {
    const t = useAppT();
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [field, setField] = useState<Condition['field']>('rating');
    const [op, setOp] = useState<Condition['op']>('lte');
    const [value, setValue] = useState<string>('2');
    const [action, setAction] = useState<'reply' | 'incident'>('reply');
    const [template, setTemplate] = useState('');
    const [tone, setTone] = useState<string | null>(null);
    const [priority, setPriority] = useState(0);

    const { data, isLoading } = useQuery<{ success: boolean; rules: AutoReplyRule[] }>({
        queryKey: ['dealer', 'auto-reply-rules'],
        queryFn: async () => {
            const res = await fetch('/api/dealer/auto-reply-rules');
            return res.json();
        },
        staleTime: 30_000,
    });

    const createMutation = useMutation({
        mutationFn: async (payload: object) => {
            const res = await fetch('/api/dealer/auto-reply-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('dealerAutoReplies.errorCreateFailed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dealer', 'auto-reply-rules'] });
            toast.success(t('dealerAutoReplies.toastCreated'));
            closeDialog();
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, ...payload }: { id: string;[key: string]: unknown }) => {
            const res = await fetch(`/api/dealer/auto-reply-rules/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('dealerAutoReplies.errorUpdateFailed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dealer', 'auto-reply-rules'] });
            toast.success(t('dealerAutoReplies.toastUpdated'));
            closeDialog();
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/dealer/auto-reply-rules/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(t('dealerAutoReplies.errorDeleteFailed'));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dealer', 'auto-reply-rules'] });
            toast.success(t('dealerAutoReplies.toastDeleted'));
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const toggleMutation = useMutation({
        mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
            const res = await fetch(`/api/dealer/auto-reply-rules/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive }),
            });
            if (!res.ok) throw new Error(t('dealerAutoReplies.errorToggleFailed'));
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dealer', 'auto-reply-rules'] }),
        onError: (err: Error) => toast.error(err.message),
    });

    function openCreate() {
        setEditingRule(null);
        setName('');
        setField('rating');
        setOp('lte');
        setValue('2');
        setAction('reply');
        setTemplate('');
        setTone(null);
        setPriority(0);
        setDialogOpen(true);
    }

    function openEdit(rule: AutoReplyRule) {
        setEditingRule(rule);
        setName(rule.name);
        setField(rule.condition.field);
        setOp(rule.condition.op);
        setValue(String(rule.condition.value));
        setAction(rule.action);
        setTemplate(rule.template);
        setTone(rule.tone || null);
        setPriority(rule.priority);
        setDialogOpen(true);
    }

    function closeDialog() {
        setDialogOpen(false);
        setEditingRule(null);
    }

    function handleSave() {
        const conditionValue = field === 'rating' ? Number(value) : value;
        const payload = {
            name,
            condition: { field, op, value: conditionValue },
            action,
            template,
            tone,
            priority,
        };
        if (editingRule) {
            updateMutation.mutate({ id: editingRule.id, ...payload });
        } else {
            createMutation.mutate(payload);
        }
    }

    const rules = data?.rules ?? [];
    const saving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-center">
                    <Button asChild variant="ghost" size="icon" className="rounded-xl shrink-0 touch-manipulation w-fit">
                        <Link href="/dealer/settings"><ChevronLeft className="h-5 w-5" /></Link>
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
                            <Zap className="h-6 w-6 shrink-0 text-amber-500" />
                            {t('dealerAutoReplies.title')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
                            {t('dealerAutoReplies.description')}
                        </p>
                    </div>
                </div>
                <Button onClick={openCreate} className="gap-2 rounded-xl shrink-0 touch-manipulation w-full sm:w-auto">
                    <Plus className="h-4 w-4 shrink-0" /> {t('dealerAutoReplies.newRule')}
                </Button>
            </div>

            {/* Rules list */}
            {isLoading ? (
                <InlineLoadingStatus className="py-16" label={t('dealerAutoReplies.loadingRules')} />
            ) : rules.length === 0 ? (
                <Card className="rounded-2xl">
                    <CardContent className="py-16 text-center">
                        <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-lg font-medium text-muted-foreground">{t('dealerAutoReplies.emptyTitle')}</p>
                        <p className="text-sm text-muted-foreground/70 mt-1">{t('dealerAutoReplies.emptyHint')}</p>
                        <Button onClick={openCreate} variant="outline" className="mt-4 rounded-xl gap-2">
                            <Plus className="h-4 w-4" /> {t('dealerAutoReplies.createFirstRule')}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {rules.map((rule, i) => {
                            const Icon = FIELD_ICONS[rule.condition.field] || Star;
                            return (
                                <motion.div
                                    key={rule.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                                    layout
                                >
                                    <Card className={`rounded-2xl transition-all ${rule.isActive ? 'border-primary/20' : 'opacity-60 border-border/50'}`}>
                                        <CardContent className="p-4 sm:p-5">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2.5 rounded-xl shrink-0 ${rule.isActive ? 'bg-amber-500/15' : 'bg-muted'}`}>
                                                    <Icon className={`h-5 w-5 ${rule.isActive ? 'text-amber-500' : 'text-muted-foreground'}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="font-semibold">{rule.name}</h3>
                                                        <Badge variant={rule.action === 'incident' ? 'destructive' : 'secondary'} className="text-xs">
                                                            {rule.action === 'incident' ? t('dealerAutoReplies.badgeIncident') : t('dealerAutoReplies.badgeReply')}
                                                        </Badge>
                                                        {rule.priority > 0 && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {t('dealerAutoReplies.priorityShort').replace('{priority}', String(rule.priority))}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        <span className="font-medium">{t(FIELD_LABEL_KEYS[rule.condition.field])}</span>
                                                        {' '}{t(OP_LABEL_KEYS[rule.condition.op])}{' '}
                                                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                                            {String(rule.condition.value)}
                                                        </span>
                                                    </p>
                                                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1">{rule.template}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Switch
                                                        checked={rule.isActive}
                                                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, isActive: checked })}
                                                        aria-label={t('dealerAutoReplies.switchAria')}
                                                    />
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                        onClick={() => deleteMutation.mutate(rule.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {editingRule ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                            {editingRule ? t('dealerAutoReplies.dialogEdit') : t('dealerAutoReplies.dialogCreate')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('dealerAutoReplies.dialogDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <Label>{t('dealerAutoReplies.ruleName')}</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('dealerAutoReplies.ruleNamePlaceholder')}
                                className="mt-1"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <Label>{t('dealerAutoReplies.columnField')}</Label>
                                <Select value={field} onValueChange={(v) => setField(v as Condition['field'])}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="rating">{t('dealerAutoReplies.fieldRating')}</SelectItem>
                                        <SelectItem value="sentiment">{t('dealerAutoReplies.fieldSentiment')}</SelectItem>
                                        <SelectItem value="text">{t('dealerAutoReplies.fieldText')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>{t('dealerAutoReplies.columnOperator')}</Label>
                                <Select value={op} onValueChange={(v) => setOp(v as Condition['op'])}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {field === 'rating' ? (
                                            <>
                                                <SelectItem value="lte">≤</SelectItem>
                                                <SelectItem value="gte">≥</SelectItem>
                                                <SelectItem value="eq">=</SelectItem>
                                            </>
                                        ) : field === 'sentiment' ? (
                                            <SelectItem value="eq">=</SelectItem>
                                        ) : (
                                            <SelectItem value="contains">{t('dealerAutoReplies.operatorContains')}</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>{t('dealerAutoReplies.columnValue')}</Label>
                                {field === 'rating' ? (
                                    <Input
                                        type="number"
                                        min={1}
                                        max={5}
                                        value={value}
                                        onChange={(e) => setValue(e.target.value)}
                                        className="mt-1"
                                    />
                                ) : field === 'sentiment' ? (
                                    <Select value={String(value)} onValueChange={setValue}>
                                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="negative">{t('dealerAutoReplies.sentimentNegative')}</SelectItem>
                                            <SelectItem value="neutral">{t('dealerAutoReplies.sentimentNeutral')}</SelectItem>
                                            <SelectItem value="positive">{t('dealerAutoReplies.sentimentPositive')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input
                                        value={String(value)}
                                        onChange={(e) => setValue(e.target.value)}
                                        placeholder={t('dealerAutoReplies.valueKeywordPlaceholder')}
                                        className="mt-1"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>{t('dealerAutoReplies.columnAction')}</Label>
                                <Select value={action} onValueChange={(v) => setAction(v as 'reply' | 'incident')}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="reply">
                                            <span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> {t('dealerAutoReplies.selectAutoReply')}</span>
                                        </SelectItem>
                                        <SelectItem value="incident">
                                            <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> {t('dealerAutoReplies.selectIncident')}</span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>{t('dealerAutoReplies.priority')}</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={priority}
                                    onChange={(e) => setPriority(Number(e.target.value))}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <Label>{t('dealerAutoReplies.templateLabel')}</Label>
                                <Select value={tone || 'none'} onValueChange={(v) => setTone(v === 'none' ? null : v)}>
                                    <SelectTrigger className="h-7 px-2 text-[10px] w-fit border-primary/30 bg-primary/5 text-primary">
                                        <Sparkles className="h-3 w-3 mr-1" />
                                        <SelectValue placeholder={t('dealerAutoReplies.selectTone')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('dealerAutoReplies.toneNone')}</SelectItem>
                                        <SelectItem value="formal">{t('dealerAutoReplies.toneFormal')}</SelectItem>
                                        <SelectItem value="friendly">{t('dealerAutoReplies.toneFriendly')}</SelectItem>
                                        <SelectItem value="humorous">{t('dealerAutoReplies.toneHumorous')}</SelectItem>
                                        <SelectItem value="professional">{t('dealerAutoReplies.toneProfessional')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Textarea
                                value={template}
                                onChange={(e) => setTemplate(e.target.value)}
                                placeholder={tone ? t('dealerAutoReplies.templatePlaceholderAI') : t('dealerAutoReplies.templatePlaceholder')}
                                rows={4}
                                className={`mt-1 ${tone ? 'border-primary/40 bg-primary/5' : ''}`}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                {tone 
                                    ? t('dealerAutoReplies.templateHintAI').replace('{tone}', t(`dealerAutoReplies.tone_${tone}`))
                                    : action === 'incident' ? t('dealerAutoReplies.templateHintIncident') : t('dealerAutoReplies.templateHintReply')
                                }
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={closeDialog}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving || !name || !template}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingRule ? t('dealerAutoReplies.update') : t('common.create')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
