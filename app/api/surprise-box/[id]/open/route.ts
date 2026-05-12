import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 });
    }

    const { id } = await params;
    const box = await prisma.userSurpriseBox.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!box) {
      return NextResponse.json({ success: false, error: 'Kutu bulunamadı' }, { status: 404 });
    }
    if (box.openedAt) {
      return NextResponse.json({
        success: true,
        data: { box, alreadyOpened: true },
      });
    }

    const now = new Date();
    let newPoints = session.user.points ?? 0;
    if (box.points > 0) {
      const updatedUser = await creditPointsAndXp(prisma, {
        userId: session.user.id,
        points: box.points,
      });
      newPoints = updatedUser.points;
    }

    await prisma.userSurpriseBox.update({
      where: { id },
      data: { openedAt: now },
    });

    const updated = await prisma.userSurpriseBox.findUnique({ where: { id } });

    return NextResponse.json({
      success: true,
      data: {
        box: updated,
        pointsGranted: box.points,
        newPoints,
      },
    });
  } catch (e) {
    console.error('Surprise box open error:', e);
    return NextResponse.json({ success: false, error: 'Kutu açılamadı' }, { status: 500 });
  }
}
