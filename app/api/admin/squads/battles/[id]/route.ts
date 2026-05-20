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
    const body = await request.json();
    const { action, ...data } = body;

    if (action === 'finish') {
      const battle = await finishSquadBattle(params.id);
      return NextResponse.json({ success: true, battle });
    }

    const updated = await prisma.squadBattle.update({
      where: { id: params.id },
      data: {
        status: data.status,
        squad1Score: data.squad1Score,
        squad2Score: data.squad2Score,
        rewardPool: data.rewardPool,
        endTime: data.endTime ? new Date(data.endTime) : undefined,
      },
    });

    return NextResponse.json({ success: true, battle: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Güncelleme başarısız' }, { status: 500 });
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
