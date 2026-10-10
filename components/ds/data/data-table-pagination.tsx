'use client';

import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDataCopy, useLocaleInfo } from './copy';
import { pageRange } from './table-url';

export type DataTablePaginationProps<TData> = {
  table: Table<TData>;
  pageSizeOptions: readonly number[];
  /** ≥ 44px düğmeler masaüstünde de (mobilde her zaman). */
  touchTarget?: boolean;
  className?: string;
};

const navBtn = (touch: boolean) =>
  cn(
    'grid h-11 w-11 shrink-0 place-items-center rounded-control border border-subtle bg-surface-1 text-fg transition-colors duration-fast ease-standard',
    'hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
    touch ? '' : 'sm:h-9 sm:w-9',
  );

/** Sayfalama altbilgisi — "21–40 / 245", sayfa boyutu, ilk/önceki/sonraki/son. */
export function DataTablePagination<TData>({ table, pageSizeOptions, touchTarget = false, className }: DataTablePaginationProps<TData>) {
  const copy = useDataCopy();
  const { tag } = useLocaleInfo();
  const { pageIndex, pageSize } = table.getState().pagination;
  const rowCount = table.getRowCount();
  const pageCount = Math.max(1, table.getPageCount());
  const { from, to } = pageRange(pageIndex, pageSize, rowCount);
  const nf = new Intl.NumberFormat(tag);

  return (
    <nav aria-label={copy.pagination} className={cn('flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="qx-small qx-num text-fg-muted" aria-live="polite">
          {copy.rangeOf(nf.format(from), nf.format(to), nf.format(rowCount))}
        </p>
        {pageSizeOptions.length > 1 && (
          <label className="flex items-center gap-2 qx-small text-fg-muted">
            <span>{copy.rowsPerPage}</span>
            <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger
                aria-label={copy.rowsPerPage}
                className={cn('w-[5.5rem] rounded-control border-subtle bg-surface-1 dark:border-subtle dark:bg-surface-1', touchTarget ? '' : 'sm:h-9 sm:min-h-9')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <div className="flex items-center gap-1.5">
          <button type="button" className={cn(navBtn(touchTarget), 'hidden sm:grid')} onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()} aria-label={copy.firstPage}>
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={navBtn(touchTarget)} onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={copy.prevPage}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="qx-small qx-num min-w-[6rem] text-center text-fg-muted">{copy.pageOf(pageIndex + 1, pageCount)}</p>
        <div className="flex items-center gap-1.5">
          <button type="button" className={navBtn(touchTarget)} onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={copy.nextPage}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={cn(navBtn(touchTarget), 'hidden sm:grid')} onClick={() => table.lastPage()} disabled={!table.getCanNextPage()} aria-label={copy.lastPage}>
            <ChevronsRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );
}
