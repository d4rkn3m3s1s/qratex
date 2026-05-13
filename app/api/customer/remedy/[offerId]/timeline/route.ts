import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { buildRemedyTimeline } from '@/lib/remedy-timeline';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.remedyTimeline) {
    return NextResponse.json(
      { error: 'Özellik devre dışı' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { offerId } = await params;
  const offer = await prisma.remedyOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      acceptedAt: true,
      status: true,
      message: true,
    },
  });

  if (!offer) {
    return NextResponse.json(
      { error: 'Teklif bulunamadı' },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  if (offer.userId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Yetkisiz' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const events = await prisma.remedyTimelineEvent.findMany({
    where: { remedyOfferId: offerId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  const timeline = buildRemedyTimeline(offer, events);

  return NextResponse.json(
    {
      offerId,
      status: offer.status,
      timeline,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
