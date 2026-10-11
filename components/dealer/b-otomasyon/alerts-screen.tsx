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
import { useMotionPolicy } from '@/lib/motion';
import { alertRulesSchema } from '@/lib/dealer-automation/alert-rules';
import type { RadarLevel, RadarRuleEval, RadarRuleKey, RadarRules } from '@/lib/dealer-queues/radar-rules';
import { AUTOMATION_KEYS, type AlertsOverviewDto, type AlertsStatusDto } from '@/lib/dealer-automation/types';
import { errorText, fetchAlerts, fmtInt, fmtRelative, previewAlerts, saveAlerts } from './api';
import { AutomationNav } from './automation-nav';

const LEVEL_TEXT: Record<RadarLevel, { label: string; cls: string }> = {
  normal: { label: 'Normal', cls: 'bg-success-subtle text-fg' },
  watch: { label: 'İzlemede', cls: 'bg-warning-subtle text-fg' },
  alert: { label: 'Eşik aşıldı', cls: 'bg-danger-subtle text-fg' },
};

const STATUS_TR: Record<string, string> = { open: 'Açık', assigned: 'Atandı', in_progress: 'Üzerinde çalışılıyor', resolved: 'Çözüldü' };

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
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Otomasyon"
          title="Uyarı kuralları"
          description="Kriz radarı bu eşikler aşıldığında Gelen Kutusu › Vakalar'da sistem vakası açar ve size bildirir. Aynı türde açık vaka varken yenisi açılmaz."
          icon={<BellRing className="h-5 w-5" aria-hidden />}
          meta={<AutomationNav />}
          actions={
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/dealer/inbox/incidents">
                <Siren className="mr-2 h-4 w-4" aria-hidden />
                Vakalar
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
      toast.success('Uyarı eşikleri kaydedildi.');
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
          <span className={cn('rounded-chip px-3 py-1 text-sm font-semibold', LEVEL_TEXT[status.level].cls)}>
            {dirty ? 'Bu eşiklerle: ' : 'Şu an: '}
            {LEVEL_TEXT[status.level].label}
          </span>
        ) : (
          <span className="qx-small text-fg-muted">{dirty ? (preview.isError ? 'Önizleme hesaplanamadı.' : 'Hesaplanıyor…') : 'Canlı durum hesaplanamadı.'}</span>
        )}
        <span className="qx-caption text-fg-muted">
          Son otomatik tarama: {fmtRelative(data.lastScanAt)} · eşikler {data.updatedAt ? `${fmtRelative(data.updatedAt)} güncellendi` : 'varsayılan'}
        </span>
        {!isDefault && (
          <Button variant="ghost" size="sm" className="ml-auto min-h-11" onClick={() => setDraft(data.defaults)}>
            Varsayılana dön
          </Button>
        )}
      </div>

      <ul className="grid gap-3 lg:grid-cols-2">
        <li>
          <RuleCard
            icon={<TrendingDown className="h-4 w-4" />}
            title="Puan düşüşü"
            sentence={`Son 7 günün ortalaması önceki 7 güne göre ${fmt1(draft.ratingDrop.minDrop)} puan ya da daha fazla düşerse (her iki haftada en az ${draft.ratingDrop.minSample} yorum varsa).`}
            enabled={draft.ratingDrop.enabled}
            onEnabled={(v) => set('ratingDrop', { enabled: v })}
            evaluation={evalOf('rating_drop')}
            valueText={(e) =>
              e.value == null
                ? `Yeterli yorum yok (son 7 gün: ${fmtInt(e.sample)})`
                : `Ortalama ${fmt1(e.detail.avgPrev7)} → ${fmt1(e.detail.avgLast7)} (düşüş ${fmt1(e.value)})`
            }
          >
            <Field kind="labelledby" label="Düşüş eşiği (puan)">
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
            <IntInput label="En az yorum (hafta başına)" value={draft.ratingDrop.minSample} min={1} max={500} onChange={(n) => set('ratingDrop', { minSample: n })} />
          </RuleCard>
        </li>
        <li>
          <RuleCard
            icon={<MessageSquareWarning className="h-4 w-4" />}
            title="Şikâyet artışı"
            sentence={`Son ${draft.complaintSpike.windowHours} saatte ${draft.complaintSpike.count} ya da daha fazla olumsuz yorum (2 yıldız ve altı ya da olumsuz duygu) gelirse.`}
            enabled={draft.complaintSpike.enabled}
            onEnabled={(v) => set('complaintSpike', { enabled: v })}
            evaluation={evalOf('complaint_spike')}
            valueText={(e) => `Pencerede ${fmtInt(e.value ?? 0)} olumsuz yorum`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <IntInput label="Olumsuz yorum sayısı" value={draft.complaintSpike.count} min={1} max={500} onChange={(n) => set('complaintSpike', { count: n })} />
              <IntInput label="Zaman penceresi (saat)" value={draft.complaintSpike.windowHours} min={1} max={168} onChange={(n) => set('complaintSpike', { windowHours: n })} />
            </div>
          </RuleCard>
        </li>
        <li>
          <RuleCard
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Acil ya da uygunsuz yorum"
            sentence={`Son 24 saatte AI'ın aciliyetini %${Math.round(draft.urgentToxic.minUrgency * 100)} ve üstü bulduğu ya da uygunsuz işaretlediği tek bir yorum bile gelirse.`}
            enabled={draft.urgentToxic.enabled}
            onEnabled={(v) => set('urgentToxic', { enabled: v })}
            evaluation={evalOf('urgent_toxic')}
            valueText={(e) => `Son 24 saatte ${fmtInt(e.value ?? 0)} yorum (${fmtInt(e.detail.toxic ?? 0)} uygunsuz)`}
          >
            <Field kind="labelledby" label="Aciliyet eşiği" description="AI analizi gerekir; AI kapalıysa yalnız uygunsuz içerik sayılır.">
              {(p) => (
                <ChoiceChips
                  aria-labelledby={p['aria-labelledby'] as string}
                  size="sm"
                  options={[0.6, 0.7, 0.8, 0.9].map((n) => ({ value: String(n), label: `%${Math.round(n * 100)}+` }))}
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
            title="Yanıtsız olumsuz yorum"
            sentence={`${draft.unansweredNegative.slaHours} saattir yanıtlanmamış ${draft.unansweredNegative.count} ya da daha fazla olumsuz yorum varsa radar “izlemede”ye geçer. Bu kural vaka açmaz; Gelen Kutusu'nda SLA rozetini besler.`}
            enabled={draft.unansweredNegative.enabled}
            onEnabled={(v) => set('unansweredNegative', { enabled: v })}
            evaluation={evalOf('unanswered_negative')}
            valueText={(e) => `${fmtInt(e.value ?? 0)} yanıtsız olumsuz yorum`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <IntInput label="Yanıt süresi (saat)" value={draft.unansweredNegative.slaHours} min={1} max={336} onChange={(n) => set('unansweredNegative', { slaHours: n })} />
              <IntInput label="Yorum sayısı" value={draft.unansweredNegative.count} min={1} max={500} onChange={(n) => set('unansweredNegative', { count: n })} />
            </div>
          </RuleCard>
        </li>
      </ul>

      <SectionCard
        title="Son radar vakaları"
        description={
          data.replyIncidentRules > 0
            ? `Ayrıca ${fmtInt(data.replyIncidentRules)} otomatik yanıt kuralınız tek tek yorumlar için vaka açıyor.`
            : 'Tek bir yoruma göre vaka açmak için Otomatik yanıtlar’da “Vaka aç” eylemli kural kurun.'
        }
        actions={
          <Button asChild variant="link" className="h-auto min-h-11 px-0">
            <Link href="/dealer/automation/replies">Otomatik yanıtlar</Link>
          </Button>
        }
      >
        {data.recent.length === 0 ? (
          <p className="qx-small text-fg-muted">Radar henüz vaka açmadı.</p>
        ) : (
          <ul className="space-y-1">
            {data.recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="flex min-h-11 flex-wrap items-center gap-2 py-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <SeverityBadge severity={toSeverity(r.severity)} size="sm" />
                  <span className="min-w-0 flex-1 text-sm text-fg">{r.title}</span>
                  <span className="qx-caption text-fg-muted">
                    {STATUS_TR[r.status] ?? r.status} · {fmtRelative(r.createdAt)}
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
            toast.error(parsed.error.issues[0]?.message ?? 'Bazı değerler geçersiz.');
            return;
          }
          save.mutate();
        }}
        onDiscard={() => setDraft(data.rules)}
        message="Kaydedilmemiş eşik değişiklikleri var"
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
  const id = useMemo(() => `rule-${title.replace(/\s+/g, '-')}`, [title]);
  const ratio = evaluation ? Math.max(0, Math.min(1, evaluation.ratio)) : 0;
  return (
    <article aria-labelledby={id} className={cn('flex h-full flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-4', !enabled && 'opacity-80')}>
      <header className="flex items-start gap-3">
        <span className="rounded-control bg-brand-subtle p-2 text-brand" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={id} className="text-sm font-semibold text-fg">
            {title}
          </h3>
          <p className="qx-small text-fg-muted">{sentence}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={`${title} kuralı ${enabled ? 'açık' : 'kapalı'}`} />
      </header>
      {enabled && <div className="space-y-3">{children}</div>}
      {evaluation && enabled && (
        <div className="mt-auto space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="qx-caption text-fg-muted">{valueText(evaluation)}</span>
            <span className={cn('rounded-chip px-2 py-0.5 qx-caption', LEVEL_TEXT[evaluation.level].cls)}>{LEVEL_TEXT[evaluation.level].label}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <Motion.div
              className={cn('h-full rounded-full', evaluation.level === 'alert' ? 'bg-danger' : evaluation.level === 'watch' ? 'bg-warning' : 'bg-success')}
              initial={false}
              animate={{ width: `${Math.round(ratio * 100)}%` }}
              transition={{ duration: policy.reduce ? 0 : 0.35, ease: 'easeOut' }}
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
