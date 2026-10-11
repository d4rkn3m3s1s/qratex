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
import { useSourceT } from '@/components/ds/page/source-dict';
import { BADGES_DICT, useBadgesAdminCopy } from './copy';

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
  const ux = useBadgesAdminCopy().ui;
  return (
    <div className="space-y-4 pt-4">
      <SectionTabs
        paramKey="set"
        variant="pill"
        ariaLabel={ux.rozetTuru}
        resetKeys={['page', 'health', 'series', 'q', 'rarity']}
        tabs={[
          { value: 'normal', label: ux.normalRozetler, icon: <ShieldCheck />, count: stats?.normal.total },
          { value: 'series', label: ux.diziKarakterRozetleri, icon: <Sparkles />, count: stats?.series.total },
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
  const fz = useBadgesAdminCopy().fx;
  const L = useSourceT(BADGES_DICT);
  const uy = useBadgesAdminCopy().ui2;
  const ux = useBadgesAdminCopy().ui;
  const bx = useBadgesAdminCopy();
  const qc = useQueryClient();
  const { set: setUrl } = useUrlState();
  const isSeries = set === 'series';
  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: ux.ara, placeholder: ux.adAciklamaKimlikYa, minLength: 2 },
      ...(isSeries
        ? [
            {
              type: 'select' as const,
              key: 'series',
              label: ux.diziKategorisi,
              allLabel: ux.tumKategoriler,
              options: (stats?.seriesCategories ?? []).map((c) => ({ value: c.key, label: `${c.emoji} ${c.name}` })),
            },
          ]
        : []),
      { type: 'select', key: 'rarity', label: ux.nadirlik, allLabel: ux.tumu, options: BADGE_RARITIES.map((r) => ({ value: r, label: L(RARITY_LABEL[r]) })) },
      { type: 'select', key: 'health', label: ux.durum, allLabel: ux.tumuArsivHaric, options: HEALTH_OPTIONS.map((o) => ({ ...o, label: L(o.label) })).filter((o) => !isSeries || !['exact', 'approximate', 'untrackable'].includes(o.value)) },
    ],
    [isSeries, stats?.seriesCategories, L, ux]
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
        meta: { mobile: 'title', label: ux.rozet } satisfies DataTableColumnMeta,
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
        meta: { mobile: 'subtitle', label: ux.nadirlik } satisfies DataTableColumnMeta,
        cell: ({ row }) => <RarityBadge rarity={row.original.rarity} />,
      },
      {
        id: 'requirement',
        header: ux.kosul,
        enableSorting: false,
        meta: { label: ux.kosul } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="space-y-1 text-sm">
              <span className="block">{b.isCharacter ? ux.kategoriEsigi : `${requirementLabel(b.requirementType)} ≥ ${fmtNumber(b.targetValue)}`}</span>
              <StatusBadge size="sm" tone={TRACKABILITY_TONE[b.trackability]} label={L(TRACKABILITY_LABEL[b.trackability])} />
            </div>
          );
        },
      },
      {
        id: 'reward',
        header: ux.odul,
        enableSorting: false,
        meta: { numeric: true, label: ux.odulPuani } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.rewardPoints > 0 ? `+${fmtNumber(row.original.rewardPoints)}` : '—'),
      },
      {
        id: 'earned',
        header: ux.kazanim,
        meta: { numeric: true, label: ux.kazanim } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{fmtNumber(row.original.earnedCount)}</span>
            <span className="block text-xs text-fg-muted">{fz.in30d(fmtNumber(row.original.earned30d))}</span>
          </div>
        ),
      },
      {
        id: 'lastEarned',
        header: ux.sonKazanim,
        meta: { label: ux.sonKazanim } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.lastEarnedAt ? <time dateTime={row.original.lastEarnedAt}>{fmtAgo(row.original.lastEarnedAt)}</time> : <span className="text-fg-muted">{bx.never}</span>,
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { label: ux.durum } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(BADGE_STATUS, row.original.status)} label={L(statusBadgeProps(BADGE_STATUS, row.original.status).label)} />,
      },
    ],
    [L, bx, fz, ux]
  );

  const runBulk = async (action: 'activate' | 'deactivate' | 'archive', ids: string[], clear: () => void) => {
    const r = await bulkAction({ action, ids, ...(action === 'archive' ? { confirm: true } : {}) });
    const label = action === 'archive' ? ux.arsivlendi : action === 'activate' ? ux.etkinlestirildi : ux.pasiflestirildi;
    toast.success(fz.bulkDone(fmtNumber(r.changed), label, r.skipped.length, [...new Set(r.skipped.map((s) => s.reason))].join(', ')));
    clear();
    await qc.invalidateQueries({ queryKey: badgeKeys.all });
  };

  return (
    <div className="space-y-4 pt-4">
      {statsError ? (
        <ErrorState title={ux.rozetSaglikSayilariYuklenemedi} description={errorText(statsError)} onRetry={onRetryStats} />
      ) : (
        <MetricGrid cols={isSeries ? 4 : 5}>
          <MetricTile size="compact" label={ux.etkin} metric={{ value: counts?.active ?? null }} icon={<CheckCircle2 />} tone="success" loading={!counts} href={healthHref('active')} />
          <MetricTile size="compact" label={ux.pasif} metric={{ value: counts?.inactive ?? null }} icon={<CircleOff />} tone="warning" loading={!counts} href={healthHref('inactive')} hint={ux.yeniKazanimDurdu} />
          <MetricTile size="compact" label={ux.hicKazanilmamis} metric={{ value: counts?.never ?? null }} icon={<Ghost />} loading={!counts} href={healthHref('never')} />
          {!isSeries ? (
            <MetricTile
              size="compact"
              label={ux.izlenemezOlu}
              metric={{ value: counts?.untrackable ?? null }}
              icon={<HelpCircle />}
              tone={counts && counts.untrackable > 0 ? 'danger' : 'neutral'}
              loading={!counts}
              href={healthHref('untrackable')}
              hint={counts ? fz.approxExact(fmtNumber(counts.approximate), fmtNumber(counts.exact)) : undefined}
            />
          ) : (
            <MetricTile
              size="compact"
              label={ux.katalogdaKaydiOlmayan}
              metric={{ value: stats?.charactersWithoutRecord ?? null }}
              icon={<Layers />}
              loading={!stats}
              hint={ux.ilkKazanimdaOtomatikOlusturulur}
            />
          )}
          <MetricTile size="compact" label={ux.arsivde} metric={{ value: counts?.archived ?? null }} icon={<Archive />} loading={!counts} href={healthHref('archived')} hint={ux.kazanimlarKorunur} />
        </MetricGrid>
      )}
      {stats && !statsError ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Waves className="h-4 w-4" aria-hidden />
          {fz.totalEarned(fmtNumber(stats.totalEarned), fmtNumber(stats.earned30d))}
          {health ? (
            <Button variant="link" size="sm" className="h-auto min-h-11 px-1 sm:min-h-0" onClick={() => setUrl({ health: null, page: null })}>
              {ux.durumSuzgeciniKaldir}
            </Button>
          ) : null}
        </p>
      ) : null}

      <FilterBar fields={fields} ariaLabel={ux.rozetFiltreleri} />
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
              {ux.etkinlestir}
            </Button>
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => runBulk('deactivate', ids, clear).catch((e) => toast.error(errorText(e)))}>
              {ux.pasiflestir}
            </Button>
            {!isSeries ? (
              <ConfirmAction
                tone="warning"
                title={fz.bulkArchiveTitle(fmtNumber(ids.length))}
                description={ux.arsivlenenRozetlerYeniKazanilamaz}
                irreversibleNote={false}
                confirmLabel={ux.arsivle}
                trigger={
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                    {ux.arsivle}
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
                title: ux.filtrelereUyanRozetYok,
                secondaryAction: (
                  <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                    {uy.filtreleriTemizle}
                  </Button>
                ),
              }
            : {
                title: isSeries ? ux.diziRozetiKaydiYok : ux.henuzRozetYok,
                description: isSeries ? ux.karakterRozetleriIlkKazanimda : ux.sagUsttekiYeniRozet,
              }
        }
      />
    </div>
  );
}
