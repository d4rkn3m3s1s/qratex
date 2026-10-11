'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import { Bug, ListTree, Boxes } from 'lucide-react';
import { DataTable, type DataTableColumnMeta } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { PERIOD_LABEL, actionLabel, toCsv, type ErrorRow, type UsageRow } from '@/lib/admin-ai-ops/contract';
import { aiOpsKeys, fetchErrors } from './api';
import { useAiOps, useUsage } from './hooks';
import { UsageKpis, UsageSeries } from './overview-tab';
import { CsvButton, fmtDateTime, fmtInt, fmtMs, fmtPct } from './parts';

function usageColumns(keyLabel: string): ColumnDef<UsageRow>[] {
  return [
    { accessorKey: 'label', header: keyLabel, meta: { mobile: 'title' } satisfies DataTableColumnMeta },
    { accessorKey: 'calls', header: 'Çağrı', meta: { numeric: true }, cell: ({ getValue }) => fmtInt(getValue<number>()) },
    { accessorKey: 'failures', header: 'Başarısız', meta: { numeric: true }, cell: ({ getValue }) => fmtInt(getValue<number>()) },
    {
      accessorKey: 'errorRate',
      header: 'Hata oranı',
      meta: { numeric: true },
      sortingFn: (a, b) => (a.original.errorRate ?? -1) - (b.original.errorRate ?? -1),
      cell: ({ getValue }) => {
        const v = getValue<number | null>();
        return <span className={v != null && v > 5 ? 'font-medium text-danger' : undefined}>{fmtPct(v)}</span>;
      },
    },
    { accessorKey: 'tokens', header: 'Token', meta: { numeric: true }, cell: ({ getValue }) => fmtInt(getValue<number>()) },
    { accessorKey: 'p95Ms', header: 'p95', meta: { numeric: true }, sortingFn: (a, b) => (a.original.p95Ms ?? -1) - (b.original.p95Ms ?? -1), cell: ({ getValue }) => fmtMs(getValue<number | null>()) },
  ];
}

const csvOf = (rows: UsageRow[], keyLabel: string) =>
  toCsv([keyLabel, 'Çağrı', 'Başarısız', 'Hata oranı (%)', 'Token', 'p95 (ms)'], rows.map((r) => [r.label, r.calls, r.failures, r.errorRate ?? '', r.tokens, r.p95Ms ?? '']));

export function UsageTab() {
  const { period } = useAiOps();
  const usage = useUsage();
  const actionCols = useMemo(() => usageColumns('İş'), []);
  const modelCols = useMemo(() => usageColumns('Model'), []);

  return (
    <div className="space-y-6">
      <QueryState query={usage} skeleton="stats">
        {(u) => (
          <div className="space-y-6">
            <UsageKpis u={u} />
            <UsageSeries u={u} height={280} />
            <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
              <SectionCard
                title="İşe göre"
                description="Hangi AI işi ne kadar çağrı, hata ve token harcıyor."
                icon={<ListTree />}
                density="flush"
                actions={<CsvButton filename={`ai-is-bazinda-${period}.csv`} build={() => csvOf(u.byAction, 'İş')} />}
              >
                <DataTable ariaLabel="İşe göre AI kullanımı" columns={actionCols} data={u.byAction} getRowId={(r) => r.key} empty={{ title: 'Bu dönemde çağrı yok' }} defaultPageSize={10} />
              </SectionCard>
              <SectionCard
                title="Modele göre"
                description="Sağlayıcı/model dağılımı; yerel yedek ayrı satırdır."
                icon={<Boxes />}
                density="flush"
                actions={<CsvButton filename={`ai-model-bazinda-${period}.csv`} build={() => csvOf(u.byModel, 'Model')} />}
              >
                <DataTable ariaLabel="Modele göre AI kullanımı" columns={modelCols} data={u.byModel} getRowId={(r) => r.key} empty={{ title: 'Bu dönemde çağrı yok' }} defaultPageSize={10} />
              </SectionCard>
            </div>
          </div>
        )}
      </QueryState>
      <ErrorsCard />
    </div>
  );
}

const errorColumns: ColumnDef<ErrorRow>[] = [
  { accessorKey: 'at', header: 'Zaman', meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta, cell: ({ getValue }) => <time dateTime={getValue<string>()}>{fmtDateTime(getValue<string>())}</time> },
  { accessorKey: 'action', header: 'İş', meta: { mobile: 'title' } satisfies DataTableColumnMeta, cell: ({ getValue }) => actionLabel(getValue<string>()) },
  { accessorKey: 'dealerName', header: 'Bayi', cell: ({ getValue }) => getValue<string | null>() ?? <span className="text-fg-muted">Platform</span> },
  { accessorKey: 'model', header: 'Model', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
  { accessorKey: 'latencyMs', header: 'Süre', meta: { numeric: true }, cell: ({ getValue }) => fmtMs(getValue<number>()) },
  { accessorKey: 'error', header: 'Hata', cell: ({ getValue }) => <span className="line-clamp-2 break-words text-sm text-fg-muted" title={getValue<string>()}>{getValue<string>()}</span> },
];

function ErrorsCard() {
  const { period } = useAiOps();
  const usage = useUsage();
  const [action, setAction] = useState<string>('all');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const q = { period, action: action === 'all' ? undefined : action, page: pagination.pageIndex + 1, size: pagination.pageSize };
  const errors = useQuery({ queryKey: aiOpsKeys.errors(q), queryFn: () => fetchErrors(q), placeholderData: keepPreviousData });
  const actions = (usage.data?.byAction ?? []).filter((a) => a.failures > 0);

  return (
    <SectionCard
      title="Son hatalar"
      description={`${PERIOD_LABEL[period]} içindeki başarısız AI çağrıları (en yeni önce).`}
      icon={<Bug />}
      density="flush"
    >
      {actions.length > 0 ? (
        <div className="px-4 pb-3 pt-1">
          <ChoiceChips
            aria-label="İşe göre süz"
            size="sm"
            scroll
            options={[{ value: 'all', label: 'Tümü' }, ...actions.map((a) => ({ value: a.key, label: `${a.label} (${fmtInt(a.failures)})` }))]}
            value={action}
            onChange={(v) => {
              setAction(v ?? 'all');
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          />
        </div>
      ) : null}
      <DataTable
        ariaLabel="Başarısız AI çağrıları"
        columns={errorColumns}
        data={errors.data?.items}
        query={errors}
        getRowId={(r) => r.id}
        manualPagination
        rowCount={errors.data?.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        filtered={action !== 'all'}
        empty={{ title: 'Hata yok', description: 'Bu dönemde başarısız AI çağrısı kaydedilmedi.' }}
      />
    </SectionCard>
  );
}
