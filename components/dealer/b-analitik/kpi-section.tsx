'use client';

/**
 * KPI şeridi — `MetricTile` + `DeltaBadge` (rapor B-2: birim tipli; ★ mutlak, oran puan, hacim %).
 * Mobil: 2 sütun eşit ızgara (rapor B-8: boş hücre yok, yerleşim çevrilmiş metne bağlı değil).
 */
import { MessageSquare, Star, ThumbsUp, Reply, Timer, ScanLine, Gauge } from 'lucide-react';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import type { AnalyticsOverview } from '@/lib/dealer-analytics/types';
import { inboxHref } from '@/lib/dealer-analytics/params';
import { useAnalyticsCopy } from './copy';

export function KpiSection({ data }: { data: AnalyticsOverview }) {
  const copy = useAnalyticsCopy();
  const { kpis, query } = data;
  const hasCompare = query.compare !== 'none';
  const deltaLabel = hasCompare ? (query.compare === 'yoy' ? copy.vsYoy : copy.vsPrevious) : null;
  const days = data.series.length;
  const newHint = (delta: unknown) => (hasCompare && delta == null ? copy.newInPeriod : undefined);

  const conversionHint =
    data.conversionStatus === 'no_scans'
      ? copy.kpiConversionNoScans
      : data.conversionStatus === 'incomplete'
        ? copy.kpiConversionIncomplete
        : data.conversionStatus === 'not_applicable'
          ? copy.kpiConversionNA
          : copy.kpiConversionHint;

  return (
    <div className="space-y-3 sm:space-y-4">
    <MetricGrid cols={4}>
      <MetricTile
        label={copy.kpiVolume}
        icon={<MessageSquare />}
        tone="brand"
        metric={kpis.volume}
        deltaLabel={deltaLabel}
        hint={newHint(kpis.volume.delta) ?? copy.kpiVolumeHint}
        sparklineLabel={copy.sparkVolume(days)}
        href={inboxHref(query)}
      />
      <MetricTile
        label={copy.kpiAvg}
        icon={<Star />}
        tone="warning"
        metric={kpis.avgRating}
        deltaLabel={deltaLabel}
        sparklineLabel={copy.sparkAvg(days)}
      />
      <MetricTile
        label={copy.kpiPositive}
        icon={<ThumbsUp />}
        tone="success"
        metric={kpis.positiveShare}
        deltaLabel={deltaLabel}
        hint={copy.kpiPositiveHint}
      />
      <MetricTile label={copy.kpiResponse} icon={<Reply />} tone="info" metric={kpis.responseRate} deltaLabel={deltaLabel} />
    </MetricGrid>
    <MetricGrid cols={3}>
      <MetricTile label={copy.kpiReplyTime} icon={<Timer />} tone="neutral" metric={kpis.medianReply} deltaLabel={deltaLabel} size="compact" animate={false} />
      <MetricTile label={copy.kpiConversion} icon={<ScanLine />} tone="neutral" metric={kpis.conversion} deltaLabel={deltaLabel} hint={conversionHint} size="compact" />
      <MetricTile
        label={copy.kpiNps}
        icon={<Gauge />}
        tone="neutral"
        metric={kpis.nps}
        deltaLabel={deltaLabel}
        hint={kpis.nps.value == null ? copy.kpiNpsNone : copy.kpiNpsHint}
        size="compact"
        className="min-[420px]:col-span-2 lg:col-span-1"
      />
    </MetricGrid>
    </div>
  );
}
