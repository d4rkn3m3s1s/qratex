'use client';

import * as React from 'react';
import { Activity, FlaskConical, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, SectionCard, SkeletonStats, classifyError, EmptyState } from '@/components/states';
import { MetricGrid, MetricTile, ChartDataTable, type MetricDelta } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { cn } from '@/lib/utils';
import type { PointsMatrix } from '@/lib/points-rules';
import { FLOW_WINDOWS, type EconomyFlow, type FlowKind, type Multipliers, type SimulationResult } from '@/lib/admin-economy/contract';
import { getFlow, simulate } from './api';
import { Callout, fmtInt, fmtPct } from './parts';
import { AdminEkonomiStudyosuText } from './copy';

type Async<T> = { status: 'loading' | 'ready' | 'error'; data?: T; error?: unknown };

function pctDelta(cur: number, prev: number): MetricDelta | null {
  if (prev <= 0) return null;
  return { value: ((cur - prev) / prev) * 100, kind: 'percent' };
}

const KIND_LABEL: Record<FlowKind, string> = {
  mint: 'Basım',
  sink: 'Harcama',
  transfer: 'Transfer (net-sıfır)',
  correction: 'Düzeltme',
  excluded: 'Hariç',
};

/**
 * Simülasyon sekmesi: gerçek PointsLedger akışı (kaynak/harcama dengesi, arz, enflasyon) +
 * kaydedilmemiş taslakların etkisi. Ağır sorgular yalnız bu sekme açılınca çalışır.
 */
export default function SimulationTab({
  draftMatrix,
  draftMultipliers,
  matrixDirty,
  multipliersDirty,
}: {
  draftMatrix: PointsMatrix | null;
  draftMultipliers: Multipliers | null;
  matrixDirty: boolean;
  multipliersDirty: boolean;
}) {
  const [days, setDays] = React.useState<number>(30);
  const [flow, setFlow] = React.useState<Async<EconomyFlow>>({ status: 'loading' });
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setFlow((f) => ({ status: 'loading', data: f.data }));
    getFlow(days, ctrl.signal)
      .then((data) => setFlow({ status: 'ready', data }))
      .catch((error) => {
        if ((error as { name?: string })?.name !== 'AbortError') setFlow({ status: 'error', error });
      });
    return () => ctrl.abort();
  }, [days, reloadKey]);

  const hasDraft = matrixDirty || multipliersDirty;
  const [sim, setSim] = React.useState<Async<SimulationResult> | null>(null);
  const runSim = React.useCallback(() => {
    setSim({ status: 'loading' });
    simulate({
      days,
      ...(matrixDirty && draftMatrix ? { matrix: draftMatrix } : {}),
      ...(multipliersDirty && draftMultipliers ? { multipliers: draftMultipliers } : {}),
    })
      .then((data) => setSim({ status: 'ready', data }))
      .catch((error) => setSim({ status: 'error', error }));
  }, [days, matrixDirty, multipliersDirty, draftMatrix, draftMultipliers]);
  const simStale = sim?.status === 'ready' && sim.data && sim.data.days !== days;

  const f = flow.data;
  const label = `önceki ${days} güne göre`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceChips
          aria-label="Dönem"
          size="sm"
          options={FLOW_WINDOWS.map((d) => ({ value: String(d), label: `Son ${d} gün` }))}
          value={String(days)}
          onChange={(v) => v && setDays(Number(v))}
        />
        {f && <p className="qx-caption text-fg-muted"><AdminEkonomiStudyosuText k="daysNote" /></p>}
      </div>

      {flow.status === 'error' && !f ? (
        <ErrorState kind={classifyError(flow.error)} title="Puan akışı yüklenemedi" onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !f ? (
        <div role="status" aria-busy="true">
          <span className="sr-only"><AdminEkonomiStudyosuText k="flowLoading" /></span>
          <SkeletonStats />
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity duration-fast', flow.status === 'loading' && 'opacity-60')} aria-busy={flow.status === 'loading'}>
          <MetricGrid cols={3}>
            <MetricTile label="Basılan puan" icon={<Activity className="h-4 w-4" />} tone="brand" animate metric={{ value: f.minted, unit: 'puan', compact: true, delta: pctDelta(f.minted, f.previous.minted), series: f.series.map((d) => d.mint) }} deltaLabel={label} sparklineLabel="Günlük basım" />
            <MetricTile label="Harcanan puan" icon={<Scale className="h-4 w-4" />} animate metric={{ value: f.spent, unit: 'puan', compact: true, delta: pctDelta(f.spent, f.previous.spent), series: f.series.map((d) => d.sink) }} deltaLabel={label} sparklineLabel="Günlük harcama" />
            <MetricTile label="Net akış" tone={f.net > 0 ? 'warning' : 'success'} animate metric={{ value: f.net, unit: 'puan', compact: true, delta: f.previous.net !== 0 ? { value: f.net - f.previous.net, kind: 'absolute', goodDirection: 'down' } : null }} deltaLabel={label} hint="basım − harcama" />
            <MetricTile label="Dolaşımdaki puan" metric={{ value: f.supply, unit: 'puan', compact: true }} hint="tüm bakiyelerin toplamı (demo hariç), şu an" />
            <MetricTile label="Dönem enflasyonu" tone={(f.inflationPct ?? 0) > 10 ? 'warning' : 'neutral'} metric={{ value: f.inflationPct, format: 'percent', fractionDigits: 1 }} hint="net akış ÷ dönem başı dolaşım" />
            <MetricTile label="Kullanım oranı" metric={{ value: f.redeemPct, format: 'percent', fractionDigits: 1 }} hint="harcanan ÷ basılan" />
          </MetricGrid>

          {(f.pending > 0 || f.voided > 0) && (
            <Callout tone="info">
              Dönemde {fmtInt(f.pending)} kredi incelemede bekliyor, {fmtInt(f.voided)} kredi (gölge yasaklı hesap) geçersiz sayıldı — toplamlara dahil değil.
            </Callout>
          )}

          <SectionCard title="Günlük basım ve harcama" description="Transfer (klan emaneti), düzeltme ve açılış bakiyesi hariç.">
            {f.minted === 0 && f.spent === 0 ? (
              <EmptyState compact title="Bu dönemde defter hareketi yok" description="Puan basan ya da harcayan bir işlem olunca burada görünür." />
            ) : (
              <>
                <DailyBars series={f.series} />
                <ChartDataTable
                  className="sr-only"
                  caption="Günlük basım ve harcama"
                  data={f.series}
                  columns={[
                    { key: 'day', label: 'Gün' },
                    { key: 'mint', label: 'Basım', numeric: true, format: (v) => fmtInt(v as number) },
                    { key: 'sink', label: 'Harcama', numeric: true, format: (v) => fmtInt(v as number) },
                  ]}
                />
              </>
            )}
          </SectionCard>

          <SectionCard title="Kaynak ve harcama dengesi" density="flush">
            {f.bySource.length === 0 ? (
              <EmptyState compact title="Kayıt yok" description="Bu dönemde defter satırı bulunmuyor." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left">
                  <caption className="sr-only"><AdminEkonomiStudyosuText k="flowBySource" /></caption>
                  <thead>
                    <tr className="qx-caption border-b border-subtle text-fg-muted">
                      <th scope="col" className="px-4 py-2 font-medium">Kaynak</th>
                      <th scope="col" className="px-4 py-2 font-medium"><AdminEkonomiStudyosuText k="type" /></th>
                      <th scope="col" className="px-4 py-2 text-right font-medium"><AdminEkonomiStudyosuText k="operation" /></th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Puan</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.bySource.map((r, i) => {
                      const denom = r.kind === 'sink' ? f.spent : f.minted;
                      return (
                        <tr key={`${r.kind}-${r.source}-${i}`} className="qx-small border-b border-subtle last:border-0">
                          <th scope="row" className="px-4 py-2.5 font-medium">{r.label}</th>
                          <td className={cn('px-4 py-2.5', r.kind === 'sink' ? 'text-success' : r.kind === 'mint' ? 'text-fg' : 'text-fg-muted')}>{KIND_LABEL[r.kind]}</td>
                          <td className="qx-num px-4 py-2.5 text-right">{fmtInt(r.count)}</td>
                          <td className="qx-num px-4 py-2.5 text-right">{r.kind === 'sink' ? '−' : '+'}{fmtInt(r.points)}</td>
                          <td className="qx-num px-4 py-2.5 text-right">{(r.kind === 'mint' || r.kind === 'sink') && denom > 0 ? fmtPct((r.points / denom) * 100) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      <SectionCard
        icon={<FlaskConical className="h-4 w-4" />}
        title="Taslak etkisi"
        description="Puan matrisi ve çarpan sekmelerindeki KAYDEDİLMEMİŞ değişiklikleri, seçili dönemin gerçek defter verisine uygular. Hiçbir şey yazmaz."
        actions={
          <Button type="button" size="sm" className="min-h-11 sm:min-h-9" onClick={runSim} disabled={sim?.status === 'loading'}>
            {sim?.status === 'loading' ? 'Hesaplanıyor…' : hasDraft ? 'Taslağı simüle et' : 'Kayıtlı kurallarla hesapla'}
          </Button>
        }
      >
        {!hasDraft && !sim && (
          <p className="qx-small text-fg-muted">
            Kaydedilmemiş taslak yok. Puan matrisi ya da çarpanlarda bir değer değiştirip buraya dönün; etki gerçek son {days} günle hesaplanır.
          </p>
        )}
        <div aria-live="polite">
          {sim?.status === 'error' && <ErrorState kind={classifyError(sim.error)} title="Simülasyon çalıştırılamadı" onRetry={runSim} headingLevel="p" />}
          {sim?.status === 'ready' && sim.data && <SimResult result={sim.data} stale={!!simStale} />}
        </div>
      </SectionCard>
    </div>
  );
}

function DailyBars({ series }: { series: EconomyFlow['series'] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.mint, d.sink)));
  return (
    <div aria-hidden className="flex h-40 items-end gap-px overflow-hidden">
      {series.map((d) => (
        <div key={d.day} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${d.day}: +${fmtInt(d.mint)} / −${fmtInt(d.sink)}`}>
          <span className="block w-1/2 rounded-t-sm bg-brand" style={{ height: `${(d.mint / max) * 100}%` }} />
          <span className="block w-1/2 rounded-t-sm bg-success" style={{ height: `${(d.sink / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function SimResult({ result, stale }: { result: SimulationResult; stale: boolean }) {
  const up = (result.deltaPct ?? 0) > 0;
  return (
    <div className="space-y-4">
      {stale && <Callout tone="warning">Dönem değişti — sonuç {result.days} günlük veriye göre. Yeniden hesaplayın.</Callout>}
      <MetricGrid cols={3}>
        <MetricTile label={`Gerçekleşen basım (${result.days} gün)`} metric={{ value: result.observedMint, unit: 'puan', compact: true }} />
        <MetricTile
          label="Taslakla tahmini basım"
          tone={up ? 'warning' : 'neutral'}
          animate
          metric={{ value: result.projectedMint, unit: 'puan', compact: true, delta: result.deltaPct != null ? { value: result.deltaPct, kind: 'percent', goodDirection: 'down', label: 'gerçekleşene göre' } : null }}
        />
        <MetricTile label="Tahmini net akış" metric={{ value: result.projectedNet, unit: 'puan', compact: true }} hint={`gerçekleşen ${fmtInt(result.observedNet)}`} />
      </MetricGrid>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left">
          <caption className="sr-only"><AdminEkonomiStudyosuText k="mintBySource" /></caption>
          <thead>
            <tr className="qx-caption border-b border-subtle text-fg-muted">
              <th scope="col" className="py-2 pr-4 font-medium">Kaynak</th>
              <th scope="col" className="px-4 py-2 text-right font-medium"><AdminEkonomiStudyosuText k="actual" /></th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Tahmin</th>
              <th scope="col" className="py-2 pl-4 font-medium">Dayanak</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.source} className="qx-small border-b border-subtle last:border-0">
                <th scope="row" className="py-2 pr-4 font-medium">{r.label}</th>
                <td className="qx-num px-4 py-2 text-right">{fmtInt(r.observed)}</td>
                <td className={cn('qx-num px-4 py-2 text-right', r.projected > r.observed ? 'text-warning' : r.projected < r.observed ? 'text-success' : '')}>
                  {r.factor === null ? 'ölçeklenemez' : fmtInt(r.projected)}
                </td>
                <td className="qx-caption py-2 pl-4 text-fg-muted">{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="qx-small rounded-control border border-subtle p-3">
        <summary className="min-h-11 cursor-pointer font-medium sm:min-h-0">Varsayımlar ({result.assumptions.length})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
