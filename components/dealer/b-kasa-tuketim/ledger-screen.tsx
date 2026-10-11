'use client';

/**
 * İşlem defteri (/dealer/consumptions). Sunucu ilk sayfayı + özeti verir; filtre değişince
 * URL sığ olarak güncellenir (paylaşılabilir, yenilemede korunur) ve React Query yalnız BFF'i
 * çağırır (`keepPreviousData` → liste iskelete dönmez). Satır → detay çekmecesi: yorum,
 * boyut puanları, yanıt, pasif puan, 15 dk içinde geri alma.
 */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, MessageSquareReply, ScanLine, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DetailSheet, MetricGrid, MetricTile, PageHeader } from '@/components/ds';
import { EmptyState, QueryState, TONE_CALLOUT } from '@/components/states';
import {
  DEFAULT_LEDGER_FILTERS,
  LEDGER_RANGES,
  LEDGER_RATINGS,
  LEDGER_SORTS,
  ledgerFiltersToParams,
  pctDelta,
  type LedgerFilters,
} from '@/lib/dealer/kasa/core';
import { ledgerQueryKey, type KasaProduct, type LedgerPage, type LedgerRow } from '@/lib/dealer/kasa/types';
import { formatDateTime, formatMoney, formatRelative, kasaFetch } from './api';
import { CustomerAvatar, RatingBadge, VoidButton, VoidDialog } from './parts';
import { useKasaCopy } from './copy';

const SELECT_CLS =
  'min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function LedgerScreen({
  initial,
  products,
  readOnly,
  adminDealerId,
}: {
  initial: LedgerPage | null;
  products: KasaProduct[];
  readOnly: boolean;
  /** ADMIN görünümü: BFF'e `dealerId` geçilir. */
  adminDealerId?: string | null;
}) {
  const { copy } = useKasaCopy();
  const c = copy.ledger;
  const qc = useQueryClient();
  const [filters, setFilters] = useState<LedgerFilters>(initial?.filters ?? DEFAULT_LEDGER_FILTERS);
  const [qDraft, setQDraft] = useState(filters.q);
  const [customFrom, setCustomFrom] = useState(filters.from ?? '');
  const [customTo, setCustomTo] = useState(filters.to ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  const [voidRow, setVoidRow] = useState<LedgerRow | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  const search = useMemo(() => {
    const p = ledgerFiltersToParams(filters);
    if (adminDealerId) p.set('dealerId', adminDealerId);
    return p.toString();
  }, [filters, adminDealerId]);
  const initialSearch = useMemo(() => {
    if (!initial) return null;
    const p = ledgerFiltersToParams(initial.filters);
    if (adminDealerId) p.set('dealerId', adminDealerId);
    return p.toString();
  }, [initial, adminDealerId]);

  const query = useQuery({
    queryKey: ledgerQueryKey(search),
    queryFn: () => kasaFetch<LedgerPage>(`/api/dealer/consumptions${search ? `?${search}` : ''}`),
    initialData: initial && search === initialSearch ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    // Canlı: ilk sayfadayken yeni işlemler 30 sn'de bir düşer (sekme görünürken).
    refetchInterval: filters.page === 1 ? 30_000 : false,
  });

  // Sığ URL eşitlemesi (RSC yeniden çalışmaz).
  useEffect(() => {
    const p = ledgerFiltersToParams(filters);
    if (adminDealerId) p.set('dealerId', adminDealerId);
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
  }, [filters, adminDealerId]);

  // Arama: yazmayı bekle (300 ms).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const q = qDraft.trim().replace(/\s+/g, ' ');
      const next = q.length >= 2 ? q.slice(0, 80) : '';
      setFilters((f) => (f.q === next ? f : { ...f, q: next, page: 1 }));
    }, 300);
    return () => window.clearTimeout(id);
  }, [qDraft]);

  const patch = (p: Partial<LedgerFilters>) => setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }));
  const goPage = (page: number) => {
    patch({ page });
    listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    listTopRef.current?.focus({ preventScroll: true });
  };
  const isFiltered =
    filters.range !== DEFAULT_LEDGER_FILTERS.range || filters.rating !== 'all' || !!filters.productId || !!filters.q || filters.sort !== 'new';

  const data = query.data;
  const rows = data?.rows ?? [];
  const openRow = rows.find((r) => r.id === openId) ?? null;
  const exportHref = `/api/dealer/consumptions/export${search ? `?${search}` : ''}`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-24">
      <PageHeader
        eyebrow={c.eyebrow}
        title={c.title}
        description={c.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="min-h-11 gap-2">
              <a href={exportHref} download>
                <Download className="h-4 w-4" aria-hidden />
                {c.export}
              </a>
            </Button>
            {!readOnly && (
              <Button asChild className="min-h-11 gap-2">
                <Link href="/dealer/scan">
                  <ScanLine className="h-4 w-4" aria-hidden />
                  {c.scan}
                </Link>
              </Button>
            )}
          </div>
        }
      />
      {readOnly && <p className={cn('rounded-xl border px-3 py-2 text-sm', TONE_CALLOUT.info)}>{c.adminReadOnly}</p>}

      {/* Araç çubuğu */}
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-3 sm:p-4" role="search">
        <div role="radiogroup" aria-label={c.filters.range} className="flex gap-1 overflow-x-auto pb-1">
          {LEDGER_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={filters.range === r}
              onClick={() => (r === 'custom' ? patch({ range: 'custom', from: customFrom || null, to: customTo || null }) : patch({ range: r, from: null, to: null }))}
              className={cn(
                'min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filters.range === r ? 'bg-brand text-brand-foreground' : 'bg-surface-muted text-fg-muted hover:text-fg'
              )}
            >
              {c.filters.ranges[r]}
            </button>
          ))}
        </div>
        {filters.range === 'custom' && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (customFrom && customTo) patch({ range: 'custom', from: customFrom <= customTo ? customFrom : customTo, to: customFrom <= customTo ? customTo : customFrom });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="ledger-from">{c.filters.from}</Label>
              <Input id="ledger-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="min-h-11" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ledger-to">{c.filters.to}</Label>
              <Input id="ledger-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="min-h-11" />
            </div>
            <Button type="submit" variant="outline" className="min-h-11" disabled={!customFrom || !customTo}>
              {c.filters.apply}
            </Button>
          </form>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Label htmlFor="ledger-q" className="sr-only">
              {c.filters.search}
            </Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input type="search" id="ledger-q" value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder={c.filters.search} className="min-h-11 pl-9" />
          </div>
          <div>
            <Label htmlFor="ledger-rating" className="sr-only">
              {c.filters.rating}
            </Label>
            <select
              id="ledger-rating"
              className={SELECT_CLS}
              value={filters.rating}
              onChange={(e) => patch({ rating: e.target.value as LedgerFilters['rating'] })}
            >
              {LEDGER_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {c.filters.rating}: {c.filters.ratings[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ledger-product" className="sr-only">
              {c.filters.product}
            </Label>
            <select
              id="ledger-product"
              className={SELECT_CLS}
              value={filters.productId ?? ''}
              onChange={(e) => patch({ productId: e.target.value || null })}
            >
              <option value="">{c.filters.allProducts}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ledger-sort" className="sr-only">
              {c.filters.sort}
            </Label>
            <select id="ledger-sort" className={SELECT_CLS} value={filters.sort} onChange={(e) => patch({ sort: e.target.value as LedgerFilters['sort'] })}>
              {LEDGER_SORTS.map((s) => (
                <option key={s} value={s}>
                  {c.filters.sort}: {c.filters.sorts[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={filters.rating === 'low'}
            onClick={() => patch({ rating: filters.rating === 'low' ? 'all' : 'low' })}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm font-medium ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              filters.rating === 'low' ? 'bg-danger text-white ring-danger' : 'bg-danger-subtle text-danger ring-danger-border'
            )}
          >
            {c.filters.lowAction}
          </button>
          {isFiltered && (
            <Button
              variant="ghost"
              className="min-h-11 gap-1.5"
              onClick={() => {
                setQDraft('');
                setFilters(DEFAULT_LEDGER_FILTERS);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              {c.filters.clear}
            </Button>
          )}
        </div>
      </div>

      <QueryState
        query={query}
        skeleton="table"
        error={{ title: c.errorTitle }}
        onRetry={() => query.refetch()}
        isEmpty={() => false}
        showRefreshing
      >
        {(page: LedgerPage) => (
          <div className="space-y-5">
            <Kpis page={page} />
            <div ref={listTopRef} tabIndex={-1} className="outline-none" />
            {page.rows.length === 0 ? (
              isFiltered ? (
                <EmptyState
                  title={c.empty}
                  action={
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setQDraft('');
                        setFilters(DEFAULT_LEDGER_FILTERS);
                      }}
                    >
                      {c.filters.clear}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title={c.emptyAll}
                  description={c.emptyAllHint}
                  action={
                    !readOnly ? (
                      <Button asChild className="min-h-11 gap-2">
                        <Link href="/dealer/scan">
                          <ScanLine className="h-4 w-4" aria-hidden />
                          {c.scan}
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <LedgerList rows={page.rows} onOpen={setOpenId} onVoid={readOnly ? null : setVoidRow} />
            )}
            {page.totalPages > 1 && (
              <nav aria-label={c.table.caption} className="flex items-center justify-between gap-3">
                <Button variant="outline" className="min-h-11 gap-1" disabled={page.page <= 1 || query.isFetching} onClick={() => goPage(page.page - 1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  {c.prev}
                </Button>
                <p className="text-sm text-fg-muted" aria-live="polite">
                  {c.page(page.page, page.totalPages, page.total)}
                </p>
                <Button
                  variant="outline"
                  className="min-h-11 gap-1"
                  disabled={page.page >= page.totalPages || query.isFetching}
                  onClick={() => goPage(page.page + 1)}
                >
                  {c.next}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </nav>
            )}
          </div>
        )}
      </QueryState>

      <DetailSheet
        open={!!openRow}
        onOpenChange={(o) => !o && setOpenId(null)}
        id={openRow?.id ?? null}
        title={c.detail.title}
        description={openRow ? formatDateTime(openRow.createdAt, copy.locale) : undefined}
        siblings={rows.map((r) => r.id)}
        onNavigate={setOpenId}
        size="md"
      >
        {openRow ? <RowDetail row={openRow} onVoid={readOnly ? null : () => setVoidRow(openRow)} /> : null}
      </DetailSheet>

      {voidRow && (
        <VoidDialog
          open
          onOpenChange={(o) => !o && setVoidRow(null)}
          consumptionId={voidRow.id}
          summary={{ label: voidRow.product?.name ?? copy.common.noProduct, amount: formatMoney(voidRow.amount, copy.locale), points: voidRow.passivePoints }}
          onDone={() => {
            setVoidRow(null);
            setOpenId(null);
            void qc.invalidateQueries({ queryKey: ['dealer', 'kasa'] });
          }}
        />
      )}
    </div>
  );
}

function Kpis({ page }: { page: LedgerPage }) {
  const { copy } = useKasaCopy();
  const k = copy.ledger.kpi;
  const cur = page.summary.current;
  const prev = page.summary.previous;
  const delta = (a: number | null, b: number | null | undefined, kind: 'percent' | 'points' = 'percent') => {
    if (prev == null) return null;
    if (kind === 'points') return a != null && b != null ? { value: Math.round((a - b) * 10) / 10, kind, label: k.vsPrev } : null;
    const d = pctDelta(a, b ?? null);
    return d == null ? null : { value: d, kind, label: k.vsPrev };
  };
  return (
    <MetricGrid cols={4}>
      <MetricTile label={k.revenue} metric={{ value: cur.revenue, format: 'currency', delta: delta(cur.revenue, prev?.revenue) }} />
      <MetricTile label={k.count} metric={{ value: cur.count, format: 'number', delta: delta(cur.count, prev?.count) }} />
      <MetricTile label={k.avg} metric={{ value: cur.avgBasket, format: 'currency', delta: delta(cur.avgBasket, prev?.avgBasket) }} />
      <MetricTile
        label={k.reviewRate}
        metric={{ value: cur.reviewRate, format: 'percent', delta: delta(cur.reviewRate, prev?.reviewRate, 'points') }}
        hint={cur.repeatRate != null ? `${k.repeat}: %${cur.repeatRate.toLocaleString(copy.locale)}` : undefined}
      />
    </MetricGrid>
  );
}

function LedgerList({
  rows,
  onOpen,
  onVoid,
}: {
  rows: LedgerRow[];
  onOpen: (id: string) => void;
  onVoid: ((r: LedgerRow) => void) | null;
}) {
  const { copy } = useKasaCopy();
  const t = copy.ledger.table;
  return (
    <>
      {/* Masaüstü: yoğun tablo */}
      <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{t.date}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.customer}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.product}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t.amount}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.review}</th>
              {onVoid && <th scope="col" className="px-4 py-3"><span className="sr-only">{copy.ledger.void.button}</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-surface-muted/60" onClick={() => onOpen(r.id)}>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="block">{formatDateTime(r.createdAt, copy.locale)}</span>
                  <span className="block text-xs text-fg-muted">{formatRelative(r.createdAt, copy.locale)}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(r.id);
                    }}
                    className="flex min-h-11 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t.open(r.customer.displayName ?? copy.kasa.customer.unnamed)}
                  >
                    <CustomerAvatar src={r.customer.avatar} initials={r.customer.initials} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.customer.displayName ?? copy.kasa.customer.unnamed}</span>
                      {r.cardLast4 && <span className="block text-xs text-fg-muted">•••• {r.cardLast4}</span>}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className="block">{r.product?.name ?? copy.common.noProduct}</span>
                  {r.note && <span className="line-clamp-1 block text-xs text-fg-muted">{r.note}</span>}
                </td>
                <td className="qx-num whitespace-nowrap px-4 py-3 text-right">{r.amount === 0 ? copy.common.free : formatMoney(r.amount, copy.locale)}</td>
                <td className="px-4 py-3">
                  <RatingBadge rating={r.review?.rating ?? null} />
                </td>
                {onVoid && (
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <VoidButton createdAt={r.createdAt} voidable={r.voidable} onClick={() => onVoid(r)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobil: kart listesi */}
      <ul className="space-y-2 md:hidden" aria-label={t.caption}>
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface">
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex w-full items-center gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t.open(r.customer.displayName ?? copy.kasa.customer.unnamed)}
            >
              <CustomerAvatar src={r.customer.avatar} initials={r.customer.initials} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.customer.displayName ?? copy.kasa.customer.unnamed}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {r.product?.name ?? copy.common.noProduct} · {formatRelative(r.createdAt, copy.locale)}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="qx-num text-sm font-semibold">{r.amount === 0 ? copy.common.free : formatMoney(r.amount, copy.locale)}</span>
                <RatingBadge rating={r.review?.rating ?? null} />
              </span>
            </button>
            {onVoid && r.voidable && (
              <div className="border-t border-border px-3 py-2">
                <VoidButton createdAt={r.createdAt} voidable={r.voidable} onClick={() => onVoid(r)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function RowDetail({ row, onVoid }: { row: LedgerRow; onVoid: (() => void) | null }) {
  const { copy } = useKasaCopy();
  const d = copy.ledger.detail;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <CustomerAvatar src={row.customer.avatar} initials={row.customer.initials} size={48} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.customer.displayName ?? copy.kasa.customer.unnamed}</p>
          {row.cardLast4 && <p className="text-sm text-fg-muted">{copy.kasa.customer.card(row.cardLast4)}</p>}
        </div>
        <span className="qx-num ml-auto text-lg font-semibold">{row.amount === 0 ? copy.common.free : formatMoney(row.amount, copy.locale)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-fg-muted">{d.when}</dt>
        <dd>{formatDateTime(row.createdAt, copy.locale)}</dd>
        <dt className="text-fg-muted">{copy.ledger.table.product}</dt>
        <dd>{row.product?.name ?? copy.common.noProduct}</dd>
        {row.product?.categoryName && (
          <>
            <dt className="text-fg-muted">{d.category}</dt>
            <dd>
              {row.product.categoryIcon} {row.product.categoryName}
            </dd>
          </>
        )}
        {row.note && (
          <>
            <dt className="text-fg-muted">{d.note}</dt>
            <dd className="whitespace-pre-wrap break-words">{row.note}</dd>
          </>
        )}
        {row.passivePoints != null && (
          <>
            <dt className="text-fg-muted">{d.points}</dt>
            <dd className="qx-num">{copy.common.points(row.passivePoints)}</dd>
          </>
        )}
      </dl>

      <section aria-labelledby={`rev-${row.id}`} className="space-y-2 rounded-xl border border-border p-3">
        <h3 id={`rev-${row.id}`} className="text-sm font-semibold">
          {d.review}
        </h3>
        {row.review ? (
          <>
            <RatingBadge rating={row.review.rating} />
            <p className="text-sm">{row.review.text?.trim() || <span className="text-fg-muted">{d.noText}</span>}</p>
            {row.review.dimensions && (
              <ul className="flex flex-wrap gap-2">
                {Object.entries(row.review.dimensions).map(([k, v]) => (
                  <li key={k} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs">
                    {d.dims[k] ?? k}: <span className="qx-num font-semibold">{v}/5</span>
                  </li>
                ))}
              </ul>
            )}
            {row.review.dealerReply && (
              <div className="rounded-lg bg-surface-muted p-2 text-sm">
                <p className="text-xs font-medium text-fg-muted">{d.reply}</p>
                <p>{row.review.dealerReply}</p>
              </div>
            )}
            <Button asChild variant="outline" className="min-h-11 gap-2">
              <Link href={`/dealer/inbox?source=consumption&id=${encodeURIComponent(`cr-${row.review.id}`)}`}>
                <MessageSquareReply className="h-4 w-4" aria-hidden />
                {d.goReviews}
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{d.noReview}</p>
        )}
      </section>

      {onVoid && (
        <div className="space-y-1">
          <VoidButton createdAt={row.createdAt} voidable={row.voidable} onClick={onVoid} size="default" />
          {!row.voidable && <p className="text-xs text-fg-muted">{row.review ? copy.ledger.void.closedReview : copy.ledger.void.closedWindow}</p>}
        </div>
      )}
    </div>
  );
}
