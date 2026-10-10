'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bot, CheckCircle2, ChevronRight, Clock, Gift, MessageSquareReply, Pencil, Receipt, Reply, ShieldAlert, Sparkles } from 'lucide-react';
import { Timeline, type TimelineEvent } from '@/components/ds/data';
import { EmptyState, QueryState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceDetail } from '@/lib/customer-voices/types';
import { BusinessAvatar } from './business-avatar';
import { topicLabel, useVoicesCopy, useVoicesLocale } from './copy';
import { fetchDetail, formatDate, formatDateTime, formatMoney, VoicesApiError, voicesKeys } from './lib';
import { RatingStars } from './rating-stars';
import { RemedyPanel } from './remedy-panel';
import { ReviewComposer } from './review-composer';

const SENTI_CLASS = {
  positive: 'decoration-success',
  negative: 'decoration-danger',
  neutral: 'decoration-fg-subtle',
} as const;

function Section({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      <h3 className="qx-small flex items-center gap-1.5 font-semibold text-fg">
        {icon ? <span aria-hidden className="text-fg-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailBody({ d }: { d: VoiceDetail }) {
  const copy = useVoicesCopy();
  const locale = useVoicesLocale();
  const [editing, setEditing] = useState(false);

  const journey: TimelineEvent[] = d.journey.map((e) => ({
    id: e.id,
    at: e.at,
    title: copy.journey[e.kind] ?? e.kind,
    description:
      e.kind === 'remedy_credited' && e.detail
        ? copy.creditedDetail(e.detail)
        : e.kind === 'remedy_accepted' && e.detail
          ? e.detail
          : undefined,
    tone: e.kind === 'remedy_expired' ? 'neutral' : e.kind.startsWith('remedy') ? 'brand' : 'success',
    icon: e.kind === 'replied' ? Reply : e.kind.startsWith('remedy') ? Gift : CheckCircle2,
  }));

  return (
    <div className="space-y-6">
      {/* İşletme başlığı + mekân sayfası (tekrar ziyaret, teklifler, yol tarifi) */}
      <div className="flex items-center gap-3">
        <BusinessAvatar business={d.business} />
        <div className="min-w-0 flex-1">
          <p className="qx-body truncate font-semibold text-fg">{d.business.name}</p>
          {d.place ? <p className="qx-caption truncate text-fg-muted">{d.place}</p> : null}
        </div>
        {d.business.id ? (
          <Link
            href={`/customer/places/${encodeURIComponent(d.business.id)}`}
            className="qx-small inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copy.viewPlace}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {/* Makbuz (yalnız tüketim) */}
      {d.consumption ? (
        <div className="flex items-start gap-3 rounded-card border border-subtle bg-surface-muted/50 p-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface-1 text-lg">
            {d.consumption.product?.icon || <Receipt className="h-5 w-5 text-fg-muted" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="qx-caption text-fg-muted">{copy.receipt}</p>
            <p className="qx-small font-medium text-fg">{d.consumption.product?.name ?? d.business.name}</p>
            <p className="qx-caption text-fg-muted">
              <time dateTime={d.consumption.createdAt}>{formatDateTime(d.consumption.createdAt, locale)}</time>
              {d.consumption.product?.category ? ` · ${d.consumption.product.category}` : ''}
            </p>
            {d.consumption.note ? (
              <p className="qx-caption mt-1 text-fg-muted">
                {copy.businessNote}: <span className="text-fg">{d.consumption.note}</span>
              </p>
            ) : null}
          </div>
          {d.consumption.amount != null ? (
            <p className="qx-small qx-num shrink-0 font-semibold text-fg" aria-label={`${copy.amount}: ${formatMoney(d.consumption.amount, locale)}`}>
              {formatMoney(d.consumption.amount, locale)}
            </p>
          ) : null}
        </div>
      ) : null}

      {d.moderated ? (
        <div className="flex items-start gap-3 rounded-card border border-warning-border bg-warning-subtle/50 p-3">
          <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="qx-small font-medium text-fg">{copy.moderatedTitle}</p>
            <p className="qx-caption mt-0.5 text-fg-muted">{copy.moderatedBody}</p>
          </div>
        </div>
      ) : null}

      {/* Yazma (yorumsuz tüketim) — birincil aksiyon en üstte */}
      {d.composer?.mode === 'create' && d.consumptionId ? (
        <Section title={copy.composerTitle} icon={<Pencil />}>
          <ReviewComposer consumptionId={d.consumptionId} mode="create" reward={d.composer.reward} />
        </Section>
      ) : null}

      {/* Bekleyen telafi — aksiyon */}
      {d.remedies
        .filter((r) => r.status === 'pending')
        .map((r) => (
          <RemedyPanel key={r.id} remedy={r} business={d.business} />
        ))}

      {/* Senin sesin */}
      {d.voice ? (
        <Section title={copy.yourVoiceCard}>
          {editing && d.composer?.mode === 'edit' && d.consumptionId ? (
            <div className="rounded-card border border-subtle p-card">
              <p className="qx-small mb-3 font-medium text-fg">{copy.composerEditTitle}</p>
              <ReviewComposer
                consumptionId={d.consumptionId}
                mode="edit"
                reward={null}
                initial={{ rating: d.voice.rating, text: d.voice.text, dimensions: d.voice.dimensions }}
                onDone={() => setEditing(false)}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <div className="rounded-card border border-subtle bg-surface-1 p-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <RatingStars value={d.voice.rating} size="md" />
                <time dateTime={d.voice.createdAt} className="qx-caption text-fg-muted">
                  {formatDateTime(d.voice.createdAt, locale)}
                </time>
              </div>
              {d.voice.text ? (
                <p className="qx-body mt-3 whitespace-pre-wrap break-words text-fg">{d.voice.text}</p>
              ) : (
                <p className="qx-small mt-3 italic text-fg-muted">{copy.noText}</p>
              )}
              {d.voice.dimensions ? (
                <dl className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {Object.entries(d.voice.dimensions).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2 rounded-control bg-surface-muted/60 px-2.5 py-1.5">
                      <dt className="qx-caption text-fg-muted">{copy.dimensions[k] ?? k}</dt>
                      <dd>
                        <RatingStars value={v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {d.voice.media.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {d.voice.media.map((src, i) => (
                    <li key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- kullanıcının yüklediği medya (R2/https) */}
                      <img src={src} alt={copy.mediaAlt(i + 1)} loading="lazy" decoding="async" className="h-20 w-20 rounded-control border border-subtle object-cover" />
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.reward && d.reward.points > 0 ? (
                <p className="qx-caption mt-3 flex items-center gap-1.5 font-medium text-brand">
                  <Sparkles aria-hidden className="h-3.5 w-3.5" />
                  {copy.rewardLine(d.reward.points, d.reward.xp)}
                </p>
              ) : null}
              {d.composer?.mode === 'edit' ? (
                <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden className="h-4 w-4" />
                  {copy.editReview}
                </Button>
              ) : null}
            </div>
          )}
        </Section>
      ) : null}

      {/* İşletme yanıtı */}
      {d.reply ? (
        <Section title={copy.replyTitle} icon={<MessageSquareReply />}>
          <figure className="rounded-card border border-success-border bg-success-subtle/40 p-card">
            <figcaption className="flex items-center gap-2">
              <BusinessAvatar business={d.business} size="sm" />
              <span className="min-w-0">
                <span className="qx-small block truncate font-medium text-fg">{d.business.name}</span>
                {d.reply.at ? (
                  <time dateTime={d.reply.at} className="qx-caption block text-fg-muted">
                    {formatDateTime(d.reply.at, locale)}
                  </time>
                ) : null}
              </span>
            </figcaption>
            <blockquote className="qx-body mt-2 whitespace-pre-wrap break-words text-fg">{d.reply.text}</blockquote>
          </figure>
        </Section>
      ) : null}

      {/* Diğer telafiler (kabul edilmiş / süresi dolmuş) */}
      {d.remedies.some((r) => r.status !== 'pending') ? (
        <Section title={copy.remedyTitle} icon={<Gift />}>
          <div className="space-y-2">
            {d.remedies
              .filter((r) => r.status !== 'pending')
              .map((r) => (
                <RemedyPanel key={r.id} remedy={r} business={d.business} />
              ))}
          </div>
        </Section>
      ) : null}

      {/* Yolculuk */}
      {journey.length > 0 ? (
        <Section title={copy.journeyTitle}>
          <Timeline events={journey} ariaLabel={copy.journeyAria} timeStyle="datetime" animate />
          {d.stage !== 'replied' && d.voice ? (
            <div className="flex items-start gap-2 rounded-control border border-dashed border-subtle px-3 py-2.5">
              <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
              <div>
                <p className="qx-small text-fg">{copy.awaitingReply}</p>
                {d.expectation ? (
                  <p className="qx-caption text-fg-muted">
                    {copy.expectation(d.expectation.medianHours)} · {copy.expectationSample(d.expectation.sample)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* AI ne anladı (QR; modül açıksa ve analiz varsa) */}
      {d.analysis ? (
        <Section title={copy.analysisTitle} icon={<Bot />}>
          <div className="space-y-3 rounded-card border border-subtle bg-surface-muted/40 p-card">
            <p className="qx-caption text-fg-muted">{copy.analysisHint}</p>
            {d.analysis.summary ? <p className="qx-small text-fg">{d.analysis.summary}</p> : null}
            {d.analysis.statements.length > 0 ? (
              <div>
                <p className="qx-caption font-medium text-fg-muted">{copy.analysisStatements}</p>
                <ul className="mt-1 space-y-1">
                  {d.analysis.statements.map((s, i) => (
                    <li key={i} className="qx-small flex items-start gap-2 text-fg">
                      <span className="qx-caption mt-0.5 shrink-0 rounded-full bg-surface-1 px-1.5 text-fg-muted">
                        {s.sentiment === 'positive' ? copy.positive : s.sentiment === 'negative' ? copy.negative : copy.neutral}
                      </span>
                      <span className={cn('underline decoration-2 underline-offset-4', SENTI_CLASS[s.sentiment])}>{s.statement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.analysis.themes.length > 0 || d.analysis.topics.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={copy.analysisThemes}>
                {d.analysis.themes.map((t, i) => (
                  <li key={`t${i}`} className="qx-caption rounded-full bg-surface-1 px-2.5 py-1 text-fg ring-1 ring-inset ring-border">
                    {t.theme}
                  </li>
                ))}
                {d.analysis.topics.map((t) => (
                  <li key={t} className="qx-caption rounded-full bg-brand-subtle px-2.5 py-1 text-brand ring-1 ring-inset ring-brand-border">
                    {topicLabel(t, locale)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Section>
      ) : null}

      <p className="qx-caption text-fg-subtle">
        {d.place ? `${d.place} · ` : ''}
        {d.voice ? formatDate(d.voice.createdAt, locale) : d.consumption ? formatDate(d.consumption.createdAt, locale) : ''}
      </p>
    </div>
  );
}

/**
 * Çekmece içeriği: kendi sorgusu + QueryState. Yanıt beklenirken sayfa görünürken dakikada
 * bir yenilenir (işletme yanıt verince adım canlı yeşile döner); odakta da yenilenir.
 */
export function VoiceDetailBody({ voiceKey }: { voiceKey: string }) {
  const copy = useVoicesCopy();
  const q = useQuery({
    queryKey: voicesKeys.detail(voiceKey),
    queryFn: ({ signal }) => fetchDetail(voiceKey, signal),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.voice && d.stage !== 'replied' ? 60_000 : false;
    },
    retry: (count, err) => !(err instanceof VoicesApiError && (err.status === 404 || err.status === 403)) && count < 2,
  });

  if (q.isError && q.error instanceof VoicesApiError && q.error.status === 404) {
    return <EmptyState variant="permission" icon={ShieldAlert} title={copy.removedTitle} description={q.error.message} compact />;
  }

  return (
    <QueryState query={q} skeleton="detail" loadingLabel={copy.loading} error={{ title: copy.errorTitle }}>
      {(d) => <DetailBody d={d} />}
    </QueryState>
  );
}
