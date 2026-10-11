'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { FilterBar, SectionCard, type FilterField } from '@/components/ds/page';
import { DataTable, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import type { AuditRow } from '@/lib/admin-trust/contract';
import { fetchAudit, trustKeys } from './api';
import { ROLE_LABEL, fmtAbs, fmtRel } from './format';

const FIELDS: FilterField[] = [
  {
    type: 'select',
    key: 'hwindow',
    label: 'Zaman',
    allLabel: null,
    defaultValue: '7d',
    options: [
      { value: '24h', label: 'Son 24 saat' },
      { value: '7d', label: 'Son 7 gün' },
      { value: '30d', label: 'Son 30 gün' },
    ],
  },
];

/** Hassas yönetici işlemleri — rozet/profil gibi gürültü dışlanır; aktör, rol ve IP görünür. */
export function AuditTab() {
  const sp = useSearchParams();
  const table = useUrlTableState({ pageKey: 'hpage', sizeKey: 'hsize', sortKey: 'hsort' });
  const qs = new URLSearchParams({
    window: sp.get('hwindow') || '7d',
    page: String(table.params.page),
    size: String(table.params.pageSize),
  }).toString();
  const q = useQuery({ queryKey: trustKeys.audit(qs), queryFn: ({ signal }) => fetchAudit(qs, signal), placeholderData: keepPreviousData, staleTime: 15_000 });

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        id: 'action',
        header: 'İşlem',
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-fg">{row.original.actionLabel}</p>
            <p className="truncate text-xs text-fg-muted">
              {row.original.entity}
              {row.original.entityId ? ` · ${row.original.entityId}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'actor',
        header: 'Yapan',
        meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const a = row.original.actor;
          return (
            <span className="text-sm text-fg">
              {a.name || a.email || 'Sistem'}
              {a.role ? <span className="text-fg-muted"> · {ROLE_LABEL[a.role] ?? a.role}</span> : null}
            </span>
          );
        },
      },
      {
        id: 'ip',
        header: 'IP',
        meta: { mobile: 'field', label: 'IP' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="font-mono text-xs text-fg-muted">{row.original.ipAddress ?? '—'}</span>,
      },
      {
        id: 'createdAt',
        header: 'Zaman',
        meta: { mobile: 'field', label: 'Zaman' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={fmtAbs(row.original.createdAt)} className="whitespace-nowrap text-sm text-fg-muted">
            {fmtRel(row.original.createdAt)}
          </time>
        ),
      },
    ],
    [],
  );

  return (
    <SectionCard
      title="Hassas işlemler"
      description="Askıya alma, rol ve yetki değişimi, puan düzeltmesi, anonimleştirme ve Güven Merkezi aksiyonları."
      actions={
        <Link href="/admin/audit" className="inline-flex min-h-11 items-center gap-1 text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          Tam denetim günlüğü
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-4">
        <FilterBar fields={FIELDS} resetKeys={['hpage']} />
        <DataTable
          ariaLabel="Hassas yönetici işlemleri"
          columns={columns}
          data={q.data?.items}
          query={q}
          getRowId={(r) => r.id}
          manualPagination
          rowCount={q.data?.total}
          pagination={table.pagination}
          onPaginationChange={table.onPaginationChange}
          empty={{ title: 'Hassas işlem yok', description: 'Bu dönemde kayda geçen hassas yönetici işlemi bulunmuyor.' }}
        />
      </div>
    </SectionCard>
  );
}
