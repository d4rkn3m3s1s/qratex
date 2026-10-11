'use client';

import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, RotateCcw, Save, ShieldCheck, ShieldAlert, Swords, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkline, StatusBadge } from '@/components/ds/data';
import { SectionTabs } from '@/components/ds/page';
import { ConfirmAction, EmptyState, InlineError, QueryState, TONE_CALLOUT, type ImpactItem } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  FIELD_LABELS,
  FIELD_REACH,
  HISTORY_ACTION_LABELS,
  INTEGRITY_FLAG_LABELS,
  NUM_FIELDS,
  OVERRIDE_FIELDS,
  PORTFOLIO_LABELS,
  type GameDetail,
  type GameRow,
  type GamesOverview,
  type HistoryEntry,
  type NumField,
  type OverrideField,
} from '@/lib/admin-games/contract';
import { errorText, fetchDetail, fmt, fmtDateTime, fmtDay, gamesKeys, patchGame, resetGame } from './api';

type EditState = Record<OverrideField, string>;
type SheetTab = 'rules' | 'look' | 'metrics' | 'history';

function toEdit(g: GameRow): EditState {
  const out = {} as EditState;
  for (const k of OVERRIDE_FIELDS) {
    const v = g.override?.[k];
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

/** Yalnız değişen alanlar: '' → null (varsayılana dön), sayılar sayıya (admin B2). */
export function dirtyPatch(initial: EditState, edit: EditState): Partial<Record<OverrideField, string | number | null>> {
  const patch: Partial<Record<OverrideField, string | number | null>> = {};
  for (const k of OVERRIDE_FIELDS) {
    if (initial[k].trim() === edit[k].trim()) continue;
    const v = edit[k].trim();
    patch[k] = v === '' ? null : (NUM_FIELDS as readonly string[]).includes(k) ? Number(v) : v;
  }
  return patch;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function GameSheetBody({ gameType, row, overview }: { gameType: string; row: GameRow | null; overview: GamesOverview | null }) {
  const [tab, setTab] = useState<SheetTab>('rules');
  if (!row || !overview) {
    return <EmptyState title="Oyun bulunamadı" description="Bu anahtarla tanımlı bir oyun yok ya da liste henüz yüklenmedi." />;
  }
  return (
    <div className="space-y-4">
      <SheetSummary row={row} />
      <SectionTabs
        value={tab}
        onValueChange={(v) => setTab(v as SheetTab)}
        variant="pill"
        ariaLabel="Oyun ayrıntı bölümleri"
        tabs={[
          { value: 'rules', label: 'Ödül ve zorluk' },
          { value: 'look', label: 'Görünüm' },
          { value: 'metrics', label: 'Metrikler' },
          { value: 'history', label: 'Geçmiş' },
        ]}
      >
        {(active) =>
          active === 'metrics' ? (
            <MetricsTab gameType={gameType} row={row} />
          ) : active === 'history' ? (
            <HistoryTab gameType={gameType} row={row} />
          ) : (
            <EditTab key={`${row.gameType}:${row.updatedAt ?? 'none'}`} row={row} overview={overview} section={active === 'look' ? 'look' : 'rules'} />
          )
        }
      </SectionTabs>
    </div>
  );
}

function SheetSummary({ row }: { row: GameRow }) {
  const p = row.portfolio;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge size="sm" label={PORTFOLIO_LABELS[p.status]} tone={p.status === 'live' ? 'success' : p.status === 'building' ? 'info' : 'neutral'} />
        <StatusBadge size="sm" label={row.effective.enabled ? 'Açık' : 'Kapalı'} tone={row.effective.enabled ? 'success' : 'danger'} />
        {row.featured && <StatusBadge size="sm" label="Haftanın turnuvası" tone="warning" icon={Swords} />}
        {p.practice && <StatusBadge size="sm" label="Pratik modu var" tone="neutral" icon={null} />}
        <span className="font-mono text-[11px] text-fg-muted">{row.gameType}</span>
      </div>
      {(p.note || p.mergedInto) && (
        <p className="rounded-control border border-border bg-surface-muted px-3 py-2 text-xs text-fg-muted">
          {p.mergedInto && <>Yerine geçen: <strong className="text-fg">{p.mergedInto}</strong>. </>}
          {p.note}
          {row.hidden && ' Hub’da görünmez ve ödüllü deneme açılamaz.'}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── Düzenleme ───────────────────────────

function EditTab({ row, overview, section }: { row: GameRow; overview: GamesOverview; section: 'rules' | 'look' }) {
  const qc = useQueryClient();
  const initial = useMemo(() => toEdit(row), [row]);
  const [edit, setEdit] = useState<EditState>(initial);
  const [risk, setRisk] = useState<ImpactItem[] | null>(null);
  const limits = overview.limits;
  const changes = dirtyPatch(initial, edit);
  const dirty = Object.keys(changes).length > 0;
  const set = (k: OverrideField, v: string) => setEdit((e) => ({ ...e, [k]: v }));

  const save = useMutation({
    mutationFn: () => patchGame({ gameType: row.gameType, expectedUpdatedAt: row.updatedAt, ...changes }),
    onSuccess: () => {
      toast.success('Oyun ayarları kaydedildi — hemen yürürlükte');
      void qc.invalidateQueries({ queryKey: gamesKeys.all });
    },
    onError: (e) => {
      if ((e as { status?: number }).status === 409) void qc.invalidateQueries({ queryKey: gamesKeys.all });
    },
  });
  const reset = useMutation({
    mutationFn: () => resetGame(row.gameType),
    onSuccess: () => {
      toast.success(`${row.defaults.title} varsayılan ayarlara döndü`);
      void qc.invalidateQueries({ queryKey: gamesKeys.all });
    },
  });

  // İstemci tarafı ön doğrulama (sunucu yine otoriter).
  const numVal = (k: NumField): number => (edit[k].trim() === '' ? row.defaults[k] : Number(edit[k]));
  const errors: Partial<Record<OverrideField, string>> = {};
  for (const k of NUM_FIELDS) {
    if (edit[k].trim() === '') continue;
    const n = Number(edit[k]);
    const lim = limits[k];
    if (!Number.isInteger(n)) errors[k] = `${FIELD_LABELS[k]} tam sayı olmalı.`;
    else if (n < lim.min || n > lim.max) errors[k] = `${FIELD_LABELS[k]} ${lim.min}–${lim.max.toLocaleString('tr-TR')} aralığında olmalı.`;
  }
  if (!errors.rewardThreshold && !errors.maxScore && numVal('rewardThreshold') > numVal('maxScore')) {
    errors.rewardThreshold = 'Ödül eşiği maks. skoru aşamaz.';
  }
  if (edit.accent.trim() && !HEX.test(edit.accent.trim())) errors.accent = 'Renk #RRGGBB biçiminde olmalı (ör. #22d3ee).';
  if (edit.emoji.trim() && [...edit.emoji.trim()].length > 8) errors.emoji = 'Emoji tek bir simge olmalı.';
  const hasErrors = Object.keys(errors).length > 0;

  const nextPoints = numVal('rewardPoints');
  const nextMin = numVal('minDurationSec');
  const nextThr = numVal('rewardThreshold');

  const trySave = () => {
    const e = row.effective;
    const risky = nextPoints > row.defaults.rewardPoints * 2 || nextMin < e.minDurationSec || nextThr < e.rewardThreshold;
    if (!risky) return save.mutate();
    const monthlyDelta = (nextPoints - e.rewardPoints) * row.stats.rewarded30d;
    setRisk([
      { label: 'Ödül puanı', value: `${fmt(e.rewardPoints)} → ${fmt(nextPoints)}`, emphasis: nextPoints !== e.rewardPoints },
      { label: 'Ödül eşiği', value: `${fmt(e.rewardThreshold)} → ${fmt(nextThr)}`, emphasis: nextThr < e.rewardThreshold },
      { label: 'Min. süre', value: `${fmt(e.minDurationSec)} sn → ${fmt(nextMin)} sn`, emphasis: nextMin < e.minDurationSec },
      {
        label: `Son 30 günün ${fmt(row.stats.rewarded30d)} ödüllü denemesine göre aylık puan farkı`,
        value: `${monthlyDelta >= 0 ? '+' : ''}${fmt(monthlyDelta)} puan`,
        emphasis: true,
      },
    ]);
  };

  const rules: OverrideField[] = ['rewardPoints', 'rewardXp', 'rewardThreshold', 'maxScore', 'minDurationSec'];
  const look: OverrideField[] = ['title', 'emoji', 'description', 'accent'];
  const fields = section === 'rules' ? rules : look;
  const previewAccent = HEX.test(edit.accent.trim()) ? edit.accent.trim() : row.defaults.accent;

  return (
    <div className="space-y-4">
      {section === 'rules' && row.featured && (
        <p className={cn('rounded-control border px-3 py-2 text-xs', TONE_CALLOUT.warning)}>
          Bu oyun haftanın ödüllü turnuvasında. Eşik ve maks. skor değişikliği haftanın sıralamasını etkiler; hafta içinde dikkatli değiştirin.
        </p>
      )}
      <p className="text-xs text-fg-muted">
        Boş alan varsayılanı kullanır. Yalnız değiştirdiğiniz alanlar kaydedilir; aç/kapat anahtarı ayrı ve anında çalışır.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((k) =>
          k === 'accent' ? (
            <ColorField key={k} value={edit.accent} placeholder={row.defaults.accent} error={errors.accent} onChange={(v) => set('accent', v)} />
          ) : (
            <Field
              key={k}
              field={k}
              value={edit[k]}
              placeholder={String(row.defaults[k])}
              error={errors[k]}
              isNumber={(NUM_FIELDS as readonly string[]).includes(k)}
              min={(NUM_FIELDS as readonly string[]).includes(k) ? limits[k as NumField].min : undefined}
              max={(NUM_FIELDS as readonly string[]).includes(k) ? limits[k as NumField].max : undefined}
              maxLength={k === 'title' ? limits.titleMax : k === 'description' ? limits.descriptionMax : undefined}
              wide={k === 'description'}
              customized={row.customizedFields.includes(k)}
              onClear={() => set(k, '')}
              onChange={(v) => set(k, v)}
            />
          )
        )}
      </div>

      {section === 'rules' && (
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <Fact label="Sıralı deneme" value={`Günde ${overview.caps.attemptsPerDay}`} />
          <Fact label="Deneme penceresi" value={`${Math.round(row.effective.maxDurationSec / 60)} dk`} />
          <Fact label="Makullük tavanı" value={row.effective.maxScorePerSec == null ? 'Tanımsız' : `≤ ${row.effective.maxScorePerSec} skor/sn`} />
        </dl>
      )}

      {section === 'look' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-fg-muted">Hub kartı önizlemesi</p>
          <div
            className="flex items-start gap-3 rounded-card border-2 bg-surface p-4"
            style={{ borderColor: `${previewAccent}66`, backgroundImage: `linear-gradient(135deg, ${previewAccent}14, transparent 60%)` }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-2xl" style={{ backgroundColor: `${previewAccent}26` }} aria-hidden>
              {edit.emoji.trim() || row.defaults.emoji}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-fg">{edit.title.trim() || row.defaults.title}</p>
              <p className="mt-0.5 text-sm text-fg-muted">{edit.description.trim() || row.defaults.description}</p>
              <p className="mt-2 text-xs font-medium" style={{ color: previewAccent }}>
                +{nextPoints} puan · eşik {nextThr}
              </p>
            </div>
          </div>
        </div>
      )}

      {save.isError && <InlineError variant="banner">{errorText(save.error)}</InlineError>}
      {reset.isError && <InlineError variant="banner">{errorText(reset.error)}</InlineError>}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button className="min-h-11 sm:min-h-10" disabled={!dirty || hasErrors || save.isPending} loading={save.isPending} onClick={trySave}>
          {!save.isPending && <Save className="h-4 w-4" aria-hidden />}
          Kaydet
        </Button>
        <Button variant="ghost" className="min-h-11 sm:min-h-10" disabled={!dirty || save.isPending} onClick={() => setEdit(initial)}>
          Değişiklikleri geri al
        </Button>
        {row.customizedFields.length > 0 && (
          <ConfirmAction
            trigger={
              <Button variant="outline" className="ml-auto min-h-11 sm:min-h-10" disabled={reset.isPending}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Varsayılana sıfırla
              </Button>
            }
            tone="warning"
            title={`${row.effective.title} varsayılana dönsün mü?`}
            description="Tüm özelleştirmeler kaldırılır; açık/kapalı durumu korunur. İşlem denetim kaydına yazılır ve Geçmiş’ten geri alınabilir."
            impact={row.customizedFields.map((k) => ({
              label: FIELD_LABELS[k],
              value: `${String(row.effective[k])} → ${String(row.defaults[k])}`,
            }))}
            irreversibleNote={false}
            confirmLabel="Sıfırla"
            onConfirm={() => reset.mutateAsync()}
          />
        )}
      </div>

      <ConfirmAction
        open={!!risk}
        onOpenChange={(o) => !o && setRisk(null)}
        tone="warning"
        title="Ekonomiyi etkileyen değişiklik"
        description="Bu değişiklik oyunun bastığı puanı artırabilir ya da bot korumasını gevşetebilir. Etkisini kontrol edip onaylayın."
        impact={
          risk
            ? { items: risk, warning: `Oyun puanı kullanıcı başına yine günde ${fmt(overview.caps.daily)}, haftada ${fmt(overview.caps.weekly)} ile sınırlıdır.` }
            : undefined
        }
        irreversibleNote={false}
        confirmLabel="Onayla ve kaydet"
        onConfirm={async () => {
          await save.mutateAsync();
          setRisk(null);
        }}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-surface-muted px-2 py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
  onClear,
  placeholder,
  isNumber,
  min,
  max,
  maxLength,
  error,
  wide,
  customized,
}: {
  field: OverrideField;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  placeholder: string;
  isNumber: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  error?: string;
  wide?: boolean;
  customized: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const range = min != null && max != null ? `${min.toLocaleString('tr-TR')}–${max.toLocaleString('tr-TR')}` : null;
  const helper = [`Varsayılan: ${placeholder}`, range ? `Aralık: ${range}` : null, maxLength ? `${value.length}/${maxLength}` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={cn('space-y-1', wide && 'sm:col-span-2')}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">
          {FIELD_LABELS[field]}
          {customized && <span className="ml-1.5 text-[10px] font-semibold uppercase text-brand">özel</span>}
        </Label>
        {value.trim() !== '' && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-8 items-center gap-1 rounded-control px-1.5 text-[11px] text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${FIELD_LABELS[field]} alanını varsayılana döndür`}
          >
            <Undo2 className="h-3 w-3" aria-hidden /> Varsayılan
          </button>
        )}
      </div>
      <Input
        id={id}
        type={isNumber ? 'number' : 'text'}
        inputMode={isNumber ? 'numeric' : undefined}
        value={value}
        min={min}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={[hintId, error ? errId : null].filter(Boolean).join(' ')}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 sm:h-10"
      />
      <p id={hintId} className="text-[11px] text-fg-muted">
        {helper} · Yansır: {FIELD_REACH[field]}
      </p>
      {error && (
        <p id={errId} className="text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ColorField({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder: string; error?: string }) {
  const id = useId();
  const errId = `${id}-err`;
  const valid = value.trim() === '' || HEX.test(value.trim());
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {FIELD_LABELS.accent}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Renk seçici"
          value={valid && value.trim() ? value.trim() : placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-control border border-border bg-transparent p-0.5 sm:h-10"
        />
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 font-mono sm:h-10"
        />
      </div>
      <p className="text-[11px] text-fg-muted">Varsayılan: {placeholder} · Yansır: {FIELD_REACH.accent}</p>
      {error && (
        <p id={errId} className="text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── Metrikler ───────────────────────────

function MetricsTab({ gameType, row }: { gameType: string; row: GameRow }) {
  const q = useQuery({ queryKey: gamesKeys.detail(gameType), queryFn: () => fetchDetail(gameType), staleTime: 60_000 });
  const t = row.stats.today;
  const m = row.stats.last30d;
  return (
    <div className="space-y-5">
      <section aria-labelledby={`${gameType}-funnel`} className="space-y-2">
        <h3 id={`${gameType}-funnel`} className="text-sm font-semibold">Deneme hunisi</h3>
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Fact label="Bugün başlatılan" value={fmt(t.started)} />
          <Fact label="30g başlatılan" value={fmt(m.started)} />
          <Fact label="30g kazanılan" value={`${fmt(m.won)}${row.stats.winRate30d == null ? '' : ` (%${row.stats.winRate30d})`}`} />
          <Fact label="30g ödüllenen" value={`${fmt(row.stats.rewarded30d)}${row.stats.rewardRate30d == null ? '' : ` (%${row.stats.rewardRate30d})`}`} />
          <Fact label="30g kaybedilen" value={fmt(m.lost)} />
          <Fact label="Süren / terk" value={fmt(m.active)} />
          <Fact label="30g basılan puan" value={fmt(row.stats.pointsAwarded30d)} />
          <Fact label="30g sinyal" value={fmt(row.stats.flagged30d)} />
        </dl>
      </section>

      <QueryState query={q} skeleton="list">
        {(d) => (
          <div className="space-y-5">
            <TrendBlock d={d} />
            <HistogramBlock d={d} />
            <IntegrityBlock d={d} />
          </div>
        )}
      </QueryState>
    </div>
  );
}

function TrendBlock({ d }: { d: GameDetail }) {
  const started = d.trend.map((x) => x.started);
  const total = started.reduce((a, b) => a + b, 0);
  return (
    <section className="space-y-2" aria-labelledby={`${d.gameType}-trend`}>
      <h3 id={`${d.gameType}-trend`} className="text-sm font-semibold">Son 14 gün</h3>
      {total === 0 ? (
        <p className="text-sm text-fg-muted">Son 14 günde deneme yok.</p>
      ) : (
        <>
          <Sparkline
            data={started}
            height={48}
            area
            zeroBased
            showLast
            label={`Son 14 günde ${total} deneme; ilk gün ${started[0]}, son gün ${started[started.length - 1]}.`}
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-fg-muted">Günlük tablo</summary>
            <table className="mt-2 w-full">
              <thead className="text-left text-fg-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">Gün</th>
                  <th scope="col" className="py-1 text-right font-medium">Deneme</th>
                  <th scope="col" className="py-1 text-right font-medium">Kazanma</th>
                  <th scope="col" className="py-1 text-right font-medium">Puan</th>
                </tr>
              </thead>
              <tbody>
                {d.trend.map((r) => (
                  <tr key={r.day} className="border-t border-border tabular-nums">
                    <td className="py-1">{fmtDay(r.day)}</td>
                    <td className="py-1 text-right">{fmt(r.started)}</td>
                    <td className="py-1 text-right">{fmt(r.won)}</td>
                    <td className="py-1 text-right">{fmt(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

function HistogramBlock({ d }: { d: GameDetail }) {
  const h = d.histogram;
  const peak = Math.max(1, ...h.buckets.map((b) => b.count));
  return (
    <section className="space-y-2" aria-labelledby={`${d.gameType}-hist`}>
      <h3 id={`${d.gameType}-hist`} className="text-sm font-semibold">Skor dağılımı (30g, {fmt(h.total)} biten deneme)</h3>
      {h.total === 0 ? (
        <p className="text-sm text-fg-muted">Henüz biten deneme yok; eşik ayarı için veri birikmesini bekleyin.</p>
      ) : (
        <>
          <ul className="flex h-28 items-end gap-1" aria-label={`Skor dağılımı; ödül eşiği ${h.threshold}`}>
            {h.buckets.map((b) => {
              const above = b.from >= h.threshold;
              return (
                <li key={b.from} className="flex h-full flex-1 flex-col justify-end" title={`${b.from}–${b.to}: ${b.count}`}>
                  <span className="sr-only">
                    Skor {b.from}–{b.to}: {b.count} deneme{above ? ', eşik üstü' : ''}
                  </span>
                  <span
                    aria-hidden
                    className={cn('block w-full rounded-t-sm', above ? 'bg-success' : 'bg-fg-muted/40')}
                    style={{ height: `${Math.max(2, Math.round((b.count / peak) * 100))}%` }}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between text-[11px] tabular-nums text-fg-muted" aria-hidden>
            <span>0</span>
            <span>Eşik {h.threshold}</span>
            <span>{h.maxScore}</span>
          </div>
          <p className="text-xs text-fg-muted">Yeşil çubuklar ödül eşiği ve üstü. Eşiği bu dağılıma bakarak ayarlayın.</p>
        </>
      )}
    </section>
  );
}

function IntegrityBlock({ d }: { d: GameDetail }) {
  const i = d.integrity;
  return (
    <section className="space-y-2" aria-labelledby={`${d.gameType}-int`}>
      <h3 id={`${d.gameType}-int`} className="flex items-center gap-1.5 text-sm font-semibold">
        {i.total > 0 ? <ShieldAlert className="h-4 w-4 text-danger" aria-hidden /> : <ShieldCheck className="h-4 w-4 text-success" aria-hidden />}
        Bütünlük (30g)
      </h3>
      <p className="text-xs text-fg-muted">
        Doğrulama: {d.verifier.wired ? `sunucu doğrulayıcısı bağlı (${d.verifier.family})` : `yalnız ortak makullük kuralları (süre, skor/sn, tavan)${d.verifier.family ? `; hedef aile: ${d.verifier.family}` : ''}`}.
        İstemci skoru sunucu skorunu aşan biten deneme: <strong className="text-fg">{fmt(i.clientAboveServer30d)}</strong>.
      </p>
      {i.total === 0 ? (
        <p className="text-sm text-fg-muted">Son 30 günde işaretlenen deneme yok.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5">
            {i.byFlag.map((f) => (
              <li key={f.flag}>
                <StatusBadge size="sm" tone="danger" label={`${INTEGRITY_FLAG_LABELS[f.flag] ?? f.flag}: ${fmt(f.count)}`} />
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Son işaretlenen denemeler</caption>
              <thead className="text-left text-fg-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">Zaman</th>
                  <th scope="col" className="py-1 font-medium">Oyuncu</th>
                  <th scope="col" className="py-1 font-medium">Sinyal</th>
                  <th scope="col" className="py-1 text-right font-medium">İstemci → sunucu</th>
                </tr>
              </thead>
              <tbody>
                {i.recent.map((r, idx) => (
                  <tr key={`${r.at}-${idx}`} className="border-t border-border">
                    <td className="py-1 tabular-nums">{fmtDateTime(r.at)}</td>
                    <td className="py-1">{r.user}</td>
                    <td className="py-1">{r.flags.map((f) => INTEGRITY_FLAG_LABELS[f] ?? f).join(', ')}</td>
                    <td className="py-1 text-right tabular-nums">
                      {fmt(r.clientScore)} → {fmt(r.verifiedScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ─────────────────────────── Geçmiş ───────────────────────────

const REVERTABLE: ReadonlyArray<OverrideField | 'enabled'> = ['enabled', ...OVERRIDE_FIELDS];

function revertBody(e: HistoryEntry): Record<string, unknown> | null {
  if (!e.oldData) return null;
  const body: Record<string, unknown> = {};
  for (const k of REVERTABLE) {
    if (k in e.oldData && (e.newData == null || k in e.newData)) body[k] = e.oldData[k] ?? null;
  }
  return Object.keys(body).length ? body : null;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'varsayılan';
  if (typeof v === 'boolean') return v ? 'açık' : 'kapalı';
  return String(v);
}

function HistoryTab({ gameType, row }: { gameType: string; row: GameRow }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: gamesKeys.detail(gameType), queryFn: () => fetchDetail(gameType), staleTime: 60_000 });
  const revert = useMutation({
    mutationFn: (body: Record<string, unknown>) => patchGame({ gameType, expectedUpdatedAt: row.updatedAt, ...body }),
    onSuccess: () => {
      toast.success('Önceki sürüme dönüldü');
      void qc.invalidateQueries({ queryKey: gamesKeys.all });
    },
  });
  return (
    <QueryState
      query={q}
      skeleton="list"
      isEmpty={(d) => d.history.length === 0}
      empty={{ title: 'Değişiklik kaydı yok', description: 'Bu oyunun ayarları hiç değiştirilmemiş.', icon: History }}
    >
      {(d) => (
        <ol className="space-y-3">
          {revert.isError && <InlineError variant="banner">{errorText(revert.error)}</InlineError>}
          {d.history.map((e) => {
            const keys = Object.keys(e.newData ?? {}).filter((k) => k !== 'reason');
            const body = revertBody(e);
            return (
              <li key={e.id} className="rounded-control border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{HISTORY_ACTION_LABELS[e.action] ?? e.action}</p>
                  <p className="text-xs tabular-nums text-fg-muted">
                    {fmtDateTime(e.at)}
                    {e.actor ? ` · ${e.actor}` : ''}
                  </p>
                </div>
                {e.reason && <p className="mt-1 text-xs text-fg-muted">Gerekçe: {e.reason}</p>}
                <ul className="mt-2 space-y-0.5 text-xs">
                  {keys.map((k) => (
                    <li key={k}>
                      <span className="text-fg-muted">{FIELD_LABELS[k as OverrideField] ?? k}:</span>{' '}
                      <span className="tabular-nums">
                        {e.oldData ? show(e.oldData[k]) : '—'} → {show(e.newData?.[k])}
                      </span>
                    </li>
                  ))}
                </ul>
                {body && (
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="ghost" className="mt-2 min-h-11 sm:min-h-9" disabled={revert.isPending}>
                        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Bu değişikliği geri al
                      </Button>
                    }
                    tone="warning"
                    title="Önceki değerlere dönülsün mü?"
                    description="Bu kayıttaki alanlar değişiklikten önceki değerlerine döner. Geri alma da denetim kaydına yazılır."
                    impact={Object.entries(body).map(([k, v]) => ({
                      label: FIELD_LABELS[k as OverrideField] ?? k,
                      value: `→ ${show(v)}`,
                    }))}
                    irreversibleNote={false}
                    confirmLabel="Geri al"
                    onConfirm={() => revert.mutateAsync(body)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </QueryState>
  );
}
