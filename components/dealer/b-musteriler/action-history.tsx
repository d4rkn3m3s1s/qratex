'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import type { ActionHistoryItem } from '@/lib/dealer-customers/types';
import { customerKeys, fetchHistory } from './api';
import { useCustomersCopy } from './copy';
import { useFormat } from './parts';

/** Son aksiyonlar + 14 günlük atıf: gönderilen → geri gelen → ciro (kapalı döngü ölçümü). */
export function ActionHistory() {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const q = useQuery({ queryKey: customerKeys.history(), queryFn: fetchHistory, staleTime: 60_000 });

  const columns = useMemo<ColumnDef<ActionHistoryItem>[]>(
    () => [
      {
        id: 'at',
        header: copy.colWhen,
        meta: { mobile: 'subtitle', label: copy.colWhen } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.at}>{fmt.date(row.original.at)}</time>,
      },
      {
        id: 'audience',
        header: copy.colAudience,
        meta: { mobile: 'title', label: copy.colAudience } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="font-medium text-fg">{row.original.audienceLabel}</span>,
      },
      {
        id: 'action',
        header: copy.colAction,
        meta: { label: copy.colAction } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge
            size="sm"
            tone={row.original.action === 'personal_offer' ? 'brand' : 'info'}
            label={
              row.original.action === 'personal_offer'
                ? copy.actionOffer
                : `${copy.actionMessage} · ${row.original.template ? copy.templates[row.original.template] : ''}`
            }
          />
        ),
      },
      {
        id: 'sent',
        header: copy.colSent,
        meta: { numeric: true, label: copy.colSent } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.number(row.original.sent),
      },
      {
        id: 'returned',
        header: copy.colReturned,
        meta: { numeric: true, label: copy.colReturned } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span>
            {fmt.number(row.original.returned)}
            {row.original.windowOpen && <span className="qx-caption ml-1 text-fg-muted">({copy.measuring})</span>}
          </span>
        ),
      },
      {
        id: 'revenue',
        header: copy.colRevenue,
        meta: { numeric: true, label: copy.colRevenue } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.revenue),
      },
    ],
    [copy, fmt]
  );

  return (
    <SectionCard title={copy.historyTitle} description={copy.historyDesc} density="flush">
      <DataTable
        ariaLabel={copy.historyTitle}
        columns={columns}
        data={q.data?.items}
        query={q}
        getRowId={(r) => r.id}
        density="compact"
        enableColumnVisibility={false}
        paginated={false}
        empty={{ title: copy.historyEmpty }}
      />
    </SectionCard>
  );
}
