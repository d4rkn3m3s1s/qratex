/**
 * b-asistan — veriden türeyen soru önerileri (saf; jest'li).
 *
 * Statik "son haftayı özetle" çipleri yerine (ai-chat Bulgu 7, ask-analytics Bulgu 6) yalnız
 * verinin gerçekten cevaplayabildiği sorular önerilir: girdi Analitik ile aynı özet yükleyicinin
 * çıktısıdır. Veri yoksa öneri yok (arayüz onboarding boş durumunu gösterir; AI maliyeti yok).
 */
import { RATING_MIN_N } from '@/lib/dealer-analytics/core';
import type { AnalyticsOverview } from '@/lib/dealer-analytics/types';
import type { AssistantPeriod, AssistantSuggestion } from './types';

export interface SuggestionInput {
  period: AssistantPeriod;
  overview: Pick<AnalyticsOverview, 'kpis' | 'topics' | 'anomalies' | 'qr' | 'hasAnyData'>;
  /** Dönemdeki yüksek kayıp riskli yorum sayısı (null: hesaplanamadı). */
  highChurn: number | null;
}

const MAX_SUGGESTIONS = 4;

export function buildSuggestions({ period, overview, highChurn }: SuggestionInput): AssistantSuggestion[] {
  if (!overview.hasAnyData) return [];
  const out: AssistantSuggestion[] = [];
  const push = (s: Omit<AssistantSuggestion, 'id' | 'period'>) => {
    if (out.length >= MAX_SUGGESTIONS || out.some((o) => o.kind === s.kind)) return;
    out.push({ ...s, id: `${s.kind}:${Object.values(s.params).join(':')}`, period });
  };

  const volume = overview.kpis.volume.value ?? 0;
  const avg = overview.kpis.avgRating;
  const avgDelta = avg.delta && avg.delta.kind === 'absolute' ? avg.delta.value : null;
  if (avg.value != null && avgDelta != null && (avg.n ?? 0) >= RATING_MIN_N) {
    const prev = Math.round((avg.value - avgDelta) * 10) / 10;
    const cur = Math.round(avg.value * 10) / 10;
    if (avgDelta <= -0.2) push({ kind: 'rating_drop', params: { from: prev, to: cur } });
    else if (avgDelta >= 0.2) push({ kind: 'rating_rise', params: { from: prev, to: cur } });
  }

  const spike = [...overview.anomalies].filter((a) => a.kind === 'negative_spike').sort((a, b) => b.day.localeCompare(a.day))[0];
  if (spike) push({ kind: 'negative_spike', params: { day: spike.day, count: spike.value } });

  const rising = overview.topics.find(
    (t) => t.count >= 5 && t.compareCount != null && t.compareCount > 0 && t.count >= t.compareCount * 1.5 && t.negative > t.positive,
  );
  if (rising) push({ kind: 'rising_topic', params: { topic: rising.key, count: rising.count, prev: rising.compareCount ?? 0 } });

  const fix = overview.topics.find((t) => t.quadrant === 'fix' && t.key !== rising?.key);
  if (fix) push({ kind: 'fix_topic', params: { topic: fix.key, count: fix.count } });

  if (highChurn != null && highChurn > 0) push({ kind: 'churn', params: { count: highChurn } });

  const rated = overview.qr.filter((r) => !r.archived && r.feedbacks >= 5 && r.bayesRating != null);
  if (rated.length >= 2 && avg.value != null) {
    const weakest = [...rated].sort((a, b) => (a.bayesRating ?? 5) - (b.bayesRating ?? 5))[0];
    if ((weakest.bayesRating ?? 5) <= avg.value - 0.3) push({ kind: 'weak_location', params: { name: weakest.locationName ?? weakest.name } });
  }

  if (volume > 0) {
    push({ kind: 'priorities', params: {} });
    const strength = overview.topics.find((t) => t.quadrant === 'strength');
    if (strength) push({ kind: 'strengths', params: { topic: strength.key } });
  }
  return out;
}
