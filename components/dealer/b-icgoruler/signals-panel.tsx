'use client';

import { Activity, Brain, HeartPulse, ShieldAlert, Smile, Star } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { INTENT_KEYS, type InsightsData } from '@/lib/dealer-insights/types';
import { DistBar, MeterRow } from './dist-bar';
import { formatPercent, useInsightsCopy } from './copy';

/**
 * Sinyaller — duygu/puan dağılımı (gerçek sayım), AI niyet/aciliyet/kayıp/efor sinyalleri ve
 * analiz kapsamı. Eski sayfadaki "toplu AI analizi" düğmesi kaldırıldı: bekleyen kayıtlar
 * otomatik analiz hattında işlenir; burada kapsam dürüstçe gösterilir.
 */
export function SignalsPanel({ data }: { data: InsightsData }) {
  const { copy, tag } = useInsightsCopy();
  const s = data.signals;
  const sl = copy.signals.sentimentLabel;
  const intentTotal = INTENT_KEYS.reduce((a, k) => a + s.intents[k], 0);
  const urgencyTotal = s.urgency.high + s.urgency.medium + s.urgency.low;
  const churnTotal = s.churn.high + s.churn.medium + s.churn.low;
  const emotionTotal = data.sample.withSignals;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard id="duygu" title={copy.signals.sentiment} description={copy.signals.sentimentDesc} icon={<Smile className="h-4 w-4" aria-hidden />}>
        <DistBar
          tag={tag}
          ariaLabel={copy.signals.sentiment}
          segments={[
            { key: 'positive', label: sl.positive, count: data.sentiment.positive, barClass: 'bg-success' },
            { key: 'neutral', label: sl.neutral, count: data.sentiment.neutral, barClass: 'bg-fg-subtle' },
            { key: 'negative', label: sl.negative, count: data.sentiment.negative, barClass: 'bg-danger' },
            { key: 'pending', label: sl.pending, count: data.sentiment.pending, barClass: 'bg-info' },
          ]}
        />
      </SectionCard>

      <SectionCard id="puan" title={copy.signals.rating} icon={<Star className="h-4 w-4" aria-hidden />}>
        <div className="space-y-2.5">
          {[5, 4, 3, 2, 1].map((star) => (
            <MeterRow
              key={star}
              label={copy.signals.stars(star)}
              count={data.ratingDist[star - 1]}
              total={data.sample.total}
              tag={tag}
              barClass={star >= 4 ? 'bg-success' : star === 3 ? 'bg-warning' : 'bg-danger'}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard id="niyet" title={copy.signals.intents} description={copy.signals.intentsDesc} icon={<Brain className="h-4 w-4" aria-hidden />}>
        {intentTotal === 0 ? (
          <p className="qx-small text-fg-muted">{copy.signals.noSignals}</p>
        ) : (
          <div className="space-y-2.5">
            {INTENT_KEYS.map((k) => (
              <MeterRow
                key={k}
                label={copy.signals.intent[k]}
                count={s.intents[k]}
                total={intentTotal}
                tag={tag}
                barClass={k === 'complaint' ? 'bg-danger' : k === 'praise' ? 'bg-success' : k === 'suggestion' ? 'bg-info' : 'bg-fg-subtle'}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard id="risk" title={`${copy.signals.urgency} · ${copy.signals.churn}`} icon={<HeartPulse className="h-4 w-4" aria-hidden />}>
        {urgencyTotal + churnTotal === 0 ? (
          <p className="qx-small text-fg-muted">{copy.signals.noSignals}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="qx-overline mb-2 text-fg-muted">{copy.signals.urgency}</h3>
              <div className="space-y-2.5">
                {(['high', 'medium', 'low'] as const).map((b) => (
                  <MeterRow
                    key={b}
                    label={copy.signals.bucket[b]}
                    count={s.urgency[b]}
                    total={urgencyTotal}
                    tag={tag}
                    barClass={b === 'high' ? 'bg-danger' : b === 'medium' ? 'bg-warning' : 'bg-success'}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="qx-overline mb-2 text-fg-muted">{copy.signals.churn}</h3>
              <div className="space-y-2.5">
                {(['high', 'medium', 'low'] as const).map((b) => (
                  <MeterRow
                    key={b}
                    label={copy.signals.bucket[b]}
                    count={s.churn[b]}
                    total={churnTotal}
                    tag={tag}
                    barClass={b === 'high' ? 'bg-danger' : b === 'medium' ? 'bg-warning' : 'bg-success'}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard id="duygular" title={copy.signals.emotions} icon={<Activity className="h-4 w-4" aria-hidden />}>
        {s.emotions.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.signals.noSignals}</p>
        ) : (
          <div className="space-y-2.5">
            {s.emotions.map((e) => (
              <MeterRow
                key={e.key}
                label={copy.signals.emotion[e.key] ?? e.key}
                count={e.count}
                total={Math.max(emotionTotal, e.count)}
                tag={tag}
                barClass="bg-brand"
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard id="kapsam" title={copy.signals.coverage} icon={<ShieldAlert className="h-4 w-4" aria-hidden />}>
        <div className="space-y-4">
          <MeterRow
            label={copy.signals.coverage}
            count={data.sample.analyzed}
            total={data.sample.withText}
            tag={tag}
            barClass="bg-brand"
          />
          <p className="qx-small text-fg-muted">{copy.signals.coverageDesc(data.sample.analyzed, data.sample.withText)}</p>
          <div className="border-t border-subtle pt-3">
            <h3 className="qx-small font-medium text-fg">{copy.signals.effort}</h3>
            {s.avgEffort == null ? (
              <p className="mt-1 qx-small text-fg-muted">{copy.signals.noSignals}</p>
            ) : (
              <>
                <p className="mt-1 qx-small text-fg-muted">{copy.signals.effortDesc(formatPercent(s.avgEffort * 100, tag), s.effortN)}</p>
                <p className="mt-1 qx-small text-fg">{copy.signals.highEffort(s.highEffort)}</p>
              </>
            )}
          </div>
          {s.toxic > 0 && <p className="qx-small text-warning">{copy.signals.toxic(s.toxic)}</p>}
        </div>
      </SectionCard>
    </div>
  );
}
