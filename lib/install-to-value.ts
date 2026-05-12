/**
 * Install-to-value (P1 item 1).
 * İşletme kayıttan ilk anlamlı insight'a geçen süre (dakika).
 */
import { prisma } from '@/lib/prisma';

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

  const results: InstallToValueResult[] = [];
  for (const d of dealers) {
    const firstFeedback = await prisma.feedback.findFirst({
      where: {
        qrCode: { dealerId: d.id },
        aiProcessedAt: { not: null },
      },
      orderBy: { aiProcessedAt: 'asc' },
      select: { aiProcessedAt: true },
    });
    const firstInsightAt = firstFeedback?.aiProcessedAt ?? null;
    const minutesToValue =
      firstInsightAt != null
        ? Math.round((firstInsightAt.getTime() - d.createdAt.getTime()) / (60 * 1000))
        : null;

    results.push({
      dealerId: d.id,
      dealerName: d.businessName || d.name,
      registeredAt: d.createdAt,
      firstInsightAt,
      minutesToValue,
    });
  }
  return results;
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

export async function getInstallToValueStats(dealerIds?: string[]): Promise<InstallToValueStats> {
  const results = await getInstallToValue(dealerIds);
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
