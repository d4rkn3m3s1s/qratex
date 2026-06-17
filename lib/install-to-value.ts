/**
 * Install-to-value (P1 item 1).
 * İşletme kayıttan ilk anlamlı insight'a geçen süre (dakika).
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface InstallToValueResult {
  dealerId: string;
  dealerName: string | null;
  registeredAt: Date;
  firstInsightAt: Date | null;
  minutesToValue: number | null;
}

export interface InstallToValueStats {
  averageMinutes: number | null;
  medianMinutes: number | null;
  p95Minutes: number | null;
  sampleSize: number;
  cappedOutliers: number;
}

const OUTLIER_CAP_MINUTES = 60 * 24 * 30; // 30 gün

export async function getInstallToValue(dealerIds?: string[]): Promise<InstallToValueResult[]> {
  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER', ...(dealerIds?.length ? { id: { in: dealerIds } } : {}) },
    select: {
      id: true,
      name: true,
      businessName: true,
      createdAt: true,
    },
  });

  if (dealers.length === 0) return [];
  const ids = dealers.map((d) => d.id);

  // Önceden N dealer × findFirst (N+1). Artık tek SQL: dealer başına ilk
  // (en erken) AI-işlenmiş feedback zamanı. aiProcessedAt index'inden yararlanır.
  const firstRows = await prisma.$queryRaw<Array<{ dealerId: string; firstInsightAt: Date | null }>>(Prisma.sql`
    SELECT q."dealerId" AS "dealerId", MIN(f."aiProcessedAt") AS "firstInsightAt"
    FROM "Feedback" f
    JOIN "QRCode" q ON q."id" = f."qrCodeId"
    WHERE q."dealerId" IN (${Prisma.join(ids)})
      AND f."aiProcessedAt" IS NOT NULL
    GROUP BY q."dealerId"
  `);
  const firstByDealer = new Map(firstRows.map((r) => [r.dealerId, r.firstInsightAt]));

  return dealers.map((d) => {
    const firstInsightAt = firstByDealer.get(d.id) ?? null;
    const minutesToValue =
      firstInsightAt != null
        ? Math.round((firstInsightAt.getTime() - d.createdAt.getTime()) / (60 * 1000))
        : null;
    return {
      dealerId: d.id,
      dealerName: d.businessName || d.name,
      registeredAt: d.createdAt,
      firstInsightAt,
      minutesToValue,
    };
  });
}

export async function getInstallToValueAverage(dealerIds?: string[]): Promise<number | null> {
  const stats = await getInstallToValueStats(dealerIds);
  return stats.averageMinutes;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export async function getInstallToValueStats(
  dealerIdsOrResults?: string[] | InstallToValueResult[]
): Promise<InstallToValueStats> {
  // Önceden hesaplanmış sonuçlar geçilebilir (route'ta çift çağrıyı önler).
  const isResults = Array.isArray(dealerIdsOrResults) &&
    dealerIdsOrResults.length > 0 &&
    typeof dealerIdsOrResults[0] === 'object';
  const results = isResults
    ? (dealerIdsOrResults as InstallToValueResult[])
    : await getInstallToValue(dealerIdsOrResults as string[] | undefined);
  const raw = results
    .map((r) => r.minutesToValue)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);

  if (raw.length === 0) {
    return { averageMinutes: null, medianMinutes: null, p95Minutes: null, sampleSize: 0, cappedOutliers: 0 };
  }

  let cappedOutliers = 0;
  const normalized = raw.map((v) => {
    if (v > OUTLIER_CAP_MINUTES) {
      cappedOutliers += 1;
      return OUTLIER_CAP_MINUTES;
    }
    return v;
  });
  const sorted = [...normalized].sort((a, b) => a - b);
  const averageMinutes = Math.round(normalized.reduce((s, v) => s + v, 0) / normalized.length);
  const medianMinutes = sorted.length % 2 === 1
    ? sorted[Math.floor(sorted.length / 2)]
    : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const p95Minutes = percentile(sorted, 95);

  return {
    averageMinutes,
    medianMinutes,
    p95Minutes,
    sampleSize: normalized.length,
    cappedOutliers,
  };
}
