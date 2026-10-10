'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Drama, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, PanelPage, SectionTabs, PanelErrorBoundary } from '@/components/ds/page';
import { DetailSheet } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import type { CollectionItem, CollectionOverview, CollectionSort } from '@/lib/badges/collection-logic';
import { CharacterShowcase } from '@/components/customer/character-card';
import { BADGES_QUERY_KEY, BadgesApiError, featureCharacter, fetchBadgesOverview, setBadgePinned } from './api';
import { BadgeGrid, isCollectionSort } from './badge-grid';
import { BadgeDetailBody, BadgeDetailFooter } from './badge-detail';
import { CollectionHero, SurprisePanel } from './collection-hero';
import { CommunityBoard } from './community-board';
import { useBadgesCopy } from './copy';
import { useShallowParams } from './use-shallow-params';

type Tab = 'badges' | 'characters' | 'community';
const TABS: readonly Tab[] = ['badges', 'characters', 'community'];

/**
 * `/customer/me/badges` istemci adası. Kritik veri sunucuda yüklenir (`initialData`);
 * sunucu yüklemesi başarısızsa ada kendisi dener ve hatayı `QueryState` ile gösterir
 * (rozetlerin "kayboldu" sanılmaz). URL durumu (`?tab`, `?sort`, `?cat`, `?badge`) sunucuya
 * gitmeden güncellenir; `?badge=<id>` derin linki detay çekmecesini açar.
 */
export function BadgesExperience({ initialData }: { initialData: CollectionOverview | null }) {
  const copy = useBadgesCopy();
  const qc = useQueryClient();
  const url = useShallowParams();

  const query = useQuery({
    queryKey: BADGES_QUERY_KEY,
    queryFn: ({ signal }) => fetchBadgesOverview(signal),
    initialData: initialData ?? undefined,
    staleTime: 60_000,
  });

  const rawTab = url.get('tab');
  const tab: Tab = rawTab && (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : 'badges';
  const rawSort = url.get('sort');
  const sort: CollectionSort = isCollectionSort(rawSort) ? rawSort : 'recent';
  const category = url.get('cat');
  const openId = url.get('badge');

  // Derin link (bildirim/e-posta → `?badge=`): ilk açılıştaki hedef bir kez vurgulanır.
  const [highlightId] = useState<string | null>(() => openId);
  const pushedRef = useRef(false);

  const openBadge = useCallback(
    (id: string) => {
      pushedRef.current = true;
      url.set({ badge: id }, 'push');
    },
    [url],
  );
  const closeBadge = useCallback(() => {
    if (pushedRef.current && typeof window !== 'undefined') {
      pushedRef.current = false;
      window.history.back();
    } else {
      url.set({ badge: null });
    }
  }, [url]);

  const [pinPendingId, setPinPendingId] = useState<string | null>(null);
  const pin = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => setBadgePinned(id, next),
    onMutate: async ({ id, next }) => {
      setPinPendingId(id);
      await qc.cancelQueries({ queryKey: BADGES_QUERY_KEY });
      const prev = qc.getQueryData<CollectionOverview>(BADGES_QUERY_KEY);
      if (prev) {
        const delta = next ? 1 : -1;
        qc.setQueryData<CollectionOverview>(BADGES_QUERY_KEY, {
          ...prev,
          items: prev.items.map((i) => (i.id === id ? { ...i, isPinned: next } : i)),
          stats: { ...prev.stats, pinnedBadges: prev.stats.pinnedBadges + delta, pinnedTotal: prev.stats.pinnedTotal + delta },
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(BADGES_QUERY_KEY, ctx.prev);
      toast.error(err instanceof BadgesApiError && err.status !== 500 ? err.message : copy.pinFailed);
    },
    onSuccess: (res) => {
      qc.setQueryData<CollectionOverview>(BADGES_QUERY_KEY, (cur) =>
        cur
          ? {
              ...cur,
              items: cur.items.map((i) => (i.id === res.badgeId ? { ...i, isPinned: res.isPinned } : i)),
              stats: { ...cur.stats, pinnedBadges: res.pinnedBadges, pinnedTotal: res.pinnedTotal, pinLimit: res.pinLimit },
            }
          : cur,
      );
      toast.success(res.isPinned ? copy.pinOn : copy.pinOff);
    },
    onSettled: () => setPinPendingId(null),
  });

  const feature = useMutation({
    mutationFn: (id: string) => featureCharacter(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: BADGES_QUERY_KEY });
      const prev = qc.getQueryData<CollectionOverview>(BADGES_QUERY_KEY);
      if (prev) qc.setQueryData<CollectionOverview>(BADGES_QUERY_KEY, { ...prev, character: { ...prev.character, featuredBadgeId: id } });
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      // Eski davranış: sessiz geri alma. Şimdi kullanıcı NEDEN değişmediğini görür.
      if (ctx?.prev) qc.setQueryData(BADGES_QUERY_KEY, ctx.prev);
      toast.error(copy.featureFailed);
    },
    onSuccess: (_res, id) => {
      const name = qc.getQueryData<CollectionOverview>(BADGES_QUERY_KEY)?.items.find((i) => i.id === id)?.name;
      if (name) toast.success(copy.featureOk(name));
    },
  });

  const onRevealed = useCallback(() => {
    void qc.invalidateQueries({ queryKey: BADGES_QUERY_KEY });
  }, [qc]);

  return (
    <PanelPage register="play" header={<PageHeader title={copy.pageTitle} description={copy.pageDescription} />}>
      <QueryState<CollectionOverview>
        query={query}
        isEmpty={() => false}
        skeleton={<BadgesSkeleton />}
        error={{ title: copy.loadError, description: copy.loadErrorBody }}
      >
        {(data) => (
          <Content
            data={data}
            tab={tab}
            sort={sort}
            category={category}
            openId={openId}
            highlightId={highlightId}
            onTab={(t) => url.set({ tab: t === 'badges' ? null : t })}
            onSort={(s) => url.set({ sort: s === 'recent' ? null : s })}
            onCategory={(c) => url.set({ cat: c })}
            onOpen={openBadge}
            onClose={closeBadge}
            onRevealed={onRevealed}
            pinPendingId={pinPendingId}
            featurePending={feature.isPending}
            onTogglePin={(id, next) => pin.mutate({ id, next })}
            onFeature={(id) => feature.mutate(id)}
          />
        )}
      </QueryState>
    </PanelPage>
  );
}

function Content({
  data,
  tab,
  sort,
  category,
  openId,
  highlightId,
  onTab,
  onSort,
  onCategory,
  onOpen,
  onClose,
  onRevealed,
  pinPendingId,
  featurePending,
  onTogglePin,
  onFeature,
}: {
  data: CollectionOverview;
  tab: Tab;
  sort: CollectionSort;
  category: string | null;
  openId: string | null;
  highlightId: string | null;
  onTab: (t: Tab) => void;
  onSort: (s: CollectionSort) => void;
  onCategory: (c: string | null) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRevealed: () => void;
  pinPendingId: string | null;
  featurePending: boolean;
  onTogglePin: (id: string, next: boolean) => void;
  onFeature: (id: string) => void;
}) {
  const copy = useBadgesCopy();
  const { badges, characters, byId } = useMemo(() => {
    const b: CollectionItem[] = [];
    const c: CollectionItem[] = [];
    const m = new Map<string, CollectionItem>();
    for (const it of data.items) {
      (it.kind === 'character' ? c : b).push(it);
      m.set(it.id, it);
    }
    return { badges: b, characters: c, byId: m };
  }, [data.items]);

  const featured = data.character.featuredBadgeId ? byId.get(data.character.featuredBadgeId) ?? null : null;
  const openItem = openId ? byId.get(openId) ?? null : null;

  return (
    <>
      <CollectionHero data={data} featured={featured} onOpen={onOpen} />
      <PanelErrorBoundary>
        <SurprisePanel data={data} onRevealed={onRevealed} />
      </PanelErrorBoundary>

      <SectionTabs
        variant="pill"
        ariaLabel={copy.tabsLabel}
        value={tab}
        onValueChange={(v) => onTab(v as Tab)}
        tabs={[
          { value: 'badges', label: copy.tabs.badges, icon: <Award />, count: data.stats.badges },
          { value: 'characters', label: copy.tabs.characters, icon: <Drama />, count: data.stats.characters },
          { value: 'community', label: copy.tabs.community, icon: <Users /> },
        ]}
      >
        {(active) => (
          <PanelErrorBoundary resetKeys={[active]}>
            {active === 'badges' ? (
              <BadgeGrid
                items={badges}
                moreToDiscover={data.moreToDiscover}
                sort={sort}
                onSortChange={onSort}
                category={category}
                onCategoryChange={onCategory}
                onOpen={onOpen}
                highlightId={highlightId}
              />
            ) : active === 'characters' ? (
              <CharacterShowcase
                items={characters}
                categoryStats={data.character.categoryStats}
                featuredBadgeId={data.character.featuredBadgeId}
                onOpen={onOpen}
              />
            ) : (
              <CommunityBoard />
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>

      <DetailSheet
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        id={openId}
        size="md"
        title={openItem?.name ?? copy.pageTitle}
        footer={
          openItem ? (
            <BadgeDetailFooter
              item={openItem}
              stats={data.stats}
              featuredBadgeId={data.character.featuredBadgeId}
              pinPending={pinPendingId === openItem.id}
              featurePending={featurePending}
              onTogglePin={onTogglePin}
              onFeature={onFeature}
            />
          ) : null
        }
      >
        <BadgeDetailBody item={openItem} />
      </DetailSheet>
    </>
  );
}

/** Statik iskelet (shimmer yok) — gerçek yerleşimle aynı ritim; tek yerde. */
export function BadgesSkeleton() {
  return (
    <div className="flex flex-col gap-section" aria-hidden>
      <div className="h-40 rounded-card bg-surface-muted" />
      <div className="h-28 rounded-card bg-surface-muted" />
      <div className="h-11 w-72 max-w-full rounded-control bg-surface-muted" />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[9.5rem] rounded-card bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}
