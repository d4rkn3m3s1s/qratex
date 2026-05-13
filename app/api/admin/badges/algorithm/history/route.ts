import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const rows = await prisma.auditLog.findMany({
    where: { action: 'BADGE_ALGO_UPDATE', entity: 'settings' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    success: true,
    history: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      user: r.user,
      oldData: r.oldData,
      newData: r.newData,
    })),
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

