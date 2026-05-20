import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const users = await prisma.user.findMany({
      where: { isHallOfFame: true },
      select: {
        id: true,
        name: true,
        email: true,
        level: true,
        xp: true,
        biography: true,
      },
    });

    return NextResponse.json({ success: true, users });
  } catch (error) {
    return NextResponse.json({ error: 'Kullanıcılar getirilemedi' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { userId, isHallOfFame } = body;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isHallOfFame },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    return NextResponse.json({ error: 'Kullanıcı güncellenemedi' }, { status: 500 });
  }
}
