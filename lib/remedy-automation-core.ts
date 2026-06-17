/**
 * Otomatik telafi (remedy) taslağı çekirdeği — tek bir feedback için onay
 * kuyruğuna RemedyOffer taslağı ekler. Hem batch (apply-scan) hem feedback
 * analiz pipeline'ı (yüksek churn anında) bunu kullanır.
 *
 * `User.dealerRemedyAutomation` config'i şemada vardı ama analiz pipeline'ı
 * yalnızca bildirim atıp bırakıyordu — döngü burada kapanır.
 */
import { prisma } from '@/lib/prisma';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';

export interface RemedyAutomationConfig {
  enabled: boolean;
  minRating: number;
  maxPerRun: number;
  maxMonthlyAuto: number;
  messageTemplate: string;
}

const DEFAULTS: RemedyAutomationConfig = {
  enabled: false,
  minRating: 2,
  maxPerRun: 5,
  maxMonthlyAuto: 40,
  messageTemplate:
    'Deneyiminiz için özür dileriz. Aşağıdan telafi türü ve miktarınızı seçin (otomatik teklif).',
};

const DEFAULT_OPTIONS = [
  { type: 'discount', label: 'İndirim', unit: '%', values: [10, 15, 20] },
  { type: 'points', label: 'Puan', unit: 'puan', values: [50, 100, 150] },
];

export function parseRemedyAutomation(raw: unknown): RemedyAutomationConfig {
  const base = { ...DEFAULTS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
    if (typeof o.minRating === 'number') base.minRating = o.minRating;
    if (typeof o.maxPerRun === 'number') base.maxPerRun = o.maxPerRun;
    if (typeof o.maxMonthlyAuto === 'number') base.maxMonthlyAuto = o.maxMonthlyAuto;
    if (typeof o.messageTemplate === 'string') base.messageTemplate = o.messageTemplate;
  }
  return base;
}

function monthStartUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Tek bir feedback için otomatik remedy taslağı oluşturmayı dener.
 * Koşullar: otomasyon açık, kullanıcı var, puan eşiği altında, bu feedback için
 * açık teklif yok, aylık limit aşılmamış. Döndürür: oluşturulan offer id veya null.
 */
export async function maybeCreateAutoRemedyForFeedback(params: {
  feedbackId: string;
  dealerId: string;
  userId: string | null;
  rating: number;
  churnRisk?: number | null;
}): Promise<{ created: boolean; offerId?: string; reason?: string }> {
  const { feedbackId, dealerId, userId, rating, churnRisk } = params;
  if (!userId) return { created: false, reason: 'no_user' };

  const dealer = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { dealerRemedyAutomation: true },
  });
  const cfg = parseRemedyAutomation(dealer?.dealerRemedyAutomation);
  if (!cfg.enabled) return { created: false, reason: 'disabled' };

  // Tetik: düşük puan VEYA yüksek churn riski.
  const lowRating = rating <= cfg.minRating;
  const highChurn = typeof churnRisk === 'number' && churnRisk >= 0.7;
  if (!lowRating && !highChurn) return { created: false, reason: 'not_eligible' };

  // Aylık otomatik limit.
  const monthCount = await prisma.remedyOffer.count({
    where: {
      dealerId,
      createdAt: { gte: monthStartUTC() },
      status: { in: ['awaiting_dealer_approval', 'pending', 'accepted'] },
    },
  });
  if (monthCount >= cfg.maxMonthlyAuto) return { created: false, reason: 'monthly_limit' };

  // Bu feedback için zaten açık teklif var mı?
  const existing = await prisma.remedyOffer.findFirst({
    where: { feedbackId, status: { in: ['pending', 'awaiting_dealer_approval', 'accepted'] } },
    select: { id: true },
  });
  if (existing) return { created: false, reason: 'already_exists' };

  const offer = await prisma.remedyOffer.create({
    data: {
      feedbackId,
      dealerId,
      userId,
      message: cfg.messageTemplate,
      status: 'awaiting_dealer_approval',
      options: DEFAULT_OPTIONS as object,
    },
  });

  await appendRemedyTimelineEvent(prisma, offer.id, 'created', 'Otomasyon ile telafi taslağı oluşturuldu', {
    preview: cfg.messageTemplate.slice(0, 120),
    trigger: highChurn ? 'high_churn' : 'low_rating',
  });
  await appendRemedyTimelineEvent(prisma, offer.id, 'queued', 'Onay kuyruğunda');

  await prisma.analyticsEvent.create({
    data: {
      userId: dealerId,
      event: 'remedy_automation_queued',
      category: 'dealer',
      data: { feedbackId, offerId: offer.id, trigger: highChurn ? 'high_churn' : 'low_rating' },
    },
  });

  // Bayiye onay kuyruğu bildirimi.
  await prisma.notification.create({
    data: {
      userId: dealerId,
      title: 'Otomatik telafi taslağı hazır',
      message: highChurn
        ? 'Yüksek kayıp riski tespit edilen bir yorum için telafi taslağı onay kuyruğunda.'
        : 'Düşük puanlı bir yorum için telafi taslağı onay kuyruğunda.',
      type: 'info',
      data: { offerId: offer.id, feedbackId },
    },
  });

  return { created: true, offerId: offer.id };
}
