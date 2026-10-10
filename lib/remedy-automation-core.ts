/**
 * Otomatik telafi (remedy) taslağı çekirdeği — tek bir feedback için onay
 * kuyruğuna RemedyOffer taslağı ekler. Hem batch (apply-scan) hem feedback
 * analiz pipeline'ı (yüksek churn anında) bunu kullanır.
 *
 * `User.dealerRemedyAutomation` config'i şemada vardı ama analiz pipeline'ı
 * yalnızca bildirim atıp bırakıyordu — döngü burada kapanır.
 */
import { prisma } from '@/lib/prisma';
import { createRemedyOffer, isRemedyOfferError } from '@/lib/remedy-offer-service';
import { getRemedyOptionsForQrCode } from '@/lib/remedy-options';

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

export function parseRemedyAutomation(raw: unknown): RemedyAutomationConfig {
  const base = { ...DEFAULTS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
    if (typeof o.minRating === 'number') base.minRating = o.minRating;
    if (typeof o.maxPerRun === 'number') base.maxPerRun = o.maxPerRun;
    if (typeof o.maxMonthlyAuto === 'number') base.maxMonthlyAuto = o.maxMonthlyAuto;
    if (typeof o.messageTemplate === 'string' && o.messageTemplate.trim()) {
      base.messageTemplate = o.messageTemplate.trim().slice(0, 500);
    }
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
 * daha önce (reddedilmiş dahil) teklif yok, aylık limit aşılmamış. Döndürür: oluşturulan offer id veya null.
 */
export async function maybeCreateAutoRemedyForFeedback(params: {
  feedbackId: string;
  dealerId: string;
  userId: string | null;
  rating: number;
  churnRisk?: number | null;
  /** Mekana özel telafi seçeneklerini çözmek için (opsiyonel, geriye uyumlu). */
  qrCodeId?: string | null;
}): Promise<{ created: boolean; offerId?: string; reason?: string }> {
  const { feedbackId, dealerId, userId, rating, churnRisk, qrCodeId } = params;
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

  // Bu feedback için DAHA ÖNCE herhangi bir teklif açıldı mı? (P0-22 / bayi P0-10)
  // `rejected` da sayılır: bayinin açıkça reddettiği taslak otomasyonla yeniden üretilmez;
  // `expired`/`accepted` da — aynı yoruma ikinci otomatik telafi gitmez.
  const existing = await prisma.remedyOffer.findFirst({
    where: { feedbackId },
    select: { id: true },
  });
  if (existing) return { created: false, reason: 'already_exists' };

  // Telafi seçenekleri: mekana/işletmeye özel şablonlardan (yoksa varsayılan).
  const options = await getRemedyOptionsForQrCode(dealerId, qrCodeId);
  const trigger = highChurn ? 'high_churn' : 'low_rating';

  let offerId: string;
  try {
    const created = await createRemedyOffer({
      source: { kind: 'feedback', feedbackId },
      dealerId,
      userId,
      message: cfg.messageTemplate,
      mode: 'queue', // otomasyon ASLA doğrudan müşteriye göndermez
      options,
      createdLabel: 'Otomasyon ile telafi taslağı oluşturuldu',
      createdMeta: { trigger },
    });
    offerId = created.offerId;
  } catch (err) {
    // Eşzamanlı bayi/otomasyon yarışı: servis 409 üretir → sessizce atla.
    if (isRemedyOfferError(err)) {
      return { created: false, reason: err.code === 'NO_OPTIONS' ? 'no_options' : 'already_exists' };
    }
    throw err;
  }
  const offer = { id: offerId };

  await prisma.analyticsEvent.create({
    data: {
      userId: dealerId,
      event: 'remedy_automation_queued',
      category: 'dealer',
      data: { feedbackId, offerId: offer.id, trigger },
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
      // Gelen Kutusu → Telafi onayı'nda taslağın detay çekmecesine derin link (denetim B12).
      data: { type: 'remedy_draft', module: 'remedy_offers', offerId: offer.id, feedbackId, ctaPath: `/dealer/inbox/remedy?id=${offer.id}` },
    },
  });

  return { created: true, offerId: offer.id };
}
