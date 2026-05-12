/**
 * Olay (incident) otomatik tetikleme: eşik aşımında sistem olayı oluşturur.
 * - Puan düşüşü: son 7 gün ort. < önceki 7 gün ort. (en az 0.5 fark, yeterli veri)
 * - Şikayet artışı: son 24 saatte 3+ düşük puan (1-2) veya negatif feedback
 * - Tekil yüksek aciliyet: son 24 saatte urgency > 0.8 veya isToxic
 */

import { prisma } from '@/lib/prisma';

const RATING_DROP_THRESHOLD = 0.5;
const MIN_FEEDBACKS_FOR_DROP = 2;
const NEGATIVE_SPIKE_COUNT = 3;
const NEGATIVE_SPIKE_HOURS = 24;
const RECENT_OPEN_DAYS = 7; // Aynı tip açık olay varsa yeni oluşturma

export type IncidentType = 'rating_drop' | 'nps_drop' | 'complaint_spike' | 'negative_spike' | 'other';

async function hasOpenIncidentOfType(dealerId: string, type: string): Promise<boolean> {
  const since = new Date();
  since.setDate(since.getDate() - RECENT_OPEN_DAYS);
  const count = await prisma.incident.count({
    where: {
      dealerId,
      type,
      status: { not: 'resolved' },
      createdAt: { gte: since },
    },
  });
  return count > 0;
}

async function createIncident(
  dealerId: string,
  type: IncidentType,
  severity: 'low' | 'medium' | 'high' | 'critical',
  title: string,
  description: string | null,
  thresholdValue: number | null
): Promise<void> {
  await prisma.incident.create({
    data: {
      dealerId,
      type,
      severity,
      status: 'open',
      title,
      description,
      thresholdValue,
    },
  });
}

/**
 * Dealer için QR feedback verilerini son 14 gün getirir (rating, sentiment, urgency, isToxic, createdAt).
 */
async function getDealerFeedbackStats(dealerId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const feedbacks = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      qrCode: { dealerId },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      rating: true,
      sentiment: true,
      urgency: true,
      isToxic: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return feedbacks;
}

/**
 * Eşik aşımı varsa otomatik olay oluşturur. Çağıran GET /api/dealer/incidents vb.
 */
export async function runIncidentDetection(dealerId: string): Promise<{ created: string[] }> {
  const created: string[] = [];
  const now = new Date();
  const last7Start = new Date(now);
  last7Start.setDate(last7Start.getDate() - 7);
  const prev7Start = new Date(now);
  prev7Start.setDate(prev7Start.getDate() - 14);
  const last24hStart = new Date(now.getTime() - NEGATIVE_SPIKE_HOURS * 60 * 60 * 1000);

  const feedbacks = await getDealerFeedbackStats(dealerId);
  const last7 = feedbacks.filter((f) => new Date(f.createdAt) >= last7Start);
  const prev7 = feedbacks.filter(
    (f) => new Date(f.createdAt) >= prev7Start && new Date(f.createdAt) < last7Start
  );
  const last24h = feedbacks.filter((f) => new Date(f.createdAt) >= last24hStart);

  // 1) Puan düşüşü: son 7 gün ort. < önceki 7 gün ort. (en az 0.5)
  if (last7.length >= MIN_FEEDBACKS_FOR_DROP && prev7.length >= MIN_FEEDBACKS_FOR_DROP) {
    const avgLast7 = last7.reduce((s, f) => s + f.rating, 0) / last7.length;
    const avgPrev7 = prev7.reduce((s, f) => s + f.rating, 0) / prev7.length;
    const drop = avgPrev7 - avgLast7;
    if (drop >= RATING_DROP_THRESHOLD && !(await hasOpenIncidentOfType(dealerId, 'rating_drop'))) {
      const severity: 'low' | 'medium' | 'high' | 'critical' =
        drop >= 1.5 ? 'high' : drop >= 1 ? 'medium' : 'low';
      await createIncident(
        dealerId,
        'rating_drop',
        severity,
        'Puan düşüşü tespit edildi',
        `Son 7 gün ortalama puan: ${avgLast7.toFixed(1)}, önceki 7 gün: ${avgPrev7.toFixed(1)}. Fark: -${drop.toFixed(1)}.`,
        Math.round(avgLast7 * 10) / 10
      );
      created.push('rating_drop');
    }
  }

  // 2) Şikayet artışı: son 24 saatte 3+ düşük puan (1-2) veya negatif
  const lowIn24h = last24h.filter((f) => f.rating <= 2 || f.sentiment === 'negative');
  if (
    lowIn24h.length >= NEGATIVE_SPIKE_COUNT &&
    !(await hasOpenIncidentOfType(dealerId, 'complaint_spike'))
  ) {
    const severity: 'low' | 'medium' | 'high' | 'critical' =
      lowIn24h.length >= 6 ? 'high' : lowIn24h.length >= 4 ? 'medium' : 'low';
    await createIncident(
      dealerId,
      'complaint_spike',
      severity,
      'Son 24 saatte şikayet artışı',
      `Son 24 saatte ${lowIn24h.length} adet düşük puan veya negatif geri bildirim.`,
      lowIn24h.length
    );
    created.push('complaint_spike');
  }

  // 3) Yüksek aciliyet veya toksik: son 24 saatte tek bir yorum bile olsa olay aç
  const urgentOrToxic = last24h.filter(
    (f) => f.isToxic || (f.urgency != null && f.urgency >= 0.8)
  );
  if (
    urgentOrToxic.length > 0 &&
    !(await hasOpenIncidentOfType(dealerId, 'negative_spike'))
  ) {
    await createIncident(
      dealerId,
      'negative_spike',
      urgentOrToxic.some((f) => f.isToxic) ? 'high' : 'medium',
      'Yüksek aciliyet veya toksik içerik tespit edildi',
      `Son 24 saatte ${urgentOrToxic.length} yüksek aciliyetli veya toksik geri bildirim.`,
      null
    );
    created.push('negative_spike');
  }

  return { created };
}

/**
 * Hiç olay yoksa ve yeterli geri bildirim de yoksa demo amaçlı tek bir "bilgi" olayı oluşturur (sayfa boş kalmasın).
 */
export async function ensureDemoIncidentIfEmpty(dealerId: string): Promise<boolean> {
  const count = await prisma.incident.count({ where: { dealerId } });
  if (count > 0) return false;
  await createIncident(
    dealerId,
    'other',
    'low',
    'Olaylar / Kriz Radarı',
    'Eşik aşımında (puan düşüşü, şikayet artışı, yüksek aciliyet) otomatik olaylar burada listelenir. Manuel olay da ekleyebilirsiniz.',
    null
  );
  return true;
}
