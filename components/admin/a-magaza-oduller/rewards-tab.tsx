'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CircleDashed, Coins, PackageX, Rocket, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, MetricGrid, MetricTile, StatusBadge, statusBadgeProps, useDetailSheet, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, type FilterField } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import {
  REWARD_SORTS,
  REWARD_TYPE_LABEL,
  REWARD_TYPES,
  STORE_PAGE_SIZE,
  rewardsQs,
  type Paged,
  type RewardListItem,
  type RewardStats,
} from '@/lib/admin-store/contract';
import { errorText, fetchRewards, storeKeys } from './api';
import { REWARD_STATUS, REWARD_TYPE_TONE, fmtNumber, rulesSummary } from './format';
import { RewardIcon, StockBadge } from './parts';
import { STORE_DICT, useStoreCopy } from './copy';
import { localizeFields, useSourceT } from '@/components/ds/page/source-dict';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const SORT_IDS = ['cost', 'name', 'claims30d', 'created', 'stock'];

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Ad ya da açıklama', minLength: 2 },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    allLabel: 'Tümü (arşiv hariç)',
    options: [
      { value: 'published', label: 'Yayında' },
      { value: 'draft', label: 'Taslak' },
      { value: 'scheduled', label: 'Zamanlanmış' },
      { value: 'expired', label: 'Süresi doldu' },
      { value: 'soldout', label: 'Tükenen' },
      { value: 'low', label: 'Az kalan' },
      { value: 'archived', label: 'Arşivdekiler' },
    ],
  },
  { type: 'select', key: 'type', label: 'Tür', allLabel: 'Tüm türler', options: REWARD_TYPES.map((t) => ({ value: t, label: REWARD_TYPE_LABEL[t] })) },
];

export type RewardsInitial = { qs: string; page: Paged<RewardListItem> } | null;


export function RewardsTab({
  initial,
  stats,
  statsError,
  onRetryStats,
  onCreate,
}: {
  initial: RewardsInitial;
  stats: RewardStats | undefined;
  statsError: unknown;
  onRetryStats: () => void;
  onCreate: () => void;
}) {
  const fx = useStoreCopy().fx;
  const L = useSourceT(STORE_DICT);
  const uy = useStoreCopy().ui2;
  const ux = useStoreCopy().ui;
  const fields = useMemo(() => localizeFields(FIELDS, L), [L]);
  const filters = useFilterState(fields);
  const sheet = useDetailSheet('odul');
  const table = useUrlTableState({ defaultPageSize: STORE_PAGE_SIZE, defaultSort: [{ id: 'cost', desc: false }], sortableIds: SORT_IDS });
  const qs = rewardsQs({
    q: str(filters.values.q),
    status: str(filters.values.status),
    type: str(filters.values.type),
    sort: table.params.sort,
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: storeKeys.rewards(qs),
    queryFn: ({ signal }) => fetchRewards(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<RewardListItem>[]>(
    () => [
      {
        id: 'name',
        header: ux.odul,
        enableHiding: false,
        meta: { mobile: 'title', label: ux.odul } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const r = row.original;
          const rules = rulesSummary(r.rules);
          return (
            <div className="flex min-w-[15rem] items-center gap-3">
              <RewardIcon icon={r.icon} name={r.name} muted={r.status === 'archived' || r.status === 'draft'} />
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">{r.name}</span>
                <span className="block truncate text-xs text-fg-muted">{rules.length ? rules.join(' · ') : r.description}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: ux.tur,
        enableSorting: false,
        meta: { mobile: 'subtitle', label: ux.tur } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" icon={null} tone={REWARD_TYPE_TONE[row.original.type]} label={L(REWARD_TYPE_LABEL[row.original.type])} />,
      },
      {
        id: 'cost',
        header: 'Maliyet',
        meta: { numeric: true, label: ux.maliyet } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="tabular-nums">{fmtNumber(row.original.cost)} puan</span>,
      },
      {
        id: 'stock',
        header: 'Stok',
        meta: { label: ux.stok } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StockBadge stock={row.original.stock} pool={row.original.pool} />,
      },
      {
        id: 'claims30d',
        header: 'Talep',
        meta: { numeric: true, label: ux.talep } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{fmtNumber(row.original.claims30d)}</span>
            <span className="block text-xs text-fg-muted">toplam {fmtNumber(row.original.claimsTotal)}</span>
          </div>
        ),
      },
      {
        id: 'pending',
        header: 'Bekleyen',
        enableSorting: false,
        meta: { numeric: true, label: ux.bekleyen } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.pending > 0 ? <span className="tabular-nums text-warning">{fmtNumber(row.original.pending)}</span> : <span className="text-fg-muted">—</span>),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { label: ux.durum } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(REWARD_STATUS, row.original.status)} label={L(statusBadgeProps(REWARD_STATUS, row.original.status).label)} />,
      },
    ],
    []
  );

  const href = (status: string) => `?tab=oduller&status=${status}`;

  return (
    <div className="space-y-4 pt-4">
      {statsError ? (
        <ErrorState title={ux.odulSayilariYuklenemedi} description={errorText(statsError)} onRetry={onRetryStats} />
      ) : (
        <MetricGrid cols={3}>
          <MetricTile size="compact" label={ux.yayinda} metric={{ value: stats?.published ?? null }} icon={<Rocket />} tone="success" loading={!stats} href={href('published')} />
          <MetricTile size="compact" label={ux.taslak} metric={{ value: stats?.draft ?? null }} icon={<CircleDashed />} loading={!stats} href={href('draft')} hint={ux.musteriGormez} />
          <MetricTile
            size="compact"
            label={ux.tukenen}
            metric={{ value: stats?.soldOut ?? null }}
            icon={<PackageX />}
            tone={stats && stats.soldOut > 0 ? 'danger' : 'neutral'}
            loading={!stats}
            href={href('soldout')}
          />
          <MetricTile
            size="compact"
            label={ux.azKalan}
            metric={{ value: stats?.low ?? null }}
            icon={<AlertTriangle />}
            tone={stats && stats.low > 0 ? 'warning' : 'neutral'}
            loading={!stats}
            href={href('low')}
            hint={ux.stok10UnAltinda}
          />
          <MetricTile
            size="compact"
            label={ux.bekleyenFizikselTeslim}
            metric={{ value: stats?.pendingFulfilment ?? null }}
            icon={<Truck />}
            tone={stats && stats.pendingFulfilment > 0 ? 'warning' : 'neutral'}
            loading={!stats}
            href="?tab=talepler&status=pending&type=physical"
          />
          <MetricTile
            size="compact"
            label={ux.son30GunHarcanan}
            metric={{ value: stats?.spent30d ?? null, unit: 'puan', compact: true }}
            icon={<Coins />}
            tone="brand"
            loading={!stats}
            hint={stats ? `${fmtNumber(stats.claims30d)} talep · ${fmtNumber(stats.refunds30d)} iade (puan defterinden)` : undefined}
          />
        </MetricGrid>
      )}

      <FilterBar fields={fields} ariaLabel={ux.odulFiltreleri} />
      <p className="sr-only" aria-live="polite">
        {list.data ? fx.rewardsFound(fmtNumber(list.data.total)) : ''}
      </p>
      <DataTable
        ariaLabel={ux.odulKatalogu}
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        activeRowId={sheet.id}
        onRowClick={(r) => sheet.open(r.id)}
        empty={
          filters.activeCount > 0
            ? {
                variant: 'filtered',
                title: ux.filtrelereUyanOdulYok,
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                    {uy.filtreleriTemizle}
                  </Button>
                ),
              }
            : {
                title: ux.henuzOdulYok,
                description: ux.musterilerPuanlariniBuradaTanimladiginiz,
                action: (
                  <Button className="min-h-11" onClick={onCreate}>
                    {ux.ilkOduluOlustur}
                  </Button>
                ),
              }
        }
      />
    </div>
  );
}
