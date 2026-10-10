'use client';

/**
 * Gelen Kutusu istemci adası (Medallia kapalı döngü): özet → araç çubuğu → liste → detay
 * çekmecesi (`?id=`). Kritik veri sunucuda çekilip `initial` olarak gelir (ilk boyamada istek
 * yok); filtre/çekmece durumu URL'de sığ yazılır (sunucu bileşeni her değişimde çalışmaz).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Eye, Loader2, QrCode, RotateCcw, ScanLine, UserCheck, X } from 'lucide-react';
import { DetailSheet, SelectionCheckbox } from '@/components/ds/data';
import { parseDateRange, serializeDateRange, toPeriod, type DateRangeValue } from '@/components/ds/page';
import { EmptyState, ErrorState, QueryState, SkeletonDetail, SkeletonList } from '@/components/states';
import { Button } from '@/components/ui/button';
import { DEFAULT_INBOX_FILTERS, normalizeInboxFilters } from '@/lib/dealer-inbox/core';
import type { InboxFilters, InboxListPage, InboxMeta, InboxSummary } from '@/lib/dealer-inbox/types';
import {
  fetchDetail,
  fetchListPage,
  fetchMeta,
  fetchSummary,
  inboxKeys,
  postAction,
  shouldRetry,
  useShallowParams,
} from './api';
import { useInboxCopy } from './copy';
import { InboxList } from './inbox-list';
import { KpiStrip } from './kpi-strip';
import { NativeSelect } from './parts';
import { countActive, InboxToolbar } from './toolbar';
import { SemanticSearch } from './semantic-search';

// Çekmece gövdesi ağır (editör, AI, telafi, geçmiş) → yalnız açılınca yüklenir.
const InboxDetailBody = dynamic(() => import('./detail-body').then((m) => m.InboxDetailBody), {
  ssr: false,
  loading: () => <SkeletonDetail />,
});

export const KPI_PERIOD_KEYS = { period: 'kpi', from: 'kpiFrom', to: 'kpiTo', compare: 'kpiCmp' } as const;

export type InboxInitial = {
  filters: InboxFilters;
  period: { from: string; to: string };
  list: InboxListPage | null;
  summary: InboxSummary | null;
  meta: InboxMeta | null;
  /** ADMIN görünümü (salt okunur). */
  readOnly: boolean;
};

function sameFilters(a: InboxFilters, b: InboxFilters): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function InboxScreen({ initial }: { initial: InboxInitial }) {
  const copy = useInboxCopy();
  const qc = useQueryClient();
  const { params, set } = useShallowParams();

  const filters = useMemo(() => normalizeInboxFilters(params), [params]);
  const openKey = params.get('id');
  const periodValue: DateRangeValue = useMemo(() => parseDateRange(params, { keys: KPI_PERIOD_KEYS, defaultPreset: 'last30' }), [params]);
  const period = useMemo(() => toPeriod(periodValue).range, [periodValue]);

  const meta = useQuery({
    queryKey: inboxKeys.meta,
    queryFn: ({ signal }) => fetchMeta(signal),
    initialData: initial.meta ?? undefined,
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  });

  const summary = useQuery({
    queryKey: inboxKeys.summary(period.from, period.to),
    queryFn: ({ signal }) => fetchSummary(period.from, period.to, signal),
    initialData: initial.summary && initial.period.from === period.from && initial.period.to === period.to ? initial.summary : undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: shouldRetry,
  });

  const list = useInfiniteQuery({
    queryKey: inboxKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchListPage(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData:
      initial.list && sameFilters(initial.filters, filters) ? { pages: [initial.list], pageParams: [null] } : undefined,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: shouldRetry,
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const keys = useMemo(() => items.map((i) => i.key), [items]);

  /* ───── Seçim ───── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtersSig = JSON.stringify(filters);
  useEffect(() => setSelected(new Set()), [filtersSig]);
  const toggle = useCallback((key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const visibleSelected = keys.filter((k) => selected.has(k));
  const allChecked = keys.length > 0 && visibleSelected.length === keys.length;

  /* ───── URL yazımı ───── */
  const change = useCallback(
    (patch: Partial<Record<keyof InboxFilters, string | null>>) => {
      const out: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(patch)) {
        const def = (DEFAULT_INBOX_FILTERS as unknown as Record<string, unknown>)[k];
        out[k] = v == null || v === def ? null : v;
      }
      // Varsayılan durum "Yeni" URL'ye yazılmaz; "Tümü" yazılır.
      set(out);
    },
    [set]
  );
  const clear = useCallback(
    () => set({ source: null, rating: null, sentiment: null, signal: null, assigned: null, range: null, qr: null, q: null, sort: null }),
    [set]
  );
  const open = useCallback((key: string) => set({ id: key }), [set]);
  const close = useCallback(() => set({ id: null }), [set]);

  /* ───── Klavye: J/K gezin · Enter aç · X seç ───── */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focusRef = useRef(focusKey);
  focusRef.current = focusKey;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (openKey || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (!['j', 'k', 'x', 'enter'].includes(k) || keys.length === 0) return;
      const i = focusRef.current ? keys.indexOf(focusRef.current) : -1;
      if (k === 'j' || k === 'k') {
        e.preventDefault();
        const next = keys[Math.min(keys.length - 1, Math.max(0, i + (k === 'j' ? 1 : -1)))] ?? keys[0];
        setFocusKey(next);
        document.querySelector<HTMLElement>(`[data-inbox-row="${next}"] button`)?.focus();
      } else if (k === 'x' && i >= 0 && !initial.readOnly) {
        e.preventDefault();
        toggle(keys[i], !selected.has(keys[i]));
      } else if (k === 'enter' && i >= 0 && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
        open(keys[i]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, openKey, open, toggle, selected, initial.readOnly]);

  /* ───── Sonsuz kaydırma ───── */
  const sentinel = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* ───── Toplu işlem ───── */
  const [bulkAssignee, setBulkAssignee] = useState('');
  const bulk = useMutation({
    mutationFn: (v: { action: 'resolve' | 'reopen' | 'viewed' | 'assign'; assigneeId?: string }) =>
      postAction(visibleSelected, v.action, v.assigneeId),
    onSuccess: (res) => {
      (res.failCount ? toast.warning : toast.success)(copy.bulkDone(res.okCount, res.failCount));
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['dealer-inbox'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : copy.actionFailed),
  });

  const activeFilters = countActive(filters);
  // Durum sayaçları tüm zamanlar içindir; filtre açıkken yanıltmasın diye gizlenir.
  const counts = activeFilters === 0 ? summary.data?.statusCounts ?? null : null;
  const readOnly = initial.readOnly;

  const empty =
    activeFilters > 0 ? (
      <EmptyState
        variant="filtered"
        title={copy.emptyFilteredTitle}
        description={copy.emptyFilteredBody}
        action={
          <Button type="button" variant="outline" onClick={clear}>
            {copy.clearFilters}
          </Button>
        }
      />
    ) : filters.status === 'new' ? (
      <EmptyState
        icon={CheckCircle2}
        title={copy.emptyNewTitle}
        description={copy.emptyNewBody}
        action={
          <Button type="button" variant="outline" onClick={() => change({ status: 'all' })}>
            {copy.showAll}
          </Button>
        }
      />
    ) : (
      <EmptyState
        variant="first-use"
        title={copy.emptyAllTitle}
        description={copy.emptyAllBody}
        action={
          <Button asChild variant="outline">
            <Link href="/dealer/qr-codes">
              <QrCode aria-hidden className="mr-2 h-4 w-4" />
              {copy.goQr}
            </Link>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="ghost">
            <Link href="/dealer/scan">
              <ScanLine aria-hidden className="mr-2 h-4 w-4" />
              {copy.goScan}
            </Link>
          </Button>
        }
      />
    );

  // Çekmece başlığı: listede yoksa (derin link) detay sorgusundan — gövdeyle aynı anahtar, tek istek.
  const listItem = items.find((i) => i.key === openKey);
  const openDetail = useQuery({
    queryKey: inboxKeys.detail(openKey ?? ''),
    queryFn: ({ signal }) => fetchDetail(openKey ?? '', signal),
    enabled: !!openKey && !listItem,
    staleTime: 15_000,
    retry: shouldRetry,
  });
  const openItem = listItem ?? (openKey ? openDetail.data : undefined);

  return (
    <div className="space-y-4">
      <KpiStrip
        query={summary}
        period={periodValue}
        onPeriodChange={(v) => set(serializeDateRange(v, { keys: KPI_PERIOD_KEYS, defaultPreset: 'last30' }))}
        activeRating={filters.rating}
        onRating={(r) => change({ rating: r })}
        pendingHref="/dealer/inbox?sort=oldest"
      />

      <section aria-labelledby="inbox-list-title" className="space-y-3">
        <h2 id="inbox-list-title" className="sr-only">
          {copy.listLabel}
        </h2>
        <InboxToolbar filters={filters} counts={counts} meta={meta.data ?? null} onChange={change} onClear={clear} />
        {filters.q.length >= 2 && meta.data?.aiEnabled && filters.source !== 'consumption' ? (
          <SemanticSearch key={filters.q} query={filters.q} onOpen={open} />
        ) : null}

        {!readOnly && keys.length > 0 ? (
          <div className="flex min-h-11 flex-wrap items-center gap-3 px-1">
            <label className="qx-small inline-flex items-center gap-3 text-fg-muted">
              <SelectionCheckbox
                checked={allChecked ? true : visibleSelected.length > 0 ? 'indeterminate' : false}
                onCheckedChange={(c) => setSelected(c ? new Set(keys) : new Set())}
                aria-label={copy.selectAll}
              />
              <span aria-live="polite">{visibleSelected.length > 0 ? copy.selected(visibleSelected.length) : copy.resultCount(items.length, !!list.hasNextPage)}</span>
            </label>
            <span className="qx-caption ml-auto hidden text-fg-subtle lg:inline">{copy.shortcuts}</span>
          </div>
        ) : null}

        <QueryState
          query={{ ...list, data: list.data ? items : undefined }}
          skeleton={<SkeletonList rows={6} />}
          empty={empty}
          showRefreshing
        >
          {() => (
            <>
              <InboxList
                items={items}
                selected={selected}
                activeKey={openKey}
                focusKey={focusKey}
                selectable={!readOnly}
                onToggle={toggle}
                onOpen={open}
                onFocusRow={setFocusKey}
              />
              <div ref={sentinel} className="flex flex-col items-center gap-2 py-3">
                {list.isFetchNextPageError ? (
                  <ErrorState variant="section" onRetry={() => void list.fetchNextPage()} />
                ) : list.hasNextPage ? (
                  <Button type="button" variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="min-h-11 gap-2">
                    {list.isFetchingNextPage ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                    {list.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
                  </Button>
                ) : (
                  <p className="qx-caption text-fg-subtle">{copy.endOfList}</p>
                )}
              </div>
            </>
          )}
        </QueryState>
      </section>

      {!readOnly && visibleSelected.length > 0 ? (
        <div
          role="region"
          aria-label={copy.selected(visibleSelected.length)}
          className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-sticky flex flex-wrap items-end gap-2 rounded-card border border-subtle bg-surface-2 p-3 qx-elevation-2"
        >
          <p className="qx-small mr-auto self-center font-semibold text-fg">{copy.selected(visibleSelected.length)}</p>
          <Button type="button" variant="outline" className="min-h-11 gap-2 sm:h-10 sm:min-h-10" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: 'viewed' })}>
            <Eye aria-hidden className="h-4 w-4" />
            {copy.bulkViewed}
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-2 sm:h-10 sm:min-h-10" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: 'resolve' })}>
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            {copy.bulkResolve}
          </Button>
          {filters.status === 'resolved' || filters.status === 'all' ? (
            <Button type="button" variant="outline" className="min-h-11 gap-2 sm:h-10 sm:min-h-10" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: 'reopen' })}>
              <RotateCcw aria-hidden className="h-4 w-4" />
              {copy.bulkReopen}
            </Button>
          ) : null}
          <div className="flex items-end gap-2">
            <NativeSelect label={copy.bulkAssignTo} value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} className="min-w-[10rem]">
              <option value="">—</option>
              {(meta.data?.assignees ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2 sm:h-10 sm:min-h-10"
              disabled={bulk.isPending || !bulkAssignee}
              onClick={() => bulk.mutate({ action: 'assign', assigneeId: bulkAssignee })}
            >
              <UserCheck aria-hidden className="h-4 w-4" />
              {copy.bulkAssign}
            </Button>
          </div>
          <Button type="button" variant="ghost" className="min-h-11 gap-1.5 sm:h-10 sm:min-h-10" onClick={() => setSelected(new Set())}>
            <X aria-hidden className="h-4 w-4" />
            {copy.bulkClear}
          </Button>
        </div>
      ) : null}

      <DetailSheet
        open={!!openKey}
        id={openKey}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        onNavigate={open}
        siblings={keys}
        size="lg"
        title={() =>
          openItem ? (openItem.anonymous ? copy.anonymous : openItem.customerName ?? copy.unnamed) : copy.detailTitle
        }
        description={() =>
          openItem ? `${openItem.source === 'qr' ? copy.sourceQr : copy.sourceConsumption}${openItem.contextLabel ? ` · ${openItem.contextLabel}` : ''}` : null
        }
      >
        {(key) => <InboxDetailBody itemKey={key} meta={meta.data ?? null} readOnly={readOnly} onOpenKey={open} />}
      </DetailSheet>
    </div>
  );
}
