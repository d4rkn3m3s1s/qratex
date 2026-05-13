/**
 * Müşteri yolculuğu skoru (madde 49): toplam deneyim skoru (feedback ortalaması, sıklık).
 * GET: giriş yapan müşterinin yolculuk skoru.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const userId = session.user.id as string;

  const feedbacks = await prisma.feedback.findMany({
    where: { userId, deletedAt: null } as { userId: string; deletedAt: null },
    select: { rating: true, sentiment: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const count = feedbacks.length;
  const avgRating = count ? feedbacks.reduce((s, f) => s + f.rating, 0) / count : 0;
  const positiveRate = count ? feedbacks.filter((f) => f.sentiment === 'positive').length / count : 0;
  const recentAvg = feedbacks.length >= 3
    ? feedbacks.slice(0, 5).reduce((s, f) => s + f.rating, 0) / Math.min(5, feedbacks.length)
    : avgRating;

  // 0–100 skor: avgRating×20 (0–100), positiveRate×30 (0–30), engagement×20 (0–20), recentAvg×15 (0–75) → max 225
  const raw = avgRating * 20 + positiveRate * 30 + Math.min(1, count / 10) * 20 + recentAvg * 15;
  const journeyScore = count === 0 ? 0 : Math.round((raw / 225) * 100);

  return NextResponse.json(
    {
      journeyScore: Math.min(100, Math.max(0, journeyScore)),
      metrics: {
        totalFeedbackCount: count,
        avgRating: Math.round(avgRating * 100) / 100,
        positiveRate: Math.round(positiveRate * 100) / 100,
        recentAvgRating: Math.round(recentAvg * 100) / 100,
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
