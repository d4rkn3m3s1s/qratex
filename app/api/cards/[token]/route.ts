import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,128}$/;

/**
 * GET /api/cards/[token]
 * Kart durumunu token ile getirir (aktivasyon sayfası `/c/[token]`).
 *
 * P0-09: Eski yanıt oturumsuz herkese kart sahibinin ADINI, FOTOĞRAFINI ve kullanıcı id'sini
 * veriyordu — QR'ı gören (masadaki kart, paylaşılan fotoğraf) kişi kart sahibinin kimliğini
 * öğreniyordu. Artık sahip bilgisi YALNIZ kartın sahibine döner; diğer herkes yalnız
 * "kart aktif / sahipli" bilgisini alır. Blok gerekçesi (iç not) de dışarı verilmez.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || !TOKEN_RE.test(token)) {
      return NextResponse.json(
        { error: 'Geçersiz kart bağlantısı', code: 'INVALID_TOKEN' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Token taramasına (enumeration) karşı IP başına sınır.
    const rl = await checkRateLimitDb(`card-lookup:${getClientIdentifier(request)}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)),
          },
        }
      );
    }

    const card = await prisma.physicalCard.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        status: true,
        activatedAt: true,
        customerId: true,
        archivedAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!card || card.archivedAt) {
      return NextResponse.json(
        { error: 'Kart bulunamadı', code: 'CARD_NOT_FOUND' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (card.status === 'BLOCKED') {
      return NextResponse.json(
        { error: 'Bu kart bloklanmış', code: 'CARD_BLOCKED' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id ?? null;
    const isOwnCard = !!viewerId && !!card.customerId && card.customerId === viewerId;
    const hasOwner = !!card.customerId;

    return NextResponse.json({
      success: true,
      card: {
        id: card.id,
        token: card.token,
        status: card.status,
        isActivated: card.status === 'ACTIVATED',
        activatedAt: isOwnCard ? card.activatedAt : null,
        isOwnCard,
        ownerHidden: hasOwner && !isOwnCard,
        // Sahip kimliği yalnız sahibine. Başkasına yalnız "sahipli" yer tutucusu (geriye uyumlu şekil:
        // istemci `customer` varlığına bakıp "Kart aktif" ekranını gösterir).
        customer: !hasOwner
          ? null
          : isOwnCard && card.customer
            ? { id: card.customer.id, name: card.customer.name, image: card.customer.image }
            : { id: '', name: 'Kayıtlı kart sahibi', image: null },
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching card:', error);
    return NextResponse.json(
      { error: 'Kart bilgisi alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
