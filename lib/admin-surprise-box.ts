/**
 * Admin sürpriz kutu gönderimi — kurallar ve tavanlar (P0-19).
 *
 * Önceki durum (`app/api/admin/surprise-box/send/route.ts`): kutu başına puan sınırsızdı
 * (`z.number().int().min(0)`), tek istekte 500 alıcıya gidebiliyordu, AuditLog yazılmıyordu,
 * "rastgele" seçim `orderBy`'sız tablo başıydı ve gölge banlı / askıdaki hesaplar dahildi.
 * Kutu açılınca puan `creditPointsAndXp` ile basıldığı için bu uç fiilen tavansız bir
 * mint kanalıydı.
 *
 * Kurallar:
 *  - Kutu başına puan 0–5.000 (tam sayı).
 *  - Kampanya toplamı (alıcı × puan) ≤ 100.000.
 *  - Gönderen admin başına UTC günü toplamı ≤ 250.000 (otomatik günlük kutular sayılmaz).
 *  - Puanlı ya da çok alıcılı gönderimde sunucu tarafı onay: istemci önizlemede gördüğü
 *    alıcı sayısını ve toplam puanı geri yollamalı; değer tutmazsa 409 + güncel önizleme.
 *  - Aynı `requestId` ile ikinci gönderim yeni kutu üretmez (kampanya kimliği).
 *  - Alıcı yalnız CUSTOMER; askıdaki, anonimleştirilmiş ve gölge banlı hesaplar dışarıda.
 *  - Gönderim + alıcı bildirimleri + AuditLog tek transaction'da.
 */

export const SURPRISE_BOX_LIMITS = {
  maxPointsPerBox: 5_000,
  maxCampaignPoints: 100_000,
  dailySenderBudget: 250_000,
  maxRecipients: 500,
} as const;

export interface CampaignTotals {
  recipientCount: number;
  pointsPerBox: number;
  totalPoints: number;
}

export type CampaignCheck =
  | { ok: true; totals: CampaignTotals; remainingToday: number }
  | {
      ok: false;
      code: 'CAMPAIGN_CAP_EXCEEDED' | 'DAILY_BUDGET_EXCEEDED' | 'POINTS_PER_BOX_EXCEEDED' | 'NO_RECIPIENTS';
      message: string;
      totals: CampaignTotals;
      remainingToday: number;
    };

const fmt = (n: number) => n.toLocaleString('tr-TR');

/** Kampanyanın toplamını ve tavanlara uyup uymadığını hesaplar (saf fonksiyon). */
export function checkCampaign(params: {
  recipientCount: number;
  pointsPerBox: number;
  sentTodayBySender: number;
}): CampaignCheck {
  const recipientCount = Math.max(0, Math.floor(params.recipientCount));
  const pointsPerBox = Math.max(0, Math.floor(params.pointsPerBox));
  const totals: CampaignTotals = { recipientCount, pointsPerBox, totalPoints: recipientCount * pointsPerBox };
  const remainingToday = Math.max(0, SURPRISE_BOX_LIMITS.dailySenderBudget - Math.max(0, params.sentTodayBySender));

  if (recipientCount === 0) {
    return { ok: false, code: 'NO_RECIPIENTS', message: 'Gönderilecek uygun müşteri bulunamadı.', totals, remainingToday };
  }
  if (pointsPerBox > SURPRISE_BOX_LIMITS.maxPointsPerBox) {
    return {
      ok: false,
      code: 'POINTS_PER_BOX_EXCEEDED',
      message: `Kutu başına en fazla ${fmt(SURPRISE_BOX_LIMITS.maxPointsPerBox)} puan verilebilir.`,
      totals,
      remainingToday,
    };
  }
  if (totals.totalPoints > SURPRISE_BOX_LIMITS.maxCampaignPoints) {
    return {
      ok: false,
      code: 'CAMPAIGN_CAP_EXCEEDED',
      message: `Bir gönderimin toplam puanı en fazla ${fmt(SURPRISE_BOX_LIMITS.maxCampaignPoints)} olabilir (şu an ${fmt(totals.totalPoints)}).`,
      totals,
      remainingToday,
    };
  }
  if (totals.totalPoints > remainingToday) {
    return {
      ok: false,
      code: 'DAILY_BUDGET_EXCEEDED',
      message: `Bugünkü sürpriz kutu puan bütçeniz yetmiyor: kalan ${fmt(remainingToday)}, istenen ${fmt(totals.totalPoints)}.`,
      totals,
      remainingToday,
    };
  }
  return { ok: true, totals, remainingToday };
}

/** Puanlı ya da birden fazla alıcılı gönderim, önizlemede gösterilen değerlerle onaylanmalı. */
export function requiresConfirmation(totals: CampaignTotals): boolean {
  return totals.totalPoints > 0 || totals.recipientCount > 1;
}

export function confirmationMatches(
  totals: CampaignTotals,
  confirm: { recipientCount?: number | null; totalPoints?: number | null }
): boolean {
  return confirm.recipientCount === totals.recipientCount && confirm.totalPoints === totals.totalPoints;
}
