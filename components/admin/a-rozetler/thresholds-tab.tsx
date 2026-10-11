'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, Eye, History, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ds/page';
import { Timeline, type TimelineEvent } from '@/components/ds/data';
import { InlineError, QueryState } from '@/components/states';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import {
  THRESHOLD_LIMITS,
  type ThresholdCategoryRow,
  type ThresholdImpact,
  type ThresholdOverrides,
  type ThresholdsState,
} from '@/lib/admin-badges/contract';
import { BadgesApiError, badgeKeys, errorText, fetchThresholdHistory, fetchThresholds, previewThresholds, saveThresholds } from './api';
import { fmtAgo, fmtDateTime, fmtNumber } from './format';
import { useBadgesAdminCopy } from './copy';

type Draft = Record<string, { threshold: string; minReviewLength: string }>;

function toDraft(s: ThresholdsState): Draft {
  return Object.fromEntries(
    s.categories.map((c) => [
      c.key,
      {
        threshold: s.overrides[c.key]?.threshold != null ? String(s.overrides[c.key]!.threshold) : '',
        minReviewLength: s.overrides[c.key]?.minReviewLength != null ? String(s.overrides[c.key]!.minReviewLength) : '',
      },
    ])
  );
}

function fromOverrides(categories: ThresholdCategoryRow[], o: ThresholdOverrides): Draft {
  return Object.fromEntries(
    categories.map((c) => [c.key, { threshold: o[c.key]?.threshold != null ? String(o[c.key]!.threshold) : '', minReviewLength: o[c.key]?.minReviewLength != null ? String(o[c.key]!.minReviewLength) : '' }])
  );
}

/** Taslak → sunucuya gidecek override tablosu (boş = varsayılan; varsayılana eşit değer atılır). */
function toOverrides(categories: ThresholdCategoryRow[], d: Draft): ThresholdOverrides {
  const out: ThresholdOverrides = {};
  for (const c of categories) {
    const e = d[c.key];
    if (!e) continue;
    const entry: { threshold?: number; minReviewLength?: number } = {};
    if (e.threshold.trim() !== '') {
      const n = Number(e.threshold);
      if (n !== c.defaultThreshold) entry.threshold = n;
    }
    if (e.minReviewLength.trim() !== '') {
      const n = Number(e.minReviewLength);
      if (n !== c.defaultMinReviewLength) entry.minReviewLength = n;
    }
    if (Object.keys(entry).length) out[c.key] = entry;
  }
  return out;
}

function fieldError(raw: string, kind: 'threshold' | 'minReviewLength', m: { intRequired: string; rangeRequired: (a: number, b: number) => string }): string | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  const lim = THRESHOLD_LIMITS[kind];
  if (!Number.isInteger(n)) return m.intRequired;
  if (n < lim.min || n > lim.max) return m.rangeRequired(lim.min, lim.max);
  return null;
}

const stable = (o: ThresholdOverrides) =>
  JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]?.threshold ?? null, o[k]?.minReviewLength ?? null]));

export function ThresholdsTab({ initial }: { initial: ThresholdsState | null }) {
  const ux = useBadgesAdminCopy().ui;
  const q = useQuery({ queryKey: badgeKeys.thresholds(), queryFn: fetchThresholds, initialData: initial ?? undefined, staleTime: 0 });
  return (
    <div className="space-y-6 pt-4">
      <QueryState query={q} skeleton="form" error={{ title: ux.esiklerOkunamadiDuzenlemeKilitli }}>
        {(state) => <ThresholdsEditor state={state} />}
      </QueryState>
      <ThresholdHistory />
    </div>
  );
}

function ThresholdsEditor({ state }: { state: ThresholdsState }) {
  const fz = useBadgesAdminCopy().fx;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const qc = useQueryClient();
  const { reduce } = useMotionPolicy();
  const [draft, setDraft] = useState<Draft>(() => toDraft(state));
  const [revertOf, setRevertOf] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [conflict, setConflict] = useState(false);

  // Sunucu durumu değişince (kayıt / yenileme) taslağı ona eşitle.
  useEffect(() => {
    setDraft(toDraft(state));
    setRevertOf(null);
    setConflict(false);
  }, [state]);

  // Geçmişten "bu sürümü geri yükle" isteği.
  useEffect(() => {
    const onRevert = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; overrides: ThresholdOverrides }>).detail;
      setDraft(fromOverrides(state.categories, detail.overrides));
      setRevertOf(detail.id);
      setReviewOpen(true);
    };
    window.addEventListener('badges:thresholds-revert', onRevert);
    return () => window.removeEventListener('badges:thresholds-revert', onRevert);
  }, [state.categories]);

  const next = useMemo(() => toOverrides(state.categories, draft), [state.categories, draft]);
  const errors = useMemo(
    () =>
      Object.fromEntries(
        state.categories.map((c) => [c.key, { threshold: fieldError(draft[c.key]?.threshold ?? '', 'threshold', fz), minReviewLength: fieldError(draft[c.key]?.minReviewLength ?? '', 'minReviewLength', fz) }])
      ),
    [state.categories, draft]
  );
  const hasErrors = Object.values(errors).some((e) => e.threshold || e.minReviewLength);
  const dirty = stable(next) !== stable(state.overrides);
  const changedKeys = state.categories.filter((c) => stable({ x: next[c.key] ?? {} }) !== stable({ x: state.overrides[c.key] ?? {} })).map((c) => c.key);

  // Kaydedilmemiş değişiklik varken sayfadan ayrılma uyarısı (Bulgu 10).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (key: string, field: 'threshold' | 'minReviewLength', value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value.replace(/[^\d]/g, '').slice(0, 5) } }));

  return (
    <>
      <SectionCard
        title={ux.karakterKategoriEsikleri}
        description={
          <>
            {bx.thresholdsIntro} {bx.retroA} <strong>{bx.retroStrong}</strong> {bx.retroB}
          </>
        }
        actions={
          <span className="text-xs text-fg-muted">
            {state.lastChange ? fz.lastChange(state.lastChange.actor ?? fz.unknown, fmtAgo(state.lastChange.at)) : ux.henuzDegistirilmedi}
          </span>
        }
      >
        <ul className="divide-y divide-border">
          {state.categories.map((c) => (
            <CategoryRow
              key={c.key}
              c={c}
              draft={draft[c.key] ?? { threshold: '', minReviewLength: '' }}
              errors={errors[c.key]}
              changed={changedKeys.includes(c.key)}
              onChange={(f, v) => set(c.key, f, v)}
              onReset={() => setDraft((d) => ({ ...d, [c.key]: { threshold: '', minReviewLength: '' } }))}
            />
          ))}
        </ul>
      </SectionCard>

      <AnimatePresence>
        {dirty ? (
          <div className="sticky bottom-3 z-20">
            <m.div
              role="region"
              aria-label={ux.kaydedilmemisEsikDegisiklikleri}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: DURATION.base, ease: EASE.emphasized }}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3 shadow-lg"
            >
              <span className="text-sm font-medium text-fg">
                {fz.categoriesChanged(fmtNumber(changedKeys.length))}{revertOf ? ux.gecmistenGeriYukleme : ''}
              </span>
              {hasErrors ? <span className="text-sm text-danger">{bx.fixErrors}</span> : null}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => { setDraft(toDraft(state)); setRevertOf(null); }}>
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {ux.vazgec}
                </Button>
                <Button className="min-h-11 sm:min-h-10" disabled={hasErrors} onClick={() => setReviewOpen(true)}>
                  <Eye className="h-4 w-4" aria-hidden />
                  {ux.etkiyiGorVeYayinla}
                </Button>
              </div>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        state={state}
        next={next}
        conflict={conflict}
        onReload={async () => {
          await qc.invalidateQueries({ queryKey: badgeKeys.thresholds() });
          setReviewOpen(false);
        }}
        onPublish={async () => {
          try {
            const saved = await saveThresholds(next, state.version, revertOf ?? undefined);
            qc.setQueryData(badgeKeys.thresholds(), saved);
            await qc.invalidateQueries({ queryKey: ['admin-badges', 'thresholds', 'history'] });
            toast.success(ux.esiklerYayinlandi);
            setReviewOpen(false);
          } catch (e) {
            if (e instanceof BadgesApiError && e.status === 409) setConflict(true);
            throw e;
          }
        }}
      />
    </>
  );
}

function CategoryRow({
  c,
  draft,
  errors,
  changed,
  onChange,
  onReset,
}: {
  c: ThresholdCategoryRow;
  draft: { threshold: string; minReviewLength: string };
  errors: { threshold: string | null; minReviewLength: string | null };
  changed: boolean;
  onChange: (f: 'threshold' | 'minReviewLength', v: string) => void;
  onReset: () => void;
}) {
  const fz = useBadgesAdminCopy().fx;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const id = useId();
  const th = draft.threshold.trim() === '' ? c.defaultThreshold : Number(draft.threshold);
  const aggressive = Number.isFinite(th) && th < THRESHOLD_LIMITS.threshold.aggressiveBelow;
  const minLen = draft.minReviewLength.trim() === '' ? c.defaultMinReviewLength : Number(draft.minReviewLength);
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
      <div role="group" aria-labelledby={`${id}-name`} className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} />
        <div className="min-w-0">
          <p id={`${id}-name`} className="font-medium text-fg">
            <span aria-hidden>{c.emoji} </span>
            {c.name}
            {changed ? <span className="ml-2 rounded bg-brand-subtle px-1.5 py-0.5 text-xs text-brand">{bx.changed}</span> : null}
          </p>
          <p className="text-xs text-fg-muted">
            {fmtNumber(c.characterCount)} karakter · Etkin: {fmtNumber(c.effectiveThreshold)} yorum
            {c.effectiveMinReviewLength > 0 ? `, ≥ ${fmtNumber(c.effectiveMinReviewLength)} karakter` : ''}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-th`} className="text-sm font-medium text-fg">
          {ux.esikYorum}
        </label>
        <Input
          id={`${id}-th`}
          inputMode="numeric"
          value={draft.threshold}
          placeholder={String(c.defaultThreshold)}
          onChange={(e) => onChange('threshold', e.target.value)}
          aria-invalid={errors.threshold ? true : undefined}
          aria-describedby={`${id}-th-hint`}
          className="min-h-11 sm:min-h-10"
        />
        <p id={`${id}-th-hint`} className={errors.threshold ? 'text-xs text-danger' : aggressive ? 'text-xs text-warning' : 'text-xs text-fg-muted'} role={errors.threshold ? 'alert' : undefined}>
          {errors.threshold ??
            (aggressive
              ? fz.aggressive(th)
              : fz.defaultAllowed(c.defaultThreshold, THRESHOLD_LIMITS.threshold.min, THRESHOLD_LIMITS.threshold.max))}
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-len`} className="text-sm font-medium text-fg">
          Min. uzunluk (karakter)
        </label>
        <Input
          id={`${id}-len`}
          inputMode="numeric"
          value={draft.minReviewLength}
          placeholder={String(c.defaultMinReviewLength)}
          onChange={(e) => onChange('minReviewLength', e.target.value)}
          aria-invalid={errors.minReviewLength ? true : undefined}
          aria-describedby={`${id}-len-hint`}
          className="min-h-11 sm:min-h-10"
        />
        <p id={`${id}-len-hint`} className={errors.minReviewLength ? 'text-xs text-danger' : 'text-xs text-fg-muted'} role={errors.minReviewLength ? 'alert' : undefined}>
          {errors.minReviewLength ??
            (minLen > 0
              ? ux.uzunlukSartiIlerlemeHesabinda
              : fz.defaultLen(c.defaultMinReviewLength === 0 ? fz.noRequirement : String(c.defaultMinReviewLength)))}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 justify-self-start md:mt-6"
        onClick={onReset}
        disabled={draft.threshold === '' && draft.minReviewLength === ''}
        aria-label={fz.resetCategory(c.name)}
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
        {ux.varsayilan}
      </Button>
    </li>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  state,
  next,
  conflict,
  onPublish,
  onReload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ThresholdsState;
  next: ThresholdOverrides;
  conflict: boolean;
  onPublish: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const fz = useBadgesAdminCopy().fx;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const [impact, setImpact] = useState<ThresholdImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const ackId = useId();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setImpact(null);
    setError(null);
    setAck(false);
    setLoading(true);
    previewThresholds(next)
      .then((r) => alive && setImpact(r))
      .catch((e) => alive && setError(errorText(e, ux.etkiHesaplanamadi)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // Açılışta bir kez (taslak diyalog açıkken değişmez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const extraPoints = impact?.rows.reduce((s, r) => s + Math.max(0, r.extraPointsEstimate), 0) ?? 0;
  const regressed = impact?.rows.reduce((s, r) => s + r.regressed, 0) ?? 0;
  const needsAck = extraPoints > 0 || regressed > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{bx.reviewTitle}</DialogTitle>
          <DialogDescription>{bx.reviewDesc}</DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{bx.reviewCaption}</caption>
            <thead className="text-left text-xs text-fg-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">{bx.category}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{bx.threshold}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{bx.minLength}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{bx.ready}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{bx.newReadyRegressed}</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{bx.extraBadges}</th>
                <th scope="col" className="py-2 font-medium">{bx.distribution}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.categories.map((c) => {
                const r = impact?.rows.find((x) => x.key === c.key);
                const thNew = next[c.key]?.threshold ?? c.defaultThreshold;
                const lenNew = next[c.key]?.minReviewLength ?? c.defaultMinReviewLength;
                const thChanged = thNew !== c.effectiveThreshold;
                const lenChanged = lenNew !== c.effectiveMinReviewLength;
                return (
                  <tr key={c.key}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-fg">
                      <span aria-hidden>{c.emoji} </span>
                      {c.name}
                    </th>
                    <td className="py-2 pr-3 tabular-nums">{thChanged ? `${c.effectiveThreshold} → ${thNew}` : thNew}</td>
                    <td className="py-2 pr-3 tabular-nums">{lenChanged ? `${c.effectiveMinReviewLength} → ${lenNew}` : lenNew}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r ? `${fmtNumber(r.readyNow)} → ${fmtNumber(r.readyAfter)}` : loading ? '…' : '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r ? (
                        <>
                          <span className="text-success">+{fmtNumber(r.newlyReady)}</span> / <span className={r.regressed ? 'text-danger' : ''}>−{fmtNumber(r.regressed)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r ? `${r.extraReveals >= 0 ? '+' : ''}${fmtNumber(r.extraReveals)} · ${fmtNumber(r.extraPointsEstimate)}` : '—'}</td>
                    <td className="py-2">{r ? <Histogram values={r.histogram} accent={c.accent} label={fz.distributionOf(c.name)} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {impact ? (
          <p className="text-xs text-fg-muted">
            {fz.scanned(fmtNumber(impact.usersScanned), fmtDateTime(impact.computedAt))}
          </p>
        ) : null}
        {error ? <InlineError variant="banner">{error}</InlineError> : null}
        {conflict ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {ux.sizDuzenlerkenBaskaBir}
            <Button size="sm" variant="outline" className="ml-auto min-h-11 sm:min-h-9" onClick={onReload}>
              {ux.guncelHaliYukle}
            </Button>
          </div>
        ) : null}
        {needsAck ? (
          <label htmlFor={ackId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle p-3 text-sm">
            <Checkbox id={ackId} checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            <span>
              {fz.ackLead} {extraPoints > 0 ? fz.ackExtra(fmtNumber(extraPoints)) : ''}
              {extraPoints > 0 && regressed > 0 ? fz.ackAnd : ''}
              {regressed > 0 ? fz.ackRegressed(fmtNumber(regressed)) : ''} {fz.ackTail}
            </span>
          </label>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>
            {ux.duzenlemeyeDon}
          </Button>
          <Button
            className="min-h-11"
            disabled={busy || loading || !impact || conflict || (needsAck && !ack)}
            aria-busy={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onPublish();
              } catch (e) {
                setError(errorText(e, ux.esiklerKaydedilemedi));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? ux.yayinlaniyor : ux.yayinla}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Histogram({ values, accent, label }: { values: readonly number[]; accent: string; label: string }) {
  const ux = useBadgesAdminCopy().ui;
  const max = Math.max(1, ...values);
  const names = ['%0–25', '%25–50', '%50–75', '%75–100', ux.hazir];
  return (
    <div role="img" aria-label={`${label}: ${values.map((v, i) => `${names[i]} ${v}`).join(', ')}`} className="flex h-8 items-end gap-0.5">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-3 rounded-sm"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, backgroundColor: i === 4 ? 'var(--success, #16a34a)' : accent, opacity: v === 0 ? 0.25 : 1 }}
        />
      ))}
    </div>
  );
}

function ThresholdHistory() {
  const fz = useBadgesAdminCopy().fx;
  const uy = useBadgesAdminCopy().ui2;
  const ux = useBadgesAdminCopy().ui;
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: badgeKeys.thresholdHistory(page), queryFn: () => fetchThresholdHistory(page), staleTime: 15_000 });
  const fmt = (o: ThresholdOverrides) => {
    const parts = Object.entries(o).map(([k, v]) => `${k}: ${v.threshold != null ? fz.histThreshold(v.threshold) : ''}${v.threshold != null && v.minReviewLength != null ? ', ' : ''}${v.minReviewLength != null ? fz.histLength(v.minReviewLength) : ''}`);
    return parts.length ? parts.join(' · ') : ux.tumuVarsayilan;
  };
  return (
    <SectionCard title={ux.degisiklikGecmisi} description={ux.denetimKaydindanBirSurumu} icon={<History />}>
      <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: ux.henuzEsikDegisikligiYok, compact: true }}>
        {(d) => {
          const events: TimelineEvent[] = d.items.map((h) => ({
            id: h.id,
            at: h.at,
            actor: h.actor ?? fz.unknown,
            title: h.revertOf ? ux.gecmisSurumGeriYuklendi : ux.esiklerGuncellendi,
            description: fz.beforeAfter(fmt(h.before), fmt(h.after)),
            meta: (
              <Button
                variant="link"
                size="sm"
                className="h-auto min-h-11 px-0 sm:min-h-0"
                onClick={() => window.dispatchEvent(new CustomEvent('badges:thresholds-revert', { detail: { id: h.id, overrides: h.after } }))}
              >
                {ux.buSurumuGeriYukle}
              </Button>
            ),
          }));
          const pages = Math.max(1, Math.ceil(d.total / d.size));
          return (
            <div className="space-y-3">
              <Timeline events={events} timeStyle="datetime" dense ariaLabel={ux.esikDegisiklikGecmisi} />
              {pages > 1 ? (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {ux.onceki}
                  </Button>
                  <span className="text-sm text-fg-muted">
                    {page} / {pages}
                  </span>
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    {uy.sonraki}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}
