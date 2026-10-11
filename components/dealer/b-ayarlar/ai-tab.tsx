'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bot, GraduationCap, Power, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile, StatusBadge } from '@/components/ds/data';
import { DirtyBar, Form, FormRootError, TextareaField, useZodForm } from '@/components/ds/form';
import { ConfirmAction, EmptyState, InlineError } from '@/components/states';
import { AI_CONTEXT_MAX, type AiSection, type DealerSettingsSnapshot } from '@/lib/dealer-settings/contract';
import { SETTINGS_KEY, errorText, fetchAi, retrainAi } from './api';
import { fmtDateTime } from './format';
import { useSettingsCopy } from './copy';
import { InstantSwitchRow } from './ui';
import { useAiPatch } from './use-ai-patch';

const contextSchemaFor = (maxMsg: string) =>
  z.object({
    customPrompt: z
      .string()
      .trim()
      .max(AI_CONTEXT_MAX, maxMsg)
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
  });
type ContextValues = z.input<ReturnType<typeof contextSchemaFor>>;

/**
 * AI — yalnız GERÇEKTEN uygulanan anahtarlar (denetim B3: 17 ayarın 14'ü hiçbir yerde
 * okunmuyordu; 9 "analiz modülü" ve aylık rapor kaldırıldı). Ana anahtar alt ayarları
 * sıfırlamaz, yalnız etkisiz kılar (B9). Okuyucu `lib/ai-policy` (fail-closed).
 */
export function AiTab({ section }: { section: AiSection }) {
  const queryClient = useQueryClient();
  const patch = useAiPatch();
  const s = section.settings;
  const locked = !section.moduleEnabled;
  const copy = useSettingsCopy();
  const c = copy.ai;
  const [refreshing, setRefreshing] = useState(false);

  const refreshStats = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchAi();
      // Yalnız istatistikler tazelenir; düzenlenmekte olan bağlam metnine dokunulmaz.
      queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) => (old ? { ...old, ai: { ...old.ai, stats: fresh.stats, moduleEnabled: fresh.moduleEnabled } } : old));
    } catch (e) {
      toast.error(errorText(e, c.refreshFailed));
    } finally {
      setRefreshing(false);
    }
  };

  const setMaster = async (next: boolean) => {
    try {
      await patch({ isEnabled: next });
      toast.success(next ? c.engineOn : c.engineOff);
    } catch (e) {
      toast.error(errorText(e, copy.common.saveFailed));
      throw e;
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {locked && (
        <InlineError variant="banner" tone="warning">
          {c.locked}
        </InlineError>
      )}

      <SectionCard
        title={c.engine}
        icon={<Bot className="h-5 w-5" aria-hidden />}
        description={c.engineHint}
        actions={<StatusBadge label={s.isEnabled && !locked ? c.on : c.off} tone={s.isEnabled && !locked ? 'success' : 'neutral'} />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-subtle p-4">
          <div className="min-w-0">
            <p className="qx-body font-medium text-fg">{s.isEnabled ? c.running : c.stopped}</p>
            <p className="qx-small text-fg-muted">
              {s.isEnabled
                ? c.runningHint
                : c.stoppedHint}
            </p>
          </div>
          {s.isEnabled ? (
            <ConfirmAction
              trigger={
                <Button type="button" variant="outline" disabled={locked}>
                  <Power className="h-4 w-4" aria-hidden />
                  {c.turnOff}
                </Button>
              }
              title={c.offTitle}
              description={c.offBody}
              impact={[
                { label: c.impactAnalysis, value: c.stops },
                { label: c.impactAlerts, value: c.stops },
                { label: c.impactAssistant, value: c.stops },
                { label: c.impactData, value: c.notSent },
              ]}
              tone="warning"
              confirmLabel={c.offConfirm}
              irreversibleNote={false}
              onConfirm={() => setMaster(false)}
            />
          ) : (
            <Button type="button" onClick={() => void setMaster(true).catch(() => undefined)} disabled={locked}>
              <Power className="h-4 w-4" aria-hidden />
              {c.turnOn}
            </Button>
          )}
        </div>
        <div className="mt-2 divide-y divide-subtle">
          <InstantSwitchRow
            icon={<Zap />}
            label={c.auto}
            description={c.autoHint}
            checked={s.autoAnalyze}
            muted={!s.isEnabled}
            disabled={locked}
            onSave={(v) => patch({ autoAnalyze: v })}
          />
        </div>
        {!s.isEnabled && (
          <p className="qx-caption mt-1 text-fg-muted">{c.keptNote}</p>
        )}
      </SectionCard>

      <UsageCard section={section} onRefresh={() => void refreshStats()} refreshing={refreshing} />

      <ContextCard initial={s.customPrompt} version={s.version} locked={locked} />

      <LearningCard section={section} locked={locked || !s.isEnabled} />

      <SectionCard title={c.automation} description={c.automationHint}>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild variant="outline">
            <Link href="/dealer/automation/replies">
              {c.replyRules}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dealer/settings?tab=notifications">
              {c.alertPrefs}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ───────────────────────────── Kullanım ─────────────────────────────

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(`${date}T12:00:00Z`));
}

function UsageCard({ section, onRefresh, refreshing }: { section: AiSection; onRefresh: () => void; refreshing: boolean }) {
  const st = section.stats;
  const max = Math.max(1, ...st.daily.map((d) => d.count));
  const total7 = st.daily.reduce((a, d) => a + d.count, 0);
  const c = useSettingsCopy().ai;

  return (
    <SectionCard
      title={c.usage}
      description={c.usageHint}
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          {c.refresh}
        </Button>
      }
    >
      <MetricGrid cols={4}>
        <MetricTile label={c.analyzed} metric={{ value: st.analyzedTotal }} size="compact" />
        <MetricTile label={c.last24} metric={{ value: st.analyzedLast24h }} size="compact" />
        <MetricTile
          label={c.pending}
          metric={{ value: st.pendingLast30d }}
          hint={st.pendingLast30d > 0 && !section.settings.isEnabled ? c.pendingOff : c.last30}
          size="compact"
        />
        <MetricTile label={c.calls} metric={{ value: st.usageLast7d }} hint={c.callsHint} size="compact" />
      </MetricGrid>

      <h3 className="qx-small mt-6 font-semibold text-fg" id="ai-daily-title">
        {c.dailyTitle}
      </h3>
      {total7 === 0 ? (
        <EmptyState
          compact
          icon={Sparkles}
          title={c.noAnalysis}
          description={section.settings.isEnabled ? c.noAnalysisOn : c.noAnalysisOff}
          headingLevel="p"
        />
      ) : (
        <figure aria-labelledby="ai-daily-title" className="mt-3">
          <div className="flex h-36 items-end gap-2" role="img" aria-label={c.chartAria(total7)}>
            {st.daily.map((d) => (
              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="qx-caption qx-num text-fg-muted">{d.count}</span>
                <div
                  className="w-full max-w-10 rounded-t-chip bg-brand transition-[height] duration-slow ease-standard motion-reduce:transition-none"
                  style={{ height: d.count > 0 ? `${Math.max(4, (d.count / max) * 100)}%` : '2px', opacity: d.count > 0 ? 1 : 0.35 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2" aria-hidden>
            {st.daily.map((d) => (
              <span key={d.date} className="qx-caption min-w-0 flex-1 truncate text-center text-fg-muted">
                {dayLabel(d.date, c.dateLocale)}
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>{c.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{c.day}</th>
                <th scope="col">{c.analysis}</th>
              </tr>
            </thead>
            <tbody>
              {st.daily.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </SectionCard>
  );
}

// ───────────────────────────── İşletme bağlamı ─────────────────────────────

function ContextCard({ initial, version, locked }: { initial: string | null; version: string; locked: boolean }) {
  const queryClient = useQueryClient();
  const patch = useAiPatch();
  const c = useSettingsCopy().ai;
  const contextSchema = useMemo(() => contextSchemaFor(c.maxChars(AI_CONTEXT_MAX)), [c]);
  const form = useZodForm(contextSchema, { defaultValues: { customPrompt: initial } });
  const baseRef = useRef(initial);

  useEffect(() => {
    if (initial === baseRef.current) return;
    baseRef.current = initial;
    if (!form.formState.isDirty) form.reset({ customPrompt: initial });
  }, [initial, version, form]);

  return (
    <SectionCard
      title={c.context}
      description={c.contextHint}
    >
      <Form
        form={form}
        onSubmit={async (v: ContextValues) => {
          const next = v.customPrompt && v.customPrompt.trim() ? v.customPrompt.trim() : null;
          await patch({ customPrompt: next });
          baseRef.current = next;
          toast.success(c.contextSaved);
        }}
        className="space-y-3"
      >
        <FormRootError />
        <TextareaField
          control={form.control}
          name="customPrompt"
          label={c.contextLabel}
          hideLabel
          rows={5}
          maxLength={AI_CONTEXT_MAX}
          placeholder={c.contextPlaceholder}
          optional
          emptyAsNull
          disabled={locked}
        />
        <p className="qx-caption text-fg-muted">
          {c.contextNoteBefore}
          <strong>{c.contextNoteStrong}</strong>
          {c.contextNoteAfter}
        </p>
        <DirtyBar
          bottomOffset="var(--qx-tabbar-h, 0px)"
          message={c.contextDirty}
          onReloadLatest={() => {
            const latest = queryClient.getQueryData<DealerSettingsSnapshot>(SETTINGS_KEY)?.ai.settings.customPrompt ?? null;
            baseRef.current = latest;
            form.reset({ customPrompt: latest });
          }}
        />
      </Form>
    </SectionCard>
  );
}

// ───────────────────────────── Öğrenme ─────────────────────────────

function LearningCard({ section, locked }: { section: AiSection; locked: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const copy = useSettingsCopy();
  const c = copy.ai;
  const l = section.stats.learning;

  const retrain = async () => {
    setBusy(true);
    try {
      const fresh = await retrainAi();
      queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) => (old ? { ...old, ai: fresh } : old));
      toast.success(c.learnSaved);
    } catch (e) {
      toast.error(errorText(e, c.learnFailed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={c.learning}
      icon={<GraduationCap className="h-5 w-5" aria-hidden />}
      description={c.learningHint}
      actions={l ? <StatusBadge label={copy.learningStatus[l.status] ?? l.status} tone={l.status === 'ready' ? 'success' : 'neutral'} size="sm" /> : null}
    >
      {!l ? (
        <EmptyState
          compact
          icon={GraduationCap}
          title={c.noLearning}
          description={c.noLearningHint}
          headingLevel="p"
        />
      ) : (
        <div className="space-y-4">
          <MetricGrid cols={3}>
            <MetricTile label={c.corrections} metric={{ value: l.correctionsTotal }} size="compact" />
            <MetricTile label={c.correctionsUsed} metric={{ value: l.correctionsUsed }} size="compact" />
            <MetricTile label={c.trainingCount} metric={{ value: l.trainingFeedbackCount }} size="compact" />
          </MetricGrid>
          <p className="qx-small text-fg-muted">{c.lastTrained(l.lastTrainedAt ? fmtDateTime(l.lastTrainedAt) : null)}</p>
          {l.retrain?.shouldRetrain && (
            <InlineError variant="banner" tone="info">
              {l.retrain.reason ?? c.retrainReason} {c.retrainCounts(l.retrain.newFeedbackCount, l.retrain.newCorrectionsCount)}
            </InlineError>
          )}
          <Button type="button" variant={l.retrain?.shouldRetrain ? 'default' : 'outline'} onClick={() => void retrain()} disabled={busy || locked}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
            {busy ? c.retraining : c.retrainNow}
          </Button>
          {locked && <p className="qx-caption text-fg-muted">{c.retrainLocked}</p>}
        </div>
      )}
    </SectionCard>
  );
}
