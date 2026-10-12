'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight, Copy, Link2, Loader2, MessageSquare, Receipt, ScanLine, Share2, Star } from 'lucide-react';
import { m as Motion } from 'framer-motion';
import { SectionCard } from '@/components/ds/page';
import { IconButton, announce } from '@/components/ds/a11y';
import { EmptyState, InlineError } from '@/components/states';
import { Button } from '@/components/ui/button';
import { listItem, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { VenueHistoryItem, VenueHistoryPage, VenueShareLink } from '@/lib/venue-detail/types';
import { getVenueCopy, type VenueCopy, type VenueLocale } from './copy';
import { copyText } from './clipboard';
import type { ShareTarget } from './share-sheet';
import { consumptionVoiceHref, feedbackVoiceHref } from '@/lib/navigation/deep-links';

// Paylaşım alt sayfası yalnız "Paylaş"a basılınca yüklenir (ilk JS'te yok).
const ShareSheet = dynamic(() => import('./share-sheet').then((m) => m.ShareSheet), { ssr: false });

const SHARE_MIN_RATING = 4;

async function fetchPage(dealerId: string, cursor: string): Promise<VenueHistoryPage> {
  const res = await fetch(
    `/api/customer/venue-detail/${encodeURIComponent(dealerId)}/history?cursor=${encodeURIComponent(cursor)}`,
    { cache: 'no-store' }
  );
  const json = (await res.json().catch(() => ({}))) as { data?: VenueHistoryPage; error?: string };
  if (!res.ok || !json.data) throw new Error(json.error || 'history');
  return json.data;
}

function Rating({ value, copy }: { value: number; copy: VenueCopy }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-fg" aria-label={copy.ratingAria(value)} role="img">
      <Star aria-hidden className="h-4 w-4 fill-current text-warning" />
      <span aria-hidden className="tabular-nums">
        {value}/5
      </span>
    </span>
  );
}

function DealerReply({ text, at, copy }: { text: string; at: string | null; copy: VenueCopy }) {
  return (
    <div className="mt-2 rounded-control border-l-2 border-brand bg-brand-subtle px-3 py-2">
      <p className="qx-caption font-medium text-brand">
        {copy.dealerReply}
        {at && <span className="font-normal text-fg-muted"> · {copy.dateTime(new Date(at))}</span>}
      </p>
      <p className="qx-small mt-0.5 text-fg">{text}</p>
    </div>
  );
}

function HistoryRow({
  item,
  copy,
  shareEnabled,
  onShare,
}: {
  item: VenueHistoryItem;
  copy: VenueCopy;
  shareEnabled: boolean;
  onShare: (t: ShareTarget, label: string) => void;
}) {
  const at = new Date(item.at);
  if (item.kind === 'consumption') {
    const title = item.productName ?? copy.consumption;
    const review = item.review;
    return (
      <div className="flex gap-3">
        <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-2 text-fg-muted">
          <Receipt className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="font-medium text-fg">{title}</h3>
            <time dateTime={item.at} className="qx-caption text-fg-muted">
              {copy.dateTime(at)}
            </time>
          </div>
          <p className="qx-small text-fg-muted">
            {copy.consumption}
            {item.amount != null && <> · <span className="tabular-nums">{copy.money(item.amount)}</span></>}
          </p>
          {review && (
            <div className="mt-1.5 space-y-1">
              <Rating value={review.rating} copy={copy} />
              {review.excerpt && <p className="qx-small text-fg">{review.excerpt}</p>}
              {review.dealerReply && <DealerReply text={review.dealerReply} at={review.dealerRepliedAt} copy={copy} />}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1 px-2 sm:min-h-9">
              <Link href={consumptionVoiceHref(item.id)}>
                {review ? copy.viewConsumption : copy.writeReview}
                <ChevronRight aria-hidden className="h-4 w-4" />
              </Link>
            </Button>
            {shareEnabled && review && review.rating >= SHARE_MIN_RATING && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 gap-1 px-2 sm:min-h-9"
                aria-label={copy.shareThisAria(title)}
                onClick={() => onShare({ kind: 'review', id: review.id, rating: review.rating }, title)}
              >
                <Share2 aria-hidden className="h-4 w-4" />
                {copy.shareThis}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-2 text-fg-muted">
        <MessageSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="font-medium text-fg">{copy.feedback}</h3>
          <time dateTime={item.at} className="qx-caption text-fg-muted">
            {copy.dateTime(at)}
          </time>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Rating value={item.rating} copy={copy} />
          {item.topics.map((t) => (
            <span key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">
              {copy.topics[t] ?? t}
            </span>
          ))}
        </div>
        {item.excerpt && <p className="qx-small mt-1 text-fg">{item.excerpt}</p>}
        {item.dealerReply && <DealerReply text={item.dealerReply} at={item.dealerRepliedAt} copy={copy} />}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1 px-2 sm:min-h-9">
            <Link href={feedbackVoiceHref(item.id)}>
              {copy.viewJourney}
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Link>
          </Button>
          {shareEnabled && item.rating >= SHARE_MIN_RATING && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 gap-1 px-2 sm:min-h-9"
              aria-label={copy.shareThisAria(copy.feedback)}
              onClick={() => onShare({ kind: 'feedback', id: item.id, rating: item.rating }, copy.feedback)}
            >
              <Share2 aria-hidden className="h-4 w-4" />
              {copy.shareThis}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareLinks({ links, copy }: { links: VenueShareLink[]; copy: VenueCopy }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="qx-small flex items-center gap-2 font-semibold text-fg">
        <Link2 aria-hidden className="h-4 w-4 text-fg-muted" />
        {copy.myLinksTitle}
      </h3>
      <ul className="mt-2 space-y-2">
        {links.map((l) => (
          <li key={l.token} className="flex items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{l.caption ?? l.url}</p>
              <p className="qx-caption text-fg-muted">
                {copy.linkViews(l.viewCount)} · {copy.linkExpires(copy.date(new Date(l.expiresAt)))}
              </p>
            </div>
            <IconButton
              aria-label={copy.copyLinkAria}
              icon={<Copy />}
              variant="ghost"
              onClick={async () => {
                const okCopy = await copyText(l.url);
                announce(okCopy ? copy.shareCopied : copy.shareCopyFailed, { politeness: okCopy ? 'polite' : 'assertive' });
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Bu mekândaki geçmişim" — ilk sayfa sunucudan (initialData), sonrakiler imleçli
 * `GET /api/customer/venue-detail/[dealerId]/history`. Her 4-5 puanlık deneyimden paylaşım.
 */
export function HistoryList({
  dealerId,
  dealerName,
  initial,
  stamp,
  initialLinks,
  shareEnabled,
  locale,
}: {
  dealerId: string;
  dealerName: string;
  initial: VenueHistoryPage;
  /** Sunucu render anı — her yeni sunucu render'ı taze ilk sayfayla yeni sorgu başlatır. */
  stamp: string;
  initialLinks: VenueShareLink[];
  shareEnabled: boolean;
  locale: VenueLocale;
}) {
  const copy = getVenueCopy(locale);
  const reduce = useReducedMotionPref();
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [links, setLinks] = useState<VenueShareLink[]>(initialLinks);

  const query = useInfiniteQuery({
    queryKey: ['venue-history', dealerId, stamp],
    queryFn: ({ pageParam }) => fetchPage(dealerId, pageParam as string),
    initialPageParam: '',
    getNextPageParam: (last: VenueHistoryPage) => last.nextCursor ?? undefined,
    initialData: { pages: [initial], pageParams: [''] },
    staleTime: Infinity,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const onShare = (t: ShareTarget) => {
    setShareTarget(t);
    setSheetOpen(true);
  };

  return (
    <SectionCard
      title={copy.historyTitle}
      description={copy.historyDesc}
      icon={<MessageSquare />}
      bodyClassName="pt-3"
    >
      {items.length === 0 ? (
        <EmptyState
          variant="first-use"
          compact
          icon={ScanLine}
          title={copy.historyEmptyTitle}
          description={copy.historyEmptyBody}
          headingLevel="h3"
          action={
            <Button asChild className="gap-2">
              <Link href="/customer/scan">
                <ScanLine aria-hidden className="h-4 w-4" />
                {copy.scanCta}
              </Link>
            </Button>
          }
        />
      ) : (
        <ol className="divide-y divide-border" aria-busy={query.isFetchingNextPage || undefined}>
          {items.map((item, idx) => (
            <Motion.li
              key={`${item.kind}:${item.id}`}
              className="py-3 first:pt-0 last:pb-0"
              variants={listItem}
              initial={reduce || idx < initial.items.length ? false : 'hidden'}
              animate="visible"
            >
              <HistoryRow item={item} copy={copy} shareEnabled={shareEnabled} onShare={onShare} />
            </Motion.li>
          ))}
        </ol>
      )}

      {query.isError && !query.isFetchingNextPage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <InlineError variant="banner">{copy.historyLoadFailed}</InlineError>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void query.fetchNextPage()}>
            {copy.historyRetry}
          </Button>
        </div>
      )}

      {query.hasNextPage && !query.isError && (
        <Button
          type="button"
          variant="outline"
          className={cn('mt-4 w-full gap-2')}
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {query.isFetchingNextPage ? copy.historyLoadingMore : copy.historyMore}
        </Button>
      )}
      {!query.hasNextPage && items.length > initial.items.length && (
        <p className="qx-caption mt-3 text-center text-fg-muted">{copy.historyEnd}</p>
      )}

      {shareEnabled && <ShareLinks links={links} copy={copy} />}

      {shareEnabled && shareTarget && (
        <ShareSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          dealerId={dealerId}
          dealerName={dealerName}
          target={shareTarget}
          locale={locale}
          onCreated={(link) => setLinks((prev) => [link, ...prev.filter((p) => p.token !== link.token)].slice(0, 5))}
        />
      )}
    </SectionCard>
  );
}
