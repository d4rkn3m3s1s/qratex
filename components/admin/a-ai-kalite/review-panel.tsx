'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { m } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Loader2, RotateCcw, SkipForward, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceChips } from '@/components/ds/a11y';
import { KeyValueList, StatusBadge, Timeline, statusBadgeProps } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { fadeIn, useMotionPolicy } from '@/lib/motion';
import {
  VERDICTS,
  VERDICT_FIELDS,
  VERDICT_FIELD_LABEL,
  VERDICT_LABEL,
  intentLabel,
  scoreFromVerdicts,
  sentimentLabel,
  type SampleActionInput,
  type SampleDetail,
  type Verdict,
  type VerdictField,
} from '@/lib/ai-quality/contract';
import { QualityApiError, errorText, fetchSample, qualityKeys, sampleAction } from './api';
import { SAMPLE_STATUS, fmtDateTime, fmtDateTimeYear, scoreTone } from './format';
import { AdminAiKaliteText } from './copy';

const pct = (v: number | null | undefined) => (v == null ? '—' : `%${Math.round(v * 100)}`);

const HISTORY_LABEL: Record<string, string> = {
  'ai_quality.review': 'Değerlendirildi',
  'ai_quality.skip': 'Atlandı',
  'ai_quality.void': 'Geçersiz sayıldı',
  'ai_quality.reopen': 'Yeniden açıldı',
};

/** Her alan için AI'ın söylediği — inceleyici bunu metinle karşılaştırır. */
function AiValue({ field, d }: { field: VerdictField; d: SampleDetail }) {
  const f = d.feedbackDetail;
  switch (field) {
    case 'sentiment':
      return (
        <span>
          {sentimentLabel(d.feedback.sentiment)}
          {f.emotions.length ? <span className="text-fg-muted"> · {f.emotions.slice(0, 4).map((e) => e.label).join(', ')}</span> : null}
        </span>
      );
    case 'intent':
      return (
        <span>
          {intentLabel(d.feedback.intent)}
          {f.intentScore != null ? <span className="text-fg-muted"> · güven {pct(f.intentScore)}</span> : null}
        </span>
      );
    case 'themes': {
      const items = [...f.themes.map((t) => (t.subTheme ? `${t.theme} › ${t.subTheme}` : t.theme)), ...f.topics];
      return items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.slice(0, 12).map((t, i) => (
            <li key={`${t}-${i}`} className="rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 text-xs">
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-fg-muted"><AdminAiKaliteText k="noThemes" /></span>
      );
    }
    case 'urgency':
      return (
        <span>
          Aciliyet {pct(f.urgency)} · kayıp riski {pct(f.churnRisk)}
          {f.effortScore != null ? ` · çaba ${pct(f.effortScore)}` : ''}
        </span>
      );
    case 'action':
      return f.actions.length ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {f.actions.slice(0, 5).map((a, i) => (
            <li key={i}>
              {a.action}
              {a.priority ? <span className="text-fg-muted"> ({a.priority})</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-fg-muted"><AdminAiKaliteText k="noActions" /></span>
      );
  }
}

type Props = {
  id: string;
  /** Kayıttan sonra açılacak sonraki örnek (yoksa çekmece kapanır). */
  onDone: (nextAfterSave: boolean) => void;
};

export function ReviewPanel({ id, onDone }: Props) {
  const q = useQuery({ queryKey: qualityKeys.sample(id), queryFn: ({ signal }) => fetchSample(id, signal), staleTime: 5_000 });
  return (
    <QueryState query={q} skeleton="detail" onRetry={() => q.refetch()} errorKind={q.error instanceof QualityApiError && q.error.status === 404 ? 'notFound' : undefined}>
      {(d) => <ReviewForm key={`${d.id}:${d.status}:${d.reviewedAt ?? ''}`} d={d} onDone={onDone} />}
    </QueryState>
  );
}

function ReviewForm({ d, onDone }: { d: SampleDetail; onDone: Props['onDone'] }) {
  const qc = useQueryClient();
  const policy = useMotionPolicy();
  const uid = useId();
  const [verdicts, setVerdicts] = useState<Partial<Record<VerdictField, Verdict>>>(d.verdicts ?? {});
  const [corrections, setCorrections] = useState<Partial<Record<VerdictField, string>>>(d.corrections ?? {});
  const [notes, setNotes] = useState(d.notes ?? '');
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState<SampleActionInput['action'] | null>(null);

  const score = useMemo(() => scoreFromVerdicts(verdicts), [verdicts]);
  const complete = VERDICT_FIELDS.every((f) => verdicts[f]);
  const canReview = d.status !== 'void' && !d.feedback.deleted;
  const concurrency = { expectedStatus: d.status, expectedReviewedAt: d.reviewedAt };

  async function submit(input: SampleActionInput, next: boolean) {
    if (busy) return;
    setBusy(input.action);
    try {
      await sampleAction(d.id, input);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ai-quality', 'samples'] }),
        qc.invalidateQueries({ queryKey: qualityKeys.metrics() }),
        qc.invalidateQueries({ queryKey: qualityKeys.sample(d.id) }),
      ]);
      toast.success(input.action === 'review' ? `Kaydedildi · skor %${scoreFromVerdicts(verdicts) ?? 0}` : 'Örnek güncellendi.');
      onDone(next);
    } catch (e) {
      toast.error(errorText(e));
      if (e instanceof QualityApiError && e.status === 409) await qc.invalidateQueries({ queryKey: qualityKeys.sample(d.id) });
    } finally {
      setBusy(null);
    }
  }

  const save = () => {
    if (!complete || score === null) {
      toast.error('Her alan için bir karar seçin; en az biri "Değerlendirilemez" dışında olmalı.');
      return;
    }
    void submit(
      {
        action: 'review',
        verdicts: verdicts as Record<VerdictField, Verdict>,
        corrections: Object.fromEntries(Object.entries(corrections).filter(([, v]) => v && v.trim())) as Partial<Record<VerdictField, string>>,
        notes: notes.trim() || null,
        ...concurrency,
      },
      true
    );
  };

  // Ctrl/⌘ + Enter → Kaydet ve sonraki
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canReview) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fb = d.feedback;
  return (
    <m.div key={d.id} variants={policy.variants(fadeIn)} initial="hidden" animate="visible" className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge {...statusBadgeProps(SAMPLE_STATUS, d.status)} size="sm" />
        {d.accuracyScore != null ? <StatusBadge label={`Skor %${d.accuracyScore}`} tone={scoreTone(d.accuracyScore)} icon={null} size="sm" /> : null}
        {d.isDemo ? <StatusBadge label="Demo bayi" tone="info" icon={null} size="sm" /> : null}
        {fb.deleted ? <StatusBadge label="Yorum silinmiş" tone="danger" size="sm" /> : null}
      </div>

      <section aria-labelledby={`${uid}-text`} className="space-y-2">
        <h3 id={`${uid}-text`} className="text-sm font-semibold text-fg">
          Müşteri yorumu
        </h3>
        <p className="flex items-center gap-1 text-sm text-fg-muted">
          <Star className="h-4 w-4 fill-warning text-warning" aria-hidden />
          <span>{fb.rating} / 5 yıldız</span>
        </p>
        <blockquote className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-sm leading-relaxed text-fg">
          {d.feedbackDetail.text || <span className="text-fg-muted">Metin yok</span>}
        </blockquote>
        <p className="text-xs text-fg-muted"><AdminAiKaliteText k="maskedNote" /></p>
      </section>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: 'İşletme', value: fb.dealerName },
          { label: 'QR', value: fb.qrName },
          { label: 'Yorum tarihi', value: fmtDateTimeYear(fb.createdAt) },
          { label: 'Analiz zamanı', value: fmtDateTimeYear(d.feedbackDetail.aiProcessedAt) },
          { label: 'Model', value: fb.model ?? 'Bilinmiyor', mono: true },
          { label: 'Prompt sürümü', value: fb.version, mono: true },
        ]}
      />

      {canReview ? (
        <fieldset className="space-y-4" aria-describedby={`${uid}-help`}>
          <legend className="text-sm font-semibold text-fg"><AdminAiKaliteText k="fieldReview" /></legend>
          <p id={`${uid}-help`} className="text-xs text-fg-muted">
            Her alan için AI çıktısını yorumla karşılaştırın. Skor kararlardan hesaplanır: Doğru 1, Kısmen 0,5, Yanlış 0; "Değerlendirilemez" hesaba katılmaz.
          </p>
          {VERDICT_FIELDS.map((f) => (
            <div key={f} className="space-y-2 rounded-md border border-border p-3">
              <div className="space-y-1">
                <p id={`${uid}-${f}`} className="text-sm font-medium text-fg">
                  {VERDICT_FIELD_LABEL[f]}
                </p>
                <div className="text-sm text-fg">
                  <AiValue field={f} d={d} />
                </div>
              </div>
              <ChoiceChips<Verdict>
                aria-labelledby={`${uid}-${f}`}
                options={VERDICTS.map((v) => ({ value: v, label: VERDICT_LABEL[v] }))}
                value={verdicts[f] ?? null}
                onChange={(v) => setVerdicts((s) => ({ ...s, [f]: v ?? undefined }))}
                size="md"
              />
              {verdicts[f] === 'wrong' || verdicts[f] === 'partial' ? (
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-${f}-fix`} className="text-xs">
                    Doğrusu ne olmalıydı? (isteğe bağlı)
                  </Label>
                  <Input
                    id={`${uid}-${f}-fix`}
                    value={corrections[f] ?? ''}
                    maxLength={300}
                    onChange={(e) => setCorrections((s) => ({ ...s, [f]: e.target.value }))}
                    className="min-h-11"
                  />
                </div>
              ) : null}
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor={`${uid}-notes`}>Not</Label>
            <Textarea id={`${uid}-notes`} value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="Hata türü, ironi, eksik bağlam…" />
          </div>
          <p className="text-sm text-fg" aria-live="polite">
            Hesaplanan skor: <strong className="tabular-nums">{score == null ? '—' : `%${score}`}</strong>
            {!complete ? <span className="text-fg-muted"> · {VERDICT_FIELDS.filter((f) => !verdicts[f]).length} alan karar bekliyor</span> : null}
          </p>
        </fieldset>
      ) : (
        <p role="status" className="rounded-md border border-border bg-surface-muted p-3 text-sm text-fg-muted">
          {fb.deleted ? 'Bu yorum sonradan silindi; metni değerlendirmeye alınmaz.' : 'Bu örnek geçersiz sayıldı. Yeniden açarak kuyruğa döndürebilirsiniz.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {canReview ? (
          <Button onClick={save} disabled={!!busy || !complete} className="min-h-11" aria-keyshortcuts="Control+Enter Meta+Enter">
            {busy === 'review' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {d.status === 'reviewed' ? 'Değerlendirmeyi güncelle' : 'Kaydet ve sonraki'}
            <kbd className="ml-1 hidden rounded border border-border px-1 text-[10px] text-fg-muted sm:inline">Ctrl ↵</kbd>
          </Button>
        ) : null}
        {d.status === 'pending' ? (
          <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => submit({ action: 'skip', reason: null, ...concurrency }, true)}>
            <SkipForward className="h-4 w-4" aria-hidden />
            Atla
          </Button>
        ) : null}
        {d.status === 'skipped' || d.status === 'void' ? (
          <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => submit({ action: 'reopen', ...concurrency }, false)}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Kuyruğa geri al
          </Button>
        ) : null}
        {d.status !== 'void' ? (
          <Button variant="ghost" className="min-h-11 text-danger" disabled={!!busy} aria-expanded={voidOpen} onClick={() => setVoidOpen((o) => !o)}>
            <Ban className="h-4 w-4" aria-hidden />
            Geçersiz say
          </Button>
        ) : null}
      </div>
      {voidOpen ? (
        <div className="space-y-2 rounded-md border border-danger/40 p-3">
          <Label htmlFor={`${uid}-void`}><AdminAiKaliteText k="voidReason" /></Label>
          <Input id={`${uid}-void`} value={voidReason} maxLength={300} onChange={(e) => setVoidReason(e.target.value)} className="min-h-11" />
          <p className="text-xs text-fg-muted"><AdminAiKaliteText k="voidNote" /></p>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={voidReason.trim().length < 3 || !!busy}
            onClick={() => submit({ action: 'void', reason: voidReason.trim(), ...concurrency }, true)}
          >
            Geçersiz olarak işaretle
          </Button>
        </div>
      ) : null}

      {d.feedbackDetail.rawAnalysis ? (
        <details className="rounded-md border border-border">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-medium text-fg"><AdminAiKaliteText k="rawOutput" /></summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border p-3 font-mono text-xs text-fg-muted">{d.feedbackDetail.rawAnalysis}</pre>
        </details>
      ) : null}

      {d.history.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg"><AdminAiKaliteText k="history" /></h3>
          <Timeline
            events={d.history.map((h) => ({
              id: h.id,
              at: h.at,
              title: HISTORY_LABEL[h.action] ?? h.action,
              actor: h.actorName ?? undefined,
              description: [h.score != null ? `Skor %${h.score}` : null, h.note].filter(Boolean).join(' · ') || undefined,
              tone: h.action === 'ai_quality.void' ? 'danger' : h.action === 'ai_quality.review' ? 'success' : 'neutral',
            }))}
          />
        </section>
      ) : (
        <p className="text-xs text-fg-muted">Örnekleme: {fmtDateTime(d.createdAt)}</p>
      )}
    </m.div>
  );
}
