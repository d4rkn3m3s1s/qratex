'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Ban, Download, List, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, useUrlTableState, type DataTableColumnMeta } from '@/components/ds/data';
import type { BatchPage, BatchRow } from '@/lib/admin-cards/contract';
import { bulkCards, cardsKeys, exportHref, fetchBatches, printHref } from './api';
import { BlockDialog } from './dialogs';
import { fmtDate, fmtDateTime, fmtNumber } from './format';
import { AdminKartlarText } from './copy';

const SEGMENTS: Array<{ key: keyof BatchRow['counts']; label: string; cls: string }> = [
  { key: 'ACTIVATED', label: 'Aktif', cls: 'bg-success' },
  { key: 'UNUSED', label: 'Kullanılmamış', cls: 'bg-fg-subtle' },
  { key: 'BLOCKED', label: 'Bloklu', cls: 'bg-danger' },
  { key: 'archived', label: 'Arşiv', cls: 'bg-fg-muted' },
];

/** Durum dağılımı yığılmış çubuk + metin karşılığı (renge bağımlı değil). */
function Distribution({ counts }: { counts: BatchRow['counts'] }) {
  const total = Math.max(1, counts.total);
  const text = SEGMENTS.filter((s) => counts[s.key] > 0)
    .map((s) => `${fmtNumber(counts[s.key])} ${s.label.toLocaleLowerCase('tr-TR')}`)
    .join(' · ');
  return (
    <div className="min-w-[10rem] space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {SEGMENTS.map((s) => (counts[s.key] > 0 ? <span key={s.key} className={s.cls} style={{ width: `${(counts[s.key] / total) * 100}%` }} /> : null))}
      </div>
      <p className="text-xs text-fg-muted">{text || 'Kart yok'}</p>
    </div>
  );
}

export function BatchesPanel({ initial, onChanged }: { initial: { qs: string; page: BatchPage } | null; onChanged: () => void }) {
  const table = useUrlTableState({ pageKey: 'bpage', sizeKey: 'bsize', sortKey: 'bsort', defaultPageSize: 20, pageSizeOptions: [20, 50, 100] });
  const qs = `page=${table.params.page}&size=${table.params.pageSize}`;
  const q = useQuery({
    queryKey: cardsKeys.batches(qs),
    queryFn: ({ signal }) => fetchBatches(qs, signal),
    placeholderData: keepPreviousData,
    initialData: initial && initial.qs === qs ? initial.page : undefined,
    staleTime: 15_000,
  });
  const [blocking, setBlocking] = useState<BatchRow | null>(null);

  const columns = useMemo<ColumnDef<BatchRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Parti',
        enableSorting: false,
        meta: { mobile: 'title', label: 'Parti' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{row.original.name}</p>
            <p className="truncate font-mono text-xs text-fg-muted">
              {row.original.id}
              {row.original.prefix ? ` · önek ${row.original.prefix}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'created',
        header: 'Üretim',
        enableSorting: false,
        meta: { mobile: 'subtitle', label: 'Üretim' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="text-sm">
            <time dateTime={row.original.createdAt}>{fmtDate(row.original.createdAt)}</time>
            <p className="truncate text-xs text-fg-muted">{row.original.createdBy ? row.original.createdBy.name || row.original.createdBy.email : 'Silinmiş yönetici'}</p>
          </div>
        ),
      },
      {
        id: 'quantity',
        header: 'Adet',
        enableSorting: false,
        meta: { numeric: true, label: 'Adet' } satisfies DataTableColumnMeta,
        cell: ({ row }) => fmtNumber(row.original.counts.total),
      },
      {
        id: 'dist',
        header: 'Durum dağılımı',
        enableSorting: false,
        meta: { label: 'Durum dağılımı' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <Distribution counts={row.original.counts} />,
      },
      {
        id: 'export',
        header: 'Dışa aktarım',
        enableSorting: false,
        meta: { label: 'Dışa aktarım' } satisfies DataTableColumnMeta,
        cell: ({ row }) =>
          row.original.lastExportedAt ? (
            <div className="text-sm">
              <span>{fmtDateTime(row.original.lastExportedAt)}</span>
              <p className="text-xs text-fg-muted">{fmtNumber(row.original.exportCount)} kez</p>
            </div>
          ) : (
            <span className="text-sm text-warning"><AdminKartlarText k="notExported" /></span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only"><AdminKartlarText k="actions" /></span>,
        enableSorting: false,
        meta: { mobile: 'actions', interactive: true, label: 'İşlemler', align: 'end' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const b = row.original;
          const blockable = b.counts.UNUSED + b.counts.ACTIVATED;
          return (
            <div className="flex flex-wrap justify-end gap-1">
              <Button asChild size="sm" variant="ghost" className="min-h-11 sm:min-h-9">
                <Link href={`/admin/cards?batch=${encodeURIComponent(b.id)}`} aria-label={`${b.name} kartlarını göster`}>
                  <List className="h-4 w-4" aria-hidden />
                  Kartlar
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="min-h-11 sm:min-h-9">
                <a href={exportHref(`batch=${encodeURIComponent(b.id)}`)} download aria-label={`${b.name} CSV indir`} onClick={() => setTimeout(() => q.refetch(), 1500)}>
                  <Download className="h-4 w-4" aria-hidden />
                  CSV
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost" className="min-h-11 sm:min-h-9">
                <a href={printHref(b.id)} target="_blank" rel="noopener" aria-label={`${b.name} baskı sayfasını aç`}>
                  <Printer className="h-4 w-4" aria-hidden />
                  Baskı
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 text-danger sm:min-h-9"
                disabled={blockable === 0}
                onClick={() => setBlocking(b)}
                aria-label={`${b.name} partisinin tamamını blokla`}
              >
                <Ban className="h-4 w-4" aria-hidden />
                Partiyi blokla
              </Button>
            </div>
          );
        },
      },
    ],
    [q]
  );

  return (
    <>
      <DataTable
        ariaLabel="Üretim partileri"
        columns={columns}
        data={q.data?.items}
        query={q}
        getRowId={(r) => r.id}
        getRowLabel={(r) => r.name}
        manualPagination
        rowCount={q.data?.total}
        pageSizeOptions={[20, 50, 100]}
        pagination={table.pagination}
        onPaginationChange={table.onPaginationChange}
        empty={{ variant: 'first-use', title: 'Henüz üretim partisi yok', description: '“Parti üret” ile ilk fiziksel kart partisini oluşturun.' }}
      />
      <BlockDialog
        open={blocking != null}
        onOpenChange={(o) => !o && setBlocking(null)}
        title={`“${blocking?.name ?? ''}” partisinin tamamı bloklansın mı?`}
        description={`Partideki ${fmtNumber((blocking?.counts.UNUSED ?? 0) + (blocking?.counts.ACTIVATED ?? 0))} kullanılmamış/aktif kart bloklanır (kayıp sevkiyat senaryosu). Zaten bloklu ve arşivli kartlar atlanır.`}
        canNotify={(blocking?.counts.ACTIVATED ?? 0) > 0}
        onConfirm={async (v) => {
          if (!blocking) return;
          const r = await bulkCards({ action: 'block', batchId: blocking.id, ...v });
          toast.success(`${fmtNumber(r.done)} kart bloklandı${r.skipped.length ? ` · ${fmtNumber(r.skipped.length)} atlandı` : ''}`);
          await q.refetch();
          onChanged();
        }}
      />
    </>
  );
}
