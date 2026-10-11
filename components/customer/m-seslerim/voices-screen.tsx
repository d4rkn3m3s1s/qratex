'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Gift, MessageSquare, QrCode, Search, X } from 'lucide-react';
import { ChoiceChips } from '@/components/ds/a11y';
import { DetailSheet } from '@/components/ds/data';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { EmptyState, ErrorState, QueryState, SkeletonDetail, SkeletonList } from '@/components/states';
import { Button } from '@/components/ui/button';
import type {
  CustomerRemedyListItem,
  VoiceListItem,
  VoiceListPage,
  VoiceSummary,
} from '@/lib/customer-voices/types';
import { BusinessAvatar } from './business-avatar';
import { useVoicesCopy, useVoicesLocale } from './copy';
import {
  fetchListPage,
  fetchRemedies,
  fetchSummary,
  formatDate,
  useDebounced,
  useLastSeen,
  useShallowParams,
  voicesKeys,
  type VoiceFilters,
} from './lib';
import { VoiceActionBand } from './voice-action-band';
import { VoiceList } from './voice-list';
import { VoiceSummaryCard } from './voice-summary-card';

// Çekmece gövdeleri ağır (yazma formu, telafi seçimi, zaman çizelgesi) → yalnız açılınca yüklenir.
const VoiceDetailBody = dynamic(() => import('./voice-detail').then((m) => m.VoiceDetailBody), {
  ssr: false,
  loading: () => <SkeletonDetail />,
});
const OfferDetailBody = dynamic(() => import('./offer-detail').then((m) => m.OfferDetailBody), {
  ssr: false,
  loading: () => <SkeletonDetail />,
});

const TYPES = ['all', 'qr', 'review'] as const;
const STATUSES = ['all', 'replied', 'awaiting', 'remedy', 'low'] as const;

export type VoicesInitial = {
  filters: VoiceFilters;
  summary: VoiceSummary | null;
  list: VoiceListPage | null;
  remedies: { offers: CustomerRemedyListItem[]; hasMore: boolean } | null;
};

function sameFilters(a: VoiceFilters, b: VoiceFilters) {
  return a.type === b.type && a.status === b.status && a.q === b.q;
}

function RemedySection({
  offers,
  hasMore,
  onOpen,
}: {
  offers: CustomerRemedyListItem[];
  hasMore: boolean;
  onOpen: (id: string) => void;
}) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const settled = offers.filter((o) => o.status !== 'pending');
  if (settled.length === 0) return null;
  return (
    <section aria-labelledby="voices-remedies" className="space-y-3">
      <div>
        <h2 id="voices-remedies" className="qx-h3 flex items-center gap-2 text-fg">
          <Gift aria-hidden className="h-4 w-4 text-brand" />
          {copy.remedySection}
        </h2>
        <p className="qx-small text-fg-muted">{copy.remedySectionHint}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {settled.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onOpen(o.id)}
              className="flex min-h-11 w-full items-center gap-3 rounded-card border border-subtle bg-surface-1 p-3 text-left qx-elevation-1 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BusinessAvatar business={o.business} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="qx-small block truncate font-medium text-fg">
                  {o.status === 'accepted' ? o.selectionLabel ?? copy.remedyAccepted : copy.remedyExpired}
                </span>
                <span className="qx-caption block truncate text-fg-muted">
                  {o.business.name}
                  {o.acceptedAt ? ` · ${formatDate(o.acceptedAt, locale)}` : ''}
                </span>
              </span>
              {o.status === 'accepted' && o.selectionType === 'points' && o.creditedPoints != null ? (
                <span className="qx-caption qx-num shrink-0 rounded-full bg-brand-subtle px-2 py-0.5 font-medium text-brand">
                  +{o.creditedPoints}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {hasMore ? <p className="qx-caption text-fg-muted">{copy.remedyMore}</p> : null}
    </section>
  );
}

/**
 * Seslerim istemci adası. Kritik veri sunucuda çekilip `initialData` olarak gelir; filtre ve
 * çekmece durumu URL'de (sığ yazım: sunucu bileşeni her değişimde yeniden çalışmaz).
 */
export function VoicesScreen({ initial }: { initial: VoicesInitial }) {
  const copy = useVoicesCopy();
  const { params, set } = useShallowParams();
  const lastSeen = useLastSeen();

  const filters: VoiceFilters = useMemo(() => {
    const t = params.get('type');
    const s = params.get('status');
    return {
      type: (TYPES as readonly string[]).includes(t ?? '') ? (t as string) : 'all',
      status: (STATUSES as readonly string[]).includes(s ?? '') ? (s as string) : 'all',
      q: (params.get('q') ?? '').trim().slice(0, 100),
    };
  }, [params]);
  const openKey = params.get('id');
  const openOffer = params.get('offer');

  // Arama kutusu: yerel durum → gecikmeli URL.
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search.trim());
  useEffect(() => {
    if (debounced !== filters.q) set({ q: debounced || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız gecikmeli değer değişince
  }, [debounced]);

  const summaryQ = useQuery({
    queryKey: voicesKeys.summary(),
    queryFn: ({ signal }) => fetchSummary(signal),
    initialData: initial.summary ?? undefined,
    staleTime: 30_000,
  });
  const remediesQ = useQuery({
    queryKey: voicesKeys.remedies(),
    queryFn: ({ signal }) => fetchRemedies(signal),
    initialData: initial.remedies ?? undefined,
    staleTime: 30_000,
  });
  const listQ = useInfiniteQuery({
    queryKey: voicesKeys.list(filters),
    queryFn: ({ pageParam, signal }) => fetchListPage(filters, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData:
      initial.list && sameFilters(filters, initial.filters) ? { pages: [initial.list], pageParams: [null] } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const items: VoiceListItem[] = useMemo(() => listQ.data?.pages.flatMap((p) => p.items) ?? [], [listQ.data]);
  const pendingOffers = useMemo(() => (remediesQ.data?.offers ?? []).filter((o) => o.status === 'pending'), [remediesQ.data]);

  const openVoice = useCallback((key: string) => set({ id: key, offer: null }), [set]);
  const openOfferSheet = useCallback((id: string) => set({ offer: id, id: null }), [set]);
  const filtered = filters.type !== 'all' || filters.status !== 'all' || !!filters.q;
  const clearFilters = () => {
    setSearch('');
    set({ type: null, status: null, q: null });
  };

  // Çekmece başlığı türü söyler; işletme adı/avatarı çekmecenin içindeki başlıkta.
  const titleFor = (key: string) => (key.startsWith('fb-') ? copy.typeQr : key.startsWith('cs-') ? copy.typeReview : copy.detailTitleFallback);
  const loadMore = useCallback(() => {
    if (listQ.hasNextPage && !listQ.isFetchingNextPage) void listQ.fetchNextPage();
  }, [listQ]);

  return (
    <PanelPage
      register="ops"
      width="narrow"
      header={<PageHeader title={copy.title} description={copy.description} eyebrow={copy.eyebrow} icon={<MessageSquare />} />}
    >
      {/* "Sesin" özeti */}
      {summaryQ.data ? (
        summaryQ.data.totals.voices > 0 ? <VoiceSummaryCard summary={summaryQ.data} /> : null
      ) : summaryQ.isError ? (
        <ErrorState variant="section" title={copy.errorTitle} description={(summaryQ.error as Error).message} onRetry={() => summaryQ.refetch()} headingLevel="h2" />
      ) : (
        <SkeletonList rows={2} />
      )}

      {/* Bekleyen aksiyonlar — özet düşse de bekleyen telafiler görünür (birincil aksiyon). */}
      {summaryQ.data || pendingOffers.length > 0 ? (
        <VoiceActionBand summary={summaryQ.data ?? null} pendingOffers={pendingOffers} onOpenOffer={openOfferSheet} onOpenVoice={openVoice} />
      ) : null}

      {/* Zaman çizelgesi */}
      <section aria-labelledby="voices-timeline" className="space-y-3">
        <h2 id="voices-timeline" className="qx-h3 text-fg">{copy.listTitle}</h2>
        <div className="space-y-2.5">
          <div className="relative">
            <label htmlFor="voices-search" className="sr-only">{copy.searchLabel}</label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input
              id="voices-search"
              type="search"
              inputMode="search"
              value={search}
              onChange={(e) => setSearch(e.target.value.slice(0, 100))}
              placeholder={copy.searchPlaceholder}
              className="qx-body h-11 w-full rounded-control border border-subtle bg-surface-1 pl-9 pr-11 text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={copy.clearSearch}
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-control text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <ChoiceChips
            aria-label={copy.typeLabel}
            size="sm"
            scroll
            options={[
              { value: 'all', label: copy.typeAll },
              { value: 'qr', label: copy.typeQr },
              { value: 'review', label: copy.typeReview },
            ]}
            value={filters.type}
            onChange={(v) => set({ type: v && v !== 'all' ? v : null })}
          />
          <ChoiceChips
            aria-label={copy.statusLabel}
            size="sm"
            scroll
            options={[
              { value: 'all', label: copy.statusAll },
              { value: 'replied', label: copy.statusReplied },
              { value: 'awaiting', label: copy.statusAwaiting },
              { value: 'remedy', label: copy.statusRemedy },
              { value: 'low', label: copy.statusLow },
            ]}
            value={filters.status}
            onChange={(v) => set({ status: v && v !== 'all' ? v : null })}
          />
          <p className="qx-caption text-fg-muted" aria-live="polite">
            {listQ.data ? copy.resultSummary(items.length, !!listQ.hasNextPage) : ''}
          </p>
        </div>

        <QueryState
          query={{ ...listQ, data: listQ.data ? items : undefined }}
          skeleton="cards"
          loadingLabel={copy.loading}
          error={{ title: copy.errorTitle }}
          isEmpty={(rows) => rows.length === 0}
          empty={
            filtered ? (
              <EmptyState
                variant="no-results"
                title={copy.noResultsTitle}
                description={copy.noResultsBody}
                action={<Button variant="outline" onClick={clearFilters}>{copy.clearFilters}</Button>}
              />
            ) : (
              <EmptyState
                variant="first-use"
                icon={MessageSquare}
                title={copy.emptyTitle}
                description={copy.emptyBody}
                action={
                  <Button asChild>
                    <Link href="/customer/scan">
                      <QrCode aria-hidden className="h-4 w-4" />
                      {copy.emptyScan}
                    </Link>
                  </Button>
                }
              />
            )
          }
        >
          {(rows) => (
            <VoiceList
              items={rows}
              hasMore={!!listQ.hasNextPage}
              loadingMore={listQ.isFetchingNextPage}
              onLoadMore={loadMore}
              onOpen={openVoice}
              activeKey={openKey}
              lastSeen={lastSeen}
            />
          )}
        </QueryState>
      </section>

      {/* Telafilerim (kabul edilmiş / süresi dolmuş) */}
      {remediesQ.data ? (
        <RemedySection offers={remediesQ.data.offers} hasMore={remediesQ.data.hasMore} onOpen={openOfferSheet} />
      ) : remediesQ.isError ? (
        <ErrorState variant="section" title={copy.remedyLoadError} onRetry={() => remediesQ.refetch()} headingLevel="h2" />
      ) : null}

      <DetailSheet
        open={!!openKey}
        id={openKey}
        onOpenChange={(o) => {
          if (!o) set({ id: null });
        }}
        size="lg"
        title={(key) => titleFor(key)}
      >
        {(key) => <VoiceDetailBody voiceKey={key} />}
      </DetailSheet>

      <DetailSheet
        open={!!openOffer}
        id={openOffer}
        onOpenChange={(o) => {
          if (!o) set({ offer: null });
        }}
        size="md"
        title={copy.remedyTitle}
      >
        {(id) => <OfferDetailBody offerId={id} onOpenVoice={openVoice} />}
      </DetailSheet>
    </PanelPage>
  );
}
