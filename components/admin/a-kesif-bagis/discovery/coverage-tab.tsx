'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, ExternalLink, MapPin, MapPinOff, Palmtree, Store, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, MetricGrid, MetricTile, StatusBadge, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, type FilterField } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { COVERAGE_FILTERS, COVERAGE_FILTER_LABEL, type CoveragePage, type CoverageRow } from '@/lib/admin-discovery/contract';
import { discoveryKeys, errorText, fetchCoverage } from '../api';
import { fmtNumber } from '../format';
import { useDiscoveryDraft } from './discovery-center';
import { useOpenLocationEditor } from './locations-tab';
import { AdminKesifBagisText } from '../copy';

export type CoverageInitial = { qs: string; page: CoveragePage } | null;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const SOURCE: Record<CoverageRow['location'], { label: string; tone: 'success' | 'info' | 'danger' }> = {
  profile: { label: 'Profilden', tone: 'success' },
  fallback: { label: 'Yedek konum', tone: 'info' },
  none: { label: 'Yok', tone: 'danger' },
};

/**
 * Kapsama — Keşfet'in veri sağlığı: konum, çalışma saati, kategori. Tek doğruluk kaynağı bayi
 * profilidir; yedek konum yalnız profil konumu olmayan işletmede devreye girer (rapor Bulgu 3).
 */
export function CoverageTab({ initial }: { initial: CoverageInitial }) {
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: 'Ara', placeholder: 'İşletme, e-posta ya da adres', minLength: 2 },
      { type: 'select', key: 'filter', label: 'Kapsam', allLabel: null, defaultValue: 'all', options: COVERAGE_FILTERS.map((f) => ({ value: f, label: COVERAGE_FILTER_LABEL[f] })) },
    ],
    []
  );
  const filters = useFilterState(fields);
  const table = useUrlTableState({ defaultPageSize: 20 });
  const sp = new URLSearchParams();
  sp.set('filter', str(filters.values.filter) || 'all');
  if (str(filters.values.q)) sp.set('q', str(filters.values.q));
  sp.set('page', String(table.params.page));
  sp.set('size', String(table.params.pageSize));
  const qs = sp.toString();
  const list = useQuery({
    queryKey: discoveryKeys.coverage(qs),
    queryFn: ({ signal }) => fetchCoverage(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 30_000,
  });
  const s = list.data?.summary;
  const { draft } = useDiscoveryDraft();
  const openEditor = useOpenLocationEditor();
  const fallbackIds = useMemo(() => new Set(draft.locations.map((l) => l.dealerId)), [draft.locations]);

  const columns = useMemo<ColumnDef<CoverageRow>[]>(
    () => [
      {
        id: 'name',
        header: 'İşletme',
        enableSorting: false,
        meta: { mobile: 'title', label: 'İşletme' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-[12rem]">
            <span className="block truncate font-medium text-fg">{row.original.name}</span>
            <span className="block truncate text-xs text-fg-muted">{row.original.address ?? 'Adres yok'}</span>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Konum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Konum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" tone={SOURCE[row.original.location].tone} label={SOURCE[row.original.location].label} />,
      },
      {
        id: 'hours',
        header: 'Çalışma saati',
        enableSorting: false,
        meta: { label: 'Çalışma saati' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.holiday ? (
            <StatusBadge size="sm" tone="warning" label="Tatilde" />
          ) : (
            <StatusBadge size="sm" tone={row.original.hours === 'none' ? 'danger' : row.original.hours === 'profile' ? 'success' : 'info'} label={row.original.hours === 'none' ? 'Bilinmiyor' : row.original.hours === 'profile' ? 'Profilden' : 'Yedek saat'} />
          ),
      },
      {
        id: 'categories',
        header: 'Kategori',
        enableSorting: false,
        meta: { label: 'Kategori' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.categories.length ? <span className="text-sm">{row.original.categories.join(', ')}</span> : <span className="text-sm text-danger">Yok</span>),
      },
      {
        id: 'actions',
        header: 'İşlem',
        enableSorting: false,
        meta: { label: 'İşlem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
              <Link href={`/admin/users/${encodeURIComponent(row.original.id)}`} onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                Profil
              </Link>
            </Button>
            {row.original.location !== 'profile' ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor({ id: row.original.id, name: row.original.name, email: row.original.email });
                }}
              >
                <MapPin className="h-4 w-4" aria-hidden />
                {fallbackIds.has(row.original.id) ? 'Yedeği düzenle' : 'Yedek konum ver'}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [openEditor, fallbackIds]
  );

  return (
    <div className="space-y-4 pt-4">
      {list.isError && !s ? (
        <ErrorState title="Kapsama bilgisi yüklenemedi" description={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            size="compact"
            label="Keşfet’te görünen"
            metric={{ value: s ? pct(s.withProfileLocation + s.withFallbackOnly, s.dealers) : null, format: 'percent' }}
            hint={s ? `${fmtNumber(s.withProfileLocation + s.withFallbackOnly)} / ${fmtNumber(s.dealers)} işletmenin konumu var` : undefined}
            icon={<Store />}
            tone="brand"
            loading={!s}
          />
          <MetricTile
            size="compact"
            label="Konumu olmayan"
            metric={{ value: s?.withoutLocation ?? null }}
            hint="Müşteri bu işletmeleri yakınında göremez"
            icon={<MapPinOff />}
            tone={s && s.withoutLocation > 0 ? 'danger' : 'neutral'}
            loading={!s}
            href="?tab=genel&filter=missing-location"
          />
          <MetricTile
            size="compact"
            label="Saati bilinen"
            metric={{ value: s ? pct(s.withHours, s.dealers) : null, format: 'percent' }}
            hint={s ? `${fmtNumber(s.dealers - s.withHours)} işletmede “açık/kapalı” gösterilmez${s.holiday ? ` · ${fmtNumber(s.holiday)} tatilde` : ''}` : undefined}
            icon={s?.holiday ? <Palmtree /> : <Clock />}
            tone="info"
            loading={!s}
            href="?tab=genel&filter=missing-hours"
          />
          <MetricTile
            size="compact"
            label="Kategorisi olan"
            metric={{ value: s ? pct(s.withCategories, s.dealers) : null, format: 'percent' }}
            hint={s ? `Bilgisi tam: ${fmtNumber(s.complete)} işletme` : undefined}
            icon={<Tags />}
            loading={!s}
            href="?tab=genel&filter=missing-category"
          />
        </MetricGrid>
      )}
      {s && s.shadowedFallbacks > 0 ? (
        <p className="text-sm text-fg-muted">
          {fmtNumber(s.shadowedFallbacks)} yedek konum satırı kullanılmıyor: bu işletmelerin profilinde konum var ve profil önceliklidir. “Yedek konumlar” sekmesinden temizleyebilirsiniz.
        </p>
      ) : null}
      <FilterBar fields={fields} ariaLabel="Kapsama filtreleri" />
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(list.data.total)} işletme listelendi` : ''}
      </p>
      <DataTable
        ariaLabel="İşletme kapsaması"
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        manualPagination
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0}
        empty={
          filters.activeCount > 0
            ? { variant: 'filtered', title: 'Bu süzgece uyan işletme yok', secondaryAction: <Button variant="outline" className="min-h-11" onClick={filters.clear}><AdminKesifBagisText k="clearFilter" /></Button> }
            : { title: 'Henüz bayi yok', description: 'Bayi hesabı açıldığında kapsama burada görünür.' }
        }
      />
    </div>
  );
}
