import { cn } from '@/lib/utils';
import { formatPercent } from './copy';

export type DistSegment = {
  key: string;
  label: string;
  count: number;
  /** Rol token'ı arka plan sınıfı (ör. `bg-success`). */
  barClass: string;
};

/**
 * Yığılmış dağılım çubuğu + metinli lejant. Anlam yalnız renge bırakılmaz: her parçanın adı,
 * sayısı ve yüzdesi lejantta yazılıdır; çubuk tek bir erişilebilir özet taşır.
 */
export function DistBar({
  segments,
  tag,
  ariaLabel,
  className,
}: {
  segments: DistSegment[];
  tag: string;
  ariaLabel: string;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  const pct = (c: number) => (total > 0 ? (c / total) * 100 : 0);
  const fmtPct = (c: number) => formatPercent(pct(c), tag);
  const summary = segments.map((s) => `${s.label} ${s.count} (${fmtPct(s.count)})`).join(', ');
  return (
    <div className={cn('space-y-3', className)}>
      <div
        role="img"
        aria-label={`${ariaLabel}: ${summary}`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3"
      >
        {total > 0 &&
          segments.map((s) =>
            s.count > 0 ? <span key={s.key} className={cn('h-full', s.barClass)} style={{ width: `${pct(s.count)}%` }} /> : null
          )}
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 min-[420px]:grid-cols-2">
        {segments.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2 qx-small">
            <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', s.barClass)} />
            <span className="min-w-0 flex-1 truncate text-fg">{s.label}</span>
            <span className="qx-num tabular-nums text-fg">{s.count.toLocaleString(tag)}</span>
            <span className="qx-num w-11 text-right tabular-nums text-fg-muted">{fmtPct(s.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tek satırlık oran çubuğu (ör. "Yüksek 12 / 80"). */
export function MeterRow({
  label,
  count,
  total,
  tag,
  barClass,
}: {
  label: string;
  count: number;
  total: number;
  tag: string;
  barClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 qx-small">
        <span className="text-fg">{label}</span>
        <span className="qx-num tabular-nums text-fg-muted">
          {count.toLocaleString(tag)} · {formatPercent(pct, tag)}
        </span>
      </div>
      <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <span className={cn('block h-full rounded-full', barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
