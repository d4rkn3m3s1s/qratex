/**
 * Otomatik telafi (remedy) taslağı çekirdeği — tek bir geri bildirim için onay kuyruğuna
 * RemedyOffer taslağı ekler. Gerçek zamanlı yol (analiz hattı ve AI'sız yol) ile bayinin
 * "Şimdi tara" taraması AYNI fonksiyonu kullanır (denetim bulgu 7: eskiden iki kopya mantık).
 *
 * Değişmezler:
 *  - Otomasyon ASLA doğrudan müşteriye göndermez (`mode: 'queue'`).
 *  - Bir geri bildirime HERHANGİ bir teklif açıldıysa (reddedilmiş dahil) yenisi üretilmez.
 *  - Aylık üst sınır yalnız OTOMATİK taslakları sayar (`remedy_automation_queued` olayı) ve
 *    ay sınırı Europe/Istanbul'dur.
 *  - Müşteri başına bekleme süresi: son N günde teklif almış müşteriye yeni taslak yok.
 *  - Ayar `lib/dealer-automation/remedy-config.ts` ile tek kaynaktan, tam sayı ve kırpılmış okunur.
 */
import { prisma } from '@/lib/prisma';
import { createRemedyOffer, isRemedyOfferError } from '@/lib/remedy-offer-service';
import { getRemedyOptionsForQrCode } from '@/lib/remedy-options';
import {
  istanbulMonthStart,
  parseRemedyAutomationConfig,
  remedyTrigger,
  renderRemedyMessage,
  type RemedyAutomationConfig,
} from '@/lib/dealer-automation/remedy-config';

export type { RemedyAutomationConfig };

/** Geriye uyumlu ad. */
export const parseRemedyAutomation = parseRemedyAutomationConfig;

export const REMEDY_AUTOMATION_EVENT = 'remedy_automation_queued';

export type AutoRemedySkipReason =
  | 'no_user'
  | 'disabled'
  | 'not_eligible'
  | 'monthly_limit'
  | 'already_exists'
  | 'cooldown'
  | 'no_options';

/** Bu ay (İstanbul) üretilen otomatik taslak sayısı. */
export async function countMonthlyAutoRemedies(dealerId: string, now: Date = new Date()): Promise<number> {
  return prisma.analyticsEvent.count({
    where: { userId: dealerId, event: REMEDY_AUTOMATION_EVENT, createdAt: { gte: istanbulMonthStart(now) } },
  });
}

/**
 * Tek bir feedback için otomatik remedy taslağı oluşturmayı dener.
 * Döndürür: oluşturulduysa offer id; değilse neden kodu.
 */
export async function maybeCreateAutoRemedyForFeedback(params: {
  feedbackId: string;
  dealerId: string;
  userId: string | null;
  rating: number | null;
  churnRisk?: number | null;
  /** Mekana özel telafi seçeneklerini çözmek için (opsiyonel, geriye uyumlu). */
  qrCodeId?: string | null;
  /** Çağıran ayarı zaten okuduysa (tarama) tekrar okunmaz. */
  config?: RemedyAutomationConfig;
  /** Tarama kendi bildirimini toplu verir. */
  notify?: boolean;
  trigger?: 'event' | 'scan';
}): Promise<{ created: boolean; offerId?: string; reason?: AutoRemedySkipReason }> {
  const { feedbackId, dealerId, userId, rating, churnRisk, qrCodeId } = params;
  if (!userId) return { created: false, reason: 'no_user' };

  let cfg = params.config;
  let businessName: string | null = null;
  if (!cfg) {
    const dealer = await prisma.user.findUnique({
      where: { id: dealerId },
      select: { dealerRemedyAutomation: true, businessName: true, name: true },
    });
    cfg = parseRemedyAutomationConfig(dealer?.dealerRemedyAutomation);
    businessName = dealer?.businessName || dealer?.name || null;
  }
  if (!cfg.enabled) return { created: false, reason: 'disabled' };

  const trigger = remedyTrigger(cfg, rating, churnRisk);
  if (!trigger) return { created: false, reason: 'not_eligible' };

  if ((await countMonthlyAutoRemedies(dealerId)) >= cfg.maxMonthlyAuto) return { created: false, reason: 'monthly_limit' };

  // Bu feedback için DAHA ÖNCE herhangi bir teklif açıldı mı? (reddedilmiş dahil — P0-22)
  const existing = await prisma.remedyOffer.findFirst({ where: { feedbackId }, select: { id: true } });
  if (existing) return { created: false, reason: 'already_exists' };

  if (cfg.cooldownDays > 0) {
    const recent = await prisma.remedyOffer.findFirst({
      where: { dealerId, userId, createdAt: { gte: new Date(Date.now() - cfg.cooldownDays * 86_400_000) } },
      select: { id: true },
    });
    if (recent) return { created: false, reason: 'cooldown' };
  }

  const [options, names] = await Promise.all([
    getRemedyOptionsForQrCode(dealerId, qrCodeId),
    prisma.user
      .findMany({ where: { id: { in: businessName ? [userId] : [userId, dealerId] } }, select: { id: true, name: true, businessName: true } })
      .catch(() => [] as Array<{ id: string; name: string | null; businessName: string | null }>),
  ]);
  const customer = names.find((u) => u.id === userId);
  const dealerRow = names.find((u) => u.id === dealerId);
  const message = renderRemedyMessage(cfg.messageTemplate, {
    musteri: customer?.name ?? null,
    isletme: businessName ?? dealerRow?.businessName ?? dealerRow?.name ?? null,
  });

  let offerId: string;
  try {
    const created = await createRemedyOffer({
      source: { kind: 'feedback', feedbackId },
      dealerId,
      userId,
      message,
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

  await prisma.analyticsEvent.create({
    data: {
      userId: dealerId,
      event: REMEDY_AUTOMATION_EVENT,
      category: 'dealer',
      data: { feedbackId, offerId, trigger, via: params.trigger ?? 'event' },
    },
  });

  if (params.notify !== false) {
    await prisma.notification.create({
      data: {
        userId: dealerId,
        title: 'Otomatik telafi taslağı hazır',
        message:
          trigger === 'high_churn'
            ? 'Yüksek kayıp riski tespit edilen bir yorum için telafi taslağı onay kuyruğunda.'
            : 'Düşük puanlı bir yorum için telafi taslağı onay kuyruğunda.',
        type: 'info',
        // Gelen Kutusu → Telafi onayı'nda taslağın detay çekmecesine derin link (denetim B12).
        data: { type: 'remedy_draft', module: 'remedy_offers', offerId, feedbackId, ctaPath: `/dealer/inbox/remedy?id=${offerId}` },
      },
    });
  }

  return { created: true, offerId };
}

/**
 * AI analizi YAPILMAYAN geri bildirim (metinsiz yalnız-puan, AI'ı kapalı bayi) için gerçek
 * zamanlı puan tetiği (denetim bulgu 5). Analiz hattı başarılıysa taslağı zaten o üretir;
 * buradaki çağrı idempotenttir (mevcut teklif kontrolü + servis kilidi). Asla fırlatmaz.
 */
export async function maybeCreateAutoRemedyForFeedbackId(feedbackId: string): Promise<void> {
  try {
    const f = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, userId: true, rating: true, churnRisk: true, deletedAt: true, qrCodeId: true, qrCode: { select: { dealerId: true } } },
    });
    if (!f || f.deletedAt || !f.qrCode) return;
    await maybeCreateAutoRemedyForFeedback({
      feedbackId: f.id,
      dealerId: f.qrCode.dealerId,
      userId: f.userId,
      rating: f.rating,
      churnRisk: f.churnRisk,
      qrCodeId: f.qrCodeId,
    });
  } catch (err) {
    console.error('[REMEDY_AUTOMATION] gerçek zamanlı taslak denenemedi:', err);
  }
}
