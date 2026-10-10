'use client';

import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
  type RefObject,
} from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryState, SectionCard, type EmptyStateProps, type QueryLike } from '@/components/states';
import { PanelErrorBoundary } from '../page/panel-error-boundary';
import { useDataCopy } from './copy';

/**
 * recharts'ı ana pakete SOKMADAN yükler. Grafik ayrı dosyada yazılır,
 * yalnız tip içe aktarılır:
 *
 *   // revenue-chart.tsx  → 'use client'; import { AreaChart, … } from 'recharts'; export default function …
 *   const RevenueChart = lazyChart(() => import('./revenue-chart'));
 *
 * Modül seviyesinde çağrılmalı (her render'da yeni bileşen üretmesin).
 */
export function lazyChart<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>): LazyExoticComponent<ComponentType<P>> {
  return lazy(loader);
}

export type ChartColumn<T> = {
  /** Satırdaki alan adı. */
  key: string;
  label: string;
  /** Sağa hizalı, tabular sayı. */
  numeric?: boolean;
  format?: (value: unknown, row: T) => ReactNode;
};

export type ChartDataTableProps<T> = {
  data: readonly T[];
  columns: readonly ChartColumn<T>[];
  caption?: ReactNode;
  className?: string;
};

function cellValue<T>(row: T, col: ChartColumn<T>): ReactNode {
  const v = (row as Record<string, unknown>)[col.key];
  if (col.format) return col.format(v, row);
  if (v == null || v === '') return '—';
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
}

/** Grafiğin erişilebilir veri tablosu karşılığı (görünür ya da `sr-only`). */
export function ChartDataTable<T>({ data, columns, caption, className }: ChartDataTableProps<T>) {
  return (
    <table className={cn('w-full border-collapse qx-small', className)}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr className="border-b border-subtle">
          {columns.map((c) => (
            <th key={c.key} scope="col" className={cn('px-3 py-2 text-left font-medium text-fg-muted', c.numeric && 'text-right')}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="border-b border-subtle last:border-b-0">
            {columns.map((c, ci) =>
              ci === 0 ? (
                <th key={c.key} scope="row" className={cn('px-3 py-2 text-left font-normal text-fg', c.numeric && 'text-right qx-num')}>
                  {cellValue(row, c)}
                </th>
              ) : (
                <td key={c.key} className={cn('px-3 py-2 text-fg', c.numeric && 'text-right qx-num')}>
                  {cellValue(row, c)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useInView<T extends Element>(enabled: boolean): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(!enabled);
  useEffect(() => {
    if (!enabled || inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, inView]);
  return [ref, inView];
}

export type ChartFrameProps<T> = {
  title: ReactNode;
  description?: ReactNode;
  /** Başlık satırına ek aksiyonlar (dönem seçici, dışa aktar). */
  actions?: ReactNode;
  /** Grafiğin verisi — tablo alternatifi bundan üretilir. */
  data: readonly T[];
  columns: readonly ChartColumn<T>[];
  /** Grafik (lazy yüklenmiş recharts bileşeni). */
  children: ReactNode;
  /** Grafik alanı yüksekliği (px) — yükleme sırasında yer ayrılır (CLS yok). */
  height?: number;
  /** Ekran okuyucu için tek cümlelik özet (ör. "Ciro son 30 günde %12 arttı"). */
  summary?: string;
  /** TanStack Query sonucu (yükleniyor/hata/boş durumları). */
  query?: QueryLike<unknown>;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => unknown;
  empty?: EmptyStateProps;
  defaultView?: 'chart' | 'table';
  /** Görünür alana yaklaşınca yükle (varsayılan true). */
  deferUntilVisible?: boolean;
  /** Kaynak / tanım notu, gösterge. */
  footer?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
};

/**
 * Grafik çerçevesi — recharts'ı yalnız gerektiğinde (görünür alana gelince,
 * `lazyChart` ile ayrı parça) yükler, yer ayırır, hata olursa sayfayı
 * düşürmeden tabloya geçer. Grafik `aria-hidden`; aynı veri her zaman
 * erişilebilir tablo olarak vardır (görünür "Tablo" görünümü + `sr-only`).
 */
export function ChartFrame<T>({
  title,
  description,
  actions,
  data,
  columns,
  children,
  height = 240,
  summary,
  query,
  loading,
  error,
  onRetry,
  empty,
  defaultView = 'chart',
  deferUntilVisible = true,
  footer,
  headingLevel = 'h2',
  className,
}: ChartFrameProps<T>) {
  const copy = useDataCopy();
  const [view, setView] = useState<'chart' | 'table'>(defaultView);
  const [ref, inView] = useInView<HTMLDivElement>(deferUntilVisible);
  const summaryId = useId();

  const q: QueryLike<readonly T[]> = {
    data,
    isLoading: loading ?? query?.isLoading,
    isPending: query?.isPending,
    isError: error != null ? true : query?.isError,
    error: error ?? query?.error,
    isFetching: query?.isFetching,
    refetch: onRetry ?? query?.refetch,
  };

  const toggle = (
    <div role="group" aria-label={copy.viewAs} className="inline-flex rounded-control border border-subtle bg-surface-muted p-0.5">
      {(['chart', 'table'] as const).map((v) => {
        const Icon = v === 'chart' ? BarChart3 : Table2;
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => setView(v)}
            className={cn(
              'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-chip px-2.5 qx-caption font-medium transition-colors duration-fast ease-standard sm:h-8',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-surface-1 text-fg qx-elevation-1' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{v === 'chart' ? copy.chartView : copy.tableView}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <SectionCard
      title={title}
      description={description}
      headingLevel={headingLevel}
      actions={
        <>
          {actions}
          {toggle}
        </>
      }
      footer={footer}
      className={className}
    >
      <QueryState query={q} skeleton={<Skeleton className="w-full rounded-control" style={{ height }} />} empty={{ compact: true, ...empty }}>
        {() =>
          view === 'table' ? (
            <div className="-mx-1 overflow-x-auto px-1">
              <ChartDataTable data={data} columns={columns} caption={summary ?? copy.chartData} />
            </div>
          ) : (
            <div ref={ref} className="min-w-0">
              {summary && (
                <p id={summaryId} className="sr-only">
                  {summary}
                </p>
              )}
              <div className="relative w-full min-w-0" style={{ height }}>
                {inView ? (
                  <PanelErrorBoundary
                    fallback={({ reset }) => (
                      <div className="grid h-full place-items-center rounded-control border border-dashed border-subtle p-4 text-center">
                        <p className="qx-small text-fg-muted">
                          {copy.chartFailed}{' '}
                          <button
                            type="button"
                            onClick={() => {
                              reset();
                              setView('table');
                            }}
                            className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {copy.tableView}
                          </button>
                        </p>
                      </div>
                    )}
                  >
                    <div aria-hidden className="h-full w-full">
                      <Suspense fallback={<Skeleton className="h-full w-full rounded-control" />}>{children}</Suspense>
                    </div>
                  </PanelErrorBoundary>
                ) : (
                  <Skeleton aria-hidden className="h-full w-full rounded-control" />
                )}
              </div>
              <ChartDataTable data={data} columns={columns} caption={summary ?? copy.chartData} className="sr-only" />
            </div>
          )
        }
      </QueryState>
    </SectionCard>
  );
}
