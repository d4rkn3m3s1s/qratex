import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPkPass, generateSerialNumber } from '@/lib/wallet';

/**
 * GET /api/wallet/apple
 * Generate and download Apple Wallet .pkpass file
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekiyor' },
        { status: 401 }
      );
    }
    
    if (session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Sadece müşteriler kart indirebilir' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('cardId');

    // Get user's card
    let card;
    
    try {
      if (cardId) {
        // Get specific card
        card = await (prisma as any).physicalCard.findFirst({
          where: {
            id: cardId,
            customerId: session.user.id,
            status: 'ACTIVATED',
          },
        });
      } else {
        // Get user's first activated card
        card = await (prisma as any).physicalCard.findFirst({
          where: {
            customerId: session.user.id,
            status: 'ACTIVATED',
          },
          orderBy: { activatedAt: 'desc' },
        });
      }
    } catch (e) {
      return NextResponse.json(
        { error: 'Kart sistemi kullanılamıyor' },
        { status: 500 }
      );
    }

    if (!card) {
      return NextResponse.json(
        { error: 'Aktif kart bulunamadı' },
        { status: 404 }
      );
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        points: true,
        level: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
    }

    // Generate serial number
    const serialNumber = generateSerialNumber(user.id, card.id);

    // Generate .pkpass file
    const pkpassBuffer = await createPkPass({
      serialNumber,
      customerName: user.name || 'Müşteri',
      customerId: user.id,
      cardToken: card.token,
      cardId: card.id,
      points: user.points,
      level: user.level,
      activatedAt: card.activatedAt,
    });

    // Return the .pkpass file
    return new NextResponse(pkpassBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="qratex-card-${card.id.slice(-8)}.pkpass"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error generating Apple Wallet pass:', error);
    return NextResponse.json(
      { error: 'Kart oluşturulamadı' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallet/apple
 * Check if Apple Wallet pass can be generated
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ available: false, reason: 'unauthorized' });
    }

    // Check if certificates are configured
    const hasCertificates = !!(
      process.env.APPLE_PASS_CERT_P12_BASE64 &&
      process.env.APPLE_PASS_CERT_PASSWORD &&
      process.env.APPLE_PASS_TYPE_IDENTIFIER
    );

    // Check if user has an activated card
    let hasCard = false;
    try {
      const card = await (prisma as any).physicalCard.findFirst({
        where: {
          customerId: session.user.id,
          status: 'ACTIVATED',
        },
      });
      hasCard = !!card;
    } catch (e) {
      // Card system not available
    }

    return NextResponse.json({
      available: hasCard,
      configured: hasCertificates,
      reason: !hasCard ? 'no_card' : !hasCertificates ? 'not_configured' : 'ready',
    });
  } catch (error) {
    return NextResponse.json({ available: false, reason: 'error' });
  }
}
