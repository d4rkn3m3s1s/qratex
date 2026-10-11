/**
 * Konsey "veri paketi": oturum başında BİR KEZ toplanır, AgentRun.context'e yazılır ve
 * uzmanların istemine eklenir. Harper bu paketin dışında sayı uyduramaz (istemde yasak).
 * Kapsam: tüm platform ya da tek bayi (bayi kapsamında yalnız o bayinin QR'larından gelen
 * geri bildirim + o bayinin açık aksiyonları/şüpheli kayıtları).
 */
import { prisma } from '@/lib/prisma';
import type { DataMetric, DataPack, SessionScope } from '@/lib/council/contract';
import { scopeLabel } from '@/lib/council/contract';

const WINDOW_DAYS = 30;

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export async function buildDataPack(scope: SessionScope, now = new Date()): Promise<DataPack> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const dealerId = scope.kind === 'dealer' ? scope.dealerId : null;
  const fbWhere = {
    createdAt: { gte: since },
    deletedAt: null,
    ...(dealerId ? { qrCode: { dealerId } } : {}),
  };

  const [feedbackCount, ratingAgg, negativeCount, highChurn, openActions, suspicious] = await Promise.all([
    prisma.feedback.count({ where: fbWhere }),
    prisma.feedback.aggregate({ where: fbWhere, _avg: { rating: true } }),
    prisma.feedback.count({ where: { ...fbWhere, sentiment: 'negative' } }),
    prisma.feedback.count({ where: { ...fbWhere, churnRisk: { gte: 0.7 } } }),
    prisma.actionItem.count({
      where: { status: { in: ['pending', 'assigned', 'in_progress'] }, ...(dealerId ? { dealerId } : {}) },
    }),
    prisma.suspiciousActivity.count({ where: { isResolved: false, ...(dealerId ? { dealerId } : {}) } }),
  ]);

  const avg = ratingAgg._avg.rating;
  const metrics: DataMetric[] = [
    { key: 'feedback_30g', label: 'Geri bildirim (30 gün)', value: feedbackCount, unit: 'adet' },
    { key: 'puan_ort_30g', label: 'Ortalama puan (30 gün)', value: avg == null ? 0 : Math.round(avg * 100) / 100, unit: '/5' },
    { key: 'negatif_oran_30g', label: 'Negatif duygu oranı (30 gün)', value: pct(negativeCount, feedbackCount), unit: '%' },
    { key: 'yuksek_churn_30g', label: 'Yüksek kayıp riski taşıyan geri bildirim (30 gün)', value: highChurn, unit: 'adet' },
    { key: 'acik_aksiyon', label: 'Açık aksiyon maddesi', value: openActions, unit: 'adet' },
    { key: 'acik_supheli', label: 'Çözülmemiş şüpheli kayıt', value: suspicious, unit: 'adet' },
  ];
  if (avg == null) {
    // Ortalama tanımsızsa 0 göstermek yanıltır: metrik çıkarılır, istem "veri yok" der.
    metrics.splice(1, 1);
  }

  return { scopeLabel: scopeLabel(scope), windowDays: WINDOW_DAYS, generatedAt: now.toISOString(), metrics };
}

/** İstemde kullanılan veri bloğu. */
export function dataPackPrompt(pack: DataPack | null): string {
  if (!pack) return 'Veri paketi: bu oturumda platform verisi kullanılmıyor (ayarlardan kapalı). Sayı verme; nitel konuş.';
  if (pack.metrics.length === 0) return 'Veri paketi boş. Sayı verme.';
  const lines = pack.metrics.map((m) => `- ${m.key} (${m.label}): ${m.value}${m.unit && m.unit !== 'adet' ? m.unit : ''}`);
  return (
    `Veri paketi (${pack.scopeLabel}, son ${pack.windowDays} gün). Bu dışında sayı UYDURMA; ` +
    `bir sayı kullanırsan anahtarını parantez içinde belirt (ör. "(negatif_oran_30g)"):\n${lines.join('\n')}`
  );
}
