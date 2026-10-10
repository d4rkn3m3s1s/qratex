'use client';

import { Fragment, useEffect, useRef } from 'react';
import { m as Motion } from 'framer-motion';
import { Gift, QrCode, Receipt } from 'lucide-react';
import { StatusBadge } from '@/components/ds/data';
import { listItem } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { VoiceListItem } from '@/lib/customer-voices/types';
import { BusinessAvatar } from './business-avatar';
import { useVoicesCopy, useVoicesLocale } from './copy';
import { formatMonth, formatRelative, monthKey } from './lib';
import { RatingStars } from './rating-stars';

function VoiceCard({
  item,
  index,
  isNew,
  active,
  onOpen,
}: {
  item: VoiceListItem;
  index: number;
  isNew: boolean;
  active: boolean;
  onOpen: (key: string) => void;
}) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const stage =
    item.stage === 'replied'
      ? { label: copy.stageReplied, tone: 'success' as const }
      : item.stage === 'viewed'
        ? { label: copy.stageViewed, tone: 'info' as const }
        : { label: copy.stageSent, tone: 'neutral' as const };
  const remedy = item.remedy
    ? item.remedy.status === 'pending'
      ? { label: copy.remedyPending, tone: 'warning' as const }
      : item.remedy.status === 'accepted'
        ? { label: item.remedy.selectionLabel ? `${copy.remedyAccepted} · ${item.remedy.selectionLabel}` : copy.remedyAccepted, tone: 'brand' as const }
        : { label: copy.remedyExpired, tone: 'neutral' as const }
    : null;

  return (
    // Konum/ızgara dış elemanda; framer yalnız iç girişte (transform çakışması yok).
    <li className="min-w-0">
      <Motion.div variants={listItem} custom={index} initial="hidden" animate="visible">
        <button
          type="button"
          onClick={() => onOpen(item.key)}
          aria-current={active ? 'true' : undefined}
          className={cn(
            'group block w-full rounded-card border bg-surface-1 p-4 text-left qx-elevation-1 transition-[border-color,box-shadow] duration-fast ease-standard',
            'hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active ? 'border-brand-border ring-1 ring-brand-border' : 'border-subtle',
            isNew && 'border-success-border'
          )}
        >
          <span className="flex items-start gap-3">
            <BusinessAvatar business={item.business} />
            <span className="block min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="qx-body block min-w-0 max-w-full truncate font-semibold text-fg">{item.business.name}</span>
                <span className="qx-caption inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-fg-muted">
                  {item.kind === 'qr' ? <QrCode aria-hidden className="h-3 w-3" /> : <Receipt aria-hidden className="h-3 w-3" />}
                  {item.kind === 'qr' ? copy.kindQr : copy.kindReview}
                </span>
                {isNew ? <StatusBadge size="sm" tone="success" label={copy.newReply} /> : null}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <RatingStars value={item.rating} />
                {item.place ? <span className="qx-caption min-w-0 truncate text-fg-muted">{item.place}</span> : null}
              </span>
            </span>
            <time dateTime={item.createdAt} className="qx-caption shrink-0 text-fg-subtle" suppressHydrationWarning>
              {formatRelative(item.createdAt, locale)}
            </time>
          </span>

          <span className={cn('qx-small mt-3 line-clamp-3 block break-words', item.textPreview ? 'text-fg' : 'italic text-fg-muted')}>
            {item.textPreview ?? copy.noText}
          </span>

          <span className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge size="sm" tone={stage.tone} label={stage.label} />
            {remedy ? <StatusBadge size="sm" tone={remedy.tone} icon={Gift} label={remedy.label} /> : null}
            {item.pointsEarned != null && item.pointsEarned > 0 ? (
              <span className="qx-caption qx-num ml-auto rounded-full bg-brand-subtle px-2 py-0.5 font-medium text-brand ring-1 ring-inset ring-brand-border">
                {copy.earned(item.pointsEarned)}
              </span>
            ) : null}
          </span>
        </button>
      </Motion.div>
    </li>
  );
}

/**
 * Ay başlıklarıyla gruplu birleşik zaman çizelgesi. "Daha eskileri göster" düğmesi her
 * zaman var (klavye/ekran okuyucu); görünür alana yaklaşınca otomatik de yüklenir.
 */
export function VoiceList({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  activeKey,
  lastSeen,
}: {
  items: VoiceListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (key: string) => void;
  activeKey: string | null;
  lastSeen: number | null;
}) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) onLoadMore();
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  const groups: Array<{ key: string; label: string; items: Array<{ item: VoiceListItem; index: number }> }> = [];
  items.forEach((item, index) => {
    const k = monthKey(item.createdAt);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) {
      g = { key: k, label: formatMonth(item.createdAt, locale), items: [] };
      groups.push(g);
    }
    g.items.push({ item, index });
  });

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <Fragment key={g.key}>
          <section aria-label={g.label} className="space-y-2">
            <h3 className="qx-caption sticky top-0 z-[1] -mx-1 bg-surface-0/90 px-1 py-1.5 font-semibold uppercase tracking-wide text-fg-muted backdrop-blur supports-[backdrop-filter]:bg-surface-0/70">
              {g.label}
            </h3>
            <ul className="space-y-2.5">
              {g.items.map(({ item, index }) => (
                <VoiceCard
                  key={item.key}
                  item={item}
                  index={index}
                  active={item.key === activeKey}
                  isNew={!!(lastSeen && item.repliedAt && new Date(item.repliedAt).getTime() > lastSeen)}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          </section>
        </Fragment>
      ))}

      <div ref={sentinel} className="flex flex-col items-center gap-2 pt-1">
        {hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            aria-busy={loadingMore}
            className="qx-small min-h-11 rounded-control border border-subtle bg-surface-1 px-4 font-medium text-fg transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {loadingMore ? copy.loadingMore : copy.loadMore}
          </button>
        ) : items.length > 0 ? (
          <p className="qx-caption text-fg-subtle">{copy.endOfList}</p>
        ) : null}
      </div>
    </div>
  );
}
