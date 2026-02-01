import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/dealer/cards/scan/[token]
 * Bayi kart tarayınca müşteri bilgisini getir
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekiyor' },
        { status: 401 }
      );
    }

    // Sadece DEALER rolü tarayabilir
    if (session.user.role !== 'DEALER') {
      return NextResponse.json(
        { error: 'Sadece bayiler kart tarayabilir' },
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
        { error: 'Kart bulunamadı', code: 'CARD_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Bloklu kart kontrolü
    if (card.status === 'BLOCKED') {
      return NextResponse.json(
        { 
          error: 'Bu kart bloklanmış', 
          code: 'CARD_BLOCKED',
        },
        { status: 403 }
      );
    }

    // Aktive edilmemiş kart
    if (card.status === 'UNUSED') {
      return NextResponse.json(
        { 
          error: 'Bu kart henüz aktive edilmemiş', 
          code: 'CARD_NOT_ACTIVATED',
        },
        { status: 400 }
      );
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
    });
  } catch (error) {
    console.error('Error scanning card:', error);
    return NextResponse.json(
      { error: 'Kart taranamadı' },
      { status: 500 }
    );
  }
}
