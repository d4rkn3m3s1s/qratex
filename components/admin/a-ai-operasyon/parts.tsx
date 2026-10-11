'use client';

import type { ReactNode } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotionPref } from '@/lib/motion';
import { StatusBadge } from '@/components/ds/data';
import { TONE_CHIP, TONE_TEXT, type Tone } from '@/components/states/tone';
import { MODEL_KIND_LABEL, type Dist, type ModelKind } from '@/lib/admin-ai-ops/contract';

// ───────────────────────────── Biçimleyiciler ─────────────────────────────

const NF = new Intl.NumberFormat('tr-TR');
const NF1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const NFC = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
const DTF = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const TF = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const fmtInt = (v: number | null | undefined) => (v == null ? '—' : NF.format(v));
export const fmtCompact = (v: number | null | undefined) => (v == null ? '—' : NFC.format(v));
export const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `%${NF1.format(v)}`);
export const fmtMs = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${NF1.format(v / 1000)} sn` : `${NF.format(Math.round(v))} ms`);
export const fmtDateTime = (iso: string | null | undefined) => (iso ? DTF.format(new Date(iso)) : '—');
export const fmtTime = (iso: string | null | undefined) => (iso ? TF.format(new Date(iso)) : '—');

/** "3 dk önce" — İstanbul saatine bağlı değil, mutlak süre. */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn önce`;
  const m_ = Math.round(s / 60);
  if (m_ < 60) return `${m_} dk önce`;
  const h = Math.round(m_ / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

/** Bucket anahtarını eksen etiketine çevirir ("2026-10-08" → "08 Eki", "…T14:00" → "14:00"). */
export function bucketLabel(key: string): string {
  if (key.includes('T')) return key.slice(11, 16);
  const [y, mo, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, mo - 1, d));
}

// ───────────────────────────── Yüzde çubuğu ─────────────────────────────

/** Erişilebilir ilerleme/yüzde çubuğu (role=progressbar). Azaltılmış harekette animasyonsuz. */
export function Meter({ value, max = 100, tone = 'brand', label, className }: { value: number; max?: number; tone?: Tone; label: string; className?: string }) {
  const reduce = useReducedMotionPref();
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const bar: Record<Tone, string> = { brand: 'bg-brand', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info', neutral: 'bg-fg-subtle' };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(Math.min(value, max))}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <m.div
        className={cn('h-full origin-left rounded-full', bar[tone])}
        style={{ width: `${ratio * 100}%` }}
        initial={reduce ? false : { opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.15 }}
      />
    </div>
  );
}

export function budgetTone(percent: number): Tone {
  if (percent >= 100) return 'danger';
  if (percent >= 80) return 'warning';
  return 'success';
}

// ───────────────────────────── Dağılım listesi ─────────────────────────────

/**
 * Dağılım (yatay çubuklar). Her satır: etiket · adet · yüzde, metin olarak da okunur;
 * `onPick` verilirse satır bir düğmedir (sinyalden listeye iniş).
 */
export function DistList({ dist, tones, onPick, pickable, emptyText = 'Bu dönemde veri yok.' }: { dist: Dist; tones?: Partial<Record<string, Tone>>; onPick?: (key: string, label: string) => void; pickable?: (key: string) => boolean; emptyText?: string }) {
  const total = dist.reduce((a, b) => a + b.count, 0);
  if (total === 0) return <p className="text-sm text-fg-muted">{emptyText}</p>;
  return (
    <ul className="space-y-2.5">
      {dist.map((d) => {
        const tone = tones?.[d.key] ?? 'brand';
        const inner = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-fg">{d.label}</span>
              <span className="tabular-nums text-fg-muted">
                {fmtInt(d.count)} · {fmtPct(d.percent)}
              </span>
            </span>
            <Meter value={d.percent ?? 0} tone={tone} label={`${d.label}: ${fmtInt(d.count)} (${fmtPct(d.percent)})`} className="mt-1.5" />
          </>
        );
        return (
          <li key={d.key}>
            {onPick && d.count > 0 && (pickable ? pickable(d.key) : true) ? (
              <button
                type="button"
                onClick={() => onPick(d.key, d.label)}
                className="block min-h-[44px] w-full rounded-md px-1 py-1 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label={`${d.label}: ${fmtInt(d.count)} geri bildirim, listeyi aç`}
              >
                {inner}
              </button>
            ) : (
              <div className="px-1 py-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────── Dikkat kutusu ─────────────────────────────

export function AttentionTile({
  label,
  value,
  prev,
  icon,
  tone,
  hint,
  onClick,
  actionLabel,
}: {
  label: string;
  value: number | null;
  prev?: number | null;
  icon: ReactNode;
  tone: Tone;
  hint?: ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const calm = value === 0;
  const effTone: Tone = calm ? 'success' : tone;
  const diff = value != null && prev != null ? value - prev : null;
  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4', TONE_CHIP[effTone])} aria-hidden>
          {icon}
        </span>
        <span className="text-sm font-medium text-fg-muted">{label}</span>
      </span>
      <span className={cn('mt-2 block text-2xl font-semibold tabular-nums', value ? TONE_TEXT[effTone] : 'text-fg')}>{fmtInt(value)}</span>
      <span className="mt-1 block text-xs text-fg-muted">
        {calm ? 'Sakin — dikkat gerektiren kayıt yok' : hint}
        {diff != null && diff !== 0 ? <span className="ml-1">({diff > 0 ? '+' : '−'}{fmtInt(Math.abs(diff))} önceki döneme göre)</span> : null}
      </span>
    </>
  );
  const cls = 'block w-full rounded-xl border border-border bg-surface-1 p-4 text-left';
  if (onClick && value) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}: ${fmtInt(value)}. ${actionLabel ?? 'Listeyi aç'}`}
        className={cn(cls, 'min-h-[44px] transition-colors hover:border-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus')}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

// ───────────────────────────── Rozetler ─────────────────────────────

const KIND_TONE: Record<ModelKind, Tone> = { llm: 'info', fallback: 'warning', synthetic: 'danger', unknown: 'neutral' };
export function KindBadge({ kind }: { kind: ModelKind }) {
  return <StatusBadge label={MODEL_KIND_LABEL[kind]} tone={KIND_TONE[kind]} size="sm" srPrefix="Analiz kaynağı" />;
}

export function CsvButton({ filename, build, children = 'CSV indir' }: { filename: string; build: () => string; children?: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9"
      onClick={() => {
        const blob = new Blob([build()], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {children}
    </button>
  );
}
