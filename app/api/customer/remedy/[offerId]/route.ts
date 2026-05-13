
export const dynamic = 'force-dynamic';

/**
 * Müşteri: telafi teklifini görüntüle (GET), tür/miktar seçip kabul et (PATCH).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
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
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { offerId } = await params;
    if (!offerId || offerId.length > 64) {
      return NextResponse.json(
        { error: 'Geçersiz teklif' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const offer = await prisma.remedyOffer.findUnique({
      where: { id: offerId },
      include: {
        feedback: { select: { id: true, rating: true, text: true, createdAt: true } },
        consumptionReview: { select: { id: true, rating: true, text: true, createdAt: true } },
        dealer: { select: { id: true, name: true, businessName: true } },
      },
    });

    if (!offer) {
      return NextResponse.json(
        { error: 'Telafi teklifi bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (offer.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Bu teklifi görüntüleme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (offer.status === 'awaiting_dealer_approval' || offer.status === 'rejected') {
      return NextResponse.json(
        { error: 'Bu teklif henüz aktif değil' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (offer.status !== 'pending') {
      return NextResponse.json(
        {
          offer: {
            id: offer.id,
            message: offer.message,
            status: offer.status,
            selectedType: offer.selectedType,
            selectedValue: offer.selectedValue,
            acceptedAt: offer.acceptedAt,
          },
          alreadyProcessed: true,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
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
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('customer/remedy GET:', error);
    return NextResponse.json(
      { error: 'Teklif yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { offerId } = await params;
    if (!offerId || offerId.length > 64) {
      return NextResponse.json(
        { error: 'Geçersiz teklif' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const offer = await prisma.remedyOffer.findUnique({
      where: { id: offerId },
      select: { id: true, userId: true, status: true },
    });

    if (!offer) {
      return NextResponse.json(
        { error: 'Telafi teklifi bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (offer.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu teklifi kabul etme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (offer.status !== 'pending') {
      return NextResponse.json(
        { error: 'Bu teklif zaten işlendi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'selectedType ve selectedValue gerekli' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const acceptedAt = new Date();
    const n = await prisma.remedyOffer.updateMany({
      where: { id: offerId, userId: session.user.id, status: 'pending' },
      data: {
        status: 'accepted',
        selectedType: parsed.data.selectedType,
        selectedValue: parsed.data.selectedValue,
        acceptedAt,
      },
    });
    if (n.count === 0) {
      return NextResponse.json(
        { error: 'Bu teklif zaten işlendi veya bulunamadı' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const updated = await prisma.remedyOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        status: true,
        selectedType: true,
        selectedValue: true,
        acceptedAt: true,
      },
    });

    await appendRemedyTimelineEvent(prisma, offerId, 'accepted', 'Seçiminiz kaydedildi — teklif kullanıma hazır', {
      selectedType: parsed.data.selectedType,
      selectedValue: parsed.data.selectedValue,
    });

    return NextResponse.json(
      {
        success: true,
        offer: updated,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('customer/remedy PATCH:', error);
    return NextResponse.json(
      { error: 'Teklif güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
