
export const dynamic = 'force-dynamic';

/**
 * Müşteri: telafi teklifini görüntüle (GET), tür/miktar seçip kabul et (PATCH).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';

const patchSchema = z.object({
  selectedType: z.string().min(1),
  selectedValue: z.string().min(1),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { offerId } = await params;
  const offer = await prisma.remedyOffer.findUnique({
    where: { id: offerId },
    include: {
      feedback: { select: { id: true, rating: true, text: true, createdAt: true } },
      consumptionReview: { select: { id: true, rating: true, text: true, createdAt: true } },
      dealer: { select: { id: true, name: true, businessName: true } },
    },
  });

  if (!offer) {
    return NextResponse.json({ error: 'Telafi teklifi bulunamadı' }, { status: 404 });
  }
  if (offer.userId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Bu teklifi görüntüleme yetkiniz yok' }, { status: 403 });
  }
  if (offer.status === 'awaiting_dealer_approval' || offer.status === 'rejected') {
    return NextResponse.json({ error: 'Bu teklif henüz aktif değil' }, { status: 404 });
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({
      offer: {
        id: offer.id,
        message: offer.message,
        status: offer.status,
        selectedType: offer.selectedType,
        selectedValue: offer.selectedValue,
        acceptedAt: offer.acceptedAt,
      },
      alreadyProcessed: true,
    });
  }

  return NextResponse.json({
    offer: {
      id: offer.id,
      message: offer.message,
      status: offer.status,
      options: offer.options,
      feedbackId: offer.feedbackId,
      consumptionReviewId: offer.consumptionReviewId,
      dealer: offer.dealer,
      feedback: offer.feedback,
      consumptionReview: offer.consumptionReview,
      createdAt: offer.createdAt,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { offerId } = await params;
  const offer = await prisma.remedyOffer.findUnique({
    where: { id: offerId },
    select: { id: true, userId: true, status: true },
  });

  if (!offer) {
    return NextResponse.json({ error: 'Telafi teklifi bulunamadı' }, { status: 404 });
  }
  if (offer.userId !== session.user.id) {
    return NextResponse.json({ error: 'Bu teklifi kabul etme yetkiniz yok' }, { status: 403 });
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'Bu teklif zaten işlendi' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'selectedType ve selectedValue gerekli' }, { status: 400 });
  }

  const updated = await prisma.remedyOffer.update({
    where: { id: offerId },
    data: {
      status: 'accepted',
      selectedType: parsed.data.selectedType,
      selectedValue: parsed.data.selectedValue,
      acceptedAt: new Date(),
    },
  });

  await appendRemedyTimelineEvent(prisma, offerId, 'accepted', 'Seçiminiz kaydedildi — teklif kullanıma hazır', {
    selectedType: parsed.data.selectedType,
    selectedValue: parsed.data.selectedValue,
  });

  return NextResponse.json({
    success: true,
    offer: {
      id: updated.id,
      status: updated.status,
      selectedType: updated.selectedType,
      selectedValue: updated.selectedValue,
      acceptedAt: updated.acceptedAt,
    },
  });
}
