'use client';

import Link from 'next/link';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, MessageSquare, QrCode, ShoppingBag, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/components/ds/page';
import { SeverityBadge } from '@/components/ds/data';
import { listContainer, listItem, useMotionPolicy } from '@/lib/motion';
import type { NextAction, WaitingSection } from '@/lib/dealer-today/types';
import { TODAY_LINKS, hoursBetween } from '@/lib/dealer-today/core';
import { useTodayCopy } from './copy';

/**
 * Sıradaki en iyi adımlar — eski panonun "Yapılacaklar" çipleri, sabah brifingi ve copilot'un
 * next-best-action'ı tek, deterministik, önceliklendirilmiş listede. Metin istemcide üretilir
 * (API yalnız kod + sayı); her satır ilgili listeye gider ve her zaman görünür bir bağlantıdır
 * (copilot B4: hover'da beliren link mobilde/klavyede görünmüyordu).
 */
export function NextActions({ actions }: { actions: NextAction[] }) {
  const { copy } = useTodayCopy();
  const policy = useMotionPolicy();
  return (
    <SectionCard title={copy.next.title} description={copy.next.desc} density="compact">
      {actions.length === 0 ? (
        <div role="status" className="flex items-start gap-3 rounded-control bg-success-subtle/50 px-3 py-3">
          <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-medium text-fg">{copy.next.allClear}</p>
            <p className="text-xs text-fg-muted">{copy.next.allClearDesc}</p>
          </div>
        </div>
      ) : (
        <Motion.ol
          className="-mx-1 divide-y divide-subtle"
          variants={policy.variants(listContainer)}
          // Sunucu HTML'i görünür çizilir: "hidden" başlangıcı, tembel yüklenen animasyon özellikleri
          // gelene kadar listeyi opaklık 0'da tutuyordu (yavaş cihazda içerik geç görünüyordu).
          initial={false}
          animate="visible"
        >
          <AnimatePresence initial={false}>
            {actions.map((a) => (
              <Motion.li key={a.kind} layout={!policy.reduce} variants={policy.variants(listItem)} exit="exit">
                <Link
                  href={a.href}
                  prefetch={false}
                  className="group flex min-h-11 items-start gap-3 rounded-control px-1 py-3 hover:bg-surface-3/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <SeverityBadge severity={a.severity} size="sm" className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">{copy.next.title_[a.kind](a)}</span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{copy.next.detail[a.kind](a)}</span>
                  </span>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
                    {copy.next.open}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform duration-fast group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </Motion.li>
            ))}
          </AnimatePresence>
        </Motion.ol>
      )}
    </SectionCard>
  );
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cn('h-3.5 w-3.5', i < rating ? 'fill-current text-warning' : 'text-fg-subtle')} />
      ))}
    </span>
  );
}

/** Yanıt bekleyen geri bildirimler — önce olumsuzlar (en eski üstte, SLA), sonra en yeniler. */
export function WaitingList({ waiting, now }: { waiting: WaitingSection; now: Date }) {
  const { copy, tag } = useTodayCopy();
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
  const relative = (iso: string) => {
    const h = hoursBetween(iso, now) ?? 0;
    if (h < 1) return rtf.format(-Math.max(1, Math.floor((now.getTime() - Date.parse(iso)) / 60_000)), 'minute');
    if (h < 48) return rtf.format(-h, 'hour');
    return rtf.format(-Math.floor(h / 24), 'day');
  };
  return (
    <SectionCard
      title={copy.waiting.title}
      description={copy.waiting.desc(waiting.total)}
      density="compact"
      actions={
        waiting.total > 0 ? (
          <Link href={TODAY_LINKS.inboxWaiting} prefetch={false} className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            {copy.waiting.seeAll}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null
      }
    >
      {waiting.items.length === 0 ? (
        <div role="status" className="flex items-start gap-3 py-2">
          <MessageSquare aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-fg-subtle" />
          <div>
            <p className="text-sm font-medium text-fg">{copy.waiting.empty}</p>
            <p className="text-xs text-fg-muted">{copy.waiting.emptyDesc}</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-subtle">
          {waiting.items.map((item) => {
            const negative = item.rating <= 2;
            const late = negative && (hoursBetween(item.createdAt, now) ?? 0) >= 24;
            const SourceIcon = item.source === 'qr' ? QrCode : ShoppingBag;
            return (
              <li key={`${item.source}:${item.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                    <Stars rating={item.rating} label={copy.waiting.stars(item.rating)} />
                    <span className="inline-flex items-center gap-1">
                      <SourceIcon aria-hidden className="h-3.5 w-3.5" />
                      <span>{item.source === 'qr' ? copy.waiting.qr : copy.waiting.consumption}</span>
                      {item.place && <span className="truncate">· {item.place}</span>}
                    </span>
                    <time dateTime={item.createdAt}>{relative(item.createdAt)}</time>
                    {late && <span className="rounded-chip bg-danger-subtle px-1.5 py-0.5 font-medium text-danger">{copy.waiting.overdue}</span>}
                  </div>
                  <p className={cn('mt-1 line-clamp-2 text-sm', item.excerpt ? 'text-fg' : 'italic text-fg-muted')}>{item.excerpt ?? copy.waiting.noText}</p>
                </div>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-control border border-strong px-3 text-sm font-medium text-fg hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:min-h-9"
                >
                  {copy.waiting.reply}
                  <span className="sr-only">: {item.excerpt ?? copy.waiting.noText}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
