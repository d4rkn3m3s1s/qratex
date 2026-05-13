import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * Onay bekleyen telafi teklifleri (müşteriye henüz bildirilmemiş).
 */
export async function GET() {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? null : session.user.id;

  const offers = await prisma.remedyOffer.findMany({
    where: {
      status: 'awaiting_dealer_approval',
      ...(dealerId ? { dealerId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, name: true } },
      feedback: {
        select: {
          id: true,
          rating: true,
          text: true,
          createdAt: true,
        },
      },
      consumptionReview: {
        select: {
          id: true,
          rating: true,
          text: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ success: true, offers }, { headers: PRIVATE_NO_STORE_HEADERS });
}
