/**
 * Tenant health score (P1 item 12).
 * Her işletme için risk skoru: kullanım düşüşü, negatif artışı, aksiyon yapılmaması.
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface TenantHealthResult {
  dealerId: string;
  dealerName: string | null;
  healthScore: number; // 0-100, 100 = sağlıklı
  usageTrend: number; // son 7 / önceki 7 feedback oranı (1 = sabit)
  negativeRate: number; // son 7 gün negatif oranı (0-100)
  negativeTrend: number; // son 7 vs önceki 7 negatif oran farkı
  actionCompletionRate: number; // son 30 gün aksiyon tamamlama
}

export async function getTenantHealth(dealerIds?: string[]): Promise<TenantHealthResult[]> {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prev7 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER', ...(dealerIds?.length ? { id: { in: dealerIds } } : {}) },
    select: { id: true, name: true, businessName: true },
  });
  if (dealers.length === 0) return [];
  const ids = dealers.map((d) => d.id);

  // Önceden N dealer × 6 sorgu (sıralı for) vardı. Artık 2 toplu SQL geçişi:
  // (1) feedback metrikleri (dealer × dönem × negatiflik) tek sorguda,
  // (2) actionItem tamamlama tek sorguda. Hepsi dealerId bazında gruplanır.
  type FbRow = {
    dealerId: string;
    last7Fb: bigint; prev7Fb: bigint; last7Neg: bigint; prev7Neg: bigint;
  };
  const [fbRows, actionRows] = await Promise.all([
    prisma.$queryRaw<FbRow[]>(Prisma.sql`
      SELECT q."dealerId" AS "dealerId",
        COUNT(*) FILTER (WHERE f."createdAt" >= ${last7}) AS "last7Fb",
        COUNT(*) FILTER (WHERE f."createdAt" >= ${prev7} AND f."createdAt" < ${last7}) AS "prev7Fb",
        COUNT(*) FILTER (WHERE f."createdAt" >= ${last7} AND (f."rating" <= 2 OR f."sentiment" = 'negative')) AS "last7Neg",
        COUNT(*) FILTER (WHERE f."createdAt" >= ${prev7} AND f."createdAt" < ${last7} AND (f."rating" <= 2 OR f."sentiment" = 'negative')) AS "prev7Neg"
      FROM "Feedback" f
      JOIN "QRCode" q ON q."id" = f."qrCodeId"
      WHERE q."dealerId" IN (${Prisma.join(ids)})
        AND f."deletedAt" IS NULL
        AND f."createdAt" >= ${prev7}
      GROUP BY q."dealerId"
    `),
    prisma.$queryRaw<Array<{ dealerId: string; total: bigint; done: bigint }>>(Prisma.sql`
      SELECT "dealerId",
        COUNT(*) AS "total",
        COUNT(*) FILTER (WHERE "status" = 'done') AS "done"
      FROM "ActionItem"
      WHERE "dealerId" IN (${Prisma.join(ids)})
        AND "createdAt" >= ${last30}
      GROUP BY "dealerId"
    `),
  ]);

  const fbByDealer = new Map(fbRows.map((r) => [r.dealerId, r]));
  const actionByDealer = new Map(actionRows.map((r) => [r.dealerId, r]));

  const results: TenantHealthResult[] = [];
  for (const d of dealers) {
    const fb = fbByDealer.get(d.id);
    const act = actionByDealer.get(d.id);
    const last7Fb = Number(fb?.last7Fb ?? 0);
    const prev7Fb = Number(fb?.prev7Fb ?? 0);
    const last7Neg = Number(fb?.last7Neg ?? 0);
    const prev7Neg = Number(fb?.prev7Neg ?? 0);
    const actionTotal = Number(act?.total ?? 0);
    const actionDone = Number(act?.done ?? 0);

    const usageTrend = prev7Fb > 0 ? last7Fb / prev7Fb : 1;
    const last7NegRate = last7Fb > 0 ? (last7Neg / last7Fb) * 100 : 0;
    const prev7NegRate = prev7Fb > 0 ? (prev7Neg / prev7Fb) * 100 : 0;
    const negativeTrend = last7NegRate - prev7NegRate;
    const actionCompletionRate = actionTotal > 0 ? (actionDone / actionTotal) * 100 : 100;

    // Health score: usage drop, negative rise, low action completion → lower score
    let score = 100;
    if (usageTrend < 0.5) score -= 30;
    else if (usageTrend < 0.8) score -= 15;
    if (negativeTrend > 20) score -= 25;
    else if (negativeTrend > 10) score -= 10;
    if (actionCompletionRate < 50 && actionTotal > 0) score -= 20;
    else if (actionCompletionRate < 70 && actionTotal > 0) score -= 10;
    if (last7NegRate > 50) score -= 15;
    score = Math.max(0, Math.min(100, score));

    results.push({
      dealerId: d.id,
      dealerName: d.businessName || d.name,
      healthScore: Math.round(score),
      usageTrend,
      negativeRate: Math.round(last7NegRate * 10) / 10,
      negativeTrend: Math.round(negativeTrend * 10) / 10,
      actionCompletionRate: Math.round(actionCompletionRate * 10) / 10,
    });
  }

  return results.sort((a, b) => a.healthScore - b.healthScore);
}
