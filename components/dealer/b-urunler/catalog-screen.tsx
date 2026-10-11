'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Flame,
  Package,
  Plus,
  Search,
  Star,
  Tag,
  Tags,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, InlineError, QueryState } from '@/components/states';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { DetailSheet } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { useReducedMotionPref } from '@/lib/motion';
import { CATALOG_PAGE_SIZES, parseCatalogQuery, type CatalogQuery } from '@/lib/dealer/catalog/schemas';
import type { CatalogPageDto, CatalogProductDto } from '@/lib/dealer/catalog/types';
import { catalogApi, useCatalog, useInvalidateCatalog, useSetProductActive } from './api';
import { ProductCard, type ProductCardActions } from './product-card';
import { CatalogSkeleton } from './skeleton';
import { ratingLabel } from './format';
import { useProductsCopy } from './copy';

// Ağır / ikincil parçalar ayrı yüklenir: açılış adası küçük kalsın.
const ProductEditor = dynamic(() => import('./product-editor').then((m) => m.ProductEditor), { ssr: false });
const ProductDetail = dynamic(() => import('./product-detail').then((m) => m.ProductDetail), { ssr: false });
const CategoryManager = dynamic(() => import('./category-manager').then((m) => m.CategoryManager), { ssr: false });
const ImportDialog = dynamic(() => import('./import-dialog').then((m) => m.ImportDialog), { ssr: false });
const BulkBar = dynamic(() => import('./bulk-bar').then((m) => m.BulkBar), { ssr: false });

const DETAIL_PARAM = 'urun';

const SORTS = ['name.asc', 'name.desc', 'price.asc', 'price.desc', 'consumptions.desc', 'rating.desc', 'rating.asc', 'createdAt.desc'] as const;

/** URL'yi sunucu turu olmadan günceller (Next `useSearchParams` history API'yi izler). */
function replaceQuery(patch: Record<string, string | null>, resetPage = true) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  if (resetPage && !('page' in patch)) url.searchParams.delete('page');
  url.searchParams.delete('search'); // global arama derin bağlantısı `q`'ya taşındı
  // Veri olarak `null`: Next 16 yamalı replaceState, `__NA` taşıyan (yani window.history.state)
  // veriyi kendi iç çağrısı sayıp useSearchParams'ı GÜNCELLEMİYORDU → arama/filtre/sıralama/
  // sayfalama URL'yi değiştirip listeyi hiç yenilemiyordu. Next iç durumu kendisi kopyalar.
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function sortValue(q: CatalogQuery) {
  return `${q.sort}.${q.desc ? 'desc' : 'asc'}`;
}

function SearchBox({ value }: { value: string }) {
  const [text, setText] = useState(value);
  const c = useProductsCopy().catalog;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const push = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => replaceQuery({ q: v.trim() || null }), 300);
  };
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <label htmlFor="catalog-search" className="sr-only">
        {c.search}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
      <Input
        id="catalog-search"
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          push(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (timer.current) clearTimeout(timer.current);
            replaceQuery({ q: text.trim() || null });
          }
        }}
        placeholder={c.searchPlaceholder}
        className="min-h-11 pl-9"
        maxLength={100}
        autoComplete="off"
      />
    </div>
  );
}

function InsightStrip({ data, onOpen }: { data: CatalogPageDto; onOpen: (id: string) => void }) {
  const i = data.insights;
  const c = useProductsCopy().catalog;
  const cardCls =
    'flex min-h-[5.5rem] w-full items-start gap-3 rounded-card border border-subtle bg-surface-1 p-4 text-left transition-colors duration-fast hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:hover:border-subtle';
  return (
    <section aria-label={c.insightsAria} className="grid gap-3 sm:grid-cols-3">
      <button type="button" className={cardCls} disabled={!i.topConsumed} onClick={() => i.topConsumed && onOpen(i.topConsumed.id)}>
        <Flame className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0">
          <span className="qx-caption block text-fg-muted">{c.topConsumed}</span>
          {i.topConsumed ? (
            <>
              <span className="qx-body block truncate font-semibold text-fg">{i.topConsumed.name}</span>
              <span className="qx-caption qx-num text-fg-muted">{c.consumptions(i.topConsumed.count)}</span>
            </>
          ) : (
            <span className="qx-small block text-fg-muted">{c.noTopConsumed}</span>
          )}
        </span>
      </button>
      <button type="button" className={cardCls} disabled={!i.lowestRated} onClick={() => i.lowestRated && onOpen(i.lowestRated.id)}>
        <Star className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0">
          <span className="qx-caption block text-fg-muted">{c.lowestRated}</span>
          {i.lowestRated ? (
            <>
              <span className="qx-body block truncate font-semibold text-fg">{i.lowestRated.name}</span>
              <span className="qx-caption qx-num text-fg-muted">
                {c.reviewsLine(ratingLabel(i.lowestRated.avg), i.lowestRated.reviews)}
              </span>
            </>
          ) : (
            <span className="qx-small block text-fg-muted">{c.noLowest(i.minReviews)}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        className={cardCls}
        disabled={i.missingPrice === 0}
        onClick={() => replaceQuery({ missing: 'price', status: null, category: null, q: null })}
      >
        <Tag className={`mt-0.5 h-5 w-5 shrink-0 ${i.missingPrice > 0 ? 'text-danger' : 'text-success'}`} aria-hidden />
        <span className="min-w-0">
          <span className="qx-caption block text-fg-muted">{c.missingPrice}</span>
          <span className="qx-body qx-num block font-semibold text-fg">{c.products(i.missingPrice)}</span>
          <span className="qx-caption text-fg-muted">{i.missingPrice > 0 ? c.tapToShow : c.allPriced}</span>
        </span>
      </button>
    </section>
  );
}

function CategoryChips({ data, q }: { data: CatalogPageDto; q: CatalogQuery }) {
  const c0 = useProductsCopy().catalog;
  const cats = data.categories.filter((c) => c.isActive || c.id === q.category);
  const archived = q.status === 'archived';
  const total = archived ? data.insights.archivedCount : data.insights.activeCount;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-chip border px-3 qx-small transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
      active ? 'border-brand bg-brand-subtle font-semibold text-brand' : 'border-subtle bg-surface-1 text-fg hover:bg-surface-3'
    }`;
  // justify-start + yatay kaydırma: çok kategoride baştakiler kırpılmaz (Bulgu 7).
  return (
    <nav aria-label={c0.categoryFilter} className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full justify-start gap-2">
        <li>
          <button type="button" className={chip(!q.category)} aria-pressed={!q.category} onClick={() => replaceQuery({ category: null })}>
            {c0.all} <span className="qx-caption qx-num text-fg-muted">{total}</span>
          </button>
        </li>
        {cats.map((c) => {
          const n = archived ? c.archivedCount : c.activeCount;
          return (
            <li key={c.id}>
              <button type="button" className={chip(q.category === c.id)} aria-pressed={q.category === c.id} onClick={() => replaceQuery({ category: c.id })}>
                <span aria-hidden>{c.icon}</span>
                {c.name}
                <span className="qx-caption qx-num text-fg-muted">{n}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Pagination({ data, q }: { data: CatalogPageDto; q: CatalogQuery }) {
  const last = Math.max(1, Math.ceil(data.total / data.pageSize));
  const c = useProductsCopy().catalog;
  if (data.total <= CATALOG_PAGE_SIZES[0]) return null;
  const from = (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  return (
    <nav aria-label={c.pagination} className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="qx-small qx-num text-fg-muted">
        {c.range(from, to, data.total)}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="catalog-size" className="qx-caption text-fg-muted">
          {c.perPage}
        </label>
        <Select value={String(q.pageSize)} onValueChange={(v) => replaceQuery({ size: v === '24' ? null : v })}>
          <SelectTrigger id="catalog-size" className="min-h-11 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATALOG_PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="min-h-11" disabled={data.page <= 1} onClick={() => replaceQuery({ page: data.page - 1 > 1 ? String(data.page - 1) : null }, false)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only sm:ml-1">{c.prev}</span>
        </Button>
        <span className="qx-small qx-num text-fg" aria-current="page">
          {data.page} / {last}
        </span>
        <Button variant="outline" className="min-h-11" disabled={data.page >= last} onClick={() => replaceQuery({ page: String(data.page + 1) }, false)}>
          <span className="sr-only sm:not-sr-only sm:mr-1">{c.next}</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

/**
 * Ürünler ve menü (`/dealer/products`) istemci adası. İlk veri SSR'dan (HydrationBoundary).
 * Ops kaydı: sakin, yoğun; hareket yalnız durum değişimini anlatır (filtrede yerinde yeniden
 * düzen, arşivde daralarak çıkış), azaltılmış harekette statik. Hata asla "henüz ürün yok"
 * olarak görünmez (Bulgu 1); filtre boşu ile gerçek boşluk ayrıdır (envanter #12).
 */
export function CatalogScreen() {
  const params = useSearchParams();
  const q = useMemo(() => parseCatalogQuery(params ?? new URLSearchParams()), [params]);
  const query = useCatalog(q);
  const reduced = useReducedMotionPref();
  const invalidate = useInvalidateCatalog();
  const setActive = useSetProductActive();
  const data = query.data;
  const canWrite = data?.canWrite ?? false;
  const copy = useProductsCopy();
  const c = copy.catalog;

  const [editor, setEditor] = useState<{ open: boolean; product: CatalogProductDto | null }>({ open: false, product: null });
  const [catsOpen, setCatsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const detailId = params?.get(DETAIL_PARAM) ?? null;

  // Filtre/sayfa değişince seçim sıfırlanır (görünmeyen ürünlere kazara toplu işlem olmasın).
  const queryKey = `${q.q}|${q.category}|${q.status}|${q.missingPrice}|${q.page}|${q.pageSize}|${q.sort}|${q.desc}`;
  useEffect(() => setSelected(new Set()), [queryKey]);

  // Sonuç sayısını ekran okuyucuya duyur (arama/filtre sonrası).
  const lastAnnounced = useRef<string>('');
  useEffect(() => {
    if (!data || query.isPlaceholderData) return;
    const msg = c.found(data.total);
    if (lastAnnounced.current && lastAnnounced.current !== queryKey) announce(msg);
    lastAnnounced.current = queryKey;
  }, [data, query.isPlaceholderData, queryKey, c]);

  const openDetail = useCallback((id: string) => replaceQuery({ [DETAIL_PARAM]: id }, false), []);
  const openCreate = useCallback(() => setEditor({ open: true, product: null }), []);

  const archive = useCallback(
    (p: CatalogProductDto) => {
      setActive.mutate(
        { id: p.id, active: false },
        {
          onSuccess: () =>
            toast.success(c.archivedToast(p.name), {
              description: c.historyKept,
              action: {
                label: c.undo,
                onClick: () =>
                  setActive.mutate(
                    { id: p.id, active: true },
                    { onError: (e) => toast.error(e instanceof Error ? e.message : c.undoFailed) }
                  ),
              },
            }),
          onError: (e) => toast.error(e instanceof Error ? e.message : c.archiveFailed),
        }
      );
    },
    [setActive, c]
  );

  const actions: ProductCardActions = useMemo(
    () => ({
      onOpen: (p) => openDetail(p.id),
      onEdit: (p) => setEditor({ open: true, product: p }),
      onArchive: archive,
      onRestore: (p) =>
        setActive.mutate(
          { id: p.id, active: true },
          {
            onSuccess: () => toast.success(c.restored(p.name)),
            onError: (e) => toast.error(e instanceof Error ? e.message : c.restoreFailed),
          }
        ),
      onCopy: async (p) => {
        try {
          const r = await catalogApi.copyProduct(p.id);
          toast.success(c.copied(p.name));
          invalidate();
          setEditor({ open: true, product: r.product });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : c.copyFailed);
        }
      },
      onToggleSelect: (id, checked) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (checked) next.add(id);
          else next.delete(id);
          return next;
        }),
    }),
    [archive, invalidate, openDetail, setActive, c]
  );

  const detailProduct = data?.items.find((p) => p.id === detailId) ?? null;
  const filtersActive = !!(q.q || q.category || q.missingPrice);

  return (
    <PanelPage
      register="ops"
      aria-label={c.title}
      header={
        <PageHeader
          title={c.title}
          eyebrow={c.eyebrow}
          description={c.description}
          icon={<Package className="h-5 w-5" aria-hidden />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? (
                <Button variant="outline" className="min-h-11" onClick={() => setCatsOpen(true)}>
                  <Tags className="mr-1.5 h-4 w-4" aria-hidden /> {c.categories}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="min-h-11" disabled={!data}>
                    <FileUp className="mr-1.5 h-4 w-4" aria-hidden /> {c.importExport}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  {canWrite ? (
                    <DropdownMenuItem className="min-h-11" onSelect={() => setImportOpen(true)}>
                      <FileUp className="mr-2 h-4 w-4" aria-hidden /> {copy.common.importCsv}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem asChild className="min-h-11">
                    <a href="/api/dealer/catalog/export" download>
                      <Download className="mr-2 h-4 w-4" aria-hidden /> {c.exportActive}
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-11">
                    <a href="/api/dealer/catalog/export?archived=1" download>
                      <Download className="mr-2 h-4 w-4" aria-hidden /> {c.exportAll}
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canWrite ? (
                <Button className="hidden min-h-11 md:inline-flex" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden /> {c.addProduct}
                </Button>
              ) : null}
            </div>
          }
        />
      }
    >
      <QueryState query={query} skeleton={<CatalogSkeleton />} error={{ title: c.loadFailed, description: c.loadFailedHint }}>
        {(d) => (
          <div className="space-y-5">
            {d.capped ? (
              <InlineError variant="banner" tone="warning">
                {c.capped}
              </InlineError>
            ) : null}
            {!d.canWrite ? (
              <InlineError variant="banner" tone="info">
                {c.readOnly}
              </InlineError>
            ) : null}

            <InsightStrip data={d} onOpen={openDetail} />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={q.q} />
                <div role="group" aria-label={c.status} className="inline-flex rounded-control border border-subtle bg-surface-2 p-0.5">
                  {(['active', 'archived'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={q.status === s}
                      onClick={() => replaceQuery({ status: s === 'active' ? null : s, missing: null })}
                      className={`qx-small min-h-10 rounded-control px-3 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                        q.status === s ? 'bg-surface-1 font-semibold text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {s === 'active' ? c.active : c.archive}{' '}
                      <span className="qx-caption qx-num text-fg-muted">{s === 'active' ? d.insights.activeCount : d.insights.archivedCount}</span>
                    </button>
                  ))}
                </div>
                <Select value={sortValue(q)} onValueChange={(v) => replaceQuery({ sort: v === 'name.asc' ? null : v })}>
                  <SelectTrigger className="min-h-11 w-full sm:w-60" aria-label={c.sort}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {c.sorts[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <CategoryChips data={d} q={q} />
              {q.missingPrice ? (
                <p className="qx-small flex flex-wrap items-center gap-2 text-fg-muted">
                  <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> {c.onlyMissing}
                  <Button variant="ghost" className="min-h-11" onClick={() => replaceQuery({ missing: null })}>
                    <X className="mr-1 h-4 w-4" aria-hidden /> {c.clearFilter}
                  </Button>
                </p>
              ) : null}
            </div>

            {d.items.length === 0 ? (
              filtersActive ? (
                <EmptyState
                  variant="filtered"
                  title={c.noMatch}
                  description={q.q ? c.noMatchQuery(q.q) : c.noMatchFilter}
                  action={
                    <Button variant="outline" className="min-h-11" onClick={() => replaceQuery({ q: null, category: null, missing: null })}>
                      {c.clearFilters}
                    </Button>
                  }
                />
              ) : q.status === 'archived' ? (
                <EmptyState title={c.archiveEmpty} description={c.archiveEmptyHint} />
              ) : (
                <EmptyState
                  variant="first-use"
                  title={c.setup}
                  description={c.setupHint}
                  action={
                    canWrite ? (
                      <Button className="min-h-11" onClick={d.categories.some((x) => x.isActive) ? openCreate : () => setCatsOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> {d.categories.some((x) => x.isActive) ? c.firstProduct : c.categoryFirst}
                      </Button>
                    ) : undefined
                  }
                  secondaryAction={
                    canWrite ? (
                      <Button variant="outline" className="min-h-11" onClick={() => setImportOpen(true)}>
                        <FileUp className="mr-1.5 h-4 w-4" aria-hidden /> {copy.common.importCsv}
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <>
                {canWrite ? (
                  <div className="flex items-center justify-between">
                    <p className="qx-caption text-fg-muted" aria-live="polite">
                      {query.isFetching && query.isPlaceholderData ? c.updating : c.products(d.total)}
                    </p>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => {
                        const editable = d.items.filter((p) => p.canEdit).map((p) => p.id);
                        const all = editable.every((id) => selected.has(id));
                        setSelected(all ? new Set() : new Set(editable));
                      }}
                    >
                      {d.items.filter((p) => p.canEdit).every((p) => selected.has(p.id)) && selected.size > 0 ? c.clearSelection : c.selectPage}
                    </Button>
                  </div>
                ) : null}
                <ul
                  className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${query.isPlaceholderData ? 'opacity-70 transition-opacity duration-base' : ''}`}
                  aria-busy={query.isFetching && query.isPlaceholderData}
                >
                  <AnimatePresence initial={false}>
                    {d.items.map((p) => (
                      <ProductCard key={p.id} product={p} selected={selected.has(p.id)} selectable={canWrite} reduced={reduced} actions={actions} />
                    ))}
                  </AnimatePresence>
                </ul>
                <Pagination data={d} q={q} />
              </>
            )}

            <DetailSheet
              paramKey={DETAIL_PARAM}
              size="lg"
              title={(id) => detailProduct?.name ?? (id === d.insights.topConsumed?.id ? d.insights.topConsumed.name : id === d.insights.lowestRated?.id ? d.insights.lowestRated.name : copy.common.product)}
              siblings={d.items.map((p) => p.id)}
              footer={(id) => {
                const p = d.items.find((x) => x.id === id);
                if (!p || !canWrite) return null;
                return (
                  <div className="flex flex-wrap justify-end gap-2">
                    {p.canEdit ? (
                      <>
                        {p.isActive ? (
                          <Button variant="outline" className="min-h-11" onClick={() => archive(p)}>
                            {copy.common.archive}
                          </Button>
                        ) : (
                          <Button variant="outline" className="min-h-11" onClick={() => actions.onRestore(p)}>
                            {copy.common.restore}
                          </Button>
                        )}
                        <Button className="min-h-11" onClick={() => setEditor({ open: true, product: p })}>
                          {copy.common.edit}
                        </Button>
                      </>
                    ) : p.isGlobal ? (
                      <Button className="min-h-11" onClick={() => void actions.onCopy(p)}>
                        {copy.common.copyMine}
                      </Button>
                    ) : null}
                  </div>
                );
              }}
            >
              {(id) => <ProductDetail productId={id} />}
            </DetailSheet>

            {canWrite ? (
              <>
                <ProductEditor
                  open={editor.open}
                  onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))}
                  product={editor.product}
                  categories={d.categories}
                  imageUploadEnabled={d.imageUploadEnabled}
                  defaultCategoryId={q.category}
                  onNeedCategory={() => {
                    setEditor({ open: false, product: null });
                    setCatsOpen(true);
                  }}
                />
                <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
                {selected.size > 0 ? (
                  <BulkBar ids={[...selected]} archivedView={q.status === 'archived'} categories={d.categories} onClear={() => setSelected(new Set())} />
                ) : (
                  <Button
                    onClick={openCreate}
                    className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 h-14 rounded-full px-5 shadow-lg md:hidden"
                    aria-label={c.addProduct}
                  >
                    <Plus className="mr-1.5 h-5 w-5" aria-hidden /> {c.fabShort}
                  </Button>
                )}
              </>
            ) : null}
            {canWrite ? <CategoryManager open={catsOpen} onOpenChange={setCatsOpen} categories={d.categories} /> : null}
          </div>
        )}
      </QueryState>
    </PanelPage>
  );
}
