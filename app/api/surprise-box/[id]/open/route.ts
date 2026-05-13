import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { creditPointsAndXp } from '@/lib/points-wallet';

export const dynamic = 'force-dynamic';

/** POST: Sürpriz kutusunu aç; puan varsa kullanıcıya eklenir */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { id } = await params;
    if (!id || id.length > 64) {
      return NextResponse.json({ success: false, error: 'Geçersiz kutu' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const box = await prisma.userSurpriseBox.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!box) {
      return NextResponse.json({ success: false, error: 'Kutu bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (box.openedAt) {
      return NextResponse.json({
        success: true,
        data: { box, alreadyOpened: true },
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.userSurpriseBox.updateMany({
        where: { id, userId: session.user.id, openedAt: null },
        data: { openedAt: now },
      });

      if (claimed.count === 0) {
        const again = await tx.userSurpriseBox.findFirst({
          where: { id, userId: session.user.id },
        });
        return { kind: 'already_opened' as const, again };
      }

      let newPoints = session.user.points ?? 0;
      if (box.points > 0) {
        const updatedUser = await creditPointsAndXp(tx, {
          userId: session.user.id,
          points: box.points,
        });
        newPoints = updatedUser.points;
      }

      const updated = await tx.userSurpriseBox.findUnique({ where: { id } });
      return { kind: 'opened' as const, updated, newPoints };
    });

    if (result.kind === 'already_opened') {
      if (!result.again) {
        return NextResponse.json({ success: false, error: 'Kutu bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      return NextResponse.json({
        success: true,
        data: { box: result.again, alreadyOpened: true },
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({
      success: true,
      data: {
        box: result.updated,
        pointsGranted: box.points,
        newPoints: result.newPoints,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    console.error('Surprise box open error:', e);
    return NextResponse.json({ success: false, error: 'Kutu açılamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
