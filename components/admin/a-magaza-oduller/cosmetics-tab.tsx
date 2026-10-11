'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AlertTriangle, Archive, CheckCircle2, CircleOff, Flame, ShoppingBag, Sparkles, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, MetricGrid, MetricTile, StatusBadge, statusBadgeProps, useDetailSheet, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, type FilterField } from '@/components/ds/page';
import { RarityBadge } from '@/components/ds/play';
import { ConfirmAction, ErrorState } from '@/components/states';
import { CosmeticPreview } from '@/components/customer/m-cuzdan-oduller/cosmetic-preview';
import {
  COSMETIC_RARITIES,
  COSMETIC_RARITY_LABEL,
  COSMETIC_SORTS,
  COSMETIC_TYPE_LABEL,
  COSMETIC_TYPES,
  STORE_PAGE_SIZE,
  cosmeticsQs,
  type CosmeticListItem,
  type CosmeticStats,
  type Paged,
} from '@/lib/admin-store/contract';
import { errorText, fetchCosmetics, seedCosmetics, storeKeys } from './api';
import { COSMETIC_STATUS, fmtNumber } from './format';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const SORT_IDS = ['name', 'price', 'owners', 'sales30d', 'rarity', 'created'];
export const ADMIN_PREVIEW_USER = { image: null, name: 'Müşteri', frameColor: null };

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Ad, kısa ad ya da açıklama', minLength: 2 },
  { type: 'select', key: 'type', label: 'Tür', allLabel: 'Tüm türler', options: COSMETIC_TYPES.map((t) => ({ value: t, label: COSMETIC_TYPE_LABEL[t] })) },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    allLabel: 'Tümü (arşiv hariç)',
    options: [
      { value: 'active', label: 'Satışta' },
      { value: 'inactive', label: 'Satışta değil' },
      { value: 'archived', label: 'Arşivdekiler' },
    ],
  },
  { type: 'select', key: 'rarity', label: 'Nadirlik', allLabel: 'Tümü', options: COSMETIC_RARITIES.map((r) => ({ value: r, label: COSMETIC_RARITY_LABEL[r] })) },
];

export type CosmeticsInitial = { qs: string; page: Paged<CosmeticListItem> } | null;


export function CosmeticsTab({
  initial,
  stats,
  statsError,
  onRetryStats,
  onCreate,
}: {
  initial: CosmeticsInitial;
  stats: CosmeticStats | undefined;
  statsError: unknown;
  onRetryStats: () => void;
  onCreate: () => void;
}) {
  const qc = useQueryClient();
  const filters = useFilterState(FIELDS);
  const sheet = useDetailSheet('kozmetik');
  const table = useUrlTableState({ defaultPageSize: STORE_PAGE_SIZE, defaultSort: [{ id: 'created', desc: true }], sortableIds: SORT_IDS });
  const qs = cosmeticsQs({
    q: str(filters.values.q),
    type: str(filters.values.type),
    status: str(filters.values.status),
    rarity: str(filters.values.rarity),
    sort: table.params.sort,
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: storeKeys.cosmetics(qs),
    queryFn: ({ signal }) => fetchCosmetics(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<CosmeticListItem>[]>(
    () => [
      {
        id: 'name',
        header: 'Ürün',
        enableHiding: false,
        meta: { mobile: 'title', label: 'Ürün' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="group flex min-w-[15rem] items-center gap-3">
              {c.type !== 'other' ? <MiniPreview item={c} /> : null}
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">{c.name}</span>
                <span className="flex items-center gap-1 truncate text-xs text-fg-muted">
                  {c.assetWarning ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Görünüm uyarısı" /> : null}
                  {c.type !== 'other' ? COSMETIC_TYPE_LABEL[c.type] : 'Bilinmeyen tür'}
                  {c.slug ? <span className="font-mono"> · {c.slug}</span> : null}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'rarity',
        header: 'Nadirlik',
        meta: { mobile: 'subtitle', label: 'Nadirlik' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <RarityBadge rarity={row.original.rarity} />,
      },
      {
        id: 'price',
        header: 'Fiyat',
        meta: { numeric: true, label: 'Fiyat' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="tabular-nums">{row.original.price > 0 ? `${fmtNumber(row.original.price)} puan` : 'Ücretsiz'}</span>,
      },
      {
        id: 'owners',
        header: 'Sahip',
        meta: { numeric: true, label: 'Sahip' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{fmtNumber(row.original.owners)}</span>
            <span className="block text-xs text-fg-muted">{fmtNumber(row.original.equipped)} kuşanmış</span>
          </div>
        ),
      },
      {
        id: 'sales30d',
        header: '30 gün',
        meta: { numeric: true, label: '30 gün satış' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{fmtNumber(row.original.sales30d)}</span>
            {row.original.gifts30d > 0 ? <span className="block text-xs text-fg-muted">+{fmtNumber(row.original.gifts30d)} hediye</span> : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(COSMETIC_STATUS, row.original.status)} />,
      },
    ],
    []
  );

  const href = (status: string) => `?tab=kozmetik&status=${status}`;
  const seed = async () => {
    const r = await seedCosmetics();
    toast.success(r.added.length ? `${fmtNumber(r.added.length)} demo ürün satışta-değil olarak eklendi` : 'Eksik demo ürün yok');
    await qc.invalidateQueries({ queryKey: storeKeys.all });
  };
  const seedButton = stats && stats.demoMissing > 0 ? (
    <ConfirmAction
      tone="brand"
      title="Eksik demo ürünleri eklensin mi?"
      description="Yalnız katalogda olmayan demo ürünleri “satışta değil” olarak eklenir. Mevcut ürünlerin fiyatı, adı ve durumu DEĞİŞMEZ."
      impact={[{ label: 'Eklenecek ürün', value: fmtNumber(stats.demoMissing) }]}
      confirmLabel="Eksikleri ekle"
      trigger={
        <Button variant="outline" className="min-h-11">
          <Sparkles className="h-4 w-4" aria-hidden />
          Eksik demo ürünleri ekle ({fmtNumber(stats.demoMissing)})
        </Button>
      }
      onConfirm={seed}
    />
  ) : null;

  return (
    <div className="space-y-4 pt-4">
      {statsError ? (
        <ErrorState title="Kozmetik sayıları yüklenemedi" description={errorText(statsError)} onRetry={onRetryStats} />
      ) : (
        <MetricGrid cols={5}>
          <MetricTile size="compact" label="Satışta" metric={{ value: stats?.active ?? null }} icon={<CheckCircle2 />} tone="success" loading={!stats} href={href('active')} />
          <MetricTile size="compact" label="Satışta değil" metric={{ value: stats?.inactive ?? null }} icon={<CircleOff />} loading={!stats} href={href('inactive')} hint="Satın alınamaz, hediye edilemez; sahipler kullanır" />
          <MetricTile size="compact" label="30 gün satış + hediye" metric={{ value: stats?.sales30d ?? null }} icon={<ShoppingBag />} loading={!stats} />
          <MetricTile
            size="compact"
            label="30 gün yakılan puan"
            metric={{ value: stats?.burned30d ?? null, unit: 'puan', compact: true }}
            icon={<Flame />}
            tone="brand"
            loading={!stats}
            hint="Puan defteri: satın alma + hediye"
          />
          <MetricTile
            size="compact"
            label="En çok satan (30 gün)"
            metric={{ value: stats?.topSeller?.count ?? null }}
            icon={<Trophy />}
            loading={!stats}
            hint={stats ? (stats.topSeller ? stats.topSeller.name : 'Son 30 günde satış yok') : undefined}
          />
        </MetricGrid>
      )}
      {stats && stats.nonStandard > 0 ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          {fmtNumber(stats.nonStandard)} ürünün görünümü müşteride doğru çizilmeyebilir (ör. adresli çerçeve, sınıf tabanlı arka plan). Satırdaki uyarı
          simgesine bakıp ürünü düzenleyin.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterBar fields={FIELDS} ariaLabel="Kozmetik filtreleri" />
        {seedButton}
      </div>
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(list.data.total)} ürün bulundu` : ''}
      </p>
      <DataTable
        ariaLabel="Kozmetik kataloğu"
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
                title: 'Filtrelere uyan ürün yok',
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                    Filtreleri temizle
                  </Button>
                ),
              }
            : {
                icon: Archive,
                title: 'Kozmetik katalog boş',
                description: 'Avatar çerçevesi, profil rozeti ve arka planlar müşterinin puan harcadığı ikinci vitrindir.',
                action: (
                  <Button className="min-h-11" onClick={onCreate}>
                    İlk ürünü oluştur
                  </Button>
                ),
                secondaryAction: seedButton,
              }
        }
      />
    </div>
  );
}

/** Tablo satırı için küçük önizleme: müşteri bileşeninin KENDİSİ, yarı ölçekte (animasyonlar hover/odakta). */
export function MiniPreview({ item }: { item: Pick<CosmeticListItem, 'type' | 'asset' | 'name'> }) {
  if (item.type === 'other') return null;
  return (
    <span className="relative block h-12 w-[4.5rem] shrink-0 overflow-hidden" aria-hidden>
      <span className="absolute left-0 top-0 block origin-top-left scale-50">
        <CosmeticPreview item={{ type: item.type, asset: item.asset, name: item.name }} preview={ADMIN_PREVIEW_USER} />
      </span>
    </span>
  );
}
