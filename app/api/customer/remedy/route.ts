
export const dynamic = 'force-dynamic';

/**
 * Müşteri: bekleyen ve kabul edilmiş telafi tekliflerini listele.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const status = request.nextUrl.searchParams.get('status'); // pending | accepted | all
  const userId = session.user.role === 'ADMIN' ? request.nextUrl.searchParams.get('userId') : session.user.id;
  if (session.user.role === 'CUSTOMER' && userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!userId) {
    return NextResponse.json({ error: 'userId gerekli' }, { status: 400 });
  }

  const hiddenStatuses = ['awaiting_dealer_approval', 'rejected'] as const;

  const where: {
    userId: string;
    status?: string | { in: string[] } | { notIn: string[] };
  } = { userId };

  if (status === 'pending' || status === 'accepted') {
    where.status = status;
  } else {
    where.status = { notIn: [...hiddenStatuses] };
  }

  const offers = await prisma.remedyOffer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      dealer: { select: { id: true, name: true, businessName: true } },
      feedback: { select: { id: true, rating: true, text: true, createdAt: true } },
      consumptionReview: { select: { id: true, rating: true, text: true, createdAt: true } },
    },
  });

  return NextResponse.json({
    offers: offers.map((o) => ({
      id: o.id,
      message: o.message,
      status: o.status,
      options: o.options,
      selectedType: o.selectedType,
      selectedValue: o.selectedValue,
      acceptedAt: o.acceptedAt,
      createdAt: o.createdAt,
      dealer: o.dealer,
      feedback: o.feedback,
      consumptionReview: o.consumptionReview,
    })),
  });
}
