'use client';

/**
 * Şube → QR kırılımı (rapor heatmap Bulgu 4, 5, 7, 9, 13):
 *  - "Lokasyon" artık gerçek şube (DealerLocation); QR kodları şubenin altında açılır.
 *  - Üç parçalı yığılmış çubuk (olumlu / nötr / olumsuz + analiz bekliyor); veri yoksa gri
 *    "Veri yok" — "0,0★ / %0 / kırmızı şerit" gibi en kötü skor görünümü yok.
 *  - Puan Bayes düzeltilmiş (az örneklem genel ortalamaya çekilir); kademeli animasyon yok.
 */
import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { cn } from '@/lib/utils';
import { inboxHref } from '@/lib/dealer-analytics/params';
import type { ActivityHeatmap, LocationRow } from '@/lib/dealer-analytics/types';
import { formatNumber, formatPercent, formatRating, useAnalyticsCopy, useAnalyticsLocale } from './copy';

const QR_PREVIEW = 12;

function StackBar({ positive, neutral, negative, pending, label }: { positive: number; neutral: number; negative: number; pending: number; label: string }) {
  const total = positive + neutral + negative + pending;
  if (total === 0) return <div className="h-2 w-full rounded-full bg-surface-muted" aria-hidden />;
  const seg = (n: number, cls: string) => (n > 0 ? <div className={cls} style={{ width: `${(n / total) * 100}%` }} /> : null);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={label}>
      {seg(positive, 'bg-success')}
      {seg(neutral, 'bg-fg-subtle')}
      {seg(negative, 'bg-danger')}
      {seg(pending, 'bg-info')}
    </div>
  );
}

function LocationItem({ loc, data }: { loc: LocationRow; data: ActivityHeatmap }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const panelId = useId();
  const classified = loc.feedbacks - loc.pending;
  const sat = classified > 0 ? (loc.positive / classified) * 100 : null;
  const barLabel = `${copy.sentiments.positive} ${formatNumber(loc.positive, locale)}, ${copy.sentiments.neutral} ${formatNumber(loc.neutral, locale)}, ${copy.sentiments.negative} ${formatNumber(loc.negative, locale)}, ${copy.sentiments.pending} ${formatNumber(loc.pending, locale)}`;
  const qrs = showAll ? loc.qr : loc.qr.slice(0, QR_PREVIEW);

  return (
    <li className="py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-control px-2 py-2 text-left transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_7rem_6rem_auto]"
      >
        <span className="min-w-0">
          <span className="qx-small block truncate font-medium text-fg">{loc.name ?? copy.unassigned}</span>
          <span className="qx-caption block text-fg-subtle tabular-nums">
            {formatNumber(loc.feedbacks, locale)} {copy.cellFeedback.toLocaleLowerCase(locale === 'en' ? 'en-US' : 'tr-TR')} · {loc.qr.length} QR
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast motion-reduce:transition-none sm:order-last', open && 'rotate-180')} aria-hidden />
        <span className="col-span-2 sm:col-span-1">
          <StackBar positive={loc.positive} neutral={loc.neutral} negative={loc.negative} pending={loc.pending} label={barLabel} />
        </span>
        <span className="qx-small tabular-nums text-fg">
          {loc.avgRating == null ? (
            <span className="text-fg-subtle">{copy.noData}</span>
          ) : (
            <>
              {formatRating(loc.avgRating, locale)}★{' '}
              {loc.bayesRating != null && <span className="qx-caption text-fg-subtle">({formatRating(loc.bayesRating, locale)})</span>}
            </>
          )}
        </span>
        <span className="qx-small tabular-nums text-fg-muted">
          {sat == null ? '—' : `${copy.satisfaction} ${formatPercent(sat, locale)}`}
        </span>
      </button>
      <div id={panelId} hidden={!open} className="pb-2 pl-2 sm:pl-6">
        <ul className="divide-y divide-border border-l border-subtle pl-3">
          {qrs.map((q) => (
            <li key={q.id}>
              <Link
                href={inboxHref(data.query, { qr: q.id })}
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-1.5 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_6rem_5rem]"
              >
                <span className="qx-small min-w-0 truncate text-fg">
                  {q.name}
                  {q.archived && <span className="qx-caption ml-2 rounded-chip bg-surface-muted px-1.5 py-0.5 text-fg-muted ring-1 ring-inset ring-border">{copy.archived}</span>}
                </span>
                <span className="hidden sm:block">
                  <StackBar positive={q.positive} neutral={q.neutral} negative={q.negative} pending={q.pending} label={`${q.name}: ${barLabel}`} />
                </span>
                <span className="qx-small tabular-nums text-fg">{q.avgRating == null ? '—' : `${formatRating(q.avgRating, locale)}★`}</span>
                <span className="qx-caption hidden tabular-nums text-fg-muted sm:block">{formatNumber(q.feedbacks, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {loc.qr.length > QR_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="qx-small mt-1 min-h-11 rounded-control px-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showAll ? copy.hideQr : copy.showQr(loc.qr.length)}
          </button>
        )}
      </div>
    </li>
  );
}

export function LocationBreakdown({ data }: { data: ActivityHeatmap }) {
  const copy = useAnalyticsCopy();
  return (
    <SectionCard title={copy.locationsTitle} description={copy.locationsDescription} headingLevel="h2">
      {data.locations.length === 0 ? (
        <EmptyState compact headingLevel="p" title={copy.locationsEmpty} description={null} />
      ) : (
        <ul className="divide-y divide-border">
          {data.locations.map((loc) => (
            <LocationItem key={loc.id ?? '__none__'} loc={loc} data={data} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
