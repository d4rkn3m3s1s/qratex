import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { finishSquadBattle } from '@/lib/gamification-engine';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const params = await context.params;

    const battle = await prisma.squadBattle.findUnique({
      where: { id: params.id },
      include: {
        squad1: true,
        squad2: true,
        participants: {
          include: {
            user: { select: { id: true, name: true, image: true } }
          }
        }
      }
    });

    if (!battle) {
      return NextResponse.json({ error: 'Savaş bulunamadı' }, { status: 404 });
    }

    return NextResponse.json({ success: true, battle });
  } catch (error) {
    return NextResponse.json({ error: 'Savaş detayları getirilemedi' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const params = await context.params;
    const body = await request.json().catch(() => ({}));
    const { action, ...data } = body;

    if (action === 'finish') {
      const battle = await finishSquadBattle(params.id);
      return NextResponse.json({ success: true, battle });
    }

    // GÜVENE AL: status yalnız geçerli enum; skor/ödül-havuzu negatif olamaz + üst sınır
    // (rewardPool battle bitince ödeme = ekonomi; sınırsız değer dev ödeme yaratabilir).
    const VALID_STATUS = ['pending', 'active', 'completed', 'cancelled'];
    const clampInt = (v: unknown, max: number): number | undefined =>
      v === undefined ? undefined : Math.min(max, Math.max(0, Math.floor(Number(v)) || 0));
    const status = typeof data.status === 'string' && VALID_STATUS.includes(data.status) ? data.status : undefined;
    const endTime = data.endTime ? new Date(data.endTime) : undefined;

    const updated = await prisma.squadBattle.update({
      where: { id: params.id },
      data: {
        status,
        squad1Score: clampInt(data.squad1Score, 10_000_000),
        squad2Score: clampInt(data.squad2Score, 10_000_000),
        rewardPool: clampInt(data.rewardPool, 10_000_000),
        endTime: endTime && !isNaN(endTime.getTime()) ? endTime : undefined,
      },
    });

    return NextResponse.json({ success: true, battle: updated });
  } catch (error) {
    console.error('[squads/battles PATCH]', error);
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const params = await context.params;

    await prisma.squadBattle.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Savaş silinemedi' }, { status: 500 });
  }
}
