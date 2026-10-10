'use client';

import { forwardRef, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CHIP, type Tone } from '@/components/states';
import { useDataCopy, useLocaleInfo } from './copy';
import {
  deltaDirection,
  deltaSentiment,
  formatDelta,
  type MetricDelta,
  type MetricValue,
} from './metric-format';

export type DeltaBadgeProps = {
  delta: MetricDelta;
  /** `absolute` değişimi metrikle aynı biçimde göstermek için metrik ayarları. */
  metric?: Omit<MetricValue, 'value' | 'delta'>;
  /** Rozetin yanındaki karşılaştırma metni; `null` → gösterme. */
  label?: ReactNode | null;
  size?: 'sm' | 'md';
  className?: string;
};

const SENTIMENT_TONE = { positive: 'success', negative: 'danger', neutral: 'neutral' } as const satisfies Record<string, Tone>;

/**
 * Değişim rozeti — YÖN (ok ikonu) + İŞARET (+/−) + RENK (iyi/kötü) + ekran
 * okuyucu cümlesi ("%12,4 arttı, iyileşme"). Yalnız renge dayanmaz.
 * `goodDirection: 'down'` → düşüş yeşil (ör. şikâyet sayısı).
 */
export const DeltaBadge = forwardRef<HTMLSpanElement, DeltaBadgeProps>(function DeltaBadge(
  { delta, metric, label, size = 'sm', className },
  ref,
) {
  const copy = useDataCopy();
  const { tag, locale } = useLocaleInfo();
  const dir = deltaDirection(delta.value);
  const sentiment = deltaSentiment(dir, delta.goodDirection ?? 'up');
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  const text = dir === 'flat' ? '0' : formatDelta(delta, tag, metric, locale);
  const dirWord = dir === 'up' ? copy.deltaUp : dir === 'down' ? copy.deltaDown : copy.deltaFlat;
  const sentimentWord = sentiment === 'positive' ? copy.better : sentiment === 'negative' ? copy.worse : null;
  const shownLabel = label === null ? null : label ?? delta.label ?? copy.vsPrevious;

  return (
    <span ref={ref} className={cn('inline-flex min-w-0 flex-wrap items-center gap-1.5', size === 'sm' ? 'qx-caption' : 'qx-small', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 font-semibold qx-num',
          TONE_CHIP[SENTIMENT_TONE[sentiment]],
        )}
      >
        <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        <span aria-hidden>{text}</span>
        <span className="sr-only">
          {dir === 'flat' ? dirWord : `${text.replace(/^[+−]/, '')} ${dirWord}`}
          {sentimentWord ? `, ${sentimentWord}` : ''}
        </span>
      </span>
      {shownLabel != null && <span className="text-fg-muted">{shownLabel}</span>}
    </span>
  );
});
