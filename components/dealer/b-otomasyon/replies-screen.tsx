'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  History,
  MessageSquareText,
  Pencil,
  Plus,
  Reply,
  Siren,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PanelPage, PageHeader, SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { IconButton } from '@/components/ds/a11y';
import { ConfirmAction, InlineError, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { useMotionPolicy } from '@/lib/motion';
import { replyRuleBodySchema, type ReplyRuleBody } from '@/lib/dealer-automation/reply-rules';
import { AUTOMATION_KEYS, type RepliesOverviewDto, type ReplyRuleDto } from '@/lib/dealer-automation/types';
import {
  createReplyRule,
  deleteReplyRule,
  errorText,
  fetchReplies,
  fetchReplyRuns,
  fmtDateTime,
  fmtInt,
  fmtRelative,
  reorderReplyRules,
  setReplyRuleState,
} from './api';
import { AutomationNav } from './automation-nav';
import type { ReplyEditorState } from './reply-editor';
import { useAutomationCopy, type AutomationCopy } from './copy';

// Düzenleyici (form + önizleme) yalnız açılınca yüklenir.
const ReplyEditor = dynamic(() => import('./reply-editor').then((mod) => mod.ReplyEditor), { ssr: false });

function presets(copy: AutomationCopy): Array<{ title: string; hint: string; body: ReplyRuleBody }> {
  const p = copy.replies.presets;
  return [
    {
      title: p.apology.title,
      hint: p.apology.hint,
      body: { name: p.apology.name, condition: { field: 'rating', op: 'lte', value: 2 }, action: 'reply', template: p.apology.template, tone: null, isActive: true },
    },
    {
      title: p.oneStar.title,
      hint: p.oneStar.hint,
      body: { name: p.oneStar.name, condition: { field: 'rating', op: 'eq', value: 1 }, action: 'incident', template: p.oneStar.template, tone: null, isActive: true },
    },
    {
      title: p.thanks.title,
      hint: p.thanks.hint,
      body: { name: p.thanks.name, condition: { field: 'rating', op: 'gte', value: 5 }, action: 'reply', template: p.thanks.template, tone: null, isActive: true },
    },
    {
      title: p.wait.title,
      hint: p.wait.hint,
      body: {
        name: p.wait.name,
        // Anahtar kelimeler müşteri yorumlarının diliyle (Türkçe) eşleşir; arayüz diline göre çevrilmez.
        condition: { field: 'text', op: 'contains', keywords: ['bekledim', 'geç geldi', 'yavaş'], wholeWord: false },
        action: 'incident',
        template: p.wait.template,
        tone: null,
        isActive: true,
      },
    },
  ];
}

export function RepliesScreen() {
  const qc = useQueryClient();
  const copy = useAutomationCopy();
  const c = copy.replies;
  const q = useQuery({ queryKey: AUTOMATION_KEYS.replies, queryFn: ({ signal }) => fetchReplies(signal), staleTime: 30_000 });
  const [editor, setEditor] = useState<ReplyEditorState>(null);
  const atLimit = !!q.data && q.data.rules.length >= q.data.limit;

  const refresh = () => qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.replies });

  const newButton = (
    <Button
      onClick={() => setEditor({ mode: 'create' })}
      disabled={!q.data || atLimit}
      title={atLimit ? c.limit(q.data?.limit) : undefined}
      className="min-h-11"
    >
      <Plus className="mr-2 h-4 w-4" aria-hidden />
      {c.newRule}
    </Button>
  );

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow={copy.eyebrow}
          title={c.title}
          description={c.description}
          icon={<Reply className="h-5 w-5" aria-hidden />}
          actions={newButton}
          meta={<AutomationNav />}
        />
      }
    >
      <QueryState query={q} skeleton="list" onRetry={() => q.refetch()} isEmpty={() => false}>
        {(data) => (
          <div className="flex min-w-0 flex-col gap-section">
            <Summary data={data} />
            <Warnings data={data} />
            {data.rules.length === 0 ? (
              <Presets onPick={(body) => setEditor({ mode: 'create', preset: body })} />
            ) : (
              <SectionCard
                title={c.rules}
                description={c.rulesHint}
                actions={<span className="qx-caption tabular-nums text-fg-muted">{c.ruleCount(fmtInt(data.rules.length), fmtInt(data.limit))}</span>}
              >
                <RuleList
                  data={data}
                  atLimit={atLimit}
                  onEdit={(rule) => setEditor({ mode: 'edit', rule })}
                  onDuplicate={(rule) =>
                    rule.condition &&
                    setEditor({
                      mode: 'create',
                      preset: {
                        name: `${rule.name} ${c.copySuffix}`.slice(0, 80),
                        condition: rule.condition,
                        action: rule.action,
                        template: rule.template,
                        tone: rule.toneMissing ? null : rule.tone,
                        isActive: false,
                      },
                    })
                  }
                />
              </SectionCard>
            )}
            {data.rules.length > 0 && data.rules.length < 3 && !atLimit && (
              <Presets compact onPick={(body) => setEditor({ mode: 'create', preset: body })} />
            )}
            {editor && (
              <ReplyEditor
                state={editor}
                overview={data}
                onClose={() => setEditor(null)}
                onSaved={() => {
                  setEditor(null);
                  void refresh();
                }}
              />
            )}
          </div>
        )}
      </QueryState>
    </PanelPage>
  );
}

function Summary({ data }: { data: RepliesOverviewDto }) {
  const c = useAutomationCopy().replies;
  return (
    <MetricGrid cols={4}>
      <MetricTile
        label={c.kpiActive}
        metric={{ value: data.summary.activeCount }}
        icon={<Zap className="h-4 w-4" aria-hidden />}
        hint={c.kpiActiveHint(fmtInt(data.rules.length), fmtInt(data.limit))}
      />
      <MetricTile label={c.kpiReplies} metric={{ value: data.summary.replies7 }} icon={<MessageSquareText className="h-4 w-4" aria-hidden />} />
      <MetricTile
        label={c.kpiIncidents}
        metric={{ value: data.summary.incidents7 }}
        icon={<Siren className="h-4 w-4" aria-hidden />}
        href="/dealer/inbox/incidents"
      />
      <MetricTile
        label={c.kpiBroken}
        metric={{ value: data.summary.brokenCount }}
        tone={data.summary.brokenCount > 0 ? 'warning' : undefined}
        icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
        hint={c.kpiBrokenHint}
      />
    </MetricGrid>
  );
}

function Warnings({ data }: { data: RepliesOverviewDto }) {
  const c = useAutomationCopy().replies;
  const usesTone = data.rules.some((r) => r.isActive && r.tone);
  const usesSentiment = data.rules.some((r) => r.isActive && r.condition?.field === 'sentiment');
  // Boş kap flex-col sütununda fazladan bir boşluk adımı üretmesin.
  if (data.summary.brokenCount === 0 && !(usesTone && data.ai.canUseAi === false) && !(usesSentiment && data.ai.canAnalyze === false)) return null;
  return (
    <div className="space-y-2">
      {data.summary.brokenCount > 0 && (
        <InlineError variant="banner" tone="warning">
          {c.brokenBanner(fmtInt(data.summary.brokenCount))}
        </InlineError>
      )}
      {usesTone && data.ai.canUseAi === false && (
        <InlineError variant="banner" tone="info">
          {c.aiOffBanner}{' '}
          <Link href="/dealer/settings" className="font-medium underline underline-offset-2">
            {c.aiSettings}
          </Link>
        </InlineError>
      )}
      {usesSentiment && data.ai.canAnalyze === false && (
        <InlineError variant="banner" tone="info">
          {c.sentimentOff}
        </InlineError>
      )}
    </div>
  );
}

function Presets({ onPick, compact }: { onPick: (b: ReplyRuleBody) => void; compact?: boolean }) {
  const copy = useAutomationCopy();
  const c = copy.replies;
  return (
    <SectionCard title={compact ? c.presetsCompact : c.presetsEmpty} description={c.presetsHint}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {presets(copy).map((p) => (
          <li key={p.title}>
            <button
              type="button"
              onClick={() => onPick(replyRuleBodySchema.parse(p.body))}
              className="flex min-h-11 w-full items-start gap-3 rounded-card border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="mt-0.5 rounded-control bg-brand-subtle p-2 text-brand" aria-hidden>
                {p.body.action === 'incident' ? <Siren className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
              </span>
              <span>
                <span className="block qx-body font-medium text-fg">{p.title}</span>
                <span className="qx-small text-fg-muted">{p.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function RuleList({
  data,
  atLimit,
  onEdit,
  onDuplicate,
}: {
  data: RepliesOverviewDto;
  atLimit: boolean;
  onEdit: (r: ReplyRuleDto) => void;
  onDuplicate: (r: ReplyRuleDto) => void;
}) {
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const c = useAutomationCopy().replies;
  const key = AUTOMATION_KEYS.replies;

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderReplyRules(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RepliesOverviewDto>(key);
      if (prev) {
        const byId = new Map(prev.rules.map((r) => [r.id, r]));
        qc.setQueryData<RepliesOverviewDto>(key, {
          ...prev,
          rules: ids.map((id, i) => ({ ...(byId.get(id) as ReplyRuleDto), order: i })),
        });
      }
      return { prev };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorText(e));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; isActive: boolean; name: string }) => setReplyRuleState(v.id, v.isActive),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RepliesOverviewDto>(key);
      if (prev) qc.setQueryData<RepliesOverviewDto>(key, { ...prev, rules: prev.rules.map((r) => (r.id === v.id ? { ...r, isActive: v.isActive } : r)) });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorText(e));
    },
    onSuccess: (_r, v) => toast.success(v.isActive ? c.started(v.name) : c.stopped(v.name)),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const ids = data.rules.map((r) => r.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j] as string, ids[index] as string];
    reorder.mutate(ids);
  };

  const remove = async (rule: ReplyRuleDto) => {
    const res = await deleteReplyRule(rule.id);
    await qc.invalidateQueries({ queryKey: key });
    const snap = replyRuleBodySchema.safeParse(res.snapshot);
    toast.success(c.deleted(rule.name), {
      action:
        snap.success && !atLimit
          ? {
              label: c.undo,
              onClick: () => {
                createReplyRule(snap.data)
                  .then(() => {
                    toast.success(c.restored);
                    void qc.invalidateQueries({ queryKey: key });
                  })
                  .catch((e) => toast.error(errorText(e)));
              },
            }
          : undefined,
    });
  };

  return (
    <ol className="space-y-3" aria-label={c.listAria}>
      <AnimatePresence initial={false}>
        {data.rules.map((rule, i) => (
          <Motion.li
            key={rule.id}
            layout={!policy.reduce}
            initial={policy.reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={policy.reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: policy.reduce ? 0 : 0.18 }}
          >
            <RuleCard
              rule={rule}
              index={i}
              count={data.rules.length}
              atLimit={atLimit}
              busy={reorder.isPending || (toggle.isPending && toggle.variables?.id === rule.id)}
              onMove={(dir) => move(i, dir)}
              onToggle={(isActive) => toggle.mutate({ id: rule.id, isActive, name: rule.name })}
              onEdit={() => onEdit(rule)}
              onDuplicate={() => onDuplicate(rule)}
              onDelete={() => remove(rule)}
            />
          </Motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

function RuleCard({
  rule,
  index,
  count,
  atLimit,
  busy,
  onMove,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  rule: ReplyRuleDto;
  index: number;
  count: number;
  atLimit: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => Promise<void>;
}) {
  const [showRuns, setShowRuns] = useState(false);
  const c = useAutomationCopy().replies;
  const broken = !rule.condition;
  const runsId = `runs-${rule.id}`;
  return (
    <article
      aria-label={c.cardAria(index + 1, rule.name)}
      className={cn(
        'rounded-card border bg-surface-1 p-3 sm:p-4',
        broken ? 'border-warning-border' : 'border-subtle',
        !rule.isActive && 'opacity-75'
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 qx-body font-semibold tabular-nums text-fg"
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="qx-body font-semibold text-fg">{rule.name}</h3>
            {!rule.isActive && <span className="rounded-chip bg-surface-2 px-2 py-0.5 qx-caption text-fg-muted">{c.paused}</span>}
            {broken && (
              <span className="inline-flex items-center gap-1 rounded-chip bg-warning-subtle px-2 py-0.5 qx-caption text-fg">
                <AlertTriangle className="h-3 w-3" aria-hidden /> {c.broken}
              </span>
            )}
          </div>
          <p className="qx-body text-fg">
            <span className="font-medium">{rule.sentence}</span>
            <span className="text-fg-muted"> → </span>
            {rule.action === 'incident' ? (
              <span className="inline-flex items-center gap-1">
                <Siren className="h-3.5 w-3.5 text-danger" aria-hidden /> {c.actionIncident}
              </span>
            ) : rule.tone ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden /> {c.actionAi(rule.toneName ?? null)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <MessageSquareText className="h-3.5 w-3.5 text-brand" aria-hidden /> {c.actionFixed}
              </span>
            )}
          </p>
          {rule.template && <p className="qx-small line-clamp-2 text-fg-muted">{rule.tone ? c.fallback(rule.template) : rule.template}</p>}
          {rule.toneMissing && <p className="qx-small text-warning">{c.toneMissing}</p>}
          <p className="qx-caption text-fg-muted">
            {rule.stats.count30 > 0
              ? c.runs30(fmtInt(rule.stats.count30), rule.stats.ai30 ? fmtInt(rule.stats.ai30) : null, fmtRelative(rule.stats.lastAt))
              : c.noRuns30}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.isActive}
            disabled={busy || broken}
            onCheckedChange={onToggle}
            aria-label={c.toggleAria(rule.name, rule.isActive)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-subtle pt-2">
        <IconButton aria-label={c.moveUp(rule.name)} icon={<ArrowUp />} tooltip disabled={busy || index === 0} onClick={() => onMove(-1)} />
        <IconButton aria-label={c.moveDown(rule.name)} icon={<ArrowDown />} tooltip disabled={busy || index === count - 1} onClick={() => onMove(1)} />
        <span className="mx-1 h-6 border-l border-subtle" aria-hidden />
        <IconButton aria-label={c.edit(rule.name)} icon={<Pencil />} tooltip onClick={onEdit} />
        <IconButton aria-label={c.duplicate(rule.name)} icon={<Copy />} tooltip disabled={atLimit || broken} onClick={onDuplicate} />
        <IconButton
          aria-label={c.history(rule.name)}
          icon={<History />}
          tooltip
          pressed={showRuns}
          aria-expanded={showRuns}
          aria-controls={runsId}
          onClick={() => setShowRuns((s) => !s)}
        />
        <span className="flex-1" />
        <ConfirmAction
          trigger={<IconButton aria-label={c.deleteAria(rule.name)} icon={<Trash2 />} variant="danger" tooltip />}
          title={c.deleteTitle(rule.name)}
          description={c.deleteBody}
          tone="warning"
          irreversibleNote={false}
          confirmLabel={c.delete}
          onConfirm={onDelete}
        />
      </div>
      {showRuns && <RunsPanel id={runsId} ruleId={rule.id} />}
    </article>
  );
}

function RunsPanel({ id, ruleId }: { id: string; ruleId: string }) {
  const q = useQuery({ queryKey: AUTOMATION_KEYS.replyRuns(ruleId), queryFn: ({ signal }) => fetchReplyRuns(ruleId, signal), staleTime: 30_000 });
  const c = useAutomationCopy().replies;
  return (
    <div id={id} className="mt-2 rounded-control bg-surface-2 p-3">
      <QueryState
        query={q}
        skeleton="list"
        isEmpty={(d) => d.runs.length === 0}
        empty={{ compact: true, title: c.runsEmpty, description: c.runsEmptyHint }}
      >
        {(d) => (
          <ul className="space-y-2">
            {d.runs.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 qx-body">
                <time dateTime={r.at} className="qx-caption tabular-nums text-fg-muted">
                  {fmtDateTime(r.at)}
                </time>
                <span className="text-fg">{r.action === 'incident' ? c.runIncident : r.ai ? c.runAi : c.runReply}</span>
                {r.feedback ? (
                  <Link href={r.feedback.href} className="min-w-0 truncate text-brand underline-offset-2 hover:underline">
                    {r.feedback.rating != null ? `${r.feedback.rating} ★ · ` : ''}
                    {r.feedback.textPreview ?? c.ratingOnly}
                  </Link>
                ) : (
                  <span className="qx-caption text-fg-muted">{c.feedbackDeleted}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
