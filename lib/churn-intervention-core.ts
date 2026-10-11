/**
 * Tahminsel churn müdahalesi — bayinin riskli (yüksek churn + uzun süredir pasif)
 * müşterilerini tespit edip bayiyi uyarır ve (config açıksa) o müşteriye ÖZEL teklif
 * taslağı hazırlar.
 *
 * Bayinin elle yaptığı "riskli müşteri yakala → teklif gönder" işini otomatikleştirir.
 * Veri kaynağı: YALNIZ bu bayinin verisi (`listDealerAtRiskCustomers` — Consumption +
 * Feedback/ConsumptionReview churn sinyalleri, bayi kapsamlı). Platform geneli CLV OKUNMAZ (P0-12).
 *
 * P0-22 / bayi D8: Eskiden her riskli müşteri için müşteri alanı OLMAYAN bir
 * `DealerFlashOffer` taslağı açılıyordu; bayi aktive edince teklif konuma göre yakındaki
 * HERKESE görünüyordu (marj kaybı, "kişiye özel" vaadi sahte). Artık teklif, hedef
 * müşteriye (`RemedyOffer.userId`) bağlı kaynaksız kişisel teklif olarak onay kuyruğuna
 * (`awaiting_dealer_approval`) düşer: bayi onaylamadan kimse görmez; onaylanınca YALNIZ o
 * müşteri bildirim alır ve kendi seçenek allowlist'inden seçer. Müşteri başına aynı anda
 * tek açık kişisel teklif (servis + kısmi unique index).
 */
import { prisma } from '@/lib/prisma';
import { getRemedyOptions } from '@/lib/remedy-options';
import { createRemedyOffer, isRemedyOfferError } from '@/lib/remedy-offer-service';
import { listDealerAtRiskCustomers } from '@/lib/dealer-customer-stats';

/** Kişisel geri kazanım teklifinin müşteriye görünen metni (bayi yayınlamadan önce kuyrukta görür). */
export const CHURN_PERSONAL_OFFER_MESSAGE =
  'Sizi özledik! Tekrar ağırlamak isteriz — size özel teklifinizi aşağıdan seçebilirsiniz.';

export interface ChurnInterventionConfig {
  enabled: boolean;
  churnThreshold: number; // 0-1; predictedChurn bu değerin üstündeyse riskli
  inactiveDays: number; // son ziyaretten bu kadar gün geçtiyse
  /** Ad geriye uyumluluk için korunur: true → riskli müşteriye ÖZEL teklif taslağı (onay kuyruğu). */
  autoFlashOffer: boolean;
  maxPerRun: number; // bir koşuda en fazla kaç müşteri
}

const DEFAULTS: ChurnInterventionConfig = {
  enabled: false,
  churnThreshold: 0.6,
  inactiveDays: 14,
  autoFlashOffer: false,
  maxPerRun: 20,
};

export function parseChurnInterventionConfig(raw: unknown): ChurnInterventionConfig {
  const base = { ...DEFAULTS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (typeof o.enabled === 'boolean') base.enabled = o.enabled;
    if (typeof o.churnThreshold === 'number') base.churnThreshold = Math.min(1, Math.max(0, o.churnThreshold));
    if (typeof o.inactiveDays === 'number') base.inactiveDays = Math.max(1, Math.floor(o.inactiveDays));
    if (typeof o.autoFlashOffer === 'boolean') base.autoFlashOffer = o.autoFlashOffer;
    if (typeof o.maxPerRun === 'number') base.maxPerRun = Math.min(100, Math.max(1, Math.floor(o.maxPerRun)));
  }
  return base;
}

const DAY = 24 * 60 * 60 * 1000;

/** Tek bir bayi için churn müdahalesi çalıştırır. Döner: tespit/aksiyon sayıları. */
export async function runChurnInterventionForDealer(
  dealer: { id: string; dealerChurnIntervention: unknown },
  now: Date = new Date()
): Promise<{ dealerId: string; flagged: number; offersCreated: number; skipped?: string }> {
  const cfg = parseChurnInterventionConfig(dealer.dealerChurnIntervention);
  if (!cfg.enabled) return { dealerId: dealer.id, flagged: 0, offersCreated: 0, skipped: 'disabled' };

  const inactiveCutoff = new Date(now.getTime() - cfg.inactiveDays * DAY);

  // Bu bayide yüksek churn + BU BAYİDE uzun süredir pasif müşteriler (P0-12). Eskiden platform
  // geneli `CustomerLifetimeValue` okunuyordu: risk müşterinin RAKİP işletmelerdeki yorumlarından,
  // pasiflik rakip işletmedeki son alışverişten hesaplanıyor ve bu global değerler bayinin
  // teklif zaman çizelgesine/analitik olayına yazılıyordu. Artık yalnız bu bayinin verisi.
  const atRisk = (
    await listDealerAtRiskCustomers(dealer.id, {
      churnThreshold: cfg.churnThreshold,
      inactiveBefore: inactiveCutoff,
      limit: cfg.maxPerRun,
      now,
    })
  ).map((c) => ({ userId: c.customerId, predictedChurn: c.churnRisk, lastPurchaseAt: c.lastVisitAt }));
  if (atRisk.length === 0) return { dealerId: dealer.id, flagged: 0, offersCreated: 0 };

  // Tekrar uyarmamak için: son 7 günde bu bayiye churn uyarısı atıldı mı?
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const recentlyAlerted = new Set(
    (
      await prisma.analyticsEvent.findMany({
        where: { userId: dealer.id, event: 'churn_intervention', category: 'dealer', createdAt: { gte: weekAgo } },
        select: { data: true },
      })
    )
      .map((e) => (e.data as { customerId?: string } | null)?.customerId)
      .filter(Boolean) as string[]
  );

  let offersCreated = 0;
  const fresh = atRisk.filter((c) => !recentlyAlerted.has(c.userId));
  if (fresh.length === 0) return { dealerId: dealer.id, flagged: 0, offersCreated: 0 };

  // Seçenekler bayinin işletme geneli telafi şablonlarından (yoksa sistem varsayılanı).
  const options = cfg.autoFlashOffer ? await getRemedyOptions(dealer.id, null) : [];

  for (const c of fresh) {
    // Opsiyonel: hedef müşteriye bağlı kişisel teklif taslağı (onay kuyruğunda başlar →
    // bayi yayınlamadan müşteriye gitmez; yayınlanınca yalnız bu müşteri görür).
    if (cfg.autoFlashOffer) {
      try {
        await createRemedyOffer({
          source: { kind: 'personal' },
          dealerId: dealer.id,
          userId: c.userId,
          message: CHURN_PERSONAL_OFFER_MESSAGE,
          mode: 'queue',
          options,
          createdLabel: 'Kayıp riski için kişisel teklif taslağı oluşturuldu',
          createdMeta: { trigger: 'churn_intervention', churn: c.predictedChurn },
          // Geçmişte kabul edilmiş bir geri kazanım teklifi yenisini engellemez; açık olan engeller.
          blockIfAccepted: false,
        });
        offersCreated++;
      } catch (err) {
        if (!isRemedyOfferError(err)) console.error('[CHURN] personal offer draft failed:', err);
        // Açık teklif zaten var (409) → aynı müşteriye ikinci taslak açılmaz.
      }
    }

    // İzleme event'i (tekrar uyarmama + analitik).
    await prisma.analyticsEvent.create({
      data: {
        userId: dealer.id,
        event: 'churn_intervention',
        category: 'dealer',
        data: {
          customerId: c.userId,
          churn: c.predictedChurn,
          lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
          autoOffer: cfg.autoFlashOffer,
        },
      },
    });
  }

  // Bayiye tek özet bildirim (SSE stream bunu anında iletir).
  await prisma.notification.create({
    data: {
      userId: dealer.id,
      title: '⚡ Kayıp riski yüksek müşteriler',
      message:
        `${fresh.length} müşteri uzun süredir pasif ve kaybedilme riski yüksek.` +
        (cfg.autoFlashOffer
          ? ` ${offersCreated} kişiye özel teklif taslağı onay kuyruğunda; yayınlamadan müşteri görmez.`
          : ''),
      type: 'warning',
      data: {
        count: fresh.length,
        offersCreated,
        // Taslak varsa onay kuyruğu; yoksa işaretlenen müşterilerin listelendiği Müşteriler → Risk sekmesi.
        ctaPath: cfg.autoFlashOffer && offersCreated > 0 ? '/dealer/remedy-queue' : '/dealer/customers?tab=risk',
      },
    },
  });

  return { dealerId: dealer.id, flagged: fresh.length, offersCreated };
}

/** Müdahale açık tüm bayiler için churn müdahalesini çalıştırır. */
export async function runChurnInterventionForAllDealers(now: Date = new Date()): Promise<{ dealers: number; flagged: number; offers: number }> {
  // Config'i olan bayiler (null olanlar zaten devre dışı kabul edilir).
  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER' },
    select: { id: true, dealerChurnIntervention: true },
  });

  let flagged = 0;
  let offers = 0;
  let active = 0;
  for (const d of dealers) {
    if (d.dealerChurnIntervention == null) continue; // config yok → atla (DB yükü azalt)
    try {
      const r = await runChurnInterventionForDealer(d, now);
      if (r.skipped !== 'disabled') active++;
      flagged += r.flagged;
      offers += r.offersCreated;
    } catch (err) {
      console.error(`[CHURN] dealer ${d.id} failed:`, err);
    }
  }
  return { dealers: active, flagged, offers };
}

/**
 * Eski sürümün (P0-22 öncesi) churn müdahalesinin açtığı, müşteri alanı olmayan flash teklif
 * taslaklarının imzası. Bu taslaklardan biri bayi tarafından aktive edilirse "kişiye özel"
 * teklif yakındaki herkese sızardı; müşteri uçları (`/api/customer/innovation/nearby|radar`)
 * bu imzayı herkese açık listeden DIŞLAR. Yeni kod bu imzayla kayıt üretmez.
 */
export const LEGACY_CHURN_FLASH_SIGNATURE = {
  title: 'Seni özledik 🎁',
  body: 'Sizi tekrar ağırlamak isteriz — size özel indirim.',
  maxRedemptions: 1,
} as const;

/** Herkese açık flash teklif sorgularına eklenecek dışlama koşulu (Prisma `where`). */
export const EXCLUDE_LEGACY_CHURN_FLASH = {
  NOT: { ...LEGACY_CHURN_FLASH_SIGNATURE },
};
