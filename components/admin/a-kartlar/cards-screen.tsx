'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Activity, Archive, Ban, CircleDashed, Copy, CreditCard, Download, Hourglass, Layers, Unlock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DetailSheet,
  MetricGrid,
  MetricTile,
  StatusBadge,
  statusBadgeProps,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import { FilterBar, PageHeader, PanelPage, SectionTabs, useFilterState, type FilterField } from '@/components/ds/page';
import { ConfirmAction, ErrorState } from '@/components/states';
import {
  CARD_DEFAULT_SORT,
  CARD_EXPORT_MAX,
  CARD_PAGE_SIZE,
  CARD_PAGE_SIZES,
  CARD_SORT_IDS,
  IDLE_DAYS,
  cardQueryString,
  type BatchPage,
  type CardListItem,
  type CardListPage,
  type CardStats,
} from '@/lib/admin-cards/contract';
import { bulkCards, cardsKeys, errorText, exportHref, fetchBatchOptions, fetchList, fetchStats } from './api';
import { BatchesPanel } from './batches-panel';
import { CardDetailBody } from './card-detail';
import { BlockDialog, GenerateDialog } from './dialogs';
import { CARD_STATUS, copyText, customerLabel, fmtDate, fmtNumber, groupToken, viewStatus } from './format';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type CardsInitial = {
  stats: CardStats | null;
  list: { qs: string; page: CardListPage } | null;
  batches: { qs: string; page: BatchPage } | null;
  batchOptions: Array<{ id: string; name: string }> | null;
};

export function CardsScreen({ initial }: { initial: CardsInitial }) {
  const qc = useQueryClient();
  const sheet = useDetailSheet('card');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [blockIds, setBlockIds] = useState<{ ids: string[]; linked: boolean } | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const batchOpts = useQuery({
    queryKey: cardsKeys.batchOptions(),
    queryFn: fetchBatchOptions,
    initialData: initial.batchOptions ? { items: initial.batchOptions } : undefined,
    staleTime: 60_000,
  });

  const fields = useMemo<FilterField[]>(
    () => [
      { type: 'search', key: 'q', label: 'Ara', placeholder: 'Kod, kart bağlantısı, müşteri adı ya da e-posta', minLength: 2 },
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        allLabel: 'Tüm durumlar (arşiv hariç)',
        options: [
          { value: 'UNUSED', label: 'Kullanılmamış' },
          { value: 'ACTIVATED', label: 'Aktif' },
          { value: 'BLOCKED', label: 'Bloklu' },
          { value: 'ARCHIVED', label: 'Arşivde' },
        ],
      },
      {
        type: 'select',
        key: 'batch',
        label: 'Üretim partisi',
        allLabel: 'Tüm partiler',
        options: (batchOpts.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })),
      },
      {
        type: 'select',
        key: 'usage',
        label: 'Kullanım',
        allLabel: 'Tümü',
        options: [
          { value: 'any', label: 'Tüketimi var' },
          { value: 'none', label: 'Hiç tüketim yok' },
          { value: 'idle', label: `Aktif, ${IDLE_DAYS} gündür kullanılmıyor` },
        ],
      },
    ],
    [batchOpts.data]
  );
  const filters = useFilterState(fields, { resetKeys: ['page', 'card'] });
  const table = useUrlTableState({
    defaultPageSize: CARD_PAGE_SIZE,
    pageSizeOptions: CARD_PAGE_SIZES,
    defaultSort: [{ id: 'createdAt', desc: true }],
    sortableIds: CARD_SORT_IDS,
  });

  const f = { q: str(filters.values.q), status: str(filters.values.status), batch: str(filters.values.batch), usage: str(filters.values.usage) };
  const filterQs = cardQueryString(f);
  const sort = table.params.sort ?? CARD_DEFAULT_SORT;
  const qs = cardQueryString({ ...f, sort, page: table.params.page, size: table.params.pageSize });

  useEffect(() => setRowSelection({}), [filterQs]);

  const stats = useQuery({ queryKey: cardsKeys.stats(), queryFn: fetchStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const list = useQuery({
    queryKey: cardsKeys.list(qs),
    queryFn: ({ signal }) => fetchList(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial.list && initial.list.qs === qs ? initial.list.page : undefined,
    staleTime: 15_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: cardsKeys.all });

  const columns = useMemo<ColumnDef<CardListItem>[]>(
    () => [
      {
        id: 'token',
        header: 'Kart',
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'title', label: 'Kart', interactive: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-sm text-fg" title={row.original.token}>
              {groupToken(row.original.token)}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
              aria-label={`${row.original.token} kodunu kopyala`}
              onClick={async (e) => {
                e.stopPropagation();
                if (await copyText(row.original.token)) toast.success('Kod kopyalandı');
                else toast.error('Kopyalanamadı; kodu elle seçin.');
              }}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(CARD_STATUS, viewStatus(row.original))} title={row.original.blockReason ?? undefined} />,
      },
      {
        id: 'customer',
        header: 'Müşteri',
        enableSorting: false,
        meta: { label: 'Müşteri' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.customer ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{customerLabel(row.original.customer)}</p>
              {row.original.customer.name ? <p className="truncate text-xs text-fg-muted">{row.original.customer.email}</p> : null}
            </div>
          ) : (
            <span className="text-sm text-fg-subtle">Atanmamış</span>
          ),
      },
      {
        id: 'batch',
        header: 'Parti',
        enableSorting: false,
        meta: { label: 'Parti' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="block max-w-[12rem] truncate text-sm">{row.original.batchName ?? row.original.batchId ?? '—'}</span>,
      },
      {
        id: 'consumptions',
        accessorKey: 'consumptions',
        header: 'Tüketim',
        meta: { numeric: true, label: 'Tüketim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.consumptions),
      },
      {
        id: 'activatedAt',
        accessorKey: 'activatedAt',
        header: 'Aktivasyon',
        meta: { label: 'Aktivasyon' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.activatedAt ? <time dateTime={row.original.activatedAt}>{fmtDate(row.original.activatedAt)}</time> : '—'),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Üretim',
        meta: { label: 'Üretim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.createdAt}>{fmtDate(row.original.createdAt)}</time>,
      },
    ],
    []
  );

  const s = stats.data;
  const total = list.data?.total ?? 0;
  const kpi = (patch: Record<string, string>) => `?${cardQueryString(patch)}`;
  const csvHref = exportHref(cardQueryString({ ...f, sort }));
  const items = list.data?.items ?? [];

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Fiziksel Kartlar"
          description="Kartı kodla ya da müşteriyle bulun, parti üretip baskıya gönderin, kayıp/çalıntı kartı gerekçesiyle bloklayın."
          icon={<CreditCard />}
          actions={
            <Button className="min-h-11 sm:min-h-10" onClick={() => setGenerateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Parti üret
            </Button>
          }
        />
      }
    >
      {stats.isError ? (
        <ErrorState title="Özet sayılar yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile label="Kart (arşiv hariç)" metric={{ value: s?.total ?? 0 }} icon={<CreditCard />} loading={!s} href="?" hint={s ? `${fmtNumber(s.archived)} arşivde` : undefined} />
          <MetricTile label="Kullanılmamış" metric={{ value: s?.UNUSED ?? 0 }} icon={<CircleDashed />} loading={!s} href={kpi({ status: 'UNUSED' })} />
          <MetricTile
            label="Aktif"
            metric={{ value: s?.ACTIVATED ?? 0 }}
            icon={<Activity />}
            tone="success"
            loading={!s}
            href={kpi({ status: 'ACTIVATED' })}
            hint={s ? `Son 7 günde ${fmtNumber(s.activatedLast7d)} aktivasyon` : undefined}
          />
          <MetricTile label="Bloklu" metric={{ value: s?.BLOCKED ?? 0 }} icon={<Ban />} tone="danger" loading={!s} href={kpi({ status: 'BLOCKED' })} />
          <MetricTile
            label={`Aktif ama ${IDLE_DAYS} gündür kullanılmıyor`}
            metric={{ value: s?.idleActive ?? 0 }}
            icon={<Hourglass />}
            tone="warning"
            loading={!s}
            href={kpi({ usage: 'idle' })}
          />
        </MetricGrid>
      )}

      <SectionTabs
        ariaLabel="Kart görünümleri"
        resetKeys={['page', 'card']}
        tabs={[
          { value: 'cards', label: 'Kartlar', icon: <CreditCard className="h-4 w-4" aria-hidden /> },
          { value: 'batches', label: 'Üretim partileri', icon: <Layers className="h-4 w-4" aria-hidden /> },
        ]}
      >
        {(active) =>
          active === 'batches' ? (
            <BatchesPanel initial={initial.batches} onChanged={refresh} />
          ) : (
            <div className="space-y-4">
              <FilterBar fields={fields} resetKeys={['page', 'card']} ariaLabel="Kart filtreleri">
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-10">
                  <a href={csvHref} download aria-label={`Filtre sonucunu CSV olarak indir (${fmtNumber(Math.min(total, CARD_EXPORT_MAX))} kart)`}>
                    <Download className="h-4 w-4" aria-hidden />
                    CSV ({fmtNumber(Math.min(total, CARD_EXPORT_MAX))})
                  </a>
                </Button>
              </FilterBar>

              <DataTable
                ariaLabel="Fiziksel kartlar"
                columns={columns}
                data={list.data?.items}
                query={list}
                getRowId={(r) => r.id}
                getRowLabel={(r) => r.token}
                manualPagination
                manualSorting
                manualFiltering
                rowCount={list.data?.total}
                pageSizeOptions={CARD_PAGE_SIZES}
                {...table}
                density="compact"
                filtered={filters.activeCount > 0}
                empty={
                  filters.activeCount > 0
                    ? {
                        variant: 'filtered',
                        title: 'Filtrelere uyan kart yok',
                        secondaryAction: (
                          <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                            Filtreleri temizle
                          </Button>
                        ),
                      }
                    : {
                        variant: 'first-use',
                        title: 'Henüz fiziksel kart yok',
                        description: 'İlk partiyi üretin; kartlar baskı listesiyle birlikte hazır olur.',
                        action: (
                          <Button className="min-h-11" onClick={() => setGenerateOpen(true)}>
                            Parti üret
                          </Button>
                        ),
                      }
                }
                enableRowSelection={(row) => !row.original.archived}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                activeRowId={sheet.id}
                onRowClick={(r) => sheet.open(r.id)}
                bulkActions={({ ids, rows, clear }) => (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 text-danger sm:min-h-9"
                      onClick={() => setBlockIds({ ids, linked: rows.some((r) => !!r.customer) })}
                    >
                      <Ban className="h-4 w-4" aria-hidden />
                      Blokla
                    </Button>
                    <ConfirmAction
                      tone="brand"
                      trigger={
                        <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                          <Unlock className="h-4 w-4" aria-hidden />
                          Bloğu kaldır
                        </Button>
                      }
                      title={`${ids.length} kartın bloğu kaldırılsın mı?`}
                      description="Yalnız bloklu kartlar etkilenir: müşteriye bağlı olan “Aktif”, bağsız olan “Kullanılmamış” durumuna döner. Diğerleri atlanır."
                      confirmLabel="Bloğu kaldır"
                      onConfirm={async () => {
                        const r = await bulkCards({ action: 'unblock', ids, notify: true });
                        toast.success(`${fmtNumber(r.done)} kartın bloğu kaldırıldı${r.skipped.length ? ` · ${fmtNumber(r.skipped.length)} atlandı` : ''}`);
                        clear();
                        refresh();
                      }}
                    />
                    <ConfirmAction
                      tone="danger"
                      trigger={
                        <Button size="sm" variant="outline" className="min-h-11 text-danger sm:min-h-9">
                          <Archive className="h-4 w-4" aria-hidden />
                          Arşivle
                        </Button>
                      }
                      title={`${ids.length} kart arşivlensin mi?`}
                      description="Arşivlenen kart kalıcı olarak kullanım dışı kalır; tüketimler, yorumlar ve kart denetim izi korunur."
                      loadImpact={async () => {
                        const r = await bulkCards({ action: 'archive', ids, dryRun: true });
                        const linked = rows.filter((x) => !!x.customer).length;
                        const used = rows.reduce((n, x) => n + x.consumptions, 0);
                        return {
                          items: [
                            { label: 'Arşivlenecek kart', value: fmtNumber(r.done), emphasis: true },
                            { label: 'Müşteriye bağlı kart (bağ korunur, kart kullanılamaz olur)', value: fmtNumber(linked), emphasis: linked > 0 },
                            { label: 'Korunacak tüketim kaydı', value: fmtNumber(used) },
                            { label: 'Atlanacak (zaten arşivde)', value: fmtNumber(r.skipped.length) },
                          ],
                        };
                      }}
                      confirmPhrase="ARŞİVLE"
                      confirmLabel="Arşivle"
                      onConfirm={async () => {
                        const r = await bulkCards({ action: 'archive', ids, notify: true });
                        toast.success(`${fmtNumber(r.done)} kart arşivlendi${r.skipped.length ? ` · ${fmtNumber(r.skipped.length)} atlandı` : ''}`);
                        clear();
                        refresh();
                      }}
                    />
                  </div>
                )}
              />
            </div>
          )
        }
      </SectionTabs>

      <DetailSheet paramKey="card" size="lg" title="Kart detayı" description={(id) => items.find((x) => x.id === id)?.token ?? ''} siblings={items.map((x) => x.id)}>
        {(id) => <CardDetailBody id={id} onChanged={refresh} />}
      </DetailSheet>

      <BlockDialog
        open={blockIds != null}
        onOpenChange={(o) => !o && setBlockIds(null)}
        title={`${blockIds?.ids.length ?? 0} kart bloklansın mı?`}
        description="Bloklu kart bayilerde okutulamaz ve aktive edilemez. Zaten bloklu ya da arşivli kartlar atlanır; blok daha sonra kaldırılabilir."
        canNotify={!!blockIds?.linked}
        onConfirm={async (v) => {
          const r = await bulkCards({ action: 'block', ids: blockIds?.ids ?? [], ...v });
          toast.success(`${fmtNumber(r.done)} kart bloklandı${r.skipped.length ? ` · ${fmtNumber(r.skipped.length)} atlandı` : ''}`);
          setRowSelection({});
          refresh();
        }}
      />

      <GenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} onDone={refresh} />
    </PanelPage>
  );
}
