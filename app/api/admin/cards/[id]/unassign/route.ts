import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getClientIp } from '@/lib/request-metadata';
import { checkUnassign } from '@/lib/cards/lifecycle';


export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/cards/[id]/unassign
 * Kartı müşteriden kaldır (Admin). Tüketim geçmişi korunur.
 *
 * P0-26 (kart kolu): YALNIZ ACTIVATED kartta çalışır. Önceden bloklu kart da koşulsuz
 * `UNUSED` yapılıyordu → blok sessizce kalkıyor, çalıntı kart yeniden aktive edilebiliyordu.
 * Durum + müşteri koşullu yazılır (arada değiştiyse 409); kart denetim izi aynı tx'te.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await params;

    // Kartı kontrol et
    const card = await prisma.physicalCard.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: { consumptions: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const check = checkUnassign(card);
    if (!check.ok) {
      return NextResponse.json({ error: check.message, code: check.code }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const previousCustomerId = card.customerId as string;

    const updatedCard = await prisma.$transaction(async (tx) => {
      const w = await tx.physicalCard.updateMany({
        where: { id, status: 'ACTIVATED', customerId: previousCustomerId, archivedAt: null },
        data: {
          customerId: null,
          status: 'UNUSED',
          activatedAt: null,
        },
      });
      if (w.count === 0) return null;

      await tx.cardAuditLog.create({
        data: {
          cardId: id,
          userId: session.user.id,
          action: 'ADMIN_UNASSIGNED',
          // Kişisel veri (ad/e-posta) yerine kimlik: müşteri anonimleşse de iz tutarlı kalır.
          metadata: {
            previousCustomerId,
            consumptionCount: card._count.consumptions,
          },
          ipAddress: getClientIp(request),
          userAgent: request.headers.get('user-agent') || null,
        },
      });

      // Müşteriye bildirim (aynı tx: kart kaldırıldıysa bildirim de kesin yazılır)
      await tx.notification.create({
        data: {
          userId: previousCustomerId,
          title: 'Kartınız Kaldırıldı',
          message: 'QRateX kartınız yönetici tarafından hesabınızdan kaldırıldı. Sorularınız için destek ile iletişime geçebilirsiniz.',
          type: 'warning',
        },
      });

      return tx.physicalCard.findUnique({ where: { id } });
    });

    if (!updatedCard) {
      return NextResponse.json(
        { error: 'Kart bu sırada başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin.', code: 'CONFLICT' },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Kart müşteriden kaldırıldı',
      card: updatedCard,
      previousCustomer: {
        id: previousCustomerId,
        name: card.customer?.name ?? null,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error unassigning card:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Kart kaldırılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
