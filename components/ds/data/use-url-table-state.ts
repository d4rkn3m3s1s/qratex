'use client';

import { useCallback, useMemo } from 'react';
import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { useUrlState } from '../page/url-state';
import { parsePage, parsePageSize, parseSort, serializeSort } from './table-url';

export type UseUrlTableStateOptions = {
  pageKey?: string;
  sizeKey?: string;
  sortKey?: string;
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
  /** Varsayılan sıralama (URL'ye yazılmaz). */
  defaultSort?: SortingState;
  /** İzin verilen sıralama sütunları (URL'den gelen keyfi alanı sunucuya taşımaz). */
  sortableIds?: readonly string[];
};

export type UrlTableState = {
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  /** Sunucu isteği için: `{ page, pageSize, sort }` (page 1 tabanlı). */
  params: { page: number; pageSize: number; sort: string | null };
  isPending: boolean;
};

export const DEFAULT_PAGE_SIZES: readonly number[] = [10, 20, 50, 100];

/**
 * DataTable'ın sunucu sayfalama/sıralama durumunu URL'de tutar
 * (`?page=2&size=50&sort=createdAt.desc`). Sıralama ya da sayfa boyutu
 * değişince sayfa 1'e döner. `useSearchParams` kullanır → `<Suspense>` içinde.
 *
 *   const table = useUrlTableState({ defaultSort: [{ id: 'createdAt', desc: true }] });
 *   const q = useQuery({ queryKey: ['orders', table.params, filters], queryFn: …, placeholderData: keepPreviousData });
 *   <DataTable {...table} manualPagination manualSorting rowCount={q.data?.total} … />
 */
export function useUrlTableState(opts: UseUrlTableStateOptions = {}): UrlTableState {
  const {
    pageKey = 'page',
    sizeKey = 'size',
    sortKey = 'sort',
    defaultPageSize = 20,
    pageSizeOptions = DEFAULT_PAGE_SIZES,
    defaultSort,
    sortableIds,
  } = opts;
  const { get, set, isPending } = useUrlState();

  const pageRaw = get(pageKey);
  const sizeRaw = get(sizeKey);
  const sortRaw = get(sortKey);
  const defaultSortKey = serializeSort(defaultSort ?? []);
  const sortableKey = sortableIds?.join('|') ?? '';

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: parsePage(pageRaw) - 1, pageSize: parsePageSize(sizeRaw, pageSizeOptions, defaultPageSize) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageRaw, sizeRaw, defaultPageSize, pageSizeOptions.join('|')],
  );

  const sorting = useMemo<SortingState>(() => {
    const parsed = parseSort(sortRaw, sortableKey ? sortableKey.split('|') : undefined);
    return parsed.length ? parsed : parseSort(defaultSortKey);
  }, [sortRaw, sortableKey, defaultSortKey]);

  const onPaginationChange = useCallback<OnChangeFn<PaginationState>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      const sizeChanged = next.pageSize !== pagination.pageSize;
      set({
        [pageKey]: sizeChanged || next.pageIndex <= 0 ? null : next.pageIndex + 1,
        [sizeKey]: next.pageSize === defaultPageSize ? null : next.pageSize,
      });
    },
    [pagination, set, pageKey, sizeKey, defaultPageSize],
  );

  const onSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const serialized = serializeSort(next);
      set({ [sortKey]: serialized === defaultSortKey ? null : serialized, [pageKey]: null });
    },
    [sorting, set, sortKey, pageKey, defaultSortKey],
  );

  const params = useMemo(
    () => ({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sort: serializeSort(sorting) }),
    [pagination, sorting],
  );

  return { pagination, onPaginationChange, sorting, onSortingChange, params, isPending };
}
