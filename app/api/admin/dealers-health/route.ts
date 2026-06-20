import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
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
  const dealerIds = dealers.map((d) => d.id);

  // N+1 (200 dealer × 4 sorgu) yerine birkaç toplu groupBy/findMany.
  // Feedback'te dealerId yok (qrCode ilişkisi var) → qrId→dealerId map'i kurulur.
  const qrCodes = await prisma.qRCode.findMany({
    where: { dealerId: { in: dealerIds } },
    select: { id: true, dealerId: true },
  });
  const qrToDealer = new Map(qrCodes.map((q) => [q.id, q.dealerId]));
  const qrIds = qrCodes.map((q) => q.id);

  const fbBase = { qrCodeId: { in: qrIds }, deletedAt: null, createdAt: { gte: since } } as const;
  const [fbAgg, fbReplied, incidentsGrouped, remedyGrouped] = await Promise.all([
    prisma.feedback.groupBy({
      by: ['qrCodeId'],
      where: fbBase,
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.feedback.groupBy({
      by: ['qrCodeId'],
      where: { ...fbBase, dealerRepliedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ['dealerId'],
      where: { dealerId: { in: dealerIds }, status: { in: ['open', 'assigned', 'in_progress'] } },
      _count: { _all: true },
    }),
    prisma.remedyOffer.groupBy({
      by: ['dealerId'],
      where: { dealerId: { in: dealerIds }, status: 'awaiting_dealer_approval' },
      _count: { _all: true },
    }),
  ]);

  // Dealer bazında topla (qrCodeId gruplarını dealer'a indir).
  const perDealer = new Map<string, { count: number; ratingSum: number; replied: number }>();
  for (const id of dealerIds) perDealer.set(id, { count: 0, ratingSum: 0, replied: 0 });
  for (const g of fbAgg) {
    const dealerId = qrToDealer.get(g.qrCodeId);
    if (!dealerId) continue;
    const e = perDealer.get(dealerId)!;
    const c = g._count._all;
    e.count += c;
    if (g._avg.rating != null) e.ratingSum += Number(g._avg.rating) * c;
  }
  for (const g of fbReplied) {
    const dealerId = qrToDealer.get(g.qrCodeId);
    if (!dealerId) continue;
    perDealer.get(dealerId)!.replied += g._count._all;
  }
  const incidentsByDealer = new Map(incidentsGrouped.map((g) => [g.dealerId, g._count._all]));
  const remedyByDealer = new Map(remedyGrouped.map((g) => [g.dealerId, g._count._all]));

  const rows = dealers.map((d) => {
    const e = perDealer.get(d.id)!;
    const n = e.count;
    const avg = n > 0 ? e.ratingSum / n : null;
    const replyRate = n > 0 ? e.replied / n : 1;
    const incidents = incidentsByDealer.get(d.id) ?? 0;
    const remedyQueue = remedyByDealer.get(d.id) ?? 0;

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
  });

  rows.sort((a, b) => a.healthScore - b.healthScore);

  return NextResponse.json({
    success: true,
    periodDays: 30,
    dealers: rows,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
