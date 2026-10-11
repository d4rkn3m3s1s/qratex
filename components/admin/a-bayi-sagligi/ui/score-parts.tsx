'use client';

/**
 * Skor görselleri — tek yerde: bant rozeti (ikon + metin + sayı; yalnız renge dayanmaz),
 * bileşen dökümü (yatay çubuklar + erişilebilir metin), değişim rozeti.
 */
import { AlertOctagon, AlertTriangle, CheckCircle2, Eye, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, TONE_STRIPE, TONE_TEXT, type Tone } from '@/components/states';
import { COMPONENT_KEYS, type HealthBand, type ScoreComponent } from '../domain';
import type { HealthCopy } from '../copy';

export const BAND_TONE: Record<HealthBand, Tone> = { critical: 'danger', at_risk: 'warning', watch: 'info', healthy: 'success' };
const BAND_ICON = { critical: AlertOctagon, at_risk: AlertTriangle, watch: Eye, healthy: CheckCircle2 } as const;

export function ScoreBadge({ score, band, c, size = 'md' }: { score: number; band: HealthBand; c: HealthCopy; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = BAND_ICON[band];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium tabular-nums transition-colors duration-200',
        TONE_CHIP[BAND_TONE[band]],
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-sm',
        size === 'lg' && 'px-3 py-1.5 text-base'
      )}
    >
      <Icon aria-hidden className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      <span className="font-semibold">{score}</span>
      <span className="sr-only">/ 100,</span>
      <span>{c.bands[band]}</span>
    </span>
  );
}

export function DeltaChip({ delta, c }: { delta: number | null; c: HealthCopy }) {
  if (delta == null) {
    return (
      <span className="text-xs text-fg-subtle" title={c.table.noDelta}>
        {c.table.none}
        <span className="sr-only">{c.table.noDelta}</span>
      </span>
    );
  }
  const tone: Tone = delta <= -10 ? 'danger' : delta < 0 ? 'warning' : delta > 0 ? 'success' : 'neutral';
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm tabular-nums', TONE_TEXT[tone])}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {delta > 0 ? '+' : delta < 0 ? '−' : ''}
      {Math.abs(delta)}
    </span>
  );
}

const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Bileşen dökümü: her bileşen için puan/tavan çubuğu, açıklama ve "veri yok" durumu. */
export function ComponentBreakdown({
  components,
  fraudPenalty,
  c,
  dense = false,
}: {
  components: ScoreComponent[];
  fraudPenalty: number;
  c: HealthCopy;
  dense?: boolean;
}) {
  const ordered = COMPONENT_KEYS.map((k) => components.find((x) => x.key === k)).filter(Boolean) as ScoreComponent[];
  const earned = ordered.reduce((s, x) => s + (x.points ?? 0), 0);
  const possible = ordered.reduce((s, x) => s + (x.points == null ? 0 : x.max), 0);
  return (
    <div className="space-y-3">
      <ul className={cn('space-y-2.5', dense && 'space-y-2')}>
        {ordered.map((comp) => {
          const pct = comp.points == null ? 0 : Math.round((comp.points / comp.max) * 100);
          const tone: Tone = comp.points == null ? 'neutral' : pct >= 75 ? 'success' : pct >= 50 ? 'info' : pct >= 30 ? 'warning' : 'danger';
          return (
            <li key={comp.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-fg">{c.components[comp.key]}</span>
                <span className="tabular-nums text-fg-muted">
                  {comp.points == null ? c.notApplicable : `${fmt1(comp.points)} / ${comp.max}`}
                </span>
              </div>
              <div
                role="meter"
                aria-label={c.breakdown.aria(c.components[comp.key], comp.points == null ? '0' : fmt1(comp.points), comp.max)}
                aria-valuemin={0}
                aria-valuemax={comp.max}
                aria-valuenow={comp.points ?? 0}
                className="h-2 overflow-hidden rounded-full bg-surface-muted"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
                    comp.points == null ? 'bg-transparent' : TONE_STRIPE[tone]
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {!dense && <p className="text-xs text-fg-subtle">{c.componentHelp[comp.key]}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted tabular-nums">
        {c.breakdown.formula(fmt1(earned), possible, fraudPenalty)}
        {fraudPenalty > 0 && <span className={cn('ml-2 font-medium', TONE_TEXT.danger)}>{c.fraudPenalty(fraudPenalty)}</span>}
      </p>
    </div>
  );
}


/** Satır içi küçük yığılmış çubuk — dört bileşenin kayıplarını tek bakışta gösterir (dekoratif; metin yanında). */
export function MiniStack({ components }: { components: ScoreComponent[] }) {
  return (
    <span aria-hidden className="flex h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
      {COMPONENT_KEYS.map((k) => {
        const comp = components.find((x) => x.key === k);
        if (!comp || comp.points == null) return <span key={k} style={{ width: '25%' }} className="bg-transparent" />;
        const pct = comp.points / comp.max;
        return (
          <span key={k} style={{ width: '25%' }} className="relative border-r border-surface-1 last:border-r-0">
            <span
              className={cn('absolute inset-y-0 left-0', pct >= 0.75 ? 'bg-success' : pct >= 0.5 ? 'bg-info' : pct >= 0.3 ? 'bg-warning' : 'bg-danger')}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}
