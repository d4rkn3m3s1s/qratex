import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * RateLimitCounter temizliği. Bu tablo her login/scan/feedback denemesinde satır
 * üretir ama TTL'i yoktu → süresi geçmiş sayaçlar sonsuz birikip tabloyu şişiriyordu.
 * Bu cron, penceresi çoktan dolmuş VE aktif kilidi olmayan sayaçları siler.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const now = new Date();
  // 1 saatlik grace: resetAt geçmiş + lockout yoksa (ya da kilit de geçmişse) sil.
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const deleted = await prisma.rateLimitCounter.deleteMany({
    where: {
      resetAt: { lt: cutoff },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
  });

  return NextResponse.json({ deletedCount: deleted.count });
}
