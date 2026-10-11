'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTable, StatusBadge, statusBadgeProps, useDetailSheet, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, type FilterField } from '@/components/ds/page';
import { buildProjectQs, CATEGORY_LABEL, KNOWN_CATEGORIES, PROJECT_STATUSES, PROJECT_STATUS_LABEL, ratioText, type ProjectListPage, type ProjectRow } from '@/lib/admin-donations/contract';
import { donationKeys, fetchProjects } from '../api';
import { fmtAgo, fmtNumber, PROJECT_STATUS } from '../format';
import { ProgressBar } from './parts';
import { AdminKesifBagisText } from '../copy';

export type ProjectsInitial = { qs: string; page: ProjectListPage } | null;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function ProjectsTab({ initial, onCreate }: { initial: ProjectsInitial; onCreate: () => void }) {
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: 'Ara', placeholder: 'Kampanya adı ya da açıklama', minLength: 2 },
      { type: 'select', key: 'status', label: 'Durum', allLabel: 'Tümü (arşiv hariç)', options: PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] })) },
      { type: 'select', key: 'category', label: 'Kategori', allLabel: 'Tümü', options: KNOWN_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })) },
      {
        type: 'select',
        key: 'siralama',
        label: 'Sıralama',
        allLabel: null,
        defaultValue: 'newest',
        options: [
          { value: 'newest', label: 'Öne çıkan, en yeni' },
          { value: 'progress', label: 'Hedefe en yakın' },
          { value: 'raised', label: 'En çok toplanan' },
          { value: 'goal', label: 'En yüksek hedef' },
          { value: 'name', label: 'Ada göre' },
        ],
      },
    ],
    []
  );
  const filters = useFilterState(fields);
  const table = useUrlTableState({ defaultPageSize: 20 });
  const sheet = useDetailSheet('kampanya');
  const qs = buildProjectQs({
    q: str(filters.values.q),
    status: str(filters.values.status),
    category: str(filters.values.category),
    sort: str(filters.values.siralama),
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: donationKeys.list(qs),
    queryFn: ({ signal }) => fetchProjects(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<ProjectRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Kampanya',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Kampanya' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex min-w-[14rem] items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {p.icon}
              </span>
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">
                  {p.name}
                  {p.featured ? <span className="ml-2 text-xs font-normal text-brand"><AdminKesifBagisText k="featured" /></span> : null}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {p.category === 'other' ? `Bilinmeyen kategori (${p.rawCategory})` : CATEGORY_LABEL[p.category]} · {ratioText(p.impact)}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge size="sm" {...statusBadgeProps(PROJECT_STATUS, row.original.status)} />
            {row.original.completed ? <StatusBadge size="sm" tone="success" label="Tamamlandı" /> : null}
          </div>
        ),
      },
      {
        id: 'progress',
        header: 'İlerleme',
        enableSorting: false,
        meta: { label: 'İlerleme' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-[10rem] space-y-1">
              <ProgressBar percent={p.percent} label={`${p.name} ilerlemesi`} done={p.completed} />
              <span className="block text-xs tabular-nums text-fg-muted">
                {fmtNumber(p.current)} / {fmtNumber(p.goal)} puan{p.percent != null ? ` · %${p.percent}` : ''}
              </span>
              {p.current !== p.raised ? <span className="block text-xs text-warning">Gerçek toplam {fmtNumber(p.raised)} — uzlaştırılmalı</span> : null}
            </div>
          );
        },
      },
      {
        id: 'donors',
        header: 'Bağışçı',
        enableSorting: false,
        meta: { numeric: true, label: 'Bağışçı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{fmtNumber(row.original.donors)}</span>
            <span className="block text-xs text-fg-muted">{fmtNumber(row.original.donations)} bağış</span>
          </div>
        ),
      },
      {
        id: 'last',
        header: 'Son bağış',
        enableSorting: false,
        meta: { label: 'Son bağış' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.lastDonationAt ? <time dateTime={row.original.lastDonationAt}>{fmtAgo(row.original.lastDonationAt)}</time> : <span className="text-fg-muted"><AdminKesifBagisText k="never" /></span>),
      },
    ],
    []
  );

  return (
    <div className="space-y-4 pt-4">
      <FilterBar fields={fields} ariaLabel="Kampanya filtreleri" />
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(list.data.total)} kampanya bulundu` : ''}
      </p>
      <DataTable
        ariaLabel="Bağış kampanyaları"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        manualPagination
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        activeRowId={sheet.id}
        onRowClick={(r) => sheet.open(r.id)}
        empty={
          filters.activeCount > 0
            ? { variant: 'filtered', title: 'Filtrelere uyan kampanya yok', secondaryAction: <Button variant="outline" className="min-h-11" onClick={filters.clear}>Filtreleri temizle</Button> }
            : {
                variant: 'first-use',
                title: 'Henüz bağış kampanyası yok',
                description: 'İlk kampanyayı oluşturun; bağışa açtığınızda müşterinin Cüzdan → Bağış ekranında görünür.',
                secondaryAction: (
                  <Button className="min-h-11" onClick={onCreate}>
                    Yeni kampanya
                  </Button>
                ),
              }
        }
      />
    </div>
  );
}
