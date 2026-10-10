'use client';

/**
 * Metrik rayları (bullet chart listesi) — denetim B7 kapanışı: her metrik KENDİ ölçeğinde
 * (puan 1–5, oran 0–100, süre 0–akran üst sınırı) çizilir; farklı ölçekler aynı eksende yok.
 * Bant = akranların orta yarısı (p25–p75), çizgi = medyan, bayrak = üst %10 eşiği (≥ 10 akranla),
 * nokta = siz. Düşük örneklem kıyas dışıdır ve açıkça yazılır. Görsel `aria-hidden`; aynı bilgi
 * metin ve `aria-label` olarak verilir.
 */
import { Flag } from 'lucide-react';
import type { MetricRail } from '@/lib/dealer-benchmark/types';
import { TONE_CHIP, type Tone } from '@/components/states';
import { cn } from '@/lib/utils';
import { useBkCopy } from './copy';
import { fmtNumber, fmtPct, fmtUnit } from './format';

const STANDING_TONE: Record<NonNullable<MetricRail['standing']>, Tone> = {
  top: 'success',
  above: 'success',
  below: 'warning',
  bottom: 'danger',
};

function domainOf(r: MetricRail): [number, number] {
  if (r.unit === 'rating') return [1, 5];
  if (r.unit === 'percent') return [0, 100];
  const hi = Math.max(r.peer?.p75 ?? 0, r.peer?.top ?? 0, r.you ?? 0, r.prev ?? 0, 3600) * 1.15;
  return [0, hi];
}

function Rail({ r }: { r: MetricRail }) {
  const { copy, locale } = useBkCopy();
  const c = copy.bench.rails;
  const [lo, hi] = domainOf(r);
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const lowSample = r.you != null && r.youN < r.minN;
  const fmt = (v: number | null) => fmtUnit(v, r.unit, locale);
  const gapText = r.gapToTop == null ? null : r.gapToTop === 0 ? c.atTop : c.gap(fmtUnit(r.gapToTop, r.unit, locale));

  return (
    <li className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="qx-small font-medium text-fg">{c.label[r.key]}</h3>
          {r.standing && (
            <span className={cn('qx-caption rounded-chip border px-1.5 py-0.5 font-medium', TONE_CHIP[STANDING_TONE[r.standing]])}>{c.standing[r.standing]}</span>
          )}
        </div>
        <p className="qx-h3 mt-1 font-semibold tabular-nums text-fg">{fmt(r.you)}</p>
        <p className="qx-caption text-fg-muted">{c.hint[r.key]}</p>
      </div>

      <div className="min-w-0 space-y-2">
        {r.peer ? (
          <div
            role="img"
            aria-label={c.railAria(c.label[r.key], fmt(r.you), fmt(r.peer.p50))}
            className="relative h-11 select-none"
          >
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-muted" aria-hidden />
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[hsl(var(--text-3)/0.35)]"
              style={{ left: pos(Math.min(r.peer.p25, r.peer.p75)), width: `calc(${pos(Math.max(r.peer.p25, r.peer.p75))} - ${pos(Math.min(r.peer.p25, r.peer.p75))})` }}
              aria-hidden
            />
            <div className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-fg-muted" style={{ left: pos(r.peer.p50) }} aria-hidden />
            {r.peer.top != null && (
              <div className="absolute top-0 -translate-x-1/2 text-success" style={{ left: pos(r.peer.top) }} aria-hidden>
                <Flag className="h-3.5 w-3.5" />
              </div>
            )}
            {r.you != null && !lowSample && (
              // Konum dış sarmalayıcıda; geçiş yalnız `left` (transform çakışması yok).
              <div
                className="absolute top-1/2 transition-[left] duration-slow ease-emphasized motion-reduce:transition-none"
                style={{ left: pos(r.you) }}
                aria-hidden
              >
                <span className="block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-1 bg-brand qx-elevation-1" />
              </div>
            )}
          </div>
        ) : null}

        <div className="qx-caption flex flex-wrap gap-x-4 gap-y-1 text-fg-muted">
          {!r.peer && <span>{c.noPeer}</span>}
          {r.you == null && <span>{c.noValue}</span>}
          {lowSample && <span className="text-warning">{c.lowSample(fmtNumber(r.youN, locale), fmtNumber(r.minN, locale))}</span>}
          {r.peer && (
            <span>
              {c.median}: <span className="tabular-nums text-fg">{fmt(r.peer.p50)}</span> · {c.band}:{' '}
              <span className="tabular-nums">
                {fmt(r.peer.p25)}–{fmt(r.peer.p75)}
              </span>
            </span>
          )}
          {r.betterThanPercent != null && <span>{c.betterThan(fmtPct(r.betterThanPercent, locale))}</span>}
          {gapText && <span className={r.gapToTop === 0 ? 'text-success' : undefined}>{gapText}</span>}
          {r.prev != null && <span>{c.prev(fmt(r.prev))}</span>}
          {r.you != null && <span className="tabular-nums">{c.sample(fmtNumber(r.youN, locale))}</span>}
        </div>
      </div>
    </li>
  );
}

export function MetricRails({ metrics }: { metrics: readonly MetricRail[] }) {
  const { copy } = useBkCopy();
  const c = copy.bench.rails;
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border-subtle">
        {metrics.map((r) => (
          <Rail key={r.key} r={r} />
        ))}
      </ul>
      <div className="qx-caption flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-subtle pt-3 text-fg-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-brand" /> {c.you}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-full bg-[hsl(var(--text-3)/0.35)]" /> {c.band}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-fg-muted" /> {c.median}
        </span>
        <span className="inline-flex items-center gap-1.5 text-success">
          <Flag className="h-3 w-3" /> <span className="text-fg-muted">{c.topMark}</span>
        </span>
      </div>
    </div>
  );
}
