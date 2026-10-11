'use client';

/**
 * Kart sistemi: dönem içi hareket (aktivasyon, blok, tüketim, yorum, yorumlanma oranı) önceki
 * döneme göre; envanter ayrıca "tüm zamanlar" etiketiyle (rapor #35: dönem uygulanmıyordu ve
 * belirtilmiyordu). #38: sorgu hatası artık yutulup "Kart Sistemi Aktif Değil" gösterilmiyor;
 * hata görünür (QueryState), gerçekten kart yoksa dürüst boş durum.
 */
import { Ban, CreditCard, MessageSquare, Percent, ShoppingBag } from 'lucide-react';
import { MetricGrid, MetricTile, type MetricValue } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import type { AdminCards, Comparison } from '@/lib/admin-analytics/types';
import { fmtNumber, useAdminAnalyticsCopy, useAdminAnalyticsLocale } from './copy';

export function CardsTab({ data }: { data: AdminCards }) {
  const copy = useAdminAnalyticsCopy();
  const locale = useAdminAnalyticsLocale();
  const label = data.query.compare === 'none' ? null : data.query.compare === 'yoy' ? copy.vsYoy : copy.vsPrevious;
  const metric = (c: Comparison, opts: { points?: boolean; good?: 'up' | 'down'; percent?: boolean } = {}): MetricValue => {
    const dv = opts.points ? c.deltaAbs : c.deltaPct;
    return {
      value: c.current,
      format: opts.percent ? 'percent' : 'number',
      delta: label && dv != null ? { value: dv, kind: opts.points ? 'points' : 'percent', goodDirection: opts.good ?? 'up', label } : null,
    };
  };
  const a = data.allTime;
  const inv = [
    { key: 'unused', label: copy.cardsUnused, n: a.unused, cls: 'bg-fg-subtle' },
    { key: 'activated', label: copy.cardsActivated, n: a.activated, cls: 'bg-success' },
    { key: 'blocked', label: copy.cardsBlocked, n: a.blocked, cls: 'bg-danger' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section aria-labelledby="cards-period" className="space-y-3">
        <h2 id="cards-period" className="qx-h3 text-fg">
          {copy.cardsPeriod}
        </h2>
        <MetricGrid cols={5}>
          <MetricTile label={copy.cardsActivated} icon={<CreditCard />} tone="success" metric={metric(data.period.activated)} />
          <MetricTile label={copy.cardsBlocked} icon={<Ban />} tone="danger" metric={metric(data.period.blocked, { good: 'down' })} />
          <MetricTile label={copy.cardsConsumptions} icon={<ShoppingBag />} tone="brand" metric={metric(data.period.consumptions)} />
          <MetricTile label={copy.cardsReviews} icon={<MessageSquare />} tone="info" metric={metric(data.period.reviews)} />
          <MetricTile label={copy.cardsReviewRate} icon={<Percent />} tone="warning" metric={metric(data.period.reviewRate, { points: true, percent: true })} />
        </MetricGrid>
      </section>

      <SectionCard title={copy.cardsAllTime} description={`${copy.total}: ${fmtNumber(a.total, locale)} · ${copy.cardsArchived}: ${fmtNumber(a.archived, locale)}`}>
        {a.total === 0 ? (
          <EmptyState compact headingLevel="h3" icon={CreditCard} title={copy.cardsEmpty} />
        ) : (
          <ul className="space-y-3">
            {inv.map((i) => (
              <li key={i.key} className="grid grid-cols-[8rem_minmax(0,1fr)_5rem] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_6rem]">
                <span className="qx-small text-fg-muted">{i.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                  <span className={`block h-full rounded-full ${i.cls}`} style={{ width: `${a.total ? (i.n / a.total) * 100 : 0}%` }} />
                </span>
                <span className="qx-small text-right qx-num text-fg">{fmtNumber(i.n, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <p className="qx-caption text-fg-subtle">{copy.cardsNote}</p>
    </div>
  );
}
