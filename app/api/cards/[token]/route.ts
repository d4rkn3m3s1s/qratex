import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

/**
 * GET /api/cards/[token]
 * Kart bilgilerini token ile getir (public endpoint)
 * Aktivasyon sayfası için kullanılır
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: 'Token gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const card = await prisma.physicalCard.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        status: true,
        activatedAt: true,
        blockedAt: true,
        blockReason: true,
        customer: {
          select: {
            id: true,
            name: true,
            image: true,
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
          reason: card.blockReason 
        }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({
      success: true,
      card: {
        id: card.id,
        token: card.token,
        status: card.status,
        isActivated: card.status === 'ACTIVATED',
        activatedAt: card.activatedAt,
        customer: card.customer ? {
          id: card.customer.id,
          name: card.customer.name,
          image: card.customer.image,
        } : null,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching card:', error);
    return NextResponse.json(
      { error: 'Kart bilgisi alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
