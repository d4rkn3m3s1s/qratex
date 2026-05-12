import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const entries = await prisma.auditLog.findMany({
      where: { entity: 'settings' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        entityId: true,
        oldData: true,
        newData: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Settings audit GET error:', error);
    return NextResponse.json({ error: 'Ayar geçmişi alınamadı' }, { status: 500 });
  }
}
