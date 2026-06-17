import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';


export const dynamic = 'force-dynamic';

/**
 * POST /api/gamification/badges/[id]/unlock
 * Puanla rozet açma: pointCost kadar puan düşülür, UserBadge oluşturulur.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { id: badgeId } = await params;

    const badge = await prisma.badge.findUnique({
      where: { id: badgeId, isActive: true },
    });

    if (!badge) {
      return NextResponse.json({ success: false, error: 'Rozet bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const pointCost = badge.pointCost ?? 0;
    if (pointCost <= 0) {
      return NextResponse.json(
        { success: false, error: 'Bu rozet puanla açılamaz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.userBadge.findUnique({
      where: {
        userId_badgeId: { userId: session.user.id, badgeId },
      },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Bu rozete zaten sahipsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Atomik harcama: check-then-act yerine guarded decrement (debitPoints).
    // İki eşzamanlı istek aynı bakiyeyi görüp ikisi de düşürmesin (çift harcama/eksi bakiye).
    let newPoints: number;
    try {
      const debited = await prisma.$transaction(async (tx) => {
        const wallet = await debitPoints(tx, { userId: session.user.id, points: pointCost });
        await tx.userBadge.create({ data: { userId: session.user.id, badgeId } });
        return wallet;
      });
      newPoints = debited.points;
    } catch (err) {
      if (err instanceof InsufficientPointsError) {
        return NextResponse.json(
          { success: false, error: `Yeterli puanınız yok. Gerekli: ${pointCost} puan` },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      data: {
        badgeId,
        newPoints,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Badge unlock error:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet açılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
