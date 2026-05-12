import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

export type JourneyStep = {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
  detail?: string;
};

/**
 * Müşteri: QR geri bildiriminin işletmedeki yolculuğu (şeffaflık).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id: feedbackId } = await params;
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    include: {
      qrCode: { select: { name: true, dealer: { select: { businessName: true } } } },
      remedyOffers: {
        where: {
          status: { in: ['pending', 'accepted', 'expired'] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          acceptedAt: true,
          message: true,
        },
      },
    },
  });

  if (!feedback) {
    return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 });
  }

  if (session.user.role === 'CUSTOMER' && feedback.userId !== session.user.id) {
    return NextResponse.json({ error: 'Bu geri bildirimi görüntüleyemezsiniz' }, { status: 403 });
  }

  const steps: JourneyStep[] = [
    {
      key: 'submitted',
      label: 'Geri bildiriminiz alındı',
      at: feedback.createdAt.toISOString(),
      done: true,
    },
    {
      key: 'dealer_viewed',
      label: 'İşletme geri bildiriminizi inceledi',
      at: feedback.dealerFirstViewedAt?.toISOString() ?? null,
      done: !!feedback.dealerFirstViewedAt,
    },
    {
      key: 'dealer_replied',
      label: 'İşletme yanıt verdi',
      at: feedback.dealerRepliedAt?.toISOString() ?? null,
      done: !!feedback.dealerRepliedAt,
      detail: feedback.dealerReply ?? undefined,
    },
  ];

  const firstOffer = feedback.remedyOffers[0];
  if (firstOffer) {
    steps.push({
      key: 'remedy_sent',
      label: 'Size telafi teklifi sunuldu',
      at: firstOffer.createdAt.toISOString(),
      done: true,
      detail: firstOffer.message,
    });
    const accepted = feedback.remedyOffers.find((o) => o.status === 'accepted');
    steps.push({
      key: 'remedy_accepted',
      label: 'Telafi teklifini değerlendirdiniz',
      at: accepted?.acceptedAt?.toISOString() ?? null,
      done: !!accepted,
    });
  }

  return NextResponse.json({
    success: true,
    feedback: {
      id: feedback.id,
      rating: feedback.rating,
      text: feedback.text,
      createdAt: feedback.createdAt.toISOString(),
      qrName: feedback.qrCode.name,
      businessName: feedback.qrCode.dealer?.businessName ?? feedback.qrCode.name,
    },
    steps,
  });
}
