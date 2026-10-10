'use client';

import { MessageSquare, Receipt, Star, Reply } from 'lucide-react';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { formatDuration } from '@/components/ds/data/metric-format';
import type { TodayMetrics } from '@/lib/dealer-today/types';
import { TODAY_LINKS } from '@/lib/dealer-today/core';
import { useTodayCopy } from './copy';

function seriesText(values: ReadonlyArray<number | null> | null | undefined, tag: string): string {
  return (values ?? []).map((v) => (v == null ? '—' : v.toLocaleString(tag, { maximumFractionDigits: 1 }))).join(', ');
}

/**
 * Bugünün özet metrikleri — sayıları sunucu hesaplar (deterministik), kutu yalnız biçimler.
 * Her kutu tek bir zaman penceresi taşır ve etiketinde yazar (eski panoda tek kartta üç farklı
 * pencere vardı — dealer.md B3/B8). Veri yoksa "—" (asla "0,0 / 5" değil — copilot B10).
 */
export function MetricsRow({ metrics }: { metrics: TodayMetrics }) {
  const { copy, locale, tag } = useTodayCopy();
  const median = metrics.medianFirstResponseSec;
  return (
    <section aria-labelledby="today-metrics-title" className="min-w-0">
      <h2 id="today-metrics-title" className="sr-only">
        {copy.metrics.title}
      </h2>
      <MetricGrid cols={4}>
        <MetricTile
          label={copy.metrics.feedbackToday}
          metric={metrics.feedbackToday}
          icon={<MessageSquare />}
          tone="brand"
          href={TODAY_LINKS.inbox}
          deltaLabel={copy.metrics.vsYesterday}
          sparklineLabel={copy.metrics.sparkFeedback(seriesText(metrics.feedbackToday.series, tag))}
        />
        <MetricTile
          label={copy.metrics.consumptionsToday}
          metric={metrics.consumptionsToday}
          icon={<Receipt />}
          tone="info"
          href="/dealer/consumptions"
          deltaLabel={copy.metrics.vsYesterday}
          sparklineLabel={copy.metrics.sparkConsumptions(seriesText(metrics.consumptionsToday.series, tag))}
        />
        <MetricTile
          label={copy.metrics.avgRating}
          metric={metrics.avgRating7d}
          icon={<Star />}
          tone="warning"
          href={TODAY_LINKS.analytics}
          deltaLabel={copy.metrics.vsPrev7}
          hint={copy.metrics.last7}
          sparklineLabel={copy.metrics.sparkRating(seriesText(metrics.avgRating7d.series, tag))}
        />
        <MetricTile
          label={copy.metrics.responseRate}
          metric={metrics.responseRate7d}
          icon={<Reply />}
          tone="success"
          href={TODAY_LINKS.inbox}
          deltaLabel={copy.metrics.vsPrev7}
          hint={median == null ? copy.metrics.noResponseYet : copy.metrics.medianResponse(formatDuration(median, locale))}
        />
      </MetricGrid>
    </section>
  );
}
