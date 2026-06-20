/**
 * Tahminsel churn müdahalesi — bayinin riskli (yüksek churn + uzun süredir pasif)
 * müşterilerini tespit edip bayiyi uyarır ve (config açıksa) otomatik flash teklif
 * taslağı oluşturur.
 *
 * Bayinin elle yaptığı "riskli müşteri yakala → teklif gönder" işini otomatikleştirir.
 * Veri kaynağı: CustomerLifetimeValue (günlük CLV cron'u doldurur) + Consumption
 * (bayi↔müşteri eşleşmesi). Yeni tablo yok; DealerFlashOffer + Notification kullanır.
 */
import { prisma } from '@/lib/prisma';

export interface ChurnInterventionConfig {
  enabled: boolean;
  churnThreshold: number; // 0-1; predictedChurn bu değerin üstündeyse riskli
  inactiveDays: number; // son ziyaretten bu kadar gün geçtiyse
  autoFlashOffer: boolean; // otomatik flash teklif taslağı oluştur
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

  // Bu bayiyle tüketimi olan + yüksek churn + uzun süredir pasif müşteriler.
  const customerIds = (
    await prisma.consumption.groupBy({ by: ['customerId'], where: { dealerId: dealer.id } })
  ).map((r) => r.customerId);
  if (customerIds.length === 0) return { dealerId: dealer.id, flagged: 0, offersCreated: 0 };

  const atRisk = await prisma.customerLifetimeValue.findMany({
    where: {
      userId: { in: customerIds },
      predictedChurn: { gte: cfg.churnThreshold },
      OR: [{ lastPurchaseAt: { lt: inactiveCutoff } }, { lastPurchaseAt: null }],
    },
    select: { userId: true, predictedChurn: true, lastPurchaseAt: true, user: { select: { name: true } } },
    orderBy: { predictedChurn: 'desc' },
    take: cfg.maxPerRun,
  });
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

  for (const c of fresh) {
    // Opsiyonel: otomatik flash teklif taslağı (24 saat geçerli, pasif başlar
    // → bayi panelden aktive eder; istenmeden müşteriye gitmez).
    if (cfg.autoFlashOffer) {
      try {
        await prisma.dealerFlashOffer.create({
          data: {
            dealerId: dealer.id,
            title: 'Seni özledik 🎁',
            body: 'Sizi tekrar ağırlamak isteriz — size özel indirim.',
            offerType: 'PERCENT',
            value: 15,
            validFrom: now,
            validTo: new Date(now.getTime() + DAY),
            isActive: false, // bayi onayıyla aktive edilir
            maxRedemptions: 1,
          },
        });
        offersCreated++;
      } catch (err) {
        console.error('[CHURN] flash offer draft failed:', err);
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
        (cfg.autoFlashOffer ? ` ${offersCreated} flash teklif taslağı hazırlandı (onayınızı bekliyor).` : ''),
      type: 'warning',
      data: { count: fresh.length, offersCreated },
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
