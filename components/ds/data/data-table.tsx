'use client';

import { memo, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type TableOptions,
  type TableState,
  type VisibilityState,
} from '@tanstack/react-table';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EmptyState,
  QueryState,
  SkeletonTable,
  type EmptyStateProps,
  type ErrorStateProps,
  type QueryLike,
} from '@/components/states';
import { fadeUp } from '@/lib/motion';
import { AnimatedNumber } from './animated-number';
import { useNewIds } from '@/components/fx/event-fx';
import { useDataCopy, type DataCopy } from './copy';
import { DataTablePagination } from './data-table-pagination';
import { SelectionCheckbox } from './selection-checkbox';
import { DEFAULT_PAGE_SIZES } from './use-url-table-state';

/* ───────────────────────── Sütun meta sözleşmesi ───────────────────────── */

/**
 * `columnDef.meta` ile verilir (TanStack modül genişletmesi YOK — diğer
 * tablolarla çakışmasın diye tip burada okunur):
 *
 *   { accessorKey: 'total', header: 'Tutar', meta: { numeric: true, mobile: 'field' } satisfies DataTableColumnMeta }
 */
export type DataTableColumnMeta = {
  /** Sütun menüsü ve mobil kart etiketi (başlık düğüm ise zorunlu). */
  label?: string;
  align?: 'start' | 'center' | 'end';
  /** Sağa hizalı tabular sayı. */
  numeric?: boolean;
  /**
   * Mobil kart rolü: `title` (kart başlığı, masaüstünde satır başlığı `th`),
   * `subtitle`, `field` (varsayılan; etiket+değer), `actions` (sağ üst), `hidden`.
   */
  mobile?: 'title' | 'subtitle' | 'field' | 'actions' | 'hidden';
  /** Hücre kendi etkileşimini taşır (menü, düğme) — satır tıklaması tetiklenmez. */
  interactive?: boolean;
  /** CSS genişliği (ör. `'8rem'`). */
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
};

export function getColumnMeta<TData>(column: Column<TData, unknown>): DataTableColumnMeta {
  return (column.columnDef.meta ?? {}) as DataTableColumnMeta;
}

export function getColumnLabel<TData>(column: Column<TData, unknown>): string {
  const meta = getColumnMeta(column);
  if (meta.label) return meta.label;
  const h = column.columnDef.header;
  return typeof h === 'string' ? h : column.id;
}

export const SELECT_COLUMN_ID = '__select';

const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const;

function alignOf(meta: DataTableColumnMeta): 'start' | 'center' | 'end' {
  return meta.align ?? (meta.numeric ? 'end' : 'start');
}

const INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,label,[role="checkbox"],[role="menuitem"],[role="switch"],[data-row-click-ignore]';

/* ───────────────────────── Props ───────────────────────── */

export type BulkActionContext<TData> = {
  /** Seçili satırların bu sayfadaki verisi. */
  rows: TData[];
  /** Tüm seçili kimlikler (sunucu sayfalamada diğer sayfalardakiler dahil). */
  ids: string[];
  clear: () => void;
};

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, any>[];
  data: readonly TData[] | null | undefined;
  /** Kararlı satır kimliği (seçim ve DetailSheet `?id=` için zorunlu). */
  getRowId: (row: TData, index: number) => string;
  /** Tablonun erişilebilir adı (görünmez `caption`). */
  ariaLabel: string;

  /* Durum (QueryState) */
  query?: QueryLike<unknown>;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => unknown;
  /** Boş durum (filtre etkinse varsayılan "Sonuç bulunamadı"). */
  empty?: EmptyStateProps | ReactNode;
  errorProps?: Omit<ErrorStateProps, 'kind' | 'onRetry'>;
  /** Filtre etkin mi? (sunucu filtrelemede boş durum metni için). */
  filtered?: boolean;

  /* Sayfalama */
  paginated?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  manualPagination?: boolean;
  /** Sunucu sayfalamada toplam satır. */
  rowCount?: number;
  pageSizeOptions?: readonly number[];
  defaultPageSize?: number;

  /* Sıralama */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  enableMultiSort?: boolean;

  /* Filtre */
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  manualFiltering?: boolean;

  /* Seçim + toplu işlem */
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  bulkActions?: (ctx: BulkActionContext<TData>) => ReactNode;
  /** Seçim kutusunun etiketine eklenen satır adı ("Satırı seç: Ayşe Y."). */
  getRowLabel?: (row: TData) => string;

  /* Sütun görünürlüğü */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** "Sütunlar" menüsü. Varsayılan: gizlenebilir sütun sayısı ≥ 3 ise. */
  enableColumnVisibility?: boolean;

  /* Satır */
  onRowClick?: (row: TData) => void;
  /** Vurgulu satır (ör. DetailSheet'te açık olan kayıt). */
  activeRowId?: string | null;
  /** Mobil kart görünümü özel çizimi. */
  renderCard?: (row: Row<TData>) => ReactNode;
  /** Bu kırılımın altında tablo yerine kart listesi. `never` → hep tablo (yatay kaydırma). */
  cardBreakpoint?: 'sm' | 'md' | 'lg' | 'never';

  /* Görünüm */
  /** Tablonun üstündeki sol içerik (küçük filtre, sekme). */
  toolbar?: ReactNode;
  density?: 'comfortable' | 'compact';
  /** ≥ 44px kontroller masaüstünde de. */
  touchTarget?: boolean;
  /** Verilirse tablo bu yükseklikte kendi içinde kayar ve başlık yapışır (ör. `'32rem'`). */
  maxHeight?: string;
  /** Veri değişince sayfayı başa sar (istemci sayfalamada). Varsayılan false. */
  autoResetPageIndex?: boolean;
  className?: string;
};

/* ───────────────────────── Yardımcı bileşenler ───────────────────────── */

const CARD_BP = {
  sm: { table: 'hidden sm:block', cards: 'sm:hidden' },
  md: { table: 'hidden md:block', cards: 'md:hidden' },
  lg: { table: 'hidden lg:block', cards: 'lg:hidden' },
  never: { table: 'block', cards: 'hidden' },
} as const;

function isInteractiveTarget(e: { target: EventTarget | null; currentTarget: EventTarget | null }): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || !(t instanceof Element)) return false;
  const hit = t.closest(INTERACTIVE_SELECTOR);
  return !!hit && hit !== e.currentTarget;
}

type RowProps<TData> = {
  row: Row<TData>;
  selected: boolean;
  active: boolean;
  // Görünürlük/sütun değişince yeniden çiz (memo anahtarı).
  visibilityKey: string;
  columnsRef: unknown;
  titleColumnId: string | undefined;
  density: 'comfortable' | 'compact';
  onRowClick?: (row: TData) => void;
  /** İlk çizimden sonra listeye giren satır (ekleme / filtre / sayfa değişimi) — kısa opaklık girişi. */
  fresh?: boolean;
};

function DataTableRowImpl<TData>({ row, selected, active, titleColumnId, density, onRowClick, fresh }: RowProps<TData>) {
  const pad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const clickable = !!onRowClick;
  return (
    <tr
      data-state={selected ? 'selected' : undefined}
      data-active={active || undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? (e: MouseEvent<HTMLTableRowElement>) => {
              if (isInteractiveTarget(e)) return;
              onRowClick(row.original);
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (e: KeyboardEvent<HTMLTableRowElement>) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick(row.original);
              }
            }
          : undefined
      }
      className={cn(
        'border-b border-subtle transition-colors duration-fast ease-standard last:border-b-0',
        fresh && 'qx-fx-row-fade',
        'data-[state=selected]:bg-brand-subtle/60 data-[active=true]:bg-brand-subtle',
        clickable && 'cursor-pointer hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = getColumnMeta(cell.column);
        const isSelect = cell.column.id === SELECT_COLUMN_ID;
        const content = flexRender(cell.column.columnDef.cell, cell.getContext());
        const cls = cn(
          'align-middle text-fg',
          isSelect ? 'w-12 px-4' : pad,
          ALIGN[alignOf(meta)],
          meta.numeric && 'qx-num',
          meta.cellClassName,
        );
        return cell.column.id === titleColumnId ? (
          <th key={cell.id} scope="row" className={cn(cls, 'font-medium')}>
            {content}
          </th>
        ) : (
          <td key={cell.id} className={cls}>
            {content}
          </td>
        );
      })}
    </tr>
  );
}

const DataTableRow = memo(DataTableRowImpl) as typeof DataTableRowImpl;

function cellsByRole<TData>(row: Row<TData>, titleColumnId: string | undefined) {
  const cells = row.getVisibleCells();
  let select: Cell<TData, unknown> | undefined;
  let title: Cell<TData, unknown> | undefined;
  let subtitle: Cell<TData, unknown> | undefined;
  const actions: Cell<TData, unknown>[] = [];
  const fields: Cell<TData, unknown>[] = [];
  for (const c of cells) {
    const meta = getColumnMeta(c.column);
    if (c.column.id === SELECT_COLUMN_ID) select = c;
    else if (c.column.id === titleColumnId) title = c;
    else if (meta.mobile === 'subtitle' && !subtitle) subtitle = c;
    else if (meta.mobile === 'actions') actions.push(c);
    else if (meta.mobile !== 'hidden') fields.push(c);
  }
  return { select, title, subtitle, actions, fields };
}

function DefaultCard<TData>({
  row,
  titleColumnId,
  onRowClick,
  active,
}: {
  row: Row<TData>;
  titleColumnId: string | undefined;
  onRowClick?: (row: TData) => void;
  active: boolean;
}) {
  const copy = useDataCopy();
  const { select, title, subtitle, actions, fields } = cellsByRole(row, titleColumnId);
  const render = (c: Cell<TData, unknown>) => flexRender(c.column.columnDef.cell, c.getContext());
  return (
    <article
      data-state={row.getIsSelected() ? 'selected' : undefined}
      data-active={active || undefined}
      className={cn(
        'relative rounded-card border bg-surface-1 p-4 qx-elevation-1 transition-colors duration-fast ease-standard',
        'data-[state=selected]:border-brand-border data-[state=selected]:bg-brand-subtle/50 data-[active=true]:border-brand-border',
        onRowClick && 'focus-within:ring-2 focus-within:ring-ring hover:border-strong',
      )}
    >
      <div className="flex items-start gap-3">
        {select && <div className="relative z-raised pt-0.5">{render(select)}</div>}
        <div className="min-w-0 flex-1">
          {title &&
            (onRowClick && getColumnMeta(title.column).interactive ? (
              // Başlık hücresi kendi düğmesini taşıyor (ör. kopyala) → <button> içinde <button>
              // geçersiz HTML/hydration hatası olur. Kart tıklaması ayrı, gerilmiş bir düğmede.
              <>
                <button
                  type="button"
                  onClick={() => onRowClick(row.original)}
                  aria-label={copy.open}
                  className="absolute inset-0 rounded-card outline-none"
                />
                <div className="qx-body relative z-raised min-w-0 font-medium text-fg">{render(title)}</div>
              </>
            ) : onRowClick ? (
              <button
                type="button"
                onClick={() => onRowClick(row.original)}
                className="qx-body block w-full min-w-0 text-left font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-card"
              >
                {render(title)}
              </button>
            ) : (
              <div className="qx-body min-w-0 font-medium text-fg">{render(title)}</div>
            ))}
          {subtitle && <div className="qx-small mt-0.5 min-w-0 text-fg-muted">{render(subtitle)}</div>}
        </div>
        {actions.length > 0 && (
          <div className="relative z-raised -my-1 flex shrink-0 items-center gap-1">
            {actions.map((c) => (
              <div key={c.id}>{render(c)}</div>
            ))}
          </div>
        )}
      </div>
      {fields.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {fields.map((c) => {
            const meta = getColumnMeta(c.column);
            return (
              <div key={c.id} className={cn('min-w-0', meta.interactive && 'relative z-raised')}>
                <dt className="qx-caption text-fg-muted">{getColumnLabel(c.column)}</dt>
                <dd className={cn('qx-small min-w-0 break-words text-fg', meta.numeric && 'qx-num')}>{render(c)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}

function BulkBar({ count, copy, children, onClear }: { count: number; copy: DataCopy; children?: ReactNode; onClear: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <Motion.div
          key="bulk"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="region"
          aria-label={copy.bulkActions}
          className="sticky top-2 z-sticky flex flex-wrap items-center gap-2 rounded-control border border-brand-border bg-brand-subtle px-3 py-2 qx-elevation-2"
        >
          <p className="qx-small qx-num mr-auto font-medium text-fg" aria-live="polite" aria-atomic="true">
            <span className="sr-only">{copy.selectedRows(count)}</span>
            {/* Görsel: sayı akarak değişir (toplu seçim sayacı), metnin geri kalanı sabit. */}
            <span aria-hidden="true">
              <AnimatedNumber value={count} srLabel={null} />
              {copy.selectedRows(count).replace(String(count), '')}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">{children}</div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-11 gap-1.5 text-fg-muted hover:text-fg sm:h-9">
            <X className="h-4 w-4" aria-hidden />
            {copy.clearSelection}
          </Button>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── DataTable ───────────────────────── */

const EMPTY_DATA: never[] = [];

/**
 * Veri tablosu — @tanstack/react-table üstünde:
 * - sunucu sayfalama/sıralama/filtre (`manual*` + `rowCount`; URL için `useUrlTableState`),
 * - satır seçimi (Shift ile aralık) + yapışık toplu işlem çubuğu,
 * - yükleniyor/hata/boş durumları `QueryState` ile (hata asla boş liste gibi görünmez),
 * - sütun görünürlüğü menüsü, `aria-sort`, satır başlığı `th`,
 * - mobilde kart listesi (`cardBreakpoint`), satır tıklaması klavyeyle de çalışır.
 * Sanal kaydırma yok; 100 satıra kadar akıcı (satırlar memo'lu, stagger yok).
 */
export function DataTable<TData>(props: DataTableProps<TData>) {
  const {
    columns: columnsProp,
    data,
    getRowId,
    ariaLabel,
    query,
    loading,
    error,
    onRetry,
    empty,
    errorProps,
    filtered,
    paginated = true,
    pagination,
    onPaginationChange,
    manualPagination = false,
    rowCount,
    pageSizeOptions = DEFAULT_PAGE_SIZES,
    defaultPageSize = 20,
    sorting,
    onSortingChange,
    manualSorting = false,
    enableMultiSort = false,
    columnFilters,
    onColumnFiltersChange,
    globalFilter,
    onGlobalFilterChange,
    manualFiltering = false,
    enableRowSelection = false,
    rowSelection,
    onRowSelectionChange,
    bulkActions,
    getRowLabel,
    columnVisibility,
    onColumnVisibilityChange,
    enableColumnVisibility,
    onRowClick,
    activeRowId,
    renderCard,
    cardBreakpoint = 'md',
    toolbar,
    density = 'comfortable',
    touchTarget = false,
    maxHeight,
    autoResetPageIndex = false,
    className,
  } = props;

  const copy = useDataCopy();
  const lastIndexRef = useRef<number | null>(null);
  const shiftRef = useRef(false);
  const rowLabelRef = useRef(getRowLabel);
  useEffect(() => {
    rowLabelRef.current = getRowLabel;
  });

  const selectable = enableRowSelection !== false;

  const columns = useMemo(() => {
    if (!selectable) return columnsProp;
    const select: ColumnDef<TData, unknown> = {
      id: SELECT_COLUMN_ID,
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
      enableGlobalFilter: false,
      meta: { mobile: 'hidden', interactive: true, width: '3rem' } satisfies DataTableColumnMeta,
      header: ({ table }) => (
        <SelectionCheckbox
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
          aria-label={copy.selectPage}
        />
      ),
      cell: ({ row, table }) => {
        const label = rowLabelRef.current?.(row.original);
        return (
          <SelectionCheckbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            aria-label={label ? `${copy.selectRow}: ${label}` : copy.selectRow}
            onClick={(e) => {
              shiftRef.current = e.shiftKey;
            }}
            onCheckedChange={(v) => {
              const rows = table.getRowModel().rows;
              const idx = rows.findIndex((r) => r.id === row.id);
              const last = lastIndexRef.current;
              if (shiftRef.current && last != null && last !== idx && idx !== -1 && last < rows.length) {
                const [a, b] = last < idx ? [last, idx] : [idx, last];
                const next: RowSelectionState = { ...table.getState().rowSelection };
                for (let i = a; i <= b; i++) {
                  const r = rows[i];
                  if (!r.getCanSelect()) continue;
                  if (v) next[r.id] = true;
                  else delete next[r.id];
                }
                table.setRowSelection(next);
              } else {
                row.toggleSelected(v);
              }
              lastIndexRef.current = idx;
              shiftRef.current = false;
            }}
          />
        );
      },
    };
    return [select, ...columnsProp];
  }, [columnsProp, selectable, copy.selectPage, copy.selectRow]);

  const state: Partial<TableState> = {};
  if (pagination) state.pagination = pagination;
  if (sorting) state.sorting = sorting;
  if (columnFilters) state.columnFilters = columnFilters;
  if (globalFilter !== undefined) state.globalFilter = globalFilter;
  if (rowSelection) state.rowSelection = rowSelection;
  if (columnVisibility) state.columnVisibility = columnVisibility;

  const options: TableOptions<TData> = {
    data: (data ?? EMPTY_DATA) as TData[],
    columns,
    getRowId,
    state,
    initialState: { pagination: { pageIndex: 0, pageSize: defaultPageSize } },
    getCoreRowModel: getCoreRowModel(),
    manualPagination,
    manualSorting,
    manualFiltering,
    enableMultiSort,
    enableRowSelection,
    autoResetPageIndex,
  };
  if (!manualSorting) options.getSortedRowModel = getSortedRowModel();
  if (!manualFiltering) options.getFilteredRowModel = getFilteredRowModel();
  if (paginated && !manualPagination) options.getPaginationRowModel = getPaginationRowModel();
  if (manualPagination && typeof rowCount === 'number') options.rowCount = rowCount;
  if (onPaginationChange) options.onPaginationChange = onPaginationChange;
  if (onSortingChange) options.onSortingChange = onSortingChange;
  if (onColumnFiltersChange) options.onColumnFiltersChange = onColumnFiltersChange;
  if (onGlobalFilterChange) options.onGlobalFilterChange = onGlobalFilterChange;
  if (onRowSelectionChange) options.onRowSelectionChange = onRowSelectionChange;
  if (onColumnVisibilityChange) options.onColumnVisibilityChange = onColumnVisibilityChange;

  // Satırlar memo'lu ama seçim/görünürlük prop olarak iniyor (bayat UI yok).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable(options);
  const tableState = table.getState();

  const titleColumnId = useMemo(() => {
    const explicit = columns.find((c) => (c.meta as DataTableColumnMeta | undefined)?.mobile === 'title');
    const resolve = (c: ColumnDef<TData, unknown>) =>
      c.id ?? ('accessorKey' in c && typeof c.accessorKey === 'string' ? c.accessorKey.replace(/\./g, '_') : undefined);
    if (explicit) return resolve(explicit);
    const first = columns.find((c) => {
      const meta = c.meta as DataTableColumnMeta | undefined;
      return c.id !== SELECT_COLUMN_ID && meta?.mobile !== 'actions' && meta?.mobile !== 'hidden' && !meta?.interactive;
    });
    return first ? resolve(first) : undefined;
  }, [columns]);

  const selectedIds = Object.keys(tableState.rowSelection).filter((k) => tableState.rowSelection[k]);
  const selectedRows = selectable ? table.getSelectedRowModel().rows.map((r) => r.original) : [];
  const clearSelection = () => {
    table.resetRowSelection(true);
    lastIndexRef.current = null;
  };

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== SELECT_COLUMN_ID);
  const showViewOptions = enableColumnVisibility ?? hideable.length >= 3;
  const visibilityKey = table
    .getVisibleLeafColumns()
    .map((c) => c.id)
    .join('|');

  const hasFilter = filtered ?? (!!tableState.globalFilter || tableState.columnFilters.length > 0);

  const qLike: QueryLike<readonly TData[]> = {
    data: data ?? undefined,
    isLoading: loading ?? query?.isLoading,
    isPending: query?.isPending,
    isError: error != null ? true : query?.isError,
    error: error ?? query?.error,
    isFetching: query?.isFetching,
    isRefetching: query?.isRefetching,
    refetch: onRetry ?? query?.refetch,
  };

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const pageRows = table.getRowModel().rows;
  const isFreshRow = useNewIds(pageRows.map((r) => r.id), pageRows.length > 0);
  const bp = CARD_BP[cardBreakpoint];
  const headPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const emptyNode =
    empty !== undefined ? empty : ({ variant: hasFilter ? 'filtered' : 'default' } satisfies EmptyStateProps);

  return (
    <div className={cn('min-w-0 space-y-3', className)}>
      {(toolbar || showViewOptions) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {showViewOptions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className={cn('h-11 gap-1.5', touchTarget ? '' : 'sm:h-9')}>
                  <Columns3 className="h-4 w-4" aria-hidden />
                  {copy.columns}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel className="qx-caption text-fg-muted">{copy.visibleColumns}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideable.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) => col.toggleVisibility(!!v)}
                  >
                    {getColumnLabel(col)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {selectable && (
        <BulkBar count={selectedIds.length} copy={copy} onClear={clearSelection}>
          {bulkActions?.({ rows: selectedRows, ids: selectedIds, clear: clearSelection })}
        </BulkBar>
      )}

      <QueryState
        query={qLike}
        skeleton={<SkeletonTable rows={Math.min(tableState.pagination?.pageSize ?? 6, 8)} columns={Math.min(Math.max(visibleColumnCount, 2), 6)} />}
        empty={emptyNode}
        error={errorProps}
      >
        {() => (
          <div className="space-y-3">
            <div
              className={cn('overflow-auto rounded-card border bg-surface-1 qx-elevation-1', bp.table)}
              style={maxHeight ? { maxHeight } : undefined}
            >
              <table className="w-full border-collapse qx-small">
                <caption className="sr-only">{ariaLabel}</caption>
                <thead className={cn('bg-surface-muted', maxHeight && 'sticky top-0 z-raised')}>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b">
                      {hg.headers.map((header) => {
                        const meta = getColumnMeta(header.column);
                        const canSort = header.column.getCanSort();
                        const dir = header.column.getIsSorted();
                        const isSelect = header.column.id === SELECT_COLUMN_ID;
                        const label = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
                        const SortIcon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            colSpan={header.colSpan}
                            aria-sort={canSort ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                            style={meta.width ? { width: meta.width } : undefined}
                            className={cn(
                              'whitespace-nowrap align-middle font-medium text-fg-muted',
                              isSelect ? 'w-12 px-4' : headPad,
                              ALIGN[alignOf(meta)],
                              meta.headerClassName,
                            )}
                          >
                            {canSort && !header.isPlaceholder ? (
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className={cn(
                                  '-mx-2 inline-flex min-h-9 items-center gap-1 rounded-chip px-2 transition-colors duration-fast ease-standard hover:text-fg',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  alignOf(meta) === 'end' && 'flex-row-reverse',
                                  dir && 'text-fg',
                                )}
                              >
                                <span>{label}</span>
                                <SortIcon className={cn('h-3.5 w-3.5 shrink-0', !dir && 'opacity-50')} aria-hidden />
                                {dir && <span className="sr-only">, {dir === 'asc' ? copy.sortedAsc : copy.sortedDesc}</span>}
                              </button>
                            ) : (
                              label
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumnCount}>
                        <EmptyState variant="no-results" compact />
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <DataTableRow
                        key={row.id}
                        row={row}
                        selected={row.getIsSelected()}
                        active={activeRowId != null && row.id === activeRowId}
                        visibilityKey={visibilityKey}
                        columnsRef={columns}
                        titleColumnId={titleColumnId}
                        density={density}
                        onRowClick={onRowClick}
                        fresh={isFreshRow(row.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {cardBreakpoint !== 'never' && (
              <div className={bp.cards}>
                {selectable && pageRows.length > 0 && (
                  <div className="mb-2 flex min-h-11 items-center gap-3 px-1">
                    <SelectionCheckbox
                      checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
                      onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)}
                      aria-label={copy.selectPage}
                    />
                    <span className="qx-small text-fg-muted" aria-hidden>
                      {copy.selectPage}
                    </span>
                  </div>
                )}
                {pageRows.length === 0 ? (
                  <EmptyState variant="no-results" compact />
                ) : (
                  <ul aria-label={ariaLabel} className="space-y-2.5">
                    {pageRows.map((row) => (
                      <li key={row.id}>
                        {renderCard ? (
                          renderCard(row)
                        ) : (
                          <DefaultCard
                            row={row}
                            titleColumnId={titleColumnId}
                            onRowClick={onRowClick}
                            active={activeRowId != null && row.id === activeRowId}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {paginated && (manualPagination ? (rowCount ?? 0) > 0 : (data?.length ?? 0) > 0) && (
              <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} touchTarget={touchTarget} />
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
