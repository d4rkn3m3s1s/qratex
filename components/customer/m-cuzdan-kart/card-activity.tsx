'use client';

/**
 * Bekleyen aksiyon (yorum bekleyen tüketimler, satır başına doğrudan "Puanla") ve son işlemler
 * (işletme, ürün, deftere yazılan puan, yorum durumu). Tam liste ve filtreler Hareketler
 * sekmesinde; burada yalnız son 5 kayıt (tekrar yok).
 */
import Link from 'next/link';
import { ArrowRight, Award, ChevronRight, History, MessageSquareText, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard, TONE_CALLOUT } from '@/components/states';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { WalletCardPayload } from '@/lib/wallet-card/dto';
import type { CardCopy, CardLocale } from './copy';
import { consumptionVoiceHref } from '@/lib/navigation/deep-links';

export function PendingReviews({
  pending,
  copy,
  locale,
}: {
  pending: WalletCardPayload['pending'];
  copy: CardCopy;
  locale: CardLocale;
}) {
  if (pending.count <= 0) return null;
  const more = Math.max(0, pending.count - pending.items.length);
  return (
    <section aria-labelledby="wallet-pending-title" className={cn('rounded-card border p-4', TONE_CALLOUT.warning)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-warning-subtle text-warning ring-1 ring-inset ring-warning-border">
          <Award className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="wallet-pending-title" className="qx-body font-semibold text-fg">
            {copy.pendingTitle(pending.count)}
          </h2>
          <p className="qx-small text-fg-muted">{copy.pendingBody}</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-border rounded-control border border-subtle bg-surface-1">
        {pending.items.map((item) => (
          <li key={item.id}>
            <Link
              href={consumptionVoiceHref(item.id)}
              className="flex min-h-12 items-center gap-3 px-3 py-2 transition-colors duration-fast hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Store className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="qx-small block truncate font-medium text-fg">{item.dealerName || copy.businessFallback}</span>
                <time dateTime={item.createdAt} className="qx-caption text-fg-muted">
                  {formatRelativeTime(item.createdAt, locale)}
                </time>
              </span>
              <span className="qx-small inline-flex shrink-0 items-center gap-1 font-semibold text-brand">
                {copy.pendingRate}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="qx-caption mt-2 text-fg-muted">
          {copy.pendingMore(more)} ·{' '}
          <Link href="/customer/wallet/activity" className="font-medium text-brand underline-offset-2 hover:underline">
            {copy.allActivity}
          </Link>
        </p>
      )}
    </section>
  );
}

export function RecentActivity({ recent, copy, locale }: { recent: WalletCardPayload['recent']; copy: CardCopy; locale: CardLocale }) {
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR');
  return (
    <SectionCard
      title={copy.recent}
      icon={<History />}
      footer={
        recent.length > 0 ? (
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href="/customer/wallet/activity">
              {copy.allActivity}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : undefined
      }
    >
      {recent.length === 0 ? (
        <p className="qx-small text-fg-muted">{copy.recentEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((c) => (
            <li key={c.id}>
              <Link
                href={consumptionVoiceHref(c.id)}
                className="-mx-2 flex min-h-12 items-center gap-3 rounded-control px-2 py-2.5 transition-colors duration-fast hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted">
                  <Store className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="qx-small block truncate font-medium text-fg">{c.dealerName || copy.businessFallback}</span>
                  <span className="qx-caption flex flex-wrap items-center gap-x-2 text-fg-muted">
                    {c.productName && <span className="truncate">{c.productName}</span>}
                    <span className={cn('inline-flex items-center gap-1', c.reviewed ? 'text-success' : 'text-fg-muted')}>
                      <MessageSquareText className="h-3 w-3" aria-hidden />
                      {c.reviewed ? copy.reviewed : copy.notReviewed}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  {c.pointsEarned !== null && c.pointsEarned > 0 && (
                    <span className="qx-small qx-num font-semibold text-success">{copy.pointsEarned(nf.format(c.pointsEarned))}</span>
                  )}
                  <time dateTime={c.createdAt} className="qx-caption qx-num text-fg-muted">
                    {formatRelativeTime(c.createdAt, locale)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
