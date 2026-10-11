'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { CheckCheck, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar, SectionCard, type FilterField } from '@/components/ds/page';
import {
  DataTable,
  DetailSheet,
  SeverityBadge,
  StatusBadge,
  useDetailSheet,
  useUrlTableState,
  type DataTableColumnMeta,
} from '@/components/ds/data';
import {
  CASE_SEVERITIES,
  CASE_TYPE_LABEL,
  RESOLUTION_CODES,
  RESOLUTION_LABEL,
  SEVERITY_LABEL,
  caseQsFromParams,
  type CaseListItem,
  type Paged,
  type ResolutionCode,
} from '@/lib/admin-trust/contract';
import { bulkResolve, exportUrl, fetchCases, trustKeys } from './api';
import { fmtAbs, fmtNum, fmtRel, subjectText, toDsSeverity } from './format';
import { ReasonDialog } from './reason-dialog';
import { CaseDetailView, CaseDetailFooter } from './case-detail';

const FIELDS: FilterField[] = [
  { type: 'search', key: 'q', label: 'Ara', placeholder: 'E-posta, ad, IP, açıklama, bayi' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    allLabel: null,
    defaultValue: 'open',
    options: [
      { value: 'open', label: 'Açık' },
      { value: 'resolved', label: 'Çözülen' },
      { value: 'all', label: 'Tümü' },
    ],
  },
  { type: 'select', key: 'severity', label: 'Önem', multiple: true, options: CASE_SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] })) },
  {
    type: 'select',
    key: 'type',
    label: 'Tür',
    allLabel: 'Tüm türler',
    options: Object.entries(CASE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    type: 'select',
    key: 'window',
    label: 'Zaman',
    allLabel: 'Tüm zamanlar',
    options: [
      { value: '24h', label: 'Son 24 saat' },
      { value: '7d', label: 'Son 7 gün' },
      { value: '30d', label: 'Son 30 gün' },
    ],
  },
];

const RESOLUTION_CHOICES = RESOLUTION_CODES.map((c) => ({ value: c, label: RESOLUTION_LABEL[c] }));

export function CasesTab({ initial }: { initial: { qs: string; page: Paged<CaseListItem> } | null }) {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const qs = caseQsFromParams((k) => sp.get(k));
  const table = useUrlTableState({ defaultSort: [{ id: 'createdAt', desc: true }], sortableIds: ['createdAt'] });
  const sheet = useDetailSheet('case');
  const [bulk, setBulk] = useState<{ ids: string[]; clear: () => void } | null>(null);

  const list = useQuery({
    queryKey: trustKeys.cases(qs),
    queryFn: ({ signal }) => fetchCases(qs, signal),
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const filtered = Boolean(sp.get('q') || sp.get('severity') || sp.get('type') || sp.get('window') || (sp.get('status') && sp.get('status') !== 'open'));
  const columns = useMemo<ColumnDef<CaseListItem>[]>(
    () => [
      {
        id: 'severity',
        header: 'Önem',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Önem' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <SeverityBadge severity={toDsSeverity(row.original.severity)} size="sm" emphasize />,
      },
      {
        id: 'subject',
        header: 'Özne',
        enableSorting: false,
        meta: { mobile: 'title' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const s = subjectText(row.original.subject);
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{s.title}</p>
              <p className="truncate text-xs text-fg-muted">{row.original.typeLabel}{s.sub ? ` · ${s.sub}` : ''}</p>
            </div>
          );
        },
      },
      {
        id: 'description',
        header: 'Sinyal',
        enableSorting: false,
        meta: { mobile: 'subtitle' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <p className="line-clamp-2 max-w-md text-sm text-fg-muted">{row.original.description}</p>,
      },
      {
        id: 'dealer',
        header: 'Bayi',
        enableSorting: false,
        meta: { mobile: 'hidden' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="text-sm text-fg-muted">{row.original.dealer?.name ?? '—'}</span>,
      },
      {
        id: 'status',
        header: 'Durum',
        enableSorting: false,
        meta: { mobile: 'field', label: 'Durum' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.isResolved ? (
            <StatusBadge
              size="sm"
              tone={row.original.resolutionCode === 'confirmed' ? 'danger' : 'success'}
              label={row.original.resolutionCode ? RESOLUTION_LABEL[row.original.resolutionCode] : 'Çözüldü'}
            />
          ) : (
            <StatusBadge size="sm" tone="warning" label="Açık" />
          ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Zaman',
        meta: { mobile: 'field', label: 'Zaman' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} title={fmtAbs(row.original.createdAt)} className="whitespace-nowrap text-sm text-fg-muted">
            {fmtRel(row.original.createdAt)}
          </time>
        ),
      },
    ],
    [],
  );

  return (
    <SectionCard
      title="Vaka kuyruğu"
      description="Tespit kurallarının, giriş korumasının ve diğer kaynakların açtığı sinyaller. Satıra tıklayınca kanıt ve aksiyonlar açılır."
      actions={
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <a href={exportUrl(qs)} download>
            <Download className="h-4 w-4" aria-hidden />
            CSV dışa aktar
          </a>
        </Button>
      }
    >
      <div className="space-y-4">
        <FilterBar fields={FIELDS} resetKeys={['page', 'case']} />
        <p className="sr-only" aria-live="polite">
          {list.data ? `${fmtNum(list.data.total)} vaka listeleniyor` : ''}
        </p>
        <DataTable
          ariaLabel="Güven vakaları"
          columns={columns}
          data={list.data?.items}
          query={list}
          getRowId={(r) => r.id}
          getRowLabel={(r) => `${r.typeLabel} — ${subjectText(r.subject).title}`}
          manualPagination
          manualSorting
          rowCount={list.data?.total}
          {...table}
          filtered={filtered}
          enableRowSelection={(row) => !row.original.isResolved}
          bulkActions={({ ids, clear }) => (
            <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setBulk({ ids, clear })}>
              <CheckCheck className="h-4 w-4" aria-hidden />
              Seçilenleri çöz ({fmtNum(ids.length)})
            </Button>
          )}
          onRowClick={(r) => sheet.open(r.id)}
          activeRowId={sheet.id}
          empty={
            filtered
              ? { title: 'Filtreye uyan vaka yok', description: 'Filtreleri gevşetmeyi deneyin.' }
              : { title: 'Açık vaka yok', description: 'Yeni sinyal yakalandığında burada görünür. "Sinyalleri tara" kuralları hemen çalıştırır.' }
          }
        />
      </div>

      <DetailSheet
        paramKey="case"
        size="lg"
        title="Vaka ayrıntısı"
        siblings={list.data?.items.map((r) => r.id)}
        footer={(id: string) => <CaseDetailFooter id={id} />}
      >
        {(id: string) => <CaseDetailView id={id} />}
      </DetailSheet>

      <ReasonDialog<ResolutionCode>
        open={bulk !== null}
        onOpenChange={(v) => !v && setBulk(null)}
        title={`${fmtNum(bulk?.ids.length ?? 0)} vaka çözülsün mü?`}
        description="Seçilen açık vakaların hepsi aynı kararla kapanır. Zaten çözülmüş olanlar atlanır."
        choices={RESOLUTION_CHOICES}
        confirmLabel="Toplu çöz"
        onConfirm={async ({ note, choice }) => {
          if (!bulk || !choice) return;
          const r = await bulkResolve({ ids: bulk.ids, code: choice, note });
          toast.success(`${fmtNum(r.resolved)} vaka çözüldü${r.skipped ? `, ${fmtNum(r.skipped)} atlandı` : ''}.`);
          bulk.clear();
          await qc.invalidateQueries({ queryKey: trustKeys.all });
        }}
      />
    </SectionCard>
  );
}
