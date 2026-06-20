import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Flash teklif süresi dolma işi (saatlik cron). DealerFlashOffer'lar validTo
 * geçince aktif kalıyordu (otomasyon yoktu) → süresi dolmuş aktif teklifleri
 * pasifleştirir. Ayrıca maxRedemptions dolmuş aktif teklifleri de kapatır.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const now = new Date();
  const expired = await prisma.dealerFlashOffer.updateMany({
    where: { isActive: true, validTo: { lt: now } },
    data: { isActive: false },
  });

  // Kullanım limiti dolmuş ama hâlâ aktif olanlar (raw: sütun-sütun karşılaştırma).
  const exhausted = await prisma.$executeRaw`
    UPDATE "DealerFlashOffer"
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE "isActive" = true
      AND "maxRedemptions" > 0
      AND "redemptionCount" >= "maxRedemptions"
  `;

  return NextResponse.json({ expiredByTime: expired.count, expiredByLimit: exhausted });
}
