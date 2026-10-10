'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Gift, Banknote, MessageSquareText, Send, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, MetricGrid, MetricTile, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState, QueryState } from '@/components/states';
import type { WinBackBand, WinBackOverview, WinBackRow } from '@/lib/dealer-customers/types';
import { customerKeys, fetchWinBack } from './api';
import { useCustomersCopy } from './copy';
import { useCustomersActions } from './context';
import { ActionHistory } from './action-history';
import { BandBadge, CustomerCell, useDisplayName, useFormat } from './parts';
import { WinBackRadar } from './winback-radar';

export function WinBackTab() {
  const q = useQuery({ queryKey: customerKeys.winback(), queryFn: fetchWinBack, staleTime: 60_000 });
  return (
    <QueryState query={q} skeleton="table" isEmpty={() => false}>
      {(d) => <WinBackView d={d} />}
    </QueryState>
  );
}

type BandFilter = WinBackBand | 'all';

function WinBackView({ d }: { d: WinBackOverview }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const display = useDisplayName();
  const { openCustomer, compose, canSend } = useCustomersActions();
  const [band, setBand] = useState<BandFilter>('all');
  const rows = useMemo(() => (band === 'all' ? d.rows : d.rows.filter((r) => r.band === band)), [d.rows, band]);
  const bandTotal = band === 'all' ? d.total : d.bands[band];
  const bandLabel = band === 'all' ? copy.allBands : copy.band[band];

  const columns = useMemo<ColumnDef<WinBackRow>[]>(
    () => [
      {
        id: 'customer',
        header: copy.colCustomer,
        enableHiding: false,
        enableSorting: false,
        meta: { mobile: 'title', label: copy.colCustomer } satisfies DataTableColumnMeta,
        cell: ({ row }) => <CustomerCell c={row.original} sub={copy.absence(row.original.daysSinceLast, row.original.rhythmDays)} />,
      },
      {
        id: 'band',
        accessorFn: (r) => r.band,
        header: copy.colBand,
        meta: { mobile: 'subtitle', label: copy.colBand } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            <BandBadge band={row.original.band} />
            {row.original.contacted && <StatusBadge size="sm" tone="success" label={copy.contacted} />}
          </span>
        ),
      },
      {
        id: 'avg',
        accessorFn: (r) => r.avgOrderValue,
        header: copy.colAvg,
        meta: { numeric: true, label: copy.colAvg } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.avgOrderValue),
      },
      {
        id: 'visits',
        accessorFn: (r) => r.visits,
        header: copy.colVisits,
        meta: { numeric: true, label: copy.colVisits } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.number(row.original.visits),
      },
      {
        id: 'spend',
        accessorFn: (r) => r.totalSpent,
        header: copy.colSpend,
        meta: { numeric: true, label: copy.colSpend } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.totalSpent),
      },
    ],
    [copy, fmt]
  );

  if (d.total === 0) {
    return (
      <div className="space-y-6">
        <EmptyState icon={TrendingUp} title={copy.winbackEmpty} />
        <ActionHistory />
      </div>
    );
  }

  const r30 = d.results30d;
  return (
    <div className="space-y-6">
      <MetricGrid cols={5}>
        <MetricTile label={copy.band.waking} metric={{ value: d.bands.waking }} hint={copy.bandRule.waking} tone="warning" />
        <MetricTile label={copy.band.sleeping} metric={{ value: d.bands.sleeping }} hint={copy.bandRule.sleeping} tone="info" />
        <MetricTile label={copy.band.lost} metric={{ value: d.bands.lost }} hint={copy.bandRule.lost} />
        <MetricTile
          label={copy.monthlyAtStake}
          metric={{ value: d.monthlyAtStake, format: 'currency', currency: 'TRY' }}
          hint={copy.monthlyAtStakeHint}
          icon={<Banknote />}
        />
        <MetricTile
          label={copy.results30}
          metric={{ value: r30.runs > 0 ? r30.revenue : null, format: 'currency', currency: 'TRY' }}
          hint={r30.runs > 0 ? copy.results30Value(r30.sent, r30.returned) : copy.results30Empty}
          tone="success"
        />
      </MetricGrid>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceChips
          aria-label={copy.filterBand}
          size="sm"
          value={band}
          onChange={(v) => v && setBand(v)}
          options={[
            { value: 'all', label: `${copy.allBands} (${d.total})` },
            { value: 'waking', label: `${copy.band.waking} (${d.bands.waking})` },
            { value: 'sleeping', label: `${copy.band.sleeping} (${d.bands.sleeping})` },
            { value: 'lost', label: `${copy.band.lost} (${d.bands.lost})` },
          ]}
        />
        {canSend && bandTotal > 0 && (
          <Button
            className="min-h-11"
            onClick={() =>
              compose({
                audience: { kind: 'band', band },
                audienceLabel: band === 'all' ? copy.tabWinback : `${copy.tabWinback}: ${bandLabel}`,
                type: 'message',
                template: 'winback',
              })
            }
          >
            <Send className="h-4 w-4" aria-hidden />
            {band === 'all' ? copy.sendToAllBands : copy.sendToBand(bandLabel)}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <SectionCard title={copy.radarTitle}>
          <WinBackRadar rows={rows} total={bandTotal} onOpen={openCustomer} />
        </SectionCard>
        <SectionCard title={copy.winbackListTitle} description={copy.winbackListDesc} density="flush">
          <DataTable
            ariaLabel={copy.winbackListTitle}
            columns={columns}
            data={rows}
            getRowId={(r) => r.ref}
            getRowLabel={(r) => display(r)}
            density="compact"
            defaultPageSize={20}
            enableRowSelection={canSend}
            bulkActions={
              canSend
                ? ({ ids, clear }) => (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          compose({ audience: { kind: 'customers', refs: ids.slice(0, 200) }, audienceLabel: copy.selectedAudience(Math.min(ids.length, 200)), type: 'message', template: 'winback' });
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
        </SectionCard>
      </div>

      <ActionHistory />
    </div>
  );
}
