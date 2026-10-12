'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Clock, MessageSquareWarning, ShieldAlert, Siren, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PanelPage, PageHeader, SectionCard } from '@/components/ds/page';
import { SeverityBadge, toSeverity } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { DirtyBar, Field } from '@/components/ds/form';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { alertRulesSchema } from '@/lib/dealer-automation/alert-rules';
import type { RadarLevel, RadarRuleEval, RadarRuleKey, RadarRules } from '@/lib/dealer-queues/radar-rules';
import { AUTOMATION_KEYS, type AlertsOverviewDto, type AlertsStatusDto } from '@/lib/dealer-automation/types';
import { errorText, fetchAlerts, fmtInt, fmtRelative, previewAlerts, saveAlerts } from './api';
import { AutomationNav } from './automation-nav';
import { useAutomationCopy } from './copy';

const LEVEL_CLS: Record<RadarLevel, string> = {
  normal: 'bg-success-subtle text-fg',
  watch: 'bg-warning-subtle text-fg',
  alert: 'bg-danger-subtle text-fg',
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AlertsScreen() {
  const q = useQuery({ queryKey: AUTOMATION_KEYS.alerts, queryFn: ({ signal }) => fetchAlerts(signal), staleTime: 30_000 });
  const copy = useAutomationCopy();
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow={copy.eyebrow}
          title={copy.alerts.title}
          description={copy.alerts.description}
          icon={<BellRing className="h-5 w-5" aria-hidden />}
          meta={<AutomationNav />}
          actions={
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/dealer/inbox/incidents">
                <Siren className="mr-2 h-4 w-4" aria-hidden />
                {copy.alerts.incidents}
              </Link>
            </Button>
          }
        />
      }
    >
      <QueryState query={q} skeleton="form" isEmpty={() => false}>
        {(data) => <AlertsBody data={data} />}
      </QueryState>
    </PanelPage>
  );
}

function AlertsBody({ data }: { data: AlertsOverviewDto }) {
  const qc = useQueryClient();
  const copy = useAutomationCopy();
  const c = copy.alerts;
  const [draft, setDraft] = useState<RadarRules>(data.rules);
  const savedKey = JSON.stringify(data.rules);
  useEffect(() => setDraft(data.rules), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== savedKey;
  const parsed = alertRulesSchema.safeParse(draft);
  const debounced = useDebounced(parsed.success && dirty ? parsed.data : null, 500);
  const preview = useQuery({
    queryKey: AUTOMATION_KEYS.alertsPreview(debounced),
    queryFn: ({ signal }) => previewAlerts(debounced as RadarRules, signal),
    enabled: !!debounced,
    staleTime: 60_000,
  });
  const status: AlertsStatusDto | null = dirty ? (preview.data ?? null) : data.status;
  const evalOf = (k: RadarRuleKey) => status?.rules.find((r) => r.key === k) ?? null;

  const save = useMutation({
    mutationFn: () => saveAlerts(draft),
    onSuccess: async () => {
      toast.success(c.saved);
      await qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.alerts });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const set = <K extends keyof RadarRules>(k: K, patch: Partial<RadarRules[K]>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }));
  const isDefault = JSON.stringify(draft) === JSON.stringify(data.defaults);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-subtle bg-surface-1 p-4" aria-live="polite">
        {status ? (
          <span className={cn('rounded-chip px-3 py-1 qx-body font-semibold', LEVEL_CLS[status.level])}>
            {dirty ? c.withThese : c.now}
            {c.level[status.level]}
          </span>
        ) : (
          <span className="qx-small text-fg-muted">{dirty ? (preview.isError ? c.previewFailed : c.computing) : c.liveFailed}</span>
        )}
        <span className="qx-caption text-fg-muted">
          {c.lastScan(fmtRelative(data.lastScanAt), data.updatedAt ? fmtRelative(data.updatedAt) : null)}
        </span>
        {!isDefault && (
          <Button variant="ghost" size="sm" className="ml-auto min-h-11" onClick={() => setDraft(data.defaults)}>
            {c.resetDefaults}
          </Button>
        )}
      </div>

      <ul className="grid gap-3 lg:grid-cols-2">
        <li>
          <RuleCard
            icon={<TrendingDown className="h-4 w-4" />}
            title={c.ratingDrop.title}
            sentence={c.ratingDrop.sentence(fmt1(draft.ratingDrop.minDrop), draft.ratingDrop.minSample)}
            enabled={draft.ratingDrop.enabled}
            onEnabled={(v) => set('ratingDrop', { enabled: v })}
            evaluation={evalOf('rating_drop')}
            valueText={(e) =>
              e.value == null
                ? c.ratingDrop.notEnough(fmtInt(e.sample))
                : c.ratingDrop.value(fmt1(e.detail.avgPrev7), fmt1(e.detail.avgLast7), fmt1(e.value))
            }
          >
            <Field kind="labelledby" label={c.ratingDrop.threshold}>
              {(p) => (
                <ChoiceChips
                  aria-labelledby={p['aria-labelledby'] as string}
                  size="sm"
                  options={[0.3, 0.5, 0.7, 1, 1.5].map((n) => ({ value: String(n), label: fmt1(n) }))}
                  value={String(draft.ratingDrop.minDrop)}
                  onChange={(v) => v && set('ratingDrop', { minDrop: Number(v) })}
                />
              )}
            </Field>
            <IntInput label={c.ratingDrop.minSample} value={draft.ratingDrop.minSample} min={1} max={500} onChange={(n) => set('ratingDrop', { minSample: n })} />
          </RuleCard>
        </li>
        <li>
          <RuleCard
            icon={<MessageSquareWarning className="h-4 w-4" />}
            title={c.complaintSpike.title}
            sentence={c.complaintSpike.sentence(draft.complaintSpike.windowHours, draft.complaintSpike.count)}
            enabled={draft.complaintSpike.enabled}
            onEnabled={(v) => set('complaintSpike', { enabled: v })}
            evaluation={evalOf('complaint_spike')}
            valueText={(e) => c.complaintSpike.value(fmtInt(e.value ?? 0))}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <IntInput label={c.complaintSpike.count} value={draft.complaintSpike.count} min={1} max={500} onChange={(n) => set('complaintSpike', { count: n })} />
              <IntInput label={c.complaintSpike.window} value={draft.complaintSpike.windowHours} min={1} max={168} onChange={(n) => set('complaintSpike', { windowHours: n })} />
            </div>
          </RuleCard>
        </li>
        <li>
          <RuleCard
            icon={<ShieldAlert className="h-4 w-4" />}
            title={c.urgentToxic.title}
            sentence={c.urgentToxic.sentence(Math.round(draft.urgentToxic.minUrgency * 100))}
            enabled={draft.urgentToxic.enabled}
            onEnabled={(v) => set('urgentToxic', { enabled: v })}
            evaluation={evalOf('urgent_toxic')}
            valueText={(e) => c.urgentToxic.value(fmtInt(e.value ?? 0), fmtInt(e.detail.toxic ?? 0))}
          >
            <Field kind="labelledby" label={c.urgentToxic.threshold} description={c.urgentToxic.thresholdHint}>
              {(p) => (
                <ChoiceChips
                  aria-labelledby={p['aria-labelledby'] as string}
                  size="sm"
                  options={[0.6, 0.7, 0.8, 0.9].map((n) => ({ value: String(n), label: c.urgentToxic.pct(Math.round(n * 100)) }))}
                  value={String(draft.urgentToxic.minUrgency)}
                  onChange={(v) => v && set('urgentToxic', { minUrgency: Number(v) })}
                />
              )}
            </Field>
          </RuleCard>
        </li>
        <li>
          <RuleCard
            icon={<Clock className="h-4 w-4" />}
            title={c.unanswered.title}
            sentence={c.unanswered.sentence(draft.unansweredNegative.slaHours, draft.unansweredNegative.count)}
            enabled={draft.unansweredNegative.enabled}
            onEnabled={(v) => set('unansweredNegative', { enabled: v })}
            evaluation={evalOf('unanswered_negative')}
            valueText={(e) => c.unanswered.value(fmtInt(e.value ?? 0))}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <IntInput label={c.unanswered.sla} value={draft.unansweredNegative.slaHours} min={1} max={336} onChange={(n) => set('unansweredNegative', { slaHours: n })} />
              <IntInput label={c.unanswered.count} value={draft.unansweredNegative.count} min={1} max={500} onChange={(n) => set('unansweredNegative', { count: n })} />
            </div>
          </RuleCard>
        </li>
      </ul>

      <SectionCard
        title={c.recentTitle}
        description={
          data.replyIncidentRules > 0
            ? c.recentReplyRules(fmtInt(data.replyIncidentRules))
            : c.recentHint
        }
        actions={
          <Button asChild variant="link" className="h-auto min-h-11 px-0">
            <Link href="/dealer/automation/replies">{copy.nav.replies}</Link>
          </Button>
        }
      >
        {data.recent.length === 0 ? (
          <p className="qx-small text-fg-muted">{c.recentEmpty}</p>
        ) : (
          <ul className="space-y-1">
            {data.recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="flex min-h-11 flex-wrap items-center gap-2 py-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <SeverityBadge severity={toSeverity(r.severity)} size="sm" />
                  <span className="min-w-0 flex-1 qx-body text-fg">{r.title}</span>
                  <span className="qx-caption text-fg-muted">
                    {c.status[r.status] ?? r.status} · {fmtRelative(r.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <DirtyBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() => {
          if (!parsed.success) {
            toast.error(parsed.error.issues[0]?.message ?? c.invalid);
            return;
          }
          save.mutate();
        }}
        onDiscard={() => setDraft(data.rules)}
        message={c.dirty}
      />
    </>
  );
}

function fmt1(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function RuleCard({
  icon,
  title,
  sentence,
  enabled,
  onEnabled,
  evaluation,
  valueText,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sentence: string;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  evaluation: RadarRuleEval | null;
  valueText: (e: RadarRuleEval) => string;
  children: React.ReactNode;
}) {
  const policy = useMotionPolicy();
  const c = useAutomationCopy().alerts;
  const id = useMemo(() => `rule-${title.replace(/\s+/g, '-')}`, [title]);
  const ratio = evaluation ? Math.max(0, Math.min(1, evaluation.ratio)) : 0;
  return (
    <article aria-labelledby={id} className={cn('flex h-full flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-4', !enabled && 'opacity-80')}>
      <header className="flex items-start gap-3">
        <span className="rounded-control bg-brand-subtle p-2 text-brand" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={id} className="qx-body font-semibold text-fg">
            {title}
          </h3>
          <p className="qx-small text-fg-muted">{sentence}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={c.ruleSwitch(title, enabled)} />
      </header>
      {enabled && <div className="space-y-3">{children}</div>}
      {evaluation && enabled && (
        <div className="mt-auto space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="qx-caption text-fg-muted">{valueText(evaluation)}</span>
            <span className={cn('rounded-chip px-2 py-0.5 qx-caption', LEVEL_CLS[evaluation.level])}>{c.level[evaluation.level]}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <Motion.div
              className={cn('h-full rounded-full', evaluation.level === 'alert' ? 'bg-danger' : evaluation.level === 'watch' ? 'bg-warning' : 'bg-success')}
              initial={false}
              animate={{ width: `${Math.round(ratio * 100)}%` }}
              transition={{ duration: policy.reduce ? 0 : DURATION.slow, ease: EASE.standard }}
            />
          </div>
        </div>
      )}
    </article>
  );
}

function IntInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Field label={label} description={`${min}–${max}`}>
      {(p) => (
        <Input
          {...p}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
            setText(t);
            if (t) onChange(Math.min(max, Math.max(min, Number(t))));
          }}
          onBlur={() => setText(String(value))}
          className="min-h-11 tabular-nums"
        />
      )}
    </Field>
  );
}
