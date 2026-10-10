'use client';

/**
 * Duygu ve puan dağılımı — saf HTML çubuklar (recharts gerekmez; ekran okuyucu liste okur).
 *  - Duygu: "Analiz bekliyor" ayrı dilim (rapor B-12: nötr şişmez); her satır gelen kutusuna iner.
 *  - Puan: adet + yüzde; renk anlamı tutarlı (5★ en olumlu = success, 1★ = danger) (rapor #31).
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { cn } from '@/lib/utils';
import { inboxHref } from '@/lib/dealer-analytics/params';
import type { AnalyticsOverview, SentimentKey } from '@/lib/dealer-analytics/types';
import { formatNumber, formatPercent, useAnalyticsCopy, useAnalyticsLocale } from './copy';

const SENTIMENT_ORDER: SentimentKey[] = ['positive', 'neutral', 'negative', 'pending'];
const SENTIMENT_BAR: Record<SentimentKey, string> = {
  positive: 'bg-success',
  neutral: 'bg-fg-subtle',
  negative: 'bg-danger',
  pending: 'bg-info',
};
/** Puan rengi anlamlı ve tek yönlü: 5★ en olumlu → 1★ en olumsuz (token + saydamlık). */
const RATING_BAR: Record<number, string> = {
  5: 'hsl(var(--success))',
  4: 'hsl(var(--success) / 0.6)',
  3: 'hsl(var(--text-3))',
  2: 'hsl(var(--warning))',
  1: 'hsl(var(--danger))',
};

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
      <div
        className="h-full rounded-full transition-[width] duration-base ease-standard motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function SentimentCard({ data }: { data: AnalyticsOverview }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const s = data.sentiment;
  const total = s.total;
  return (
    <SectionCard title={copy.sentimentTitle} description={copy.sentimentDescription} headingLevel="h2">
      {/* Yığılmış tek çubuk: oranların hızlı okunuşu (yalnız görsel; liste erişilebilir karşılık). */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        {total > 0 &&
          SENTIMENT_ORDER.map((k) =>
            s[k] > 0 ? <div key={k} className={SENTIMENT_BAR[k]} style={{ width: `${(s[k] / total) * 100}%` }} /> : null,
          )}
      </div>
      <ul className="mt-4 space-y-1">
        {SENTIMENT_ORDER.map((k) => {
          const pct = total > 0 ? (s[k] / total) * 100 : 0;
          return (
            <li key={k}>
              <Link
                href={inboxHref(data.query, { sentiment: k })}
                className="group flex min-h-11 items-center gap-3 rounded-control px-2 py-1.5 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', SENTIMENT_BAR[k])} aria-hidden />
                <span className="qx-small min-w-0 flex-1 text-fg">{copy.sentiments[k]}</span>
                <span className="qx-small qx-num text-fg-muted">{formatNumber(s[k], locale)}</span>
                <span className="qx-small qx-num w-12 text-right font-medium text-fg">{total > 0 ? formatPercent(pct, locale) : '—'}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                <span className="sr-only">— {copy.openInInbox}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {s.pending > 0 && <p className="qx-caption mt-2 text-fg-subtle">{copy.pendingNote(formatNumber(s.pending, locale))}</p>}
    </SectionCard>
  );
}

export function RatingCard({ data }: { data: AnalyticsOverview }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const total = data.ratings.reduce((a, r) => a + r.count, 0);
  return (
    <SectionCard title={copy.ratingTitle} headingLevel="h2">
      <ul className="space-y-1">
        {data.ratings.map((r) => {
          const pct = total > 0 ? (r.count / total) * 100 : 0;
          return (
            <li key={r.star}>
              <Link
                href={inboxHref(data.query, { rating: r.star })}
                className="group grid min-h-11 grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded-control px-2 py-1.5 transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="qx-small text-fg">{copy.ratingRow(r.star)}</span>
                <Bar pct={pct} color={RATING_BAR[r.star]} />
                <span className="qx-small qx-num whitespace-nowrap text-right text-fg-muted">
                  <span className="font-medium text-fg">{formatNumber(r.count, locale)}</span> · {total > 0 ? formatPercent(pct, locale) : '—'}
                </span>
                <span className="sr-only">— {copy.openInInbox}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
