'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { CheckCheck, Clock, PackageCheck, Truck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, MetricGrid, MetricTile, StatusBadge, statusBadgeProps, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import { FilterBar, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { ConfirmAction, ErrorState } from '@/components/states';
import {
  REDEMPTION_STATUSES,
  REDEMPTION_STATUS_LABEL,
  REWARD_TYPE_LABEL,
  REWARD_TYPES,
  STORE_PAGE_SIZE,
  buildQs,
  type RedemptionItem,
  type RedemptionStats,
} from '@/lib/admin-store/contract';
import { errorText, fetchRedemptions, redemptionAction, storeKeys } from './api';
import { REDEMPTION_STATUS, fmtDateTime, fmtNumber } from './format';
import { RewardIcon } from './parts';
import { STORE_DICT, useStoreCopy } from './copy';
import { localizeFields, useSourceT } from '@/components/ds/page/source-dict';

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'Kod, e-posta ya da ad', minLength: 2 },
  { type: 'select', key: 'status', label: 'Durum', allLabel: 'Tüm durumlar', options: REDEMPTION_STATUSES.map((s) => ({ value: s, label: REDEMPTION_STATUS_LABEL[s] })) },
  { type: 'select', key: 'type', label: 'Tür', allLabel: 'Tüm türler', options: REWARD_TYPES.map((t) => ({ value: t, label: REWARD_TYPE_LABEL[t] })) },
];

export function RedemptionsTab({ stats, statsError, onRetryStats }: { stats: RedemptionStats | undefined; statsError: unknown; onRetryStats: () => void }) {
  const L = useSourceT(STORE_DICT);
  const uy = useStoreCopy().ui2;
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const qc = useQueryClient();
  const fields = useMemo(() => localizeFields(FIELDS, L), [L]);
  const filters = useFilterState(fields);
  const { get, set } = useUrlState();
  const rewardId = get('rewardId') ?? '';
  const table = useUrlTableState({ defaultPageSize: STORE_PAGE_SIZE });
  const qs = buildQs({
    q: str(filters.values.q).length >= 2 ? str(filters.values.q) : null,
    status: str(filters.values.status) || null,
    type: str(filters.values.type) || null,
    rewardId: rewardId || null,
    page: table.params.page > 1 ? table.params.page : null,
    size: table.params.pageSize !== STORE_PAGE_SIZE ? table.params.pageSize : null,
  });
  const list = useQuery({
    queryKey: storeKeys.redemptions(qs),
    queryFn: ({ signal }) => fetchRedemptions(qs, signal),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: storeKeys.all });

  const columns = useMemo<ColumnDef<RedemptionItem>[]>(
    () => [
      {
        id: 'reward',
        header: ux.odul,
        enableSorting: false,
        enableHiding: false,
        meta: { mobile: 'title', label: ux.odul } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const x = row.original;
          return (
            <div className="flex min-w-[13rem] items-center gap-3">
              <RewardIcon icon={x.reward.icon} name={x.reward.name} size="sm" />
              <div className="min-w-0">
                <span className="block truncate font-medium text-fg">{x.reward.name}</span>
                <span className="block truncate font-mono text-xs text-fg-muted">{x.code ?? 'kodsuz'}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'user',
        header: ux.musteri,
        enableSorting: false,
        meta: { mobile: 'subtitle', label: ux.musteri } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate">{row.original.user.name || '—'}</span>
            <span className="block truncate text-xs text-fg-muted">{row.original.user.email || ''}</span>
          </div>
        ),
      },
      {
        id: 'paid',
        header: ux.odenen,
        enableSorting: false,
        meta: { numeric: true, label: ux.odenenPuan } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.paidPoints > 0 ? (
            <div>
              <span className="block tabular-nums">{fmtNumber(row.original.paidPoints)}</span>
              {row.original.refundedPoints > 0 ? <span className="block text-xs text-success">{fmtNumber(row.original.refundedPoints)} iade</span> : null}
            </div>
          ) : (
            <span className="text-xs text-fg-muted">{sx.freeGift}</span>
          ),
      },
      {
        id: 'redeemedAt',
        header: 'Talep',
        enableSorting: false,
        meta: { label: ux.talepZamani } satisfies DataTableColumnMeta,
        cell: ({ row }) => <time dateTime={row.original.redeemedAt}>{fmtDateTime(row.original.redeemedAt)}</time>,
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { label: ux.durum } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="space-y-1">
            <StatusBadge size="sm" {...statusBadgeProps(REDEMPTION_STATUS, row.original.status)} label={L(statusBadgeProps(REDEMPTION_STATUS, row.original.status).label)} />
            {row.original.claimedAt && row.original.status === 'fulfilled' ? (
              <span className="block text-xs text-fg-muted">{fmtDateTime(row.original.claimedAt)}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: ux.islem,
        enableSorting: false,
        enableHiding: false,
        meta: { label: ux.islem } satisfies DataTableColumnMeta,
        cell: ({ row }) => (row.original.status === 'pending' ? <RowActions x={row.original} onDone={refresh} /> : <span className="text-fg-muted">—</span>),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-4 pt-4">
      {statsError ? (
        <ErrorState title={ux.talepSayilariYuklenemedi} description={errorText(statsError)} onRetry={onRetryStats} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile size="compact" label={ux.bekleyen} metric={{ value: stats?.pending ?? null }} icon={<Clock />} tone={stats && stats.pending > 0 ? 'warning' : 'neutral'} loading={!stats} href="?tab=talepler&status=pending" />
          <MetricTile size="compact" label={ux.bekleyenFiziksel} metric={{ value: stats?.pendingPhysical ?? null }} icon={<Truck />} tone={stats && stats.pendingPhysical > 0 ? 'warning' : 'neutral'} loading={!stats} href="?tab=talepler&status=pending&type=physical" hint={ux.eldenKargoTeslimiBekliyor} />
          <MetricTile size="compact" label={ux.t30GunTeslimKullanim} metric={{ value: stats?.fulfilled30d ?? null }} icon={<PackageCheck />} tone="success" loading={!stats} />
          <MetricTile size="compact" label={ux.t30GunIptal} metric={{ value: stats?.cancelled30d ?? null }} icon={<XCircle />} loading={!stats} href="?tab=talepler&status=cancelled" />
        </MetricGrid>
      )}
      {rewardId ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          {ux.tekOdulunTalepleriGosteriliyor}
          <Button variant="link" size="sm" className="h-auto min-h-11 px-1 sm:min-h-0" onClick={() => set({ rewardId: null, page: null })}>
            {ux.tumOdullereDon}
          </Button>
        </p>
      ) : null}
      <FilterBar fields={fields} ariaLabel={ux.talepFiltreleri} />
      <p className="sr-only" aria-live="polite">
        {list.data ? `${fmtNumber(list.data.total)} talep bulundu` : ''}
      </p>
      <DataTable
        ariaLabel={ux.odulTalepleri}
        columns={columns}
        data={list.data?.items}
        query={list}
        getRowId={(r) => r.id}
        getRowLabel={(r) => `${r.reward.name} · ${r.code ?? ''}`}
        manualPagination
        manualFiltering
        rowCount={list.data?.total}
        {...table}
        filtered={filters.activeCount > 0 || !!rewardId}
        empty={
          filters.activeCount > 0 || rewardId
            ? {
                variant: 'filtered',
                title: ux.filtrelereUyanTalepYok,
                secondaryAction: (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      filters.clear();
                      set({ rewardId: null });
                    }}
                  >
                    {uy.filtreleriTemizle}
                  </Button>
                ),
              }
            : { title: ux.henuzTalepYok, description: ux.musterilerBirOduluPuanla }
        }
      />
    </div>
  );
}

function RowActions({ x, onDone }: { x: RedemptionItem; onDone: () => unknown }) {
  const fx = useStoreCopy().fx;
  const ux = useStoreCopy().ui;
  const sx = useStoreCopy();
  const [reason, setReason] = useState('');
  const isPhysical = x.reward.type === 'physical';
  return (
    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      <ConfirmAction
        tone="brand"
        title={isPhysical ? ux.teslimEdildiOlarakIsaretlensin : ux.kullanildiOlarakIsaretlensinMi}
        description={fx.fulfilDesc(x.user.name || x.user.email || fx.customer, x.reward.name)}
        confirmLabel={isPhysical ? 'Teslim edildi' : ux.kullanildi}
        trigger={
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <CheckCheck className="h-4 w-4" aria-hidden />
            {isPhysical ? 'Teslim edildi' : ux.kullanildi}
          </Button>
        }
        onConfirm={async () => {
          await redemptionAction(x.id, { action: 'fulfil' });
          toast.success(ux.talepTamamlandi);
          await onDone();
        }}
      />
      <ConfirmAction
        tone="danger"
        title={ux.talepIptalEdilipPuan}
        description={
          <div className="space-y-3">
            <p>
              {fx.codeInvalidated}{x.paidPoints > 0 ? fx.refundPart(fmtNumber(x.paidPoints)) : ux.buTalepOdemesizHediye}.
              {ux.sinirliStokluOduldeStok}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={`cancel-${x.id}`}>{sx.cancelReason}</Label>
              <Textarea id={`cancel-${x.id}`} rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ux.ornStoktaKalmadi} />
            </div>
          </div>
        }
        impact={[{ label: ux.iadeEdilecekPuan, value: fmtNumber(x.paidPoints), emphasis: x.paidPoints > 0 }]}
        confirmLabel={ux.iptalEtVeIade}
        disabled={false}
        trigger={
          <Button size="sm" variant="ghost" className="min-h-11 text-danger sm:min-h-9">
            <XCircle className="h-4 w-4" aria-hidden />
            {ux.iptal}
          </Button>
        }
        onConfirm={async () => {
          if (reason.trim().length < 3) throw new Error(fx.reasonTooShort);
          await redemptionAction(x.id, { action: 'cancel', reason: reason.trim() });
          toast.success('Talep iptal edildi');
          setReason('');
          await onDone();
        }}
      />
    </div>
  );
}
