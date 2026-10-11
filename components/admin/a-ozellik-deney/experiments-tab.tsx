'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { FlaskConical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { DataTable, DetailSheet, StatusBadge, useDetailSheet, type DataTableColumnMeta } from '@/components/ds/data';
import { QueryState, TONE_CALLOUT } from '@/components/states';
import { DIMENSION_LABEL, STATUS_LABEL, type ExperimentRow, type ExperimentsState } from '@/lib/admin-flags/contract';
import { cn } from '@/lib/utils';
import { createExperiment, fcKeys, fetchExperiments } from './api';
import { STATUS_TONE, daysBetween, fmtAbs, fmtNum } from './format';
import { ExperimentEditor, emptyExperimentDraft } from './experiment-editor';
import { ExperimentDetail } from './experiment-detail';
import { useFeatureLabCopy } from './copy';

export function ExperimentsTab({ initial }: { initial: ExperimentsState | null }) {
  const fx = useFeatureLabCopy();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: fcKeys.experiments(), queryFn: ({ signal }) => fetchExperiments(signal), initialData: initial ?? undefined, staleTime: 30_000 });
  const sheet = useDetailSheet('deney');
  const [creating, setCreating] = useState(false);
  const data = query.data;

  const columns = useMemo<ColumnDef<ExperimentRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Deney',
        enableSorting: false,
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0 max-w-sm">
            <p className="truncate font-medium text-fg">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-fg-muted">{row.original.id}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const e = row.original;
          const days = daysBetween(e.startedAt, e.endedAt);
          return (
            <div className="flex flex-wrap items-center gap-1">
              <StatusBadge size="sm" tone={STATUS_TONE[e.status]} label={STATUS_LABEL[e.status]} />
              {days !== null && e.status !== 'draft' ? <span className="text-xs text-fg-muted">{fmtNum(days)}. gün</span> : null}
              {e.winner ? <StatusBadge size="sm" tone="brand" label={`Kazanan ${e.winner}`} /> : null}
            </div>
          );
        },
      },
      {
        id: 'dimension',
        header: 'Boyut',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Boyut' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg">{DIMENSION_LABEL[row.original.dimension]}</span>,
      },
      {
        id: 'split',
        header: 'Trafik (A / B)',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Trafik', numeric: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-fg">
            %{100 - row.original.splitPercentB} / %{row.original.splitPercentB}
          </span>
        ),
      },
      {
        id: 'started',
        header: 'Başlangıç',
        enableSorting: false,
        meta: { mobile: 'hidden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg-muted">{row.original.startedAt ? fmtAbs(row.original.startedAt) : row.original.legacy ? 'Bilinmiyor (eski kayıt)' : '—'}</span>,
      },
      {
        id: 'owner',
        header: 'Sahip',
        enableSorting: false,
        meta: { mobile: 'hidden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg-muted">{row.original.owner ?? '—'}</span>,
      },
    ],
    []
  );

  return (
    <SectionCard
      title="A/B deneyleri"
      icon={<FlaskConical />}
      description="Her kullanıcı deney anahtarı ve kimliğinden türetilen kovayla yapışkan biçimde A ya da B'ye düşer. Sonuçlar deney penceresiyle sınırlı, tekil kullanıcı bazlı ve sunucuda hesaplanır."
      actions={
        <Button className="min-h-11 sm:min-h-9" size="sm" onClick={() => setCreating(true)} disabled={!data}>
          <Plus className="h-4 w-4" aria-hidden />
          Yeni deney
        </Button>
      }
    >
      <QueryState query={query} skeleton="table" onRetry={() => query.refetch()}>
        {(d) => (
          <div className="space-y-4">
            {!d.killSwitchOn ? (
              <p role="status" className={cn('rounded-card border px-3 py-2 text-sm', TONE_CALLOUT.warning)}>
                Acil durdurma etkin: <code className="font-mono">ab_testing</code> modülü kapalı. Çalışan deneyler dahil herkes kontrol (A) varyantını görüyor ve
                gösterim kaydedilmiyor.
              </p>
            ) : null}
            <DataTable
              ariaLabel="A/B deneyleri"
              columns={columns}
              data={d.experiments}
              getRowId={(r) => r.id}
              getRowLabel={(r) => r.name}
              paginated={d.experiments.length > 20}
              defaultPageSize={20}
              density="compact"
              onRowClick={(r) => sheet.open(r.id)}
              activeRowId={sheet.id}
              empty={{
                title: 'Henüz deney yok',
                description: 'İlk deneyi taslak olarak oluşturun; başlatana kadar kimse etkilenmez. Varyantı gösteren ekran /api/customer/innovation/ab/variant ucunu çağırır.',
              }}
            />
            <p className="text-xs text-fg-muted">
              Eski bayi kohort “deneyi” (A/B/C XP çarpanı) kaldırıldı: çarpan hiçbir puan yolunda uygulanmıyordu, farklar tamamen gürültüydü.
            </p>
          </div>
        )}
      </QueryState>

      <DetailSheet paramKey="deney" size="xl" title="Deney ayrıntısı" siblings={data?.experiments.map((e) => e.id)}>
        {(id: string) => {
          const row = data?.experiments.find((e) => e.id === id);
          return row && data ? <ExperimentDetail row={row} version={data.version} /> : <p className="text-sm text-fg-muted">{fx.experimentNotFound}</p>;
        }}
      </DetailSheet>

      {creating && data ? (
        <ExperimentEditor
          mode="create"
          initial={emptyExperimentDraft(data.defaultSplitPercentForB)}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await createExperiment({ ...v, baseVersion: data.version });
            toast.success('Deney taslak olarak oluşturuldu.');
            await qc.invalidateQueries({ queryKey: fcKeys.all });
            sheet.open(v.id);
          }}
        />
      ) : null}
    </SectionCard>
  );
}
