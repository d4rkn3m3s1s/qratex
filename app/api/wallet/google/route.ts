import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  generateGooglePassObject,
  generateGoogleWalletJWT,
  getGoogleWalletSaveUrl,
  generateSerialNumber
} from '@/lib/wallet';

export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/google
 * Generate Google Wallet save URL
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
        { error: 'Sadece müşteriler kart ekleyebilir' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('cardId');

    // Get user's card
    let card;
    
    try {
      if (cardId) {
        card = await prisma.physicalCard.findFirst({
          where: {
            id: cardId,
            customerId: session.user.id,
            status: 'ACTIVATED',
          },
        });
      } else {
        card = await prisma.physicalCard.findFirst({
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

    // Check if Google Wallet is configured
    const isConfigured = !!(
      process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_WALLET_PRIVATE_KEY
    );

    if (!isConfigured) {
      // Return a demo URL or redirect to the card page
      return NextResponse.json({
        success: true,
        configured: false,
        message: 'Google Wallet henüz yapılandırılmamış',
        // Provide a fallback URL
        fallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/customer/my-card`,
      });
    }

    // Generate pass object
    const passId = generateSerialNumber(user.id, card.id);
    const passObject = generateGooglePassObject({
      id: passId,
      classId: 'qratex_membership',
      customerName: user.name || 'Müşteri',
      customerId: user.id,
      cardToken: card.token,
      points: user.points,
      level: user.level,
      email: user.email || undefined,
    });

    try {
      // Generate JWT and save URL
      const jwt = await generateGoogleWalletJWT(passObject);
      const saveUrl = getGoogleWalletSaveUrl(jwt);

      return NextResponse.json({
        success: true,
        configured: true,
        saveUrl,
        passId,
      });
    } catch (jwtError) {
      console.error('JWT generation error:', jwtError);
      return NextResponse.json({
        success: true,
        configured: false,
        message: 'JWT oluşturulamadı',
        fallbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/customer/my-card`,
      });
    }
  } catch (error) {
    console.error('Error generating Google Wallet pass:', error);
    return NextResponse.json(
      { error: 'Kart oluşturulamadı' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallet/google
 * Check if Google Wallet is available
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ available: false, reason: 'unauthorized' });
    }

    // Check if credentials are configured
    const hasCredentials = !!(
      process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_WALLET_PRIVATE_KEY
    );

    // Check if user has an activated card
    let hasCard = false;
    try {
      const card = await prisma.physicalCard.findFirst({
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
      configured: hasCredentials,
      reason: !hasCard ? 'no_card' : !hasCredentials ? 'not_configured' : 'ready',
    });
  } catch (error) {
    return NextResponse.json({ available: false, reason: 'error' });
  }
}
