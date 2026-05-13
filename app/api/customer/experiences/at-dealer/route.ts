import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  countVisitsAtDealer,
  getRecentExperiencesAtDealer,
  loyaltyMilestones,
} from '@/lib/customer-dealer-experiences';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = new URL(request.url).searchParams.get('dealerId');
  if (!dealerId) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER' },
    select: { businessName: true, name: true },
  });
  if (!dealer) {
    return NextResponse.json(
      { error: 'İşletme bulunamadı' },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const uid = session.user.id;
  const [experiences, visits] = await Promise.all([
    getRecentExperiencesAtDealer(uid, dealerId, 3),
    countVisitsAtDealer(uid, dealerId),
  ]);

  const loyalty = loyaltyMilestones(visits);

  return NextResponse.json(
    {
      dealerId,
      dealerLabel: dealer.businessName || dealer.name || 'İşletme',
      visitCount: visits,
      loyalty,
      experiences,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
