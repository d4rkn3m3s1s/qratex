/**
 * Churn risk modeli (madde 37): dealer müşteri/dealer bazlı risk özeti.
 * GET: yüksek churnRisk'li feedback'ler ve ortalama risk skoru.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? request.nextUrl.searchParams.get('dealerId') : session.user.id;
  if (!dealerId) {
    return NextResponse.json(
      { error: 'dealerId gerekli (admin için query)' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  if (session.user.role === 'DEALER' && dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const since = new Date();
  since.setMonth(since.getMonth() - 1);

  const [aggregate, highRiskFeedbacks, riskBuckets] = await Promise.all([
    prisma.feedback.aggregate({
      where: {
        qrCode: { dealerId },
        deletedAt: null,
        createdAt: { gte: since },
        churnRisk: { not: null },
      },
      _avg: { churnRisk: true },
      _count: true,
    }),
    prisma.feedback.findMany({
      where: {
        qrCode: { dealerId },
        deletedAt: null,
        churnRisk: { gte: 0.5 },
        createdAt: { gte: since },
      },
      orderBy: { churnRisk: 'desc' },
      take: 20,
      select: {
        id: true,
        rating: true,
        text: true,
        churnRisk: true,
        sentiment: true,
        urgency: true,
        intent: true,
        createdAt: true,
        user: { select: { id: true, name: true, image: true } },
      },
    }),
    // Risk dağılımı: düşük (<30%), orta (30-50%), yüksek (>=50%)
    Promise.all([
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          deletedAt: null,
          createdAt: { gte: since },
          churnRisk: { gte: 0, lt: 0.3 },
        },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          deletedAt: null,
          createdAt: { gte: since },
          churnRisk: { gte: 0.3, lt: 0.5 },
        },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          deletedAt: null,
          createdAt: { gte: since },
          churnRisk: { gte: 0.5 },
        },
      }),
    ]),
  ]);

  const [lowRisk, mediumRisk, highRiskCount] = riskBuckets;

  return NextResponse.json(
    {
      churnRisk: {
        dealerId,
        period: 'last_30_days',
        avgChurnRisk: aggregate._avg.churnRisk ?? null,
        feedbackCountWithRisk: aggregate._count,
        highRiskCount: highRiskCount,
        riskDistribution: { low: lowRisk, medium: mediumRisk, high: highRiskCount },
        highRiskFeedbacks: highRiskFeedbacks.map((f) => ({
          id: f.id,
          rating: f.rating,
          text: f.text,
          churnRisk: f.churnRisk,
          sentiment: f.sentiment,
          urgency: f.urgency,
          intent: f.intent,
          createdAt: f.createdAt,
          userId: f.user?.id,
          userName: f.user?.name,
          userImage: f.user?.image,
        })),
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
