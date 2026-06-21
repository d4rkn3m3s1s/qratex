import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { createPkPass, generateSerialNumber } from '@/lib/wallet';


export const dynamic = 'force-dynamic';

/**
 * GET /api/wallet/apple
 * Generate and download Apple Wallet .pkpass file
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekiyor' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    
    if (session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Sadece müşteriler kart indirebilir' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Apple Wallet pass'i geçerli olması için PKCS#7 imzası gerektirir; sertifikalar
    // yoksa imzasız .pkpass iOS tarafından REDDEDİLİR. Bu durumda kullanıcıya
    // "başarı" gibi bozuk dosya göndermek yerine dürüst bir hata döndürürüz.
    const walletConfigured = !!(
      process.env.APPLE_PASS_CERT_P12_BASE64 &&
      process.env.APPLE_PASS_CERT_PASSWORD &&
      process.env.APPLE_PASS_TYPE_IDENTIFIER &&
      process.env.APPLE_WWDR_CERT_BASE64
    );
    if (!walletConfigured) {
      return NextResponse.json(
        { error: 'Apple Wallet entegrasyonu henüz yapılandırılmamış. Lütfen daha sonra tekrar deneyin.', reason: 'not_configured' },
        { status: 503, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('cardId');

    // Get user's card
    let card;
    
    try {
      if (cardId) {
        // Get specific card
        card = await prisma.physicalCard.findFirst({
          where: {
            id: cardId,
            customerId: session.user.id,
            status: 'ACTIVATED',
          },
        });
      } else {
        // Get user's first activated card
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
        { error: 'Kart sistemi kullanılamıyor' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (!card) {
      return NextResponse.json(
        { error: 'Aktif kart bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
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
        { error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
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
      activatedAt: card.activatedAt ?? undefined,
    });

    // Return the .pkpass file
    return new NextResponse(new Uint8Array(pkpassBuffer), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="qratex-card-${card.id.slice(-8)}.pkpass"`,
      },
    });
  } catch (error) {
    console.error('Error generating Apple Wallet pass:', error);
    return NextResponse.json(
      { error: 'Kart oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
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
      return NextResponse.json({ available: false, reason: 'unauthorized' }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Check if certificates are configured
    const hasCertificates = !!(
      process.env.APPLE_PASS_CERT_P12_BASE64 &&
      process.env.APPLE_PASS_CERT_PASSWORD &&
      process.env.APPLE_PASS_TYPE_IDENTIFIER &&
      process.env.APPLE_WWDR_CERT_BASE64
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
      configured: hasCertificates,
      reason: !hasCard ? 'no_card' : !hasCertificates ? 'not_configured' : 'ready',
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ available: false, reason: 'error' }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
}
