'use client';

import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Pause, Pencil, Play, Search, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChartDataTable, KeyValueList, Sparkline, StatusBadge } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError, QueryState, TONE_CALLOUT } from '@/components/states';
import { DIMENSION_LABEL, STATUS_LABEL, type AssignmentCheck, type ExperimentResults, type ExperimentRow } from '@/lib/admin-flags/contract';
import { cn } from '@/lib/utils';
import { actOnExperiment, checkAssignment, errorText, fcKeys, fetchResults } from './api';
import { STATUS_TONE, daysBetween, fmtAbs, fmtDay, fmtNum, fmtP, fmtPct, fmtSignedPct, fmtSignedPp } from './format';
import { ReasonDialog } from './reason-dialog';
import { ExperimentEditor } from './experiment-editor';
import { useSourceT } from '@/components/ds/page/source-dict';
import { FEATURE_LAB_DICT, useFeatureLabCopy } from './copy';

type Act = 'start' | 'pause' | 'resume' | 'complete' | 'delete';

const ACT_COPY: Record<Act, { title: string; label: string; desc: string; tone: 'brand' | 'warning' | 'danger' }> = {
  start: { title: 'Deney başlatılsın mı?', label: 'Başlat', desc: 'Varyant ucu bu andan itibaren kullanıcıları A/B’ye atar; sonuç penceresi şimdi başlar.', tone: 'brand' },
  pause: { title: 'Deney duraklatılsın mı?', label: 'Duraklat', desc: 'Herkes kontrol (A) varyantını görür, yeni gösterim kaydedilmez. Atamalar korunur.', tone: 'warning' },
  resume: { title: 'Deney sürdürülsün mü?', label: 'Sürdür', desc: 'Aynı kullanıcılar aynı varyanta düşmeye devam eder.', tone: 'brand' },
  complete: { title: 'Deney tamamlansın mı?', label: 'Tamamla', desc: 'Deney kapanır, herkes A’yı görür ve sonuç penceresi donar. Bu geri alınamaz.', tone: 'danger' },
  delete: { title: 'Taslak silinsin mi?', label: 'Taslağı sil', desc: 'Taslak hiç başlamadığı için verisi yok; kayıttan kaldırılır.', tone: 'danger' },
};

const VERDICT: Record<ExperimentResults['comparison']['verdict'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'info' }> = {
  insufficient: { label: 'Yetersiz örneklem — yorum yapmayın', tone: 'neutral' },
  not_significant: { label: 'Anlamlı fark yok', tone: 'info' },
  b_better: { label: 'B anlamlı biçimde daha iyi', tone: 'success' },
  a_better: { label: 'A (kontrol) anlamlı biçimde daha iyi', tone: 'warning' },
};

export function ExperimentDetail({ row: e, version }: { row: ExperimentRow; version: string | null }) {
  const fz = useFeatureLabCopy().fx;
  const L = useSourceT(FEATURE_LAB_DICT);
  const uy = useFeatureLabCopy().ui2;
  const ux = useFeatureLabCopy().ui;
  const fx = useFeatureLabCopy();
  const qc = useQueryClient();
  const [act, setAct] = useState<Act | null>(null);
  const [winner, setWinner] = useState<'A' | 'B' | 'none'>('none');
  const [editing, setEditing] = useState(false);
  const results = useQuery({
    queryKey: fcKeys.results(e.id),
    queryFn: ({ signal }) => fetchResults(e.id, signal),
    enabled: e.status !== 'draft',
    staleTime: 60_000,
  });
  const days = daysBetween(e.startedAt, e.endedAt);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: fcKeys.all });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={STATUS_TONE[e.status]} label={STATUS_LABEL[e.status]} />
          {days !== null && e.status !== 'draft' ? <span className="text-sm text-fg-muted">{fz.dayN(fmtNum(days))}</span> : null}
          {e.winner ? <StatusBadge tone="brand" label={`Kazanan: ${e.winner}`} /> : null}
          {e.legacy ? <StatusBadge tone="neutral" label={ux.eskiKayit} title={ux.eskiAdminInnovationDan} /> : null}
        </div>
        <h3 className="text-lg font-semibold text-fg">{e.name}</h3>
        {e.hypothesis ? <p className="text-sm text-fg-muted">Hipotez: {e.hypothesis}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {e.status === 'draft' ? (
            <Button className="min-h-11 sm:min-h-10" onClick={() => setAct('start')}>
              <Play className="h-4 w-4" aria-hidden />
              {ux.baslat}
            </Button>
          ) : null}
          {e.status === 'running' ? (
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setAct('pause')}>
              <Pause className="h-4 w-4" aria-hidden />
              Duraklat
            </Button>
          ) : null}
          {e.status === 'paused' ? (
            <Button className="min-h-11 sm:min-h-10" onClick={() => setAct('resume')}>
              <Play className="h-4 w-4" aria-hidden />
              {ux.surdur}
            </Button>
          ) : null}
          {e.status === 'running' || e.status === 'paused' ? (
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setAct('complete')}>
              <Square className="h-4 w-4" aria-hidden />
              {uy.tamamla}
            </Button>
          ) : null}
          {e.status !== 'completed' ? (
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              {ux.duzenle}
            </Button>
          ) : null}
          {e.status === 'draft' ? (
            <Button variant="outline" className="min-h-11 text-danger sm:min-h-10" onClick={() => setAct('delete')}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {ux.taslagiSil}
            </Button>
          ) : null}
        </div>
      </div>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: ux.anahtar, value: e.id, mono: true, copyValue: e.id },
          { label: ux.boyut, value: DIMENSION_LABEL[e.dimension] },
          { label: ux.aVaryantiKontrol, value: e.variantA },
          { label: ux.bVaryanti, value: e.variantB },
          { label: ux.trafik, value: `A %${100 - e.splitPercentB} · B %${e.splitPercentB}` },
          { label: ux.birincilMetrik, value: e.primaryMetric ?? ux.donusumOlayiOrani },
          { label: ux.baslangic, value: e.startedAt ? fmtAbs(e.startedAt) : '—' },
          { label: ux.bitis, value: e.endedAt ? fmtAbs(e.endedAt) : '—' },
          { label: ux.sahip, value: e.owner ?? '—' },
          { label: ux.kararNotu, value: e.decisionNote ?? '—', hidden: !e.decisionNote },
        ]}
      />

      <section className="space-y-3" aria-labelledby={`res-${e.id}`}>
        <h3 id={`res-${e.id}`} className="text-sm font-semibold text-fg">
          {ux.sonuc}
        </h3>
        {e.status === 'draft' ? (
          <p className="text-sm text-fg-muted">{fx.resultsAfterStart}</p>
        ) : (
          <QueryState query={results} skeleton="detail" onRetry={() => results.refetch()}>
            {(r) => <ResultsView r={r} />}
          </QueryState>
        )}
      </section>

      <AssignmentChecker id={e.id} />

      <section className="space-y-2 rounded-card border border-border p-3 text-xs text-fg-muted">
        <p className="font-medium text-fg">Entegrasyon</p>
        <p>
          {fz.variantLabel} <code className="font-mono">GET /api/customer/innovation/ab/variant?experimentId={e.id}</code> {fz.recordsImpression}{' '}
          <code className="font-mono">POST /api/customer/innovation/ab/event</code> {'{ experimentId, variant }'} {fz.runningOnly}
        </p>
      </section>

      {act ? (
        <ReasonDialog
          open
          onOpenChange={(v) => !v && setAct(null)}
          title={L(ACT_COPY[act].title)}
          description={L(ACT_COPY[act].desc)}
          tone={ACT_COPY[act].tone}
          confirmLabel={L(ACT_COPY[act].label)}
          requireReason={act !== 'delete'}
          confirmPhrase={act === 'complete' || act === 'delete' ? e.id : undefined}
          onConfirm={async (reason) => {
            if (act === 'delete') await actOnExperiment(e.id, { action: 'delete', baseVersion: version });
            else
              await actOnExperiment(e.id, {
                action: act,
                reason,
                baseVersion: version,
                ...(act === 'complete' ? { winner: winner === 'none' ? null : winner } : {}),
              });
            toast.success(fz.actDone(L(ACT_COPY[act].label)));
            await refresh();
          }}
        >
          {act === 'complete' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg" id={`win-${e.id}`}>
                Karar
              </p>
              <ChoiceChips<'A' | 'B' | 'none'>
                aria-labelledby={`win-${e.id}`}
                options={[
                  { value: 'none', label: ux.kazananYok },
                  { value: 'A', label: ux.aKazandi },
                  { value: 'B', label: ux.bKazandi },
                ]}
                value={winner}
                onChange={(v) => v && setWinner(v)}
              />
              <p className="text-xs text-fg-muted">{fx.winnerNote}</p>
            </div>
          ) : null}
        </ReasonDialog>
      ) : null}

      {editing ? (
        <ExperimentEditor
          mode="edit"
          lockVariants={e.status !== 'draft'}
          initial={{
            id: e.id,
            name: e.name,
            dimension: e.dimension,
            hypothesis: e.hypothesis ?? '',
            primaryMetric: e.primaryMetric ?? '',
            variantA: e.variantA,
            variantB: e.variantB,
            splitPercentB: String(e.splitPercentB),
          }}
          onClose={() => setEditing(false)}
          onSubmit={async (v) => {
            await actOnExperiment(e.id, {
              action: 'edit',
              name: v.name,
              dimension: v.dimension,
              hypothesis: v.hypothesis,
              primaryMetric: v.primaryMetric,
              variantA: v.variantA,
              variantB: v.variantB,
              splitPercentB: v.splitPercentB,
              baseVersion: version,
            });
            toast.success(ux.deneyGuncellendi);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** Güven aralığı çubuğu: 0–max ölçeğinde aralık + nokta tahmini (yalnız renge dayanmaz; metin yanında). */
function CiBar({ ci, rate, max, label }: { ci: [number, number] | null; rate: number | null; max: number; label: string }) {
  const fz = useFeatureLabCopy().fx;
  if (!ci || rate === null || max <= 0) return <span className="text-xs text-fg-muted">—</span>;
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className="relative h-3 w-full min-w-[6rem] rounded-full bg-surface-muted" role="img" aria-label={fz.ciAria(label, fmtPct(rate), fmtPct(ci[0]), fmtPct(ci[1]))}>
      <div className="absolute top-0 h-full rounded-full bg-brand-subtle ring-1 ring-inset ring-brand-border" style={{ left: pos(ci[0]), width: `calc(${pos(ci[1])} - ${pos(ci[0])})` }} />
      <div className="absolute top-[-2px] h-[16px] w-[3px] -translate-x-1/2 rounded bg-brand" style={{ left: pos(rate) }} />
    </div>
  );
}

function ResultsView({ r }: { r: ExperimentResults }) {
  const fz = useFeatureLabCopy().fx;
  const L = useSourceT(FEATURE_LAB_DICT);
  const uy = useFeatureLabCopy().ui2;
  const ux = useFeatureLabCopy().ui;
  const fx = useFeatureLabCopy();
  const [a, b] = r.variants;
  const totalImpr = a.impressions + b.impressions;
  const max = Math.max(a.ci?.[1] ?? 0, b.ci?.[1] ?? 0, 1);
  const v0 = VERDICT[r.comparison.verdict];
  const v = { ...v0, label: L(v0.label) };
  const daily = r.daily.slice(-30);

  if (totalImpr === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
        {ux.buPenceredeHicGosterim}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn('flex flex-col gap-1 rounded-card border px-3 py-2 text-sm', TONE_CALLOUT[v.tone === 'neutral' ? 'neutral' : v.tone])} role="status">
        <p className="flex items-center gap-2 font-medium">
          {r.comparison.verdict === 'insufficient' ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          {v.label}
        </p>
        <p className="text-fg-muted">
          Fark (B − A): {fmtSignedPp(r.comparison.diffPp)}
          {r.comparison.diffCi ? fz.ciShort(fmtSignedPp(r.comparison.diffCi[0]), fmtSignedPp(r.comparison.diffCi[1])) : ''} · {fz.relative} {fmtSignedPct(r.comparison.relativeLift)} · {fmtP(r.comparison.pValue)}
        </p>
        {r.comparison.verdict === 'insufficient' ? <p className="text-fg-muted">{fz.minSample(fmtNum(r.minSample))}</p> : null}
      </div>

      {r.srm.mismatch ? (
        <p role="alert" className={cn('rounded-card border px-3 py-2 text-sm', TONE_CALLOUT.danger)}>
          {fz.srm(fmtP(r.srm.pValue))}{' '}
          {ux.guvenmeyin}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">{fx.variantResults}</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Varyant
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {ux.gorenKullanici}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {ux.donusen}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {uy.oran}
              </th>
              <th scope="col" className="w-1/3 py-2 font-medium">
                {ux.t95GuvenAraligi}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.variants.map((x) => (
              <tr key={x.variant} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-fg">
                  {x.variant === 'A' ? 'A (kontrol)' : 'B'} <span className="text-xs font-normal text-fg-muted">· beklenen %{Math.round(x.expectedShare * 100)}</span>
                </th>
                <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(x.exposedUsers)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(x.convertedUsers)}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-medium">{fmtPct(x.rate)}</td>
                <td className="py-2">
                  <CiBar ci={x.ci} rate={x.rate} max={max} label={`Varyant ${x.variant}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-muted">
        {fz.rawEvents(fmtNum(a.impressions), fmtNum(b.impressions), fmtNum(a.conversions), fmtNum(b.conversions))}{' '}
        {fmtNum(a.anonymousImpressions + b.anonymousImpressions)} {fz.notInRates} {r.window.from ? fmtAbs(r.window.from) : ux.son90Gun} → {fmtAbs(r.window.to)}.
      </p>

      {daily.length > 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">{fz.dailyN(fmtNum(daily.length))}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-fg-muted">A</p>
              <Sparkline data={daily.map((d) => d.aImpr)} height={40} area zeroBased label={ux.aVaryantiGunlukGosterim} />
            </div>
            <div>
              <p className="text-xs text-fg-muted">B</p>
              <Sparkline data={daily.map((d) => d.bImpr)} height={40} area zeroBased tone="brand" label={ux.bVaryantiGunlukGosterim} />
            </div>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-fg-muted">{fx.showDaily}</summary>
            <ChartDataTable
              data={daily}
              caption={ux.gunlukGosterimVeDonusum}
              columns={[
                { key: 'day', label: ux.gun, format: (v) => fmtDay(String(v)) },
                { key: 'aImpr', label: ux.aGosterim, numeric: true },
                { key: 'bImpr', label: ux.bGosterim, numeric: true },
                { key: 'aConv', label: ux.aDonusum, numeric: true },
                { key: 'bConv', label: ux.bDonusum, numeric: true },
              ]}
            />
          </details>
        </div>
      ) : null}
    </div>
  );
}

function AssignmentChecker({ id }: { id: string }) {
  const uy = useFeatureLabCopy().ui2;
  const ux = useFeatureLabCopy().ui;
  const fx = useFeatureLabCopy();
  const inputId = useId();
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AssignmentCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="space-y-2" aria-labelledby={`${inputId}-h`}>
      <h3 id={`${inputId}-h`} className="text-sm font-semibold text-fg">
        {uy.atamaDenetleyicisi}
      </h3>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (subject.trim().length < 3 || busy) return;
          setBusy(true);
          setError(null);
          try {
            setRes(await checkAssignment(id, subject.trim()));
          } catch (e) {
            setRes(null);
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor={inputId}>{fx.userIdOrEmail}</Label>
          <Input id={inputId} value={subject} onChange={(e) => setSubject(e.target.value)} autoComplete="off" />
        </div>
        <Button type="submit" variant="outline" className="min-h-11 sm:min-h-10" disabled={busy || subject.trim().length < 3} aria-busy={busy}>
          <Search className="h-4 w-4" aria-hidden />
          Hangi varyant?
        </Button>
      </form>
      {error ? <InlineError>{error}</InlineError> : null}
      {res ? (
        <p className="text-sm text-fg" role="status">
          {res.label ?? res.resolvedUserId} → <strong>{res.variant}</strong> (kova {res.bucket}/100)
          {res.experimentActive ? '' : ux.deneySuAnCalismiyor}
        </p>
      ) : null}
    </section>
  );
}
