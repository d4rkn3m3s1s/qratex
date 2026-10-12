'use client';

import { MapPin, MessageSquare, Reply, Sparkles, Star } from 'lucide-react';
import { GlowCard } from '@/components/ds/play';
import { useNumberTicker } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { VoiceSummary } from '@/lib/customer-voices/types';
import { BusinessAvatar } from './business-avatar';
import { topicLabel, useVoicesCopy, useVoicesLocale } from './copy';
import { formatNumber } from './lib';

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string | null; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-control border border-subtle bg-surface-1/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-fg-muted">
        <span aria-hidden className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        <span className="qx-caption">{label}</span>
      </div>
      <p className="qx-h2 qx-num mt-1 text-fg">{value}</p>
      {sub ? <p className="qx-caption mt-0.5 text-fg-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * "Sesin" — /customer/ai-insights'ın değerli kısmı: gerçek toplamlar, gerçek puan kredisi,
 * en çok ses verilen yer ve (modül açıksa) kayıtlı analizden duygu tonu + konular.
 * Bayi metrikleri (kaybetme riski, efor, aciliyet, aksiyon önerisi) bilerek yok.
 */
export function VoiceSummaryCard({ summary }: { summary: VoiceSummary }) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const points = useNumberTicker(summary.points.total);
  const { totals, insights, favoritePlace } = summary;
  const sent = insights?.sentiment;
  const sentTotal = sent ? sent.positive + sent.neutral + sent.negative : 0;

  return (
    <GlowCard register="play" accent="brand" className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="qx-h3 flex items-center gap-2 text-fg">
            <Sparkles aria-hidden className="h-4 w-4 text-brand" />
            {copy.yourVoice}
          </h2>
          <p className="qx-small mt-0.5 text-fg-muted">{copy.yourVoiceHint}</p>
        </div>
      </header>

      {/* Mobilde yatay kayan stat şeridi (sıkışık 3 sütun yerine), geniş ekranda ızgara. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={copy.voices} value={formatNumber(totals.voices, locale)} icon={<MessageSquare />} />
        <Stat
          label={copy.avgRating}
          value={totals.avgRating == null ? copy.noValue : formatNumber(totals.avgRating, locale, 1)}
          icon={<Star />}
        />
        <Stat
          label={copy.replyRate}
          value={totals.replyRate == null ? copy.noValue : `%${formatNumber(totals.replyRate, locale)}`}
          icon={<Reply />}
        />
        <Stat
          label={copy.pointsEarned}
          value={formatNumber(Math.round(points), locale)}
          sub={summary.points.thisMonth > 0 ? copy.pointsThisMonth(formatNumber(summary.points.thisMonth, locale)) : null}
          icon={<Sparkles />}
        />
      </div>

      {favoritePlace ? (
        <div className="flex items-center gap-3 rounded-control bg-surface-muted/60 px-3 py-2.5">
          <BusinessAvatar business={favoritePlace.business} size="sm" />
          <div className="min-w-0">
            <p className="qx-caption flex items-center gap-1 text-fg-muted">
              <MapPin aria-hidden className="h-3 w-3" />
              {copy.favoritePlace}
            </p>
            <p className="qx-small truncate font-medium text-fg">{favoritePlace.business.name}</p>
            <p className="qx-caption text-fg-muted">
              {copy.favoritePlaceLine(favoritePlace.count, formatNumber(favoritePlace.avgRating, locale, 1))}
            </p>
          </div>
        </div>
      ) : null}

      {insights && sent && sentTotal > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="qx-small font-medium text-fg">{copy.sentimentTitle}</h3>
            <div
              role="img"
              aria-label={copy.sentimentBarLabel(sent.positive, sent.neutral, sent.negative)}
              className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-muted"
            >
              {(['positive', 'neutral', 'negative'] as const).map((k) =>
                sent[k] > 0 ? (
                  <span
                    key={k}
                    className={cn(k === 'positive' ? 'bg-success' : k === 'negative' ? 'bg-danger' : 'bg-fg-subtle/60')}
                    style={{ width: `${(sent[k] / sentTotal) * 100}%` }}
                  />
                ) : null
              )}
            </div>
            <ul className="qx-caption mt-2 flex flex-wrap gap-x-3 gap-y-1 text-fg-muted" aria-hidden>
              <li className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />{copy.positive} {sent.positive}</li>
              <li className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-fg-subtle/60" />{copy.neutral} {sent.neutral}</li>
              <li className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" />{copy.negative} {sent.negative}</li>
            </ul>
            <p className="qx-caption mt-1 text-fg-subtle">{copy.sentimentSample(insights.analyzed)}</p>
          </div>
          {insights.topTopics.length > 0 ? (
            <div>
              <h3 className="qx-small font-medium text-fg">{copy.topicsTitle}</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {insights.topTopics.map((t) => (
                  <li key={t.key} className="qx-caption rounded-full bg-brand-subtle px-2.5 py-1 text-brand ring-1 ring-inset ring-brand-border">
                    {topicLabel(t.key, locale)} <span className="qx-num opacity-80">· {t.count}</span>
                  </li>
                ))}
              </ul>
              <p className="qx-caption mt-1 text-fg-subtle">{copy.topicsSample(insights.topicSample)}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </GlowCard>
  );
}
