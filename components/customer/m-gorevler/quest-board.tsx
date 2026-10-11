'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, RefreshCw, ScanLine } from 'lucide-react';
import { PanelPage, PageHeader, SectionTabs, type SectionTab } from '@/components/ds/page';
import { IconButton } from '@/components/ds/a11y';
import { CountdownChip } from '@/components/ds/play';
import { ErrorState, QueryState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { moments } from '@/lib/moments/client';
import { cn } from '@/lib/utils';
import { fetchQuestBoard, postQuestClaim, postSeasonClaim, QuestApiError, QUEST_BOARD_QUERY_KEY } from './api';
import { formatCount, useQuestCopy, type QuestCopy } from './copy';
import { QuestHero } from './quest-hero';
import { QuestRow } from './quest-row';
import { QuestDetailSheet } from './quest-detail-sheet';
import { SeasonCard } from './season-card';
import type { QuestBoard, QuestClaimResult, QuestDTO, QuestGroup } from './types';

const GROUP_ORDER: readonly QuestGroup[] = ['daily', 'weekly', 'monthly', 'season'];

function isQuestGroup(v: unknown): v is QuestGroup {
  return typeof v === 'string' && (GROUP_ORDER as readonly string[]).includes(v);
}

function claimErrorMessage(error: unknown, copy: QuestCopy): string {
  if (error instanceof QuestApiError) {
    if (error.code in copy.errors) return copy.errors[error.code as keyof QuestCopy['errors']];
    if (error.status === 429) return copy.errors.RATE_LIMITED;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return copy.errors.OFFLINE;
  return copy.errors.GENERIC;
}

type ClaimTarget = { kind: 'quest'; quest: QuestDTO } | { kind: 'all' };

export interface QuestBoardViewProps {
  /** Sunucuda hazırlanan ilk pano (yoksa istemci çeker). */
  initialBoard: QuestBoard | null;
  /** Sunucuda modül kapısı kapalı bulundu. */
  moduleDisabled?: boolean;
  /** `?tab=` derin bağlantısı (sunucu okur). */
  initialTab?: string | null;
}

/**
 * Görevler — Oyna → Görevler (play kaydı). Sunucu ilk panoyu render eder; bu ada yalnız
 * etkileşimi (sekme, ayrıntı, ödül alma, yenileme) taşır.
 */
export function QuestBoardView({ initialBoard, moduleDisabled = false, initialTab = null }: QuestBoardViewProps) {
  const { copy, locale } = useQuestCopy();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUEST_BOARD_QUERY_KEY,
    queryFn: ({ signal }) => fetchQuestBoard(signal),
    initialData: initialBoard ?? undefined,
    initialDataUpdatedAt: initialBoard ? Date.parse(initialBoard.generatedAt) : undefined,
    staleTime: 30_000,
    enabled: !moduleDisabled,
    retry: (count, error) => !(error instanceof QuestApiError && error.status < 500) && count < 2,
  });

  const [tab, setTab] = useState<QuestGroup | null>(isQuestGroup(initialTab) ? initialTab : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingClaim, setPendingClaim] = useState<string | null>(null);

  const board = query.data ?? null;
  const openQuest = useMemo(() => board?.quests.find((q) => q.id === openId) ?? null, [board, openId]);

  const refetchBoard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUEST_BOARD_QUERY_KEY });
  }, [queryClient]);

  const celebrate = useCallback(
    (points: number, xp: number, fallback: string) => {
      // An Motoru puan kapsülü (≤ 1,2 sn, azaltılmış harekette sade); Host yoksa yedek bildirim.
      const shown = points > 0 || xp > 0 ? moments.points({ points, xp }) : false;
      if (!shown) toast.success(fallback);
      // Seviye/rozet anları sunucuda kaydedildi → Host hemen çeksin.
      moments.refresh();
    },
    [],
  );

  const applyResult = useCallback(
    (result: QuestClaimResult, target: ClaimTarget) => {
      if (result.claimed.length === 0) {
        toast(copy.toastNothing);
      } else {
        if (typeof result.balance === 'number') {
          queryClient.setQueryData<QuestBoard>(QUEST_BOARD_QUERY_KEY, (old) =>
            old ? { ...old, balance: result.balance as number } : old,
          );
        }
        const pts = formatCount(result.totals.points, locale);
        const fallback =
          target.kind === 'quest' && result.claimed.length === 1
            ? copy.toastClaimed(result.claimed[0].name, pts)
            : copy.toastClaimedAll(result.claimed.length, pts);
        celebrate(result.totals.points, result.totals.xp, fallback);
      }
      if (result.skipped.length > 0) toast.warning(copy.toastSkipped(result.skipped.length));
      // Bakiye/seviye gösteren diğer müşteri panelleri de tazelensin.
      void queryClient.invalidateQueries({ queryKey: ['customer'] });
    },
    [celebrate, copy, locale, queryClient],
  );

  const claimMutation = useMutation({
    mutationFn: (target: ClaimTarget) =>
      postQuestClaim(target.kind === 'all' ? { all: true } : { questId: target.quest.id }),
    onMutate: (target) => setPendingClaim(target.kind === 'all' ? 'all' : target.quest.id),
    onSuccess: (result, target) => {
      setOpenId(null);
      applyResult(result, target);
    },
    onError: (error) => {
      toast.error(claimErrorMessage(error, copy));
      refetchBoard();
    },
    onSettled: () => setPendingClaim(null),
  });

  const seasonMutation = useMutation({
    mutationFn: postSeasonClaim,
    onMutate: () => setPendingClaim('season'),
    onSuccess: ({ points }) => {
      celebrate(points, 0, copy.season.done(formatCount(points, locale)));
      void queryClient.invalidateQueries({ queryKey: ['customer'] });
    },
    onError: (error) => {
      toast.error(error instanceof QuestApiError && error.message ? error.message : copy.season.failed);
      refetchBoard();
    },
    onSettled: () => setPendingClaim(null),
  });

  const busy = pendingClaim !== null;
  const claimQuest = useCallback((quest: QuestDTO) => claimMutation.mutate({ kind: 'quest', quest }), [claimMutation]);

  const header = (
    <PageHeader
      title={copy.title}
      description={copy.description}
      actions={
        moduleDisabled ? null : (
          <IconButton
            aria-label={query.isFetching ? copy.refreshing : copy.refresh}
            icon={<RefreshCw className={cn(query.isFetching && 'animate-spin motion-reduce:animate-none')} />}
            variant="outline"
            touchTarget
            tooltip
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          />
        )
      }
    />
  );

  if (moduleDisabled) {
    return (
      <PanelPage register="play" width="narrow" header={header}>
        <ErrorState kind="moduleDisabled" title={copy.disabledTitle} description={copy.disabledDescription} />
      </PanelPage>
    );
  }

  return (
    <PanelPage register="play" width="narrow" header={header}>
      <QueryState
        query={query}
        skeleton="cards"
        isEmpty={(b) => b.quests.length === 0 && !b.season}
        empty={{
          title: copy.emptyTitle,
          description: copy.emptyDescription,
          action: (
            <Button asChild className="min-h-11">
              <Link href="/customer/scan" prefetch={false}>
                <ScanLine className="h-4 w-4" aria-hidden />
                {copy.cta.scan}
              </Link>
            </Button>
          ),
        }}
      >
        {(data) => (
          <BoardBody
            board={data}
            copy={copy}
            locale={locale}
            tab={tab}
            onTab={(next) => {
              setTab(next);
              try {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', next);
                window.history.replaceState(window.history.state, '', url);
              } catch {
                /* URL güncellenemezse sekme yine çalışır */
              }
            }}
            pendingClaim={pendingClaim}
            busy={busy}
            onOpen={(q) => setOpenId(q.id)}
            onClaim={claimQuest}
            onClaimAll={() => claimMutation.mutate({ kind: 'all' })}
            onSeasonClaim={() => seasonMutation.mutate(data.season?.campaignId)}
            onExpire={refetchBoard}
          />
        )}
      </QueryState>

      <QuestDetailSheet
        quest={openQuest}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        copy={copy}
        locale={locale}
        claiming={!!openQuest && pendingClaim === openQuest.id}
        claimDisabled={busy}
        onClaim={claimQuest}
      />
    </PanelPage>
  );
}

interface BoardBodyProps {
  board: QuestBoard;
  copy: QuestCopy;
  locale: 'tr' | 'en';
  tab: QuestGroup | null;
  onTab: (tab: QuestGroup) => void;
  pendingClaim: string | null;
  busy: boolean;
  onOpen: (quest: QuestDTO) => void;
  onClaim: (quest: QuestDTO) => void;
  onClaimAll: () => void;
  onSeasonClaim: () => void;
  onExpire: () => void;
}

function BoardBody({
  board,
  copy,
  locale,
  tab,
  onTab,
  pendingClaim,
  busy,
  onOpen,
  onClaim,
  onClaimAll,
  onSeasonClaim,
  onExpire,
}: BoardBodyProps) {
  const byGroup = useMemo(() => {
    const map: Record<QuestGroup, QuestDTO[]> = { daily: [], weekly: [], monthly: [], season: [] };
    for (const q of board.quests) map[q.group].push(q);
    return map;
  }, [board.quests]);

  // Yalnız içeriği olan gruplar sekme olur (Bulgu 9: boş "Aylık" sekmesi yok).
  const available = GROUP_ORDER.filter((g) => byGroup[g].length > 0 || (g === 'season' && !!board.season));
  const firstWithClaim = available.find((g) => byGroup[g].some((q) => q.state === 'claimable'));
  const active: QuestGroup = tab && available.includes(tab) ? tab : firstWithClaim ?? available[0] ?? 'daily';

  const tabs: SectionTab[] = available.map((g) => {
    const claimable = byGroup[g].filter((q) => q.state === 'claimable').length;
    const open = byGroup[g].filter((q) => q.state === 'in_progress').length;
    return {
      value: g,
      label: copy.groups[g],
      // Sayaç: önce alınabilir ödül, yoksa devam eden görev sayısı.
      count: claimable > 0 ? claimable : open > 0 ? open : undefined,
    };
  });

  return (
    <div className="space-y-section">
      <QuestHero
        board={board}
        copy={copy}
        locale={locale}
        claimingAll={pendingClaim === 'all'}
        claimDisabled={busy}
        onClaimAll={onClaimAll}
        onPeriodExpire={onExpire}
      />

      {available.length > 0 ? (
        <SectionTabs
          tabs={tabs}
          value={active}
          onValueChange={(v) => {
            if (isQuestGroup(v)) onTab(v);
          }}
          variant="pill"
          touchTarget
          ariaLabel={copy.groupsAria}
        >
          {(current) =>
            isQuestGroup(current) ? (
              <GroupPanel
                group={current}
                quests={byGroup[current]}
                board={board}
                copy={copy}
                locale={locale}
                pendingClaim={pendingClaim}
                busy={busy}
                onOpen={onOpen}
                onClaim={onClaim}
                onSeasonClaim={onSeasonClaim}
                onExpire={onExpire}
              />
            ) : null
          }
        </SectionTabs>
      ) : null}
    </div>
  );
}

function GroupPanel({
  group,
  quests,
  board,
  copy,
  locale,
  pendingClaim,
  busy,
  onOpen,
  onClaim,
  onSeasonClaim,
  onExpire,
}: {
  group: QuestGroup;
  quests: QuestDTO[];
  board: QuestBoard;
  copy: QuestCopy;
  locale: 'tr' | 'en';
  pendingClaim: string | null;
  busy: boolean;
  onOpen: (quest: QuestDTO) => void;
  onClaim: (quest: QuestDTO) => void;
  onSeasonClaim: () => void;
  onExpire: () => void;
}) {
  const open = quests.filter((q) => q.state === 'claimable' || q.state === 'in_progress');
  const done = quests.filter((q) => q.state === 'claimed' || q.state === 'auto_rewarded');
  const showSeason = group === 'season' && !!board.season;

  const countdown =
    // Günlük geri sayım hero'da; burada tekrarlanmaz.
    group === 'weekly' ? (
      <CountdownChip mode="week" size="sm" label={copy.weekEnds} onExpire={onExpire} locale={locale} />
    ) : group === 'monthly' ? (
      <CountdownChip target={board.periodEnds.monthly} size="sm" label={copy.monthEnds} onExpire={onExpire} locale={locale} />
    ) : null;

  const rowProps = (q: QuestDTO, i: number) => ({
    quest: q,
    index: i,
    copy,
    locale,
    claiming: pendingClaim === q.id,
    claimDisabled: busy,
    onOpen,
    onClaim,
    onExpire,
  });

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="qx-caption text-fg-muted">{copy.groupHint[group]}</p>
        {countdown}
      </div>

      {showSeason && board.season ? (
        <SeasonCard
          season={board.season}
          copy={copy}
          locale={locale}
          claiming={pendingClaim === 'season'}
          claimDisabled={busy}
          onClaim={onSeasonClaim}
          onExpire={onExpire}
        />
      ) : null}

      {open.length > 0 ? (
        <ul className="space-y-2" aria-label={copy.groups[group]}>
          <AnimatePresence initial={true}>
            {open.map((q, i) => (
              <QuestRow key={q.id} {...rowProps(q, i)} />
            ))}
          </AnimatePresence>
        </ul>
      ) : !showSeason && done.length === 0 ? (
        <p className="qx-small rounded-card border border-dashed border-subtle p-4 text-center text-fg-muted">{copy.emptyGroup}</p>
      ) : null}

      {done.length > 0 ? (
        <details className="group/done rounded-card" open={open.length === 0 && !showSeason}>
          <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-control px-1 font-medium text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            {copy.claimedSection(done.length)}
            <ChevronDown className="h-4 w-4 transition-transform duration-fast group-open/done:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-2 space-y-2">
            <AnimatePresence initial={false}>
              {done.map((q, i) => (
                <QuestRow key={q.id} {...rowProps(q, i)} />
              ))}
            </AnimatePresence>
          </ul>
        </details>
      ) : null}
    </div>
  );
}
