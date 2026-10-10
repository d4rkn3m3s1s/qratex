'use client';

/**
 * Öne çıkanlar — zirve saat/gün (yalnız örneklem eşiğinin üstünde; rapor B-4), Bayes'li en iyi
 * QR (rapor B-7), olağan dışı günler ve düzeltilecek konular. Her öğe bir sonraki adıma bağlı
 * (yoğunluk haritası, QR'ın yorumları, gelen kutusu).
 */
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CalendarDays, Clock, Trophy } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import { inboxHref, sharedContextSearch } from '@/lib/dealer-analytics/params';
import type { AnalyticsOverview } from '@/lib/dealer-analytics/types';
import { dayLabel, formatNumber, formatPercent, formatRating, topicLabel, useAnalyticsCopy, useAnalyticsLocale, weekdayLabel } from './copy';

function Fact({ icon, label, value, sub, href, tone = 'neutral' }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: 'neutral' | 'brand' | 'warning' | 'success' }) {
  const body = (
    <>
      <span aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-control [&_svg]:h-4 [&_svg]:w-4', TONE_CHIP[tone])}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="qx-caption block text-fg-muted">{label}</span>
        <span className="qx-small block truncate font-semibold text-fg">{value}</span>
        {sub && <span className="qx-caption block text-fg-subtle">{sub}</span>}
      </span>
      {href && <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />}
    </>
  );
  const cls = 'flex min-h-11 items-center gap-3 rounded-control p-2';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function HighlightsCard({ data, heatmapEnabled }: { data: AnalyticsOverview; heatmapEnabled: boolean }) {
  const copy = useAnalyticsCopy();
  const locale = useAnalyticsLocale();
  const { peaks, bestQr } = data;
  const ctx = sharedContextSearch(data.query);
  const heatHref = heatmapEnabled ? `/dealer/analytics/heatmap${ctx ? `?${ctx}` : ''}` : undefined;
  const fixTopics = data.topics.filter((t) => t.quadrant === 'fix').slice(0, 3);

  return (
    <SectionCard title={copy.insightsTitle} headingLevel="h2">
      <div className="space-y-1">
        <Fact
          icon={<Clock />}
          tone="brand"
          label={copy.peakHour}
          value={peaks.hour ? copy.hourRange(peaks.hour.hour) : copy.needsData(peaks.minN)}
          sub={peaks.hour ? copy.shareOf(formatPercent(peaks.hour.share, locale)) : undefined}
          href={peaks.hour ? heatHref : undefined}
        />
        <Fact
          icon={<CalendarDays />}
          tone="brand"
          label={copy.peakDay}
          value={peaks.day ? weekdayLabel(peaks.day.day, locale) : copy.needsData(peaks.minN)}
          sub={peaks.day ? copy.shareOf(formatPercent(peaks.day.share, locale)) : undefined}
          href={peaks.day ? heatHref : undefined}
        />
        <Fact
          icon={<Trophy />}
          tone="success"
          label={copy.bestQr}
          value={bestQr ? `${bestQr.name} · ${formatRating(bestQr.avgRating, locale)}★` : copy.needsData(5)}
          sub={bestQr ? copy.bestQrHint(formatNumber(bestQr.feedbacks, locale)) : undefined}
          href={bestQr ? inboxHref(data.query, { qr: bestQr.id }) : undefined}
        />
      </div>

      <div className="mt-4 border-t border-subtle pt-3">
        <h3 className="qx-caption mb-2 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-fg-muted">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          {copy.attentionTitle}
        </h3>
        {data.anomalies.length === 0 && fixTopics.length === 0 ? (
          <p className="qx-small text-fg-subtle">{copy.noAnomaly}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.anomalies.map((a) => (
              <li key={`${a.day}-${a.kind}`} className="qx-small flex items-start gap-2 text-fg">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
                <span>
                  {(a.kind === 'negative_spike' ? copy.anomalyNegative : copy.anomalyVolume)(
                    dayLabel(a.day, locale, { weekday: 'short', day: 'numeric', month: 'short' }),
                    formatNumber(a.value, locale),
                    formatNumber(a.expected, locale, 1),
                  )}
                </span>
              </li>
            ))}
            {fixTopics.length > 0 && (
              <li className="qx-small flex items-start gap-2 text-fg">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                <span>
                  {copy.attentionTopics}: {fixTopics.map((t) => topicLabel(t.key, locale)).join(', ')} —{' '}
                  <Link href={inboxHref(data.query, { sentiment: 'negative' })} className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {copy.openInInbox}
                  </Link>
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
