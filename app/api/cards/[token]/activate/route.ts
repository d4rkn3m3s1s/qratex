import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/cards/[token]/activate
 * Kartı mevcut kullanıcıya bağla (tek seferlik aktivasyon)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekiyor', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // Sadece CUSTOMER rolü kart aktive edebilir
    if (session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Sadece müşteriler kart aktive edebilir', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: 'Token gerekli' },
        { status: 400 }
      );
    }

    // Transaction ile atomik işlem
    const result = await prisma.$transaction(async (tx) => {
      // Kartı bul
      const card = await tx.physicalCard.findUnique({
        where: { token },
        select: {
          id: true,
          status: true,
          customerId: true,
          blockedAt: true,
          blockReason: true,
        },
      });

      if (!card) {
        throw new Error('CARD_NOT_FOUND');
      }

      // Bloklu kart kontrolü
      if (card.status === 'BLOCKED') {
        throw new Error('CARD_BLOCKED');
      }

      // Zaten aktive edilmiş mi?
      if (card.status === 'ACTIVATED') {
        // Aynı kullanıcıya mı bağlı?
        if (card.customerId === session.user.id) {
          throw new Error('ALREADY_YOURS');
        }
        throw new Error('ALREADY_ACTIVATED');
      }

      // Kartı aktive et
      const activatedCard = await tx.physicalCard.update({
        where: { id: card.id },
        data: {
          status: 'ACTIVATED',
          customerId: session.user.id,
          activatedAt: new Date(),
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Audit log
      await tx.cardAuditLog.create({
        data: {
          cardId: card.id,
          userId: session.user.id,
          action: 'ACTIVATED',
          metadata: {
            customerEmail: session.user.email,
          },
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      });

      return activatedCard;
    });

    return NextResponse.json({
      success: true,
      message: 'Kart başarıyla aktive edildi!',
      card: {
        id: result.id,
        status: result.status,
        activatedAt: result.activatedAt,
      },
    });
  } catch (error) {
    console.error('Error activating card:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Özel hata mesajları
    const errorResponses: Record<string, { message: string; status: number }> = {
      CARD_NOT_FOUND: { message: 'Kart bulunamadı', status: 404 },
      CARD_BLOCKED: { message: 'Bu kart bloklanmış', status: 403 },
      ALREADY_YOURS: { message: 'Bu kart zaten size bağlı', status: 400 },
      ALREADY_ACTIVATED: { message: 'Bu kart başka bir kullanıcıya bağlı', status: 409 },
    };

    const errorResponse = errorResponses[errorMessage];
    if (errorResponse) {
      return NextResponse.json(
        { error: errorResponse.message, code: errorMessage },
        { status: errorResponse.status }
      );
    }

    return NextResponse.json(
      { error: 'Kart aktive edilemedi' },
      { status: 500 }
    );
  }
}
