
export const dynamic = 'force-dynamic';

/**
 * Risk segmentine otomatik kampanya (madde 38): churn riski yüksek gruba telafi tetikleme.
 * POST: son 30 gün yüksek churnRisk'li feedback'ler için toplu bildirim.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';

const bodySchema = z.object({
  minChurnRisk: z.number().min(0).max(1).default(0.5),
  maxNotifications: z.number().min(1).max(100).default(50),
  message: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? undefined : session.user.id;
  if (session.user.role === 'ADMIN') {
    return NextResponse.json({ error: 'Admin için dealerId body\'de gönderin' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const { minChurnRisk, maxNotifications, message } = parsed.success ? parsed.data : { minChurnRisk: 0.5, maxNotifications: 50, message: undefined };

  const since = new Date();
  since.setMonth(since.getMonth() - 1);

  const highRisk = await prisma.feedback.findMany({
    where: {
      qrCode: { dealerId },
      deletedAt: null,
      createdAt: { gte: since },
      churnRisk: { gte: minChurnRisk },
      userId: { not: null },
    },
    orderBy: { churnRisk: 'desc' },
    take: maxNotifications,
    select: { id: true, userId: true },
  });

  const msg = message ?? 'Deneyiminizi iyileştirmek için özel bir fırsat hazırladık.';
  let sent = 0;
  const seen = new Set<string>();
  for (const f of highRisk) {
    if (!f.userId || seen.has(f.userId)) continue;
    seen.add(f.userId);
    try {
      await prisma.notification.create({
        data: {
          userId: f.userId,
          title: 'Sizi dinliyoruz',
          message: msg,
          type: 'info',
          data: { type: 'risk_segment_campaign', feedbackId: f.id },
        },
      });
      sent++;
    } catch (err) {
      console.error('[risk-segment] Failed to send notification to user', f.userId, err);
    }
  }

  await prisma.analyticsEvent.create({
    data: {
      userId: session.user.id,
      event: 'risk_segment_campaign_triggered',
      category: 'campaign',
      data: { dealerId, sent, totalEligible: highRisk.length },
    },
  });

  return NextResponse.json({
    success: true,
    sent,
    eligibleCount: highRisk.length,
    uniqueCustomersNotified: sent,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
