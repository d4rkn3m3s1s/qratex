'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Bot, Gift, MessageSquareText, Settings2, ShieldAlert, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, MetricGrid, MetricTile, StatusBadge, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import type { RiskOverview, RiskRow } from '@/lib/dealer-customers/types';
import { customerKeys, fetchRisk } from './api';
import { useCustomersCopy } from './copy';
import { useCustomersActions } from './context';
import { InterventionSheet } from './intervention-sheet';
import { Callout, CustomerCell, RiskPill, useDisplayName, useFormat } from './parts';

type StatusFilter = 'open' | 'handled' | 'recovered' | 'all';

export function RiskTab() {
  const q = useQuery({ queryKey: customerKeys.risk(), queryFn: fetchRisk, staleTime: 60_000 });
  return (
    <QueryState query={q} skeleton="table" isEmpty={() => false}>
      {(d) => <RiskView d={d} />}
    </QueryState>
  );
}

const STATUS_TONE = { open: 'warning', handled: 'info', recovered: 'success' } as const;

function RiskView({ d }: { d: RiskOverview }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const display = useDisplayName();
  const { openCustomer, compose, canSend } = useCustomersActions();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [sheetOpen, setSheetOpen] = useState(false);
  const rows = useMemo(() => (status === 'all' ? d.rows : d.rows.filter((r) => r.status === status)), [d.rows, status]);
  const high = d.distribution.high;
  const totalKnown = d.distribution.high + d.distribution.medium + d.distribution.low + d.distribution.unknown;
  const cfg = d.intervention.config;

  const columns = useMemo<ColumnDef<RiskRow>[]>(
    () => [
      {
        id: 'customer',
        header: copy.colCustomer,
        enableHiding: false,
        meta: { mobile: 'title', label: copy.colCustomer } satisfies DataTableColumnMeta,
        cell: ({ row }) => <CustomerCell c={row.original} sub={`${copy.colLastVisit}: ${fmt.days(row.original.daysSinceLast)}`} />,
      },
      {
        id: 'risk',
        accessorFn: (r) => r.churn,
        header: copy.colRisk,
        meta: { label: copy.colRisk } satisfies DataTableColumnMeta,
        cell: ({ row }) => <RiskPill level={row.original.risk} value={row.original.churn} />,
      },
      {
        id: 'signal',
        header: copy.colSignal,
        enableSorting: false,
        meta: { label: copy.colSignal, width: '22rem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const s = row.original.signal;
          if (!s) return <span className="text-fg-muted">—</span>;
          return (
            <span className="block min-w-0">
              <span className="qx-caption text-fg-muted">
                {s.rating}/5 · {fmt.relative(s.at)} · {s.replied ? copy.signalReplied : copy.signalOpen}
                {s.intent && copy.intent[s.intent] ? ` · ${copy.intent[s.intent]}` : ''}
                {s.urgent && <span className="ml-1 font-semibold text-danger">· {copy.urgent}</span>}
              </span>
              {s.text && <span className="qx-small line-clamp-2 block text-fg">{s.text}</span>}
            </span>
          );
        },
      },
      {
        id: 'spend',
        accessorFn: (r) => r.totalSpent,
        header: copy.colSpend,
        meta: { numeric: true, label: copy.colSpend } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmt.money(row.original.totalSpent),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: copy.colStatus,
        meta: { mobile: 'subtitle', label: copy.colStatus } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <StatusBadge
            size="sm"
            tone={STATUS_TONE[row.original.status]}
            label={row.original.status === 'open' ? copy.statusOpen : row.original.status === 'handled' ? copy.statusHandled : copy.statusRecovered}
          />
        ),
      },
    ],
    [copy, fmt]
  );

  return (
    <div className="space-y-6">
      <MetricGrid cols={4}>
        <MetricTile label={copy.riskCustomers} metric={{ value: high }} hint={copy.riskCustomersHint} icon={<ShieldAlert />} tone="danger" />
        <MetricTile
          label={copy.avgRisk}
          metric={{ value: d.avgRisk != null ? Math.round(d.avgRisk * 1000) / 10 : null, format: 'percent', series: d.weekly, n: d.weeklyN }}
          hint={copy.avgRiskHint}
          sparklineLabel={copy.avgRiskHint}
        />
        <MetricTile label={copy.statusOpen} metric={{ value: d.counts.open }} hint={`${copy.statusHandled}: ${d.counts.handled}`} tone="warning" />
        <MetricTile label={copy.statusRecovered} metric={{ value: d.counts.recovered }} tone="success" />
      </MetricGrid>

      <SectionCard
        title={copy.automation}
        icon={<Bot />}
        description={cfg.enabled ? copy.automationOn(cfg.thresholdPercent, cfg.inactiveDays) : copy.automationOff}
        actions={
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => setSheetOpen(true)}>
            <Settings2 className="h-4 w-4" aria-hidden />
            {copy.automationOpen}
          </Button>
        }
      >
        <h3 className="qx-small mb-2 font-semibold text-fg">{copy.runsTitle}</h3>
        {d.intervention.runs.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.runsEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {d.intervention.runs.map((r) => (
              <li key={r.day} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <time className="qx-small qx-num w-24 shrink-0 text-fg-muted" dateTime={r.day}>
                  {fmt.date(`${r.day}T12:00:00+03:00`)}
                </time>
                <span className="qx-small text-fg">{copy.runLine(r.flagged, r.offers)}</span>
                <span className="flex flex-wrap gap-1">
                  {r.customers.map((c) => (
                    <button
                      key={c.ref}
                      type="button"
                      onClick={() => openCustomer(c.ref)}
                      className="qx-caption min-h-8 rounded-chip border border-subtle bg-surface-1 px-2 text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {c.name ?? copy.unnamed}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {totalKnown > 0 && (
        <SectionCard title={copy.distributionTitle}>
          <div
            role="img"
            aria-label={copy.distributionLabel(d.distribution.high, d.distribution.medium, d.distribution.low, d.distribution.unknown)}
            className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            {(['high', 'medium', 'low', 'unknown'] as const).map((k) =>
              d.distribution[k] > 0 ? (
                <span
                  key={k}
                  className={k === 'high' ? 'bg-danger' : k === 'medium' ? 'bg-warning' : k === 'low' ? 'bg-success' : 'bg-fg-subtle/40'}
                  style={{ width: `${(d.distribution[k] / totalKnown) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['high', 'medium', 'low', 'unknown'] as const).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 rounded-full ${k === 'high' ? 'bg-danger' : k === 'medium' ? 'bg-warning' : k === 'low' ? 'bg-success' : 'bg-fg-subtle/40'}`}
                />
                <dt className="qx-small text-fg-muted">{copy.risk[k]}</dt>
                <dd className="qx-small qx-num ml-auto font-semibold text-fg">{d.distribution[k]}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}

      {d.anonymousHighRisk30d > 0 && (
        <Callout tone="info" icon={UserX}>
          {copy.anonymousRisk(d.anonymousHighRisk30d)}
        </Callout>
      )}
      {d.flaggedExcluded30d > 0 && <Callout tone="neutral">{copy.flaggedExcluded(d.flaggedExcluded30d)}</Callout>}

      <SectionCard title={copy.riskListTitle} description={copy.riskListDesc} density="flush">
        <div className="px-4 pt-4">
          <ChoiceChips
            aria-label={copy.statusFilter}
            size="sm"
            value={status}
            onChange={(v) => v && setStatus(v)}
            options={[
              { value: 'open', label: `${copy.statusOpen} (${d.counts.open})` },
              { value: 'handled', label: `${copy.statusHandled} (${d.counts.handled})` },
              { value: 'recovered', label: `${copy.statusRecovered} (${d.counts.recovered})` },
              { value: 'all', label: `${copy.statusAll} (${d.rows.length})` },
            ]}
          />
        </div>
        <DataTable
          ariaLabel={copy.riskListTitle}
          columns={columns}
          data={rows}
          getRowId={(r) => r.ref}
          getRowLabel={(r) => display(r)}
          density="compact"
          defaultPageSize={20}
          empty={{ title: d.rows.length === 0 ? copy.riskEmpty : copy.riskEmptyFiltered, variant: d.rows.length === 0 ? 'default' : 'filtered' }}
          enableRowSelection={canSend}
          bulkActions={
            canSend
              ? ({ ids, clear }) => (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        compose({ audience: { kind: 'customers', refs: ids.slice(0, 200) }, audienceLabel: copy.selectedAudience(Math.min(ids.length, 200)), type: 'personal_offer' });
                        clear();
                      }}
                    >
                      <Gift className="h-4 w-4" aria-hidden />
                      {copy.bulkOffer}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        compose({ audience: { kind: 'customers', refs: ids.slice(0, 200) }, audienceLabel: copy.selectedAudience(Math.min(ids.length, 200)), type: 'message', template: 'checkin' });
                        clear();
                      }}
                    >
                      <MessageSquareText className="h-4 w-4" aria-hidden />
                      {copy.bulkMessage}
                    </Button>
                  </div>
                )
              : undefined
          }
          onRowClick={(r) => openCustomer(r.ref)}
        />
      </SectionCard>

      <InterventionSheet open={sheetOpen} onOpenChange={setSheetOpen} initial={cfg} canEdit={canSend} />
    </div>
  );
}
