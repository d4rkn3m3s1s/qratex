'use client';

import { Gauge, MessageSquare, Reply, SmilePlus, Star, ThumbsDown, UserMinus } from 'lucide-react';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import type { MetricValue } from '@/components/ds/data/metric-format';
import type { InsightsData } from '@/lib/dealer-insights/types';
import { useInsightsCopy } from './copy';

function seriesText(values: ReadonlyArray<number | null> | null | undefined, tag: string): string {
  return (values ?? []).map((v) => (v == null ? '—' : v.toLocaleString(tag, { maximumFractionDigits: 1 }))).join(', ');
}

/**
 * Ölçülen metrikler — sayıları sunucu hesaplar (deterministik), kutu yalnız biçimler.
 * Eski sayfadaki LLM uydurması NPS/CSAT/CES/yanıt oranı yok: CSAT ve yanıt oranı gerçek
 * veriden; NPS yalnız gerçek 0-10 yanıt varsa; CES verisi olmadığından kart yok.
 * Her kutu tanımını (`hint`) ve örneklemini (n) taşır; düşük örneklem işaretlenir.
 */
export function InsightsMetrics({ data, inboxHref }: { data: InsightsData; inboxHref: (extra?: Record<string, string>) => string }) {
  const { copy, tag } = useInsightsCopy();
  const m = data.metrics;
  const deltaLabel = data.query.compare === 'yoy' ? copy.metrics.vsYoy : copy.metrics.vsPrevious;
  const spark = (label: string, metric: MetricValue) =>
    metric.series ? copy.metrics.sparkline(label, seriesText(metric.series, tag)) : undefined;
  return (
    <section aria-labelledby="insights-metrics-title" className="min-w-0">
      <h2 id="insights-metrics-title" className="sr-only">
        {copy.metrics.title}
      </h2>
      <MetricGrid cols={3}>
        <MetricTile
          label={copy.metrics.avgRating}
          metric={m.avgRating}
          icon={<Star />}
          tone="warning"
          hint={copy.metrics.avgRatingHint}
          deltaLabel={deltaLabel}
          sparklineLabel={spark(copy.metrics.avgRating, m.avgRating)}
          animate
        />
        <MetricTile
          label={copy.metrics.csat}
          metric={m.csat}
          icon={<SmilePlus />}
          tone="success"
          hint={copy.metrics.csatHint}
          deltaLabel={deltaLabel}
          sparklineLabel={spark(copy.metrics.csat, m.csat)}
          animate
        />
        <MetricTile
          label={copy.metrics.negativeRate}
          metric={m.negativeRate}
          icon={<ThumbsDown />}
          tone="danger"
          hint={copy.metrics.negativeHint}
          href={inboxHref({ sentiment: 'negative' })}
          deltaLabel={deltaLabel}
          sparklineLabel={spark(copy.metrics.negativeRate, m.negativeRate)}
          animate
        />
        <MetricTile
          label={copy.metrics.responseRate}
          metric={m.responseRate}
          icon={<Reply />}
          tone="info"
          hint={copy.metrics.responseHint}
          href={inboxHref({ status: 'new' })}
          deltaLabel={deltaLabel}
          animate
        />
        <MetricTile
          label={copy.metrics.volume}
          metric={m.volume}
          icon={<MessageSquare />}
          tone="brand"
          hint={copy.metrics.volumeHint}
          href={inboxHref()}
          deltaLabel={deltaLabel}
          sparklineLabel={spark(copy.metrics.volume, m.volume)}
          animate
        />
        <MetricTile
          label={copy.metrics.highChurn}
          metric={m.highChurn}
          icon={<UserMinus />}
          tone="danger"
          hint={copy.metrics.highChurnHint}
          href={inboxHref({ signal: 'churn' })}
          deltaLabel={deltaLabel}
          animate
        />
        {m.nps && (
          <MetricTile
            label={copy.metrics.nps}
            metric={m.nps}
            icon={<Gauge />}
            tone="brand"
            hint={copy.metrics.npsHint}
            deltaLabel={deltaLabel}
            animate
          />
        )}
      </MetricGrid>
    </section>
  );
}
