import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/cards/scan/[token]
 * Bayi kart tarayınca müşteri bilgisini getir
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: 'Token gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const card = await prisma.physicalCard.findUnique({
      where: { token },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            points: true,
            level: true,
          },
        },
        consumptions: {
          where: {
            dealerId: session.user.id,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı', code: 'CARD_NOT_FOUND' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Bloklu kart kontrolü
    if (card.status === 'BLOCKED') {
      return NextResponse.json(
        { 
          error: 'Bu kart bloklanmış', 
          code: 'CARD_BLOCKED',
        }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Aktive edilmemiş kart
    if (card.status === 'UNUSED') {
      return NextResponse.json(
        { 
          error: 'Bu kart henüz aktive edilmemiş', 
          code: 'CARD_NOT_ACTIVATED',
        }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Audit log - kart tarandı
    await prisma.cardAuditLog.create({
      data: {
        cardId: card.id,
        userId: session.user.id,
        action: 'SCANNED',
        metadata: {
          dealerId: session.user.id,
          dealerName: session.user.name,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({
      success: true,
      card: {
        id: card.id,
        token: card.token,
        status: card.status,
        customer: card.customer,
        recentConsumptions: card.consumptions,
        totalConsumptions: await prisma.consumption.count({
          where: {
            cardId: card.id,
            dealerId: session.user.id,
          },
        }),
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error scanning card:', error);
    return NextResponse.json(
      { error: 'Kart taranamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
