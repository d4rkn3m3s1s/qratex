'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Coins, Gift, Hourglass, PackageOpen, Plus, RefreshCw, Ticket } from 'lucide-react';
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
import { FilterBar, PageHeader, PanelPage, SectionTabs, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import {
  CAMPAIGN_PAGE_SIZE,
  CAMPAIGN_STATUS_FILTERS,
  queryString,
  type CampaignListItem,
  type CampaignListPage,
  type CampaignStatusFilter,
  type SurpriseStats,
} from '@/lib/admin-surprise-boxes/contract';
import { boxKeys, errorText, fetchBoxStats, fetchCampaigns } from './api';
import { BoxSendSheet } from './box-send-sheet';
import { CampaignDetailBody } from './campaign-detail';
import { DailyTab } from './daily-tab';
import { CAMPAIGN_STATE_MAP, fmtDateTime, fmtNumber, pct } from './format';

export type BoxesInitial = {
  stats: SurpriseStats | null;
  list: { qs: string; page: CampaignListPage } | null;
};

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Başlık ya da kupon kodu', minLength: 2 },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    allLabel: 'Tümü',
    options: [
      { value: 'pending', label: 'Açılmamış kutusu olan' },
      { value: 'opened', label: 'Hepsi açılmış' },
    ],
  },
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function BoxesCenter({ initial }: { initial: BoxesInitial }) {
  const qc = useQueryClient();
  const { get, set } = useUrlState();
  const stats = useQuery({ queryKey: boxKeys.stats(), queryFn: fetchBoxStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const s = stats.data;
  const sheet = useDetailSheet('kampanya', { history: 'push' });
  const tab = get('tab') === 'gunluk' ? 'gunluk' : 'kampanyalar';
  const sendOpen = get('gonder') === '1';
  const presetCoupon = get('kupon');

  const filters = useFilterState(FIELDS);
  const table = useUrlTableState({ defaultPageSize: CAMPAIGN_PAGE_SIZE, defaultSort: [{ id: 'createdAt', desc: true }], sortableIds: [] });
  const statusRaw = str(filters.values.status);
  const status = ((CAMPAIGN_STATUS_FILTERS as readonly string[]).includes(statusRaw) ? statusRaw : 'all') as CampaignStatusFilter;
  const qs = queryString({ q: str(filters.values.q), status, page: table.params.page, size: table.params.pageSize });
  const list = useQuery({
    queryKey: boxKeys.list(qs),
    queryFn: ({ signal }) => fetchCampaigns(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial.list && initial.list.qs === qs ? initial.list.page : undefined,
    staleTime: 15_000,
    enabled: tab === 'kampanyalar',
  });

  const columns = useMemo<ColumnDef<CampaignListItem>[]>(
    () => [
      {
        id: 'title',
        header: 'Kampanya',
        enableHiding: false,
        enableSorting: false,
        meta: { mobile: 'title', label: 'Kampanya' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex min-w-0 max-w-sm items-center gap-3">
              <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border">
                <Gift className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">{c.title}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {c.sender?.name ?? 'Gönderen bilinmiyor'}
                  {c.legacy ? ' · tekil kutu' : ''}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'state',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <StatusBadge size="sm" {...statusBadgeProps(CAMPAIGN_STATE_MAP, row.original.state)} />,
      },
      {
        id: 'open',
        header: 'Açılma',
        enableSorting: false,
        meta: { label: 'Açılma' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          const p = pct(c.opened, c.recipients);
          return (
            <div className="min-w-[8rem] space-y-1 text-sm">
              <span className="qx-num block">
                {fmtNumber(c.opened)} / {fmtNumber(c.recipients)} <span className="text-fg-muted">(%{p})</span>
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full bg-success" style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        },
      },
      {
        id: 'points',
        header: 'Puan',
        enableSorting: false,
        meta: { label: 'Puan', numeric: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <span className="whitespace-nowrap text-sm">
              {fmtNumber(c.totalPoints)} puan
              <span className="block text-xs text-fg-muted">{c.pendingPoints > 0 ? `${fmtNumber(c.pendingPoints)} bekliyor` : `${fmtNumber(c.pointsPerBox)} / kutu`}</span>
            </span>
          );
        },
      },
      {
        id: 'coupon',
        header: 'Kupon',
        enableSorting: false,
        meta: { label: 'Kupon' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.couponCode ? <span className="font-mono text-sm">{row.original.couponCode}</span> : <span className="text-sm text-fg-muted">—</span>),
      },
      {
        id: 'createdAt',
        header: 'Tarih',
        enableSorting: false,
        meta: { label: 'Tarih' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} className="whitespace-nowrap text-sm">
            {fmtDateTime(row.original.createdAt)}
          </time>
        ),
      },
    ],
    []
  );

  const filtered = filters.activeCount > 0;
  const moduleEnabled = s?.moduleEnabled !== false;

  const openSend = () => set({ gonder: '1' }, { history: 'push' });

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Sürpriz Kutular"
          description="Müşterilere puan, kupon ya da mesaj içeren hediye kutusu gönderin; açılmayı izleyin, açılmamışları geri çekin."
          icon={<Gift />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: boxKeys.all })} aria-label="Verileri yenile">
                <RefreshCw className={`h-4 w-4 ${stats.isFetching || list.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                Yenile
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" asChild>
                <Link href="/admin/coupons">
                  <Ticket className="h-4 w-4" aria-hidden />
                  Kuponlar
                </Link>
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={openSend} disabled={!moduleEnabled} title={moduleEnabled ? undefined : 'Modül kapalı'}>
                <Plus className="h-4 w-4" aria-hidden />
                Yeni gönderim
              </Button>
            </div>
          }
        />
      }
    >
      {s && !s.moduleEnabled ? (
        <div role="status" className="qx-small flex flex-wrap items-start gap-2 rounded-card border border-warning-border bg-warning-subtle px-4 py-3 text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">Sürpriz kutu modülü kapalı: yeni gönderim yapılamaz, müşteriler kutularını göremez. Geçmiş kampanyaları inceleyebilirsiniz.</span>
          <Link href="/admin/settings?tab=modules" className="font-medium underline underline-offset-4">
            Modüller’den aç
          </Link>
        </div>
      ) : null}

      {stats.isError ? (
        <ErrorState title="Özet sayılar yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            label="Bu ay gönderilen"
            metric={{ value: s?.gifts.boxesMonth ?? null, unit: 'kutu' }}
            icon={<Gift />}
            tone="brand"
            loading={!s}
            animate
            hint={s ? `${fmtNumber(s.gifts.campaignsMonth)} kampanya (İstanbul ayı)` : undefined}
          />
          <MetricTile
            label="Açılma oranı (30 gün)"
            metric={{ value: s?.gifts.openRate30d ?? null, format: 'percent' }}
            icon={<PackageOpen />}
            tone="success"
            loading={!s}
            hint={s ? `${fmtNumber(s.gifts.opened30d)} / ${fmtNumber(s.gifts.boxes30d)} kutu` : undefined}
          />
          <MetricTile
            label="Dağıtılan puan (30 gün)"
            metric={{ value: s?.gifts.pointsOpened30d ?? null, unit: 'puan' }}
            icon={<Coins />}
            tone="info"
            loading={!s}
            animate
            hint="Açılan hediye kutularından basılan"
          />
          <MetricTile
            label="Bekleyen puan yükümlülüğü"
            metric={{ value: s?.gifts.pendingPoints ?? null, unit: 'puan' }}
            icon={<Hourglass />}
            tone={s && s.gifts.pendingPoints > 0 ? 'warning' : 'neutral'}
            loading={!s}
            hint={s ? `${fmtNumber(s.gifts.pendingBoxes)} açılmamış kutu · bugünkü bütçeniz ${fmtNumber(s.remainingToday)}` : undefined}
            href="?status=pending"
          />
        </MetricGrid>
      )}

      <SectionTabs
        variant="underline"
        paramKey="tab"
        defaultValue="kampanyalar"
        resetKeys={['page', 'q', 'status', 'kampanya']}
        ariaLabel="Sürpriz kutu bölümleri"
        tabs={[
          { value: 'kampanyalar', label: 'Hediye kampanyaları', count: list.data?.total },
          { value: 'gunluk', label: 'Günlük kutular' },
        ]}
      />

      {tab === 'kampanyalar' ? (
        <div className="space-y-4">
          <FilterBar fields={FIELDS} ariaLabel="Kampanya filtreleri" resetKeys={['page']} />
          <p className="sr-only" aria-live="polite">
            {list.data ? `${fmtNumber(list.data.total)} kampanya bulundu` : ''}
          </p>
          <DataTable
            ariaLabel="Hediye kampanyaları"
            columns={columns}
            data={list.data?.items}
            query={list}
            getRowId={(r) => r.id}
            getRowLabel={(r) => r.title}
            manualPagination
            manualSorting
            manualFiltering
            rowCount={list.data?.total}
            {...table}
            filtered={filtered}
            activeRowId={sheet.id}
            onRowClick={(r) => sheet.open(r.id)}
            empty={
              filtered
                ? {
                    variant: 'filtered',
                    title: 'Filtrelere uyan kampanya yok',
                    secondaryAction: (
                      <Button variant="outline" className="min-h-11" onClick={filters.clear}>
                        Filtreleri temizle
                      </Button>
                    ),
                  }
                : {
                    title: 'Henüz hediye kutusu gönderilmedi',
                    description: 'İlk kampanyayı oluşturun; müşteri görünümünü gönderimden önce önizleyebilirsiniz.',
                    secondaryAction: moduleEnabled ? (
                      <Button className="min-h-11" onClick={openSend}>
                        <Plus className="h-4 w-4" aria-hidden />
                        Yeni gönderim
                      </Button>
                    ) : undefined,
                  }
            }
          />
        </div>
      ) : stats.isError ? null : (
        <DailyTab stats={s} loading={!s} />
      )}

      <DetailSheet paramKey="kampanya" size="lg" history="push" title="Kampanya ayrıntısı" description="Alıcılar, açılış durumu ve denetim geçmişi">
        {(id) => <CampaignDetailBody id={id} />}
      </DetailSheet>

      <BoxSendSheet
        open={sendOpen}
        onOpenChange={(o) => {
          if (!o) set({ gonder: null, kupon: null });
        }}
        remainingToday={s?.remainingToday ?? null}
        moduleEnabled={moduleEnabled}
        presetCoupon={presetCoupon}
        onSent={(campaignId) => {
          void qc.invalidateQueries({ queryKey: boxKeys.all });
          set({ gonder: null, kupon: null, tab: null, kampanya: campaignId });
        }}
      />
    </PanelPage>
  );
}
