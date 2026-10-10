'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LocateFixed, Trophy } from 'lucide-react';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { EmptyState, QueryState, SkeletonBlock, SkeletonList } from '@/components/states';
import { Button } from '@/components/ui/button';
import { isReducedMotion } from '@/lib/motion';
import type { LeagueCategory, LeaguePeriod } from '@/lib/league-board/periods';
import type { LeagueBoardDTO } from '@/lib/league-board/types';
import { boardQueryKey, boardSearch, fetchBoard, type BoardFetchError, type BoardParams } from './fetch-board';
import { LeagueFilters } from './league-filters';
import { LeagueHero } from './league-hero';
import { LeagueList } from './league-list';
import { LeaguePodium } from './league-podium';
import { LeaguePrivacy } from './league-privacy';
import { useLigCopy } from './use-lig-copy';

const LAST_RANK_PREFIX = 'qx-lig-last:';

function readLastRank(key: string): number | null {
  try {
    const v = window.localStorage.getItem(LAST_RANK_PREFIX + key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeLastRank(key: string, rank: number): void {
  try {
    window.localStorage.setItem(LAST_RANK_PREFIX + key, String(rank));
  } catch {
    /* gizli pencere / engelli depolama: yalnız "son ziyaretten beri" göstergesi çıkmaz */
  }
}

/**
 * Oyna → Lig istemci adası. İlk veri sunucudan gelir (`initial`); dönem/tür/sayfa değişimi
 * `/api/customer/league` ile TanStack Query üzerinden (iptal, önceki veriyi koruma, hata görünür,
 * görünürken 2 dk'da bir yenileme). Seçim URL'de (`?period=&cat=&page=`) tutulur.
 */
export function LeagueBoard({ initial, initialParams }: { initial: LeagueBoardDTO | null; initialParams: BoardParams }) {
  const { copy, fmt } = useLigCopy();
  const [params, setParams] = useState<BoardParams>(initialParams);
  const firstRender = useRef(true);

  const isInitialParams =
    params.category === initialParams.category && params.period === initialParams.period && params.page === initialParams.page;

  const query = useQuery<LeagueBoardDTO, BoardFetchError>({
    queryKey: boardQueryKey(params),
    queryFn: ({ signal }) => fetchBoard(params, signal),
    initialData: isInitialParams && initial ? initial : undefined,
    initialDataUpdatedAt: isInitialParams && initial ? Date.parse(initial.generatedAt) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (count, err) => count < 2 && (err?.status ?? 500) >= 500,
  });
  const board = query.data;

  // URL senkronu (yalnız istemci geçmişi: sunucu bileşeni yeniden çalışmaz).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const qs = boardSearch(params);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
  }, [params]);

  // Sunucu sayfayı sıkıştırdıysa (aralık dışı ?page=) durumu hizala.
  useEffect(() => {
    if (board && !query.isPlaceholderData && board.page !== params.page && board.category === params.category && board.period === params.period) {
      setParams((p) => ({ ...p, page: board.page }));
    }
  }, [board, query.isPlaceholderData, params.category, params.period, params.page]);

  // "Son ziyaretinden beri" — kişiye özel kolaylık (yalnız bu tarayıcı); dönem anahtarı başına bir kez.
  const [rankDelta, setRankDelta] = useState<number | null>(null);
  const seenKeys = useRef(new Set<string>());
  useEffect(() => {
    if (!board || query.isPlaceholderData) return;
    const key = `${board.category}:${board.window.key}`;
    const rank = board.me.rank;
    if (!seenKeys.current.has(key)) {
      seenKeys.current.add(key);
      const prev = readLastRank(key);
      setRankDelta(prev && rank ? prev - rank : null);
    }
    if (rank) writeLastRank(key, rank);
  }, [board, query.isPlaceholderData]);

  // Kendi satırına git: başka sayfadaysa o sayfayı aç, gelince kaydır + odakla.
  const meRef = useRef<HTMLLIElement | null>(null);
  const pendingScroll = useRef(false);
  const scrollToMe = useCallback(() => {
    const el = meRef.current ?? document.getElementById('lig-me');
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: isReducedMotion() ? 'auto' : 'smooth' });
    (el as HTMLElement).focus({ preventScroll: true });
    return true;
  }, []);
  const goToMe = useCallback(() => {
    const target = board?.me.page;
    if (!target) return;
    if (target !== params.page) {
      pendingScroll.current = true;
      setParams((p) => ({ ...p, page: target }));
    } else {
      scrollToMe();
    }
  }, [board?.me.page, params.page, scrollToMe]);
  useEffect(() => {
    if (pendingScroll.current && board && !query.isPlaceholderData && board.page === board.me.page) {
      pendingScroll.current = false;
      requestAnimationFrame(() => scrollToMe());
    }
  }, [board, query.isPlaceholderData, scrollToMe]);

  // Yapışkan "sen" çubuğu: kahraman ve kendi satırın ekranda değilken.
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const [meVisible, setMeVisible] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === heroRef.current) setHeroVisible(e.isIntersecting);
          else setMeVisible(e.isIntersecting);
        }
      },
      { threshold: 0.1 }
    );
    if (heroRef.current) io.observe(heroRef.current);
    const meEl = meRef.current;
    if (meEl) io.observe(meEl);
    else setMeVisible(false);
    return () => io.disconnect();
  }, [board?.page, board?.category, board?.period, board?.me.rank]);

  // İlk (sunucu) render'da giriş animasyonu yok: içerik hidrasyondan önce de görünür.
  const [interacted, setInteracted] = useState(false);
  const onPeriod = (period: LeaguePeriod) => {
    setInteracted(true);
    setParams((p) => ({ ...p, period, page: 1 }));
  };
  const onCategory = (category: LeagueCategory) => {
    setInteracted(true);
    setParams((p) => ({ ...p, category, page: 1 }));
  };
  const onPage = (page: number) => {
    setInteracted(true);
    setParams((p) => ({ ...p, page }));
    document.getElementById('lig-ranking-title')?.scrollIntoView({ block: 'start', behavior: isReducedMotion() ? 'auto' : 'smooth' });
  };

  const me = board?.me;
  const showSticky = !!me?.rank && me.rank > 3 && !heroVisible && !meVisible;

  return (
    <>
      <PanelPage
        register="play"
        header={<PageHeader title={copy.title} description={copy.description} icon={<Trophy aria-hidden className="size-6" />} />}
        aside={
          board ? (
            <>
              {board.lastWeekPodium ? (
                <div className="rounded-2xl border border-subtle bg-surface-1 p-4">
                  {board.lastWeekPodium.length > 0 ? (
                    <LeaguePodium
                      podium={board.lastWeekPodium}
                      unit={copy.category[board.category].unit}
                      title={copy.lastWeekTitle}
                      headingId="lig-last-week"
                      compact
                    />
                  ) : (
                    <>
                      <h2 className="qx-small font-semibold text-fg">{copy.lastWeekTitle}</h2>
                      <p className="qx-small mt-2 text-fg-muted">{copy.lastWeekEmpty}</p>
                    </>
                  )}
                </div>
              ) : null}
              <LeaguePrivacy visible={board.me.visibleToOthers} />
              <details className="group rounded-2xl border border-subtle bg-surface-1 p-4">
                <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {copy.rulesTitle}
                </summary>
                <ul className="qx-small mt-2 list-disc space-y-1.5 pl-5 text-fg-muted">
                  {copy.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </details>
            </>
          ) : null
        }
        asideLabel={copy.privacyTitle}
      >
        <div ref={heroRef}>
          {board ? (
            <LeagueHero board={board} rankDelta={rankDelta} onGoToMe={goToMe} onPeriodExpire={() => void query.refetch()} />
          ) : query.isError ? null : (
            <SkeletonBlock className="h-56 rounded-2xl" />
          )}
        </div>

        <LeagueFilters period={params.period} category={params.category} onPeriod={onPeriod} onCategory={onCategory} />

        <QueryState
          query={query}
          isEmpty={() => false}
          skeleton={<SkeletonList rows={8} />}
          error={{ title: copy.errorTitle, description: copy.errorDescription }}
          errorKind={query.error?.code === 'MODULE_DISABLED' ? 'moduleDisabled' : undefined}
        >
          {(data) =>
            data.total === 0 ? (
              <EmptyState
                variant="first-use"
                icon={Trophy}
                title={copy.emptyTitle}
                description={copy.emptyDescription}
                action={
                  <Button asChild className="min-h-11">
                    <Link href={copy.category[data.category].ctaHref} prefetch={false}>
                      {copy.category[data.category].ctaLabel}
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-8">
                {data.page === 1 ? (
                  <LeaguePodium
                    podium={data.podium}
                    unit={copy.category[data.category].unit}
                    title={copy.podiumTitle}
                    headingId="lig-podium"
                    animateEntry={interacted}
                  />
                ) : null}
                <LeagueList
                  ref={meRef}
                  rows={data.page === 1 ? data.rows.filter((r) => r.rank > 3) : data.rows}
                  unit={copy.category[data.category].unit}
                  page={data.page}
                  pageCount={data.pageCount}
                  onPage={onPage}
                  listKey={`${data.category}-${data.period}-${data.page}`}
                  busy={query.isFetching && query.isPlaceholderData}
                  animateEntry={interacted}
                />
              </div>
            )
          }
        </QueryState>
      </PanelPage>

      {showSticky && me?.rank ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--qx-tabbar-h,0px)+0.75rem)] z-30 flex justify-center lg:inset-x-auto lg:right-6">
          <Button
            type="button"
            onClick={goToMe}
            className="pointer-events-auto min-h-12 w-full max-w-md justify-between gap-3 rounded-2xl px-4 shadow-lg lg:w-auto"
          >
            <span className="truncate tabular-nums">{copy.stickyMe(`#${fmt(me.rank)}`, fmt(me.score), copy.category[board?.category ?? params.category].unit)}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <LocateFixed aria-hidden className="size-4" />
              {copy.goToMe}
            </span>
          </Button>
        </div>
      ) : null}
    </>
  );
}
