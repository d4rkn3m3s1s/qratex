import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Savaşları listele
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const battles = await prisma.squadBattle.findMany({
      include: {
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'desc' },
    });

    return NextResponse.json({ success: true, battles });
  } catch (error) {
    console.error('Error fetching battles:', error);
    return NextResponse.json({ error: 'Savaşlar getirilemedi' }, { status: 500 });
  }
}

// Yeni savaş oluştur
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { squad1Id, squad2Id, startTime, endTime, rewardPool } = body;

    if (!squad1Id || !squad2Id || !startTime || !endTime) {
      return NextResponse.json({ error: 'Eksik bilgi' }, { status: 400 });
    }

    const battle = await prisma.squadBattle.create({
      data: {
        squad1Id,
        squad2Id,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        rewardPool: rewardPool || 0,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, battle });
  } catch (error) {
    console.error('Error creating battle:', error);
    return NextResponse.json({ error: 'Savaş oluşturulamadı' }, { status: 500 });
  }
}
