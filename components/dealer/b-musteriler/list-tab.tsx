'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Gift, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, type FilterField } from '@/components/ds/page';
import { LIST_DEFAULT_SORT, LIST_PAGE_SIZE, LIST_SORT_IDS, type CustomerListItem, type CustomerListPage } from '@/lib/dealer-customers/types';
import { customerKeys, fetchList, listQueryString, type ListParams } from './api';
import { useCustomersCopy, type CustomersCopy } from './copy';
import { useCustomersActions } from './context';
import { CustomerCell, RiskPill, TagChips, useDisplayName, useFormat } from './parts';

function filterFields(copy: CustomersCopy): FilterField[] {
  return [
    { type: 'search', key: 'q', label: copy.search, placeholder: copy.searchPlaceholder, minLength: 2 },
    {
      type: 'select',
      key: 'segment',
      label: copy.filterSegment,
      allLabel: copy.allTags,
      options: (['at_risk', 'vip', 'loyal', 'dormant', 'new'] as const).map((t) => ({ value: t, label: copy.tag[t] })),
    },
    {
      type: 'select',
      key: 'risk',
      label: copy.filterRisk,
      allLabel: copy.allRisks,
      options: (['high', 'medium', 'low', 'unknown'] as const).map((r) => ({ value: r, label: copy.risk[r] })),
    },
    {
      type: 'select',
      key: 'band',
      label: copy.filterBand,
      allLabel: copy.allBands,
      options: (['waking', 'sleeping', 'lost'] as const).map((b) => ({ value: b, label: copy.band[b] })),
    },
  ];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function ListTab({ initial }: { initial: { params: ListParams; page: CustomerListPage } | null }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const display = useDisplayName();
  const { openCustomer, compose, canSend } = useCustomersActions();
  const fields = useMemo(() => filterFields(copy), [copy]);
  const filters = useFilterState(fields);
  const table = useUrlTableState({
    defaultPageSize: LIST_PAGE_SIZE,
    defaultSort: [{ id: 'spend', desc: true }],
    sortableIds: LIST_SORT_IDS,
  });

  const params: ListParams = {
    q: str(filters.values.q),
    segment: str(filters.values.segment),
    risk: str(filters.values.risk),
    band: str(filters.values.band),
    sort: table.params.sort ?? LIST_DEFAULT_SORT,
    page: table.params.page,
    pageSize: table.params.pageSize,
  };
  const initialMatches = initial != null && JSON.stringify(customerKeys.list(initial.params)) === JSON.stringify(customerKeys.list(params));

  const q = useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => fetchList(params),
    placeholderData: keepPreviousData,
    initialData: initialMatches ? initial!.page : undefined,
    staleTime: 30_000,
  });

  const columns = useMemo<ColumnDef<CustomerListItem>[]>(
    () => [
      {
        id: 'customer',
        header: copy.colCustomer,
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'title', label: copy.colCustomer } satisfies DataTableColumnMeta,
        cell: ({ row }) => <CustomerCell c={row.original} />,
      },
      {
        id: 'tags',
        header: copy.colTags,
        enableSorting: false,
        meta: { label: copy.colTags } satisfies DataTableColumnMeta,
        cell: ({ row }) => <TagChips tags={row.original.tags} />,
      },
      {
        id: 'spend',
        accessorKey: 'totalSpent',
        header: copy.colSpend,
        meta: { numeric: true, label: copy.colSpend } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.totalSpent),
      },
      {
        id: 'visits',
        accessorKey: 'totalVisits',
        header: copy.colVisits,
        meta: { numeric: true, label: copy.colVisits } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.number(row.original.totalVisits),
      },
      {
        id: 'avg',
        accessorKey: 'avgOrderValue',
        header: copy.colAvg,
        meta: { numeric: true, label: copy.colAvg } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.avgOrderValue),
      },
      {
        id: 'lastVisit',
        accessorKey: 'lastPurchaseAt',
        header: copy.colLastVisit,
        meta: { mobile: 'subtitle', label: copy.colLastVisit } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.lastPurchaseAt ?? undefined} title={fmt.date(row.original.lastPurchaseAt)}>
            {fmt.days(row.original.daysSinceLast)}
          </time>
        ),
      },
      {
        id: 'risk',
        accessorKey: 'predictedChurn',
        header: copy.colRisk,
        meta: { label: copy.colRisk } satisfies DataTableColumnMeta,
        cell: ({ row }) => <RiskPill level={row.original.risk} value={row.original.predictedChurn} />,
      },
    ],
    [copy, fmt]
  );

  const exportHref = `/api/dealer/customers/export?${listQueryString({ ...params, page: 1, pageSize: undefined })}`;

  return (
    <div className="space-y-4">
      <FilterBar fields={fields}>
        {canSend && (
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <a href={exportHref} download>
              <Download className="h-4 w-4" aria-hidden />
              {copy.exportCsv}
            </a>
          </Button>
        )}
      </FilterBar>
      <DataTable
        ariaLabel={copy.tableLabel}
        columns={columns}
        data={q.data?.items}
        query={q}
        getRowId={(r) => r.ref}
        getRowLabel={(r) => display(r)}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={q.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        empty={{ variant: filters.activeCount > 0 ? 'filtered' : 'default', title: copy.emptyList }}
        enableRowSelection={canSend}
        bulkActions={
          canSend
            ? ({ ids, clear }) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      compose({ audience: { kind: 'customers', refs: ids.slice(0, 200) }, audienceLabel: copy.selectedAudience(Math.min(ids.length, 200)), type: 'message', template: 'checkin' });
                      clear();
                    }}
                  >
                    <MessageSquareText className="h-4 w-4" aria-hidden />
                    {copy.bulkMessage}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      compose({ audience: { kind: 'customers', refs: ids.slice(0, 200) }, audienceLabel: copy.selectedAudience(Math.min(ids.length, 200)), type: 'personal_offer' });
                      clear();
                    }}
                  >
                    <Gift className="h-4 w-4" aria-hidden />
                    {copy.bulkOffer}
                  </Button>
                </div>
              )
            : undefined
        }
        onRowClick={(r) => openCustomer(r.ref)}
      />
    </div>
  );
}
