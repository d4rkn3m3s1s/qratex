'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Archive, CheckCircle2, CircleOff, Ghost, HelpCircle, Layers, ShieldCheck, Sparkles, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  MetricGrid,
  MetricTile,
  StatusBadge,
  statusBadgeProps,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import { FilterBar, SectionTabs, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { BadgeGlyph, RarityBadge } from '@/components/ds/play';
import { ConfirmAction, ErrorState } from '@/components/states';
import {
  BADGE_DEFAULT_SORT,
  BADGE_PAGE_SIZE,
  BADGE_RARITIES,
  BADGE_SORT_IDS,
  buildListQs,
  RARITY_LABEL,
  TRACKABILITY_LABEL,
  requirementLabel,
  type BadgeListItem,
  type BadgeListPage,
  type BadgeStats,
} from '@/lib/admin-badges/contract';
import { badgeKeys, bulkAction, errorText, fetchBadges } from './api';
import { BADGE_STATUS, TRACKABILITY_TONE, fmtAgo, fmtNumber } from './format';
import { glyphSource } from './parts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const HEALTH_OPTIONS = [
  { value: 'active', label: 'Etkin' },
  { value: 'inactive', label: 'Pasif' },
  { value: 'never', label: 'Hiç kazanılmamış' },
  { value: 'exact', label: 'Tam izlenebilir' },
  { value: 'approximate', label: 'Yaklaşık' },
  { value: 'untrackable', label: 'İzlenemez (ölü rozet)' },
  { value: 'archived', label: 'Arşivdekiler' },
];

export type CatalogInitial = { qs: string; page: BadgeListPage } | null;

export function CatalogTab({ initial, stats, statsError, onRetryStats }: { initial: CatalogInitial; stats: BadgeStats | undefined; statsError: unknown; onRetryStats: () => void }) {
  return (
    <div className="space-y-4 pt-4">
      <SectionTabs
        paramKey="set"
        variant="pill"
        ariaLabel="Rozet türü"
        resetKeys={['page', 'health', 'series', 'q', 'rarity']}
        tabs={[
          { value: 'normal', label: 'Normal rozetler', icon: <ShieldCheck />, count: stats?.normal.total },
          { value: 'series', label: 'Dizi (karakter) rozetleri', icon: <Sparkles />, count: stats?.series.total },
        ]}
      >
        {(set) => <CatalogBody set={set} initial={initial} stats={stats} statsError={statsError} onRetryStats={onRetryStats} />}
      </SectionTabs>
    </div>
  );
}

function CatalogBody({
  set,
  initial,
  stats,
  statsError,
  onRetryStats,
}: {
  set: string;
  initial: CatalogInitial;
  stats: BadgeStats | undefined;
  statsError: unknown;
  onRetryStats: () => void;
}) {
  const qc = useQueryClient();
  const { set: setUrl } = useUrlState();
  const isSeries = set === 'series';
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: 'Ara', placeholder: 'Ad, açıklama, kimlik ya da koşul', minLength: 2 },
      ...(isSeries
        ? [
            {
              type: 'select' as const,
              key: 'series',
              label: 'Dizi kategorisi',
              allLabel: 'Tüm kategoriler',
              options: (stats?.seriesCategories ?? []).map((c) => ({ value: c.key, label: `${c.emoji} ${c.name}` })),
            },
          ]
        : []),
      { type: 'select', key: 'rarity', label: 'Nadirlik', allLabel: 'Tümü', options: BADGE_RARITIES.map((r) => ({ value: r, label: RARITY_LABEL[r] })) },
      { type: 'select', key: 'health', label: 'Durum', allLabel: 'Tümü (arşiv hariç)', options: HEALTH_OPTIONS.filter((o) => !isSeries || !['exact', 'approximate', 'untrackable'].includes(o.value)) },
    ],
    [isSeries, stats?.seriesCategories]
  );
  const filters = useFilterState(fields);
  const sheet = useDetailSheet('badge');
  const table = useUrlTableState({ defaultPageSize: BADGE_PAGE_SIZE, defaultSort: [{ id: 'rarity', desc: true }], sortableIds: BADGE_SORT_IDS });
  const health = str(filters.values.health);
  const qs = buildListQs({
    set,
    series: isSeries ? str(filters.values.series) : undefined,
    q: str(filters.values.q),
    rarity: str(filters.values.rarity),
    health,
    sort: table.params.sort,
    page: table.params.page,
    size: table.params.pageSize,
  });
  const list = useQuery({
    queryKey: badgeKeys.list(qs),
    queryFn: ({ signal }) => fetchBadges(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });

  const counts = isSeries ? stats?.series : stats?.normal;
  const healthHref = (h: string | null) => (h ? `?tab=katalog&set=${set}&health=${h}` : `?tab=katalog&set=${set}`);

  const columns = useMemo<ColumnDef<BadgeListItem>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Rozet',
        enableHiding: false,
        meta: { mobile: 'title', label: 'Rozet' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="flex min-w-[14rem] items-center gap-3">
              <BadgeGlyph label={b.name} {...glyphSource(b.icon)} rarity={b.rarity} color={b.color ?? undefined} size="sm" locked={b.status !== 'active'} />
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">{b.name}</span>
                <span className="block truncate text-xs text-fg-muted">{b.isCharacter ? b.seriesName ?? 'Dizi' : b.description || '—'}</span>
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
        id: 'requirement',
        header: 'Koşul',
        enableSorting: false,
        meta: { label: 'Koşul' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="space-y-1 text-sm">
              <span className="block">{b.isCharacter ? 'Kategori eşiği' : `${requirementLabel(b.requirementType)} ≥ ${fmtNumber(b.targetValue)}`}</span>
              <StatusBadge size="sm" tone={TRACKABILITY_TONE[b.trackability]} label={TRACKABILITY_LABEL[b.trackability]} />
            </div>
          );
        },
      },
      {
        id: 'reward',
        header: 'Ödül',
        enableSorting: false,
        meta: { numeric: true, label: 'Ödül puanı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.rewardPoints > 0 ? `+${fmtNumber(row.original.rewardPoints)}` : '—'),
      },
      {
        id: 'earned',
        header: 'Kazanım',
        meta: { numeric: true, label: 'Kazanım' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{fmtNumber(row.original.earnedCount)}</span>
            <span className="block text-xs text-fg-muted">30 günde {fmtNumber(row.original.earned30d)}</span>
          </div>
        ),
      },
      {
        id: 'lastEarned',
        header: 'Son kazanım',
        meta: { label: 'Son kazanım' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.lastEarnedAt ? <time dateTime={row.original.lastEarnedAt}>{fmtAgo(row.original.lastEarnedAt)}</time> : <span className="text-fg-muted">Hiç</span>,
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(BADGE_STATUS, row.original.status)} />,
      },
    ],
    []
  );

  const runBulk = async (action: 'activate' | 'deactivate' | 'archive', ids: string[], clear: () => void) => {
    const r = await bulkAction({ action, ids, ...(action === 'archive' ? { confirm: true } : {}) });
    const label = action === 'archive' ? 'arşivlendi' : action === 'activate' ? 'etkinleştirildi' : 'pasifleştirildi';
    toast.success(`${fmtNumber(r.changed)} rozet ${label}.${r.skipped.length ? ` ${r.skipped.length} rozet atlandı (${[...new Set(r.skipped.map((s) => s.reason))].join(', ')}).` : ''}`);
    clear();
    await qc.invalidateQueries({ queryKey: badgeKeys.all });
  };

  return (
    <div className="space-y-4 pt-4">
      {statsError ? (
        <ErrorState title="Rozet sağlık sayıları yüklenemedi" description={errorText(statsError)} onRetry={onRetryStats} />
      ) : (
        <MetricGrid cols={isSeries ? 4 : 5}>
          <MetricTile size="compact" label="Etkin" metric={{ value: counts?.active ?? null }} icon={<CheckCircle2 />} tone="success" loading={!counts} href={healthHref('active')} />
          <MetricTile size="compact" label="Pasif" metric={{ value: counts?.inactive ?? null }} icon={<CircleOff />} tone="warning" loading={!counts} href={healthHref('inactive')} hint="Yeni kazanım durdu" />
          <MetricTile size="compact" label="Hiç kazanılmamış" metric={{ value: counts?.never ?? null }} icon={<Ghost />} loading={!counts} href={healthHref('never')} />
          {!isSeries ? (
            <MetricTile
              size="compact"
              label="İzlenemez (ölü)"
              metric={{ value: counts?.untrackable ?? null }}
              icon={<HelpCircle />}
              tone={counts && counts.untrackable > 0 ? 'danger' : 'neutral'}
              loading={!counts}
              href={healthHref('untrackable')}
              hint={counts ? `${fmtNumber(counts.approximate)} yaklaşık · ${fmtNumber(counts.exact)} tam` : undefined}
            />
          ) : (
            <MetricTile
              size="compact"
              label="Katalogda kaydı olmayan"
              metric={{ value: stats?.charactersWithoutRecord ?? null }}
              icon={<Layers />}
              loading={!stats}
              hint="İlk kazanımda otomatik oluşturulur"
            />
          )}
          <MetricTile size="compact" label="Arşivde" metric={{ value: counts?.archived ?? null }} icon={<Archive />} loading={!counts} href={healthHref('archived')} hint="Kazanımlar korunur" />
        </MetricGrid>
      )}
      {stats && !statsError ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Waves className="h-4 w-4" aria-hidden />
          Toplam {fmtNumber(stats.totalEarned)} kazanım · son 30 günde {fmtNumber(stats.earned30d)}
          {health ? (
            <Button variant="link" size="sm" className="h-auto min-h-11 px-1 sm:min-h-0" onClick={() => setUrl({ health: null, page: null })}>
              Durum süzgecini kaldır
            </Button>
          ) : null}
        </p>
      ) : null}

      <FilterBar fields={fields} ariaLabel="Rozet filtreleri" />
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(list.data.total)} rozet bulundu` : ''}
      </p>
      <DataTable
        ariaLabel={isSeries ? 'Dizi rozetleri' : 'Normal rozetler'}
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
        enableRowSelection={(row) => row.original.status !== 'archived'}
        bulkActions={({ ids, clear }) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => runBulk('activate', ids, clear).catch((e) => toast.error(errorText(e)))}>
              Etkinleştir
            </Button>
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => runBulk('deactivate', ids, clear).catch((e) => toast.error(errorText(e)))}>
              Pasifleştir
            </Button>
            {!isSeries ? (
              <ConfirmAction
                tone="warning"
                title={`${fmtNumber(ids.length)} rozet arşivlensin mi?`}
                description="Arşivlenen rozetler yeni kazanılamaz; kullanıcıların kazandıkları ve geçmiş korunur. Karakter rozetleri atlanır."
                irreversibleNote={false}
                confirmLabel="Arşivle"
                trigger={
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                    Arşivle
                  </Button>
                }
                onConfirm={() => runBulk('archive', ids, clear)}
              />
            ) : null}
          </div>
        )}
        empty={
          filters.activeCount > 0
            ? {
                variant: 'filtered',
                title: 'Filtrelere uyan rozet yok',
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                    Filtreleri temizle
                  </Button>
                ),
              }
            : {
                title: isSeries ? 'Dizi rozeti kaydı yok' : 'Henüz rozet yok',
                description: isSeries ? 'Karakter rozetleri ilk kazanımda otomatik oluşturulur.' : 'Sağ üstteki “Yeni rozet” ile ilk rozeti oluşturun.',
              }
        }
      />
    </div>
  );
}
