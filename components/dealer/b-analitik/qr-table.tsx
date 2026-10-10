'use client';

/**
 * QR performans tablosu (rapor B-7, #36): tüm metrikler AYNI dönemde (eskiden tarama ömür boyu,
 * geri bildirim dönemlikti), anahtar `id` (aynı adlı QR çakışması yok), sıralanabilir, sayfalı,
 * satır → o QR'ın yorumları (gelen kutusu `?qr=`). Mobilde kart görünümü.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, DeltaBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { inboxHref } from '@/lib/dealer-analytics/params';
import type { AnalyticsOverview, QrRow } from '@/lib/dealer-analytics/types';
import { formatNumber, formatPercent, formatRating, useAnalyticsCopy, useAnalyticsLocale } from './copy';

export function QrTable({ data }: { data: AnalyticsOverview }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const router = useRouter();
  const hasCompare = data.query.compare !== 'none';
  const consumptionOnly = data.filters.effectiveChannel === 'consumption';

  const columns = useMemo<ColumnDef<QrRow>[]>(() => {
    const dash = '—';
    const cols: ColumnDef<QrRow>[] = [
      {
        accessorKey: 'name',
        header: copy.qrName,
        meta: { mobile: 'title', label: copy.qrName } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-fg">{row.original.name}</span>
            {row.original.archived && (
              <span className="qx-caption shrink-0 rounded-chip bg-surface-muted px-1.5 py-0.5 text-fg-muted ring-1 ring-inset ring-border">{copy.archived}</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'locationName',
        header: copy.qrLocation,
        meta: { mobile: 'subtitle', label: copy.qrLocation } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => <span className="text-fg-muted">{(getValue<string | null>() ?? copy.unassigned) || dash}</span>,
      },
      {
        accessorKey: 'feedbacks',
        header: copy.qrFeedbacks,
        meta: { numeric: true, label: copy.qrFeedbacks } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => formatNumber(getValue<number>(), locale),
      },
      {
        accessorKey: 'avgRating',
        header: copy.qrAvg,
        sortUndefined: 'last',
        meta: { numeric: true, label: copy.qrAvg } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v == null ? dash : `${formatRating(v, locale)}★`;
        },
      },
      {
        accessorKey: 'positiveShare',
        header: copy.qrPositive,
        meta: { numeric: true, label: copy.qrPositive } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v == null ? dash : formatPercent(v, locale);
        },
      },
      {
        accessorKey: 'scans',
        header: copy.qrScans,
        meta: { numeric: true, label: copy.qrScans } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v == null ? dash : formatNumber(v, locale);
        },
      },
      {
        accessorKey: 'conversion',
        header: copy.qrConversion,
        meta: { numeric: true, label: copy.qrConversion } satisfies DataTableColumnMeta,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v == null ? dash : formatPercent(v, locale, 1);
        },
      },
    ];
    if (hasCompare) {
      cols.push({
        accessorKey: 'feedbackDelta',
        header: copy.qrDelta,
        enableSorting: false,
        meta: { numeric: true, label: copy.qrDelta } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.feedbackDelta == null ? (
            <span className="text-fg-subtle">{row.original.compareFeedbacks === 0 && row.original.feedbacks > 0 ? copy.newInPeriod : dash}</span>
          ) : (
            <DeltaBadge delta={{ value: row.original.feedbackDelta, kind: 'percent', goodDirection: 'up' }} size="sm" label={null} />
          ),
      });
    }
    return cols;
  }, [copy, locale, hasCompare]);

  return (
    <SectionCard title={copy.qrTitle} description={consumptionOnly ? copy.qrConsumption : copy.qrDescription} headingLevel="h2" density="flush">
      <DataTable<QrRow>
        ariaLabel={copy.qrTitle}
        columns={columns}
        data={consumptionOnly ? [] : data.qr}
        getRowId={(r) => r.id}
        empty={{ title: consumptionOnly ? copy.qrConsumption : copy.qrEmpty, description: null, compact: true }}
        defaultPageSize={10}
        pageSizeOptions={[10, 25, 50]}
        onRowClick={(r) => router.push(inboxHref(data.query, { qr: r.id }))}
        enableColumnVisibility={false}
        density="compact"
        cardBreakpoint="md"
      />
    </SectionCard>
  );
}
