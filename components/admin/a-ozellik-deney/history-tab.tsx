'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FilterBar, SectionCard, type FilterField } from '@/components/ds/page';
import { DataTable, StatusBadge, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import type { HistoryItem } from '@/lib/admin-flags/contract';
import { fcKeys, fetchHistory } from './api';
import { fmtAbs, fmtNum, fmtRel } from './format';

const FIELDS: FilterField[] = [
  {
    type: 'select',
    key: 'kind',
    label: 'Tür',
    allLabel: 'Tüm değişiklikler',
    options: [
      { value: 'module', label: 'Modül anahtarı' },
      { value: 'rollout', label: 'Kademeli açılış' },
      { value: 'experiment', label: 'Deney' },
    ],
  },
  { type: 'search', key: 'hkey', label: 'Modül anahtarı', placeholder: 'ör. squads' },
];

const KIND_LABEL: Record<HistoryItem['kind'], string> = { module: 'Modül', rollout: 'Açılış', experiment: 'Deney' };
const KIND_TONE = { module: 'brand', rollout: 'info', experiment: 'success' } as const;

/** Modül, açılış ve deney değişikliklerinin tek zaman çizelgesi (AuditLog; Ayar Merkezi yazımları da modül bazında çözülür). */
export function HistoryTab() {
  const sp = useSearchParams();
  const table = useUrlTableState({ defaultSort: [{ id: 'at', desc: true }], sortableIds: [] });
  const kind = sp.get('kind') || 'all';
  const key = (sp.get('hkey') || '').trim().toLowerCase();
  const qs = new URLSearchParams({ kind, page: String(table.params.page), size: String(table.params.pageSize) });
  if (/^[a-z0-9_]{2,64}$/.test(key)) qs.set('key', key);
  const qsStr = qs.toString();
  const list = useQuery({ queryKey: fcKeys.history(qsStr), queryFn: ({ signal }) => fetchHistory(qsStr, signal), placeholderData: keepPreviousData, staleTime: 15_000 });

  const columns = useMemo<ColumnDef<HistoryItem>[]>(
    () => [
      {
        id: 'summary',
        header: 'Değişiklik',
        enableSorting: false,
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-lg">
            <p className="font-medium text-fg">{row.original.summary}</p>
            {row.original.reason ? <p className="line-clamp-2 text-xs text-fg-muted">Gerekçe: {row.original.reason}</p> : null}
          </div>
        ),
      },
      {
        id: 'kind',
        header: 'Tür',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Tür' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" tone={KIND_TONE[row.original.kind]} label={KIND_LABEL[row.original.kind]} />,
      },
      {
        id: 'actor',
        header: 'Kim',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Kim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg-muted">{row.original.actor ?? 'Sistem'}</span>,
      },
      {
        id: 'at',
        header: 'Zaman',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Zaman' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.at} title={fmtAbs(row.original.at)} className="whitespace-nowrap text-sm text-fg-muted">
            {fmtRel(row.original.at)}
          </time>
        ),
      },
    ],
    []
  );

  const filtered = kind !== 'all' || !!key;
  return (
    <SectionCard title="Değişiklik geçmişi" description="Kim, ne zaman, neyi değiştirdi ve neden. Ayrıntılı denetim için /admin/audit.">
      <div className="space-y-4">
        <FilterBar fields={FIELDS} resetKeys={['page']} />
        <p className="sr-only" aria-live="polite">
          {list.data ? `${fmtNum(list.data.total)} kayıt` : ''}
        </p>
        <DataTable
          ariaLabel="Değişiklik geçmişi"
          columns={columns}
          data={list.data?.items}
          query={list}
          getRowId={(r) => r.id}
          manualPagination
          manualSorting
          rowCount={list.data?.total}
          {...table}
          filtered={filtered}
          density="compact"
          empty={
            filtered
              ? { title: 'Filtreye uyan değişiklik yok', description: 'Türü ya da anahtarı değiştirin.' }
              : { title: 'Henüz değişiklik yok', description: 'Modül, açılış ve deney değişiklikleri burada listelenir.' }
          }
        />
      </div>
    </SectionCard>
  );
}
