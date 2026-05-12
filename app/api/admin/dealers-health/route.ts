import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

/**
 * Bayi sağlık skoru (0–100): son 30 gün rating, yanıt oranı, açık olay, telafi kuyruğu ağırlıklı.
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER' },
    select: { id: true, businessName: true, fraudStatus: true },
    take: 200,
  });

  const rows = await Promise.all(
    dealers.map(async (d) => {
      const base = { qrCode: { dealerId: d.id }, deletedAt: null, createdAt: { gte: since } };
      const [agg, replied, incidents, remedyQueue] = await Promise.all([
        prisma.feedback.aggregate({ where: base, _avg: { rating: true }, _count: true }),
        prisma.feedback.count({ where: { ...base, dealerRepliedAt: { not: null } } }),
        prisma.incident.count({
          where: { dealerId: d.id, status: { in: ['open', 'assigned', 'in_progress'] } },
        }),
        prisma.remedyOffer.count({
          where: { dealerId: d.id, status: 'awaiting_dealer_approval' },
        }),
      ]);

      const n = agg._count;
      const avg = agg._avg.rating != null ? Number(agg._avg.rating) : null;
      const replyRate = n > 0 ? replied / n : 1;

      let score = 72;
      if (avg != null) {
        score += (avg - 3.5) * 14;
      }
      score += (replyRate - 0.5) * 22;
      score -= incidents * 6;
      score -= remedyQueue * 4;
      if (d.fraudStatus === 'flagged') score -= 15;
      if (d.fraudStatus === 'shadow_ban') score -= 25;
      score = Math.max(0, Math.min(100, Math.round(score)));

      return {
        dealerId: d.id,
        label: d.businessName || d.id.slice(0, 8),
        fraudStatus: d.fraudStatus,
        feedback30d: n,
        avgRating: avg != null ? Math.round(avg * 100) / 100 : null,
        replyRate: Math.round(replyRate * 1000) / 10,
        openIncidents: incidents,
        remedyQueue,
        healthScore: score,
      };
    })
  );

  rows.sort((a, b) => a.healthScore - b.healthScore);

  return NextResponse.json({
    success: true,
    periodDays: 30,
    dealers: rows,
  });
}
