import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET: tüm ekip aktivite akışı (feed). Görev + aktör bilgisiyle.
 * Filtreler: ?actor=userId, ?action=status|commented|...
 */
export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const sp = req.nextUrl.searchParams;
  const actor = sp.get('actor');
  const action = sp.get('action');

  const where: Prisma.TaskActivityWhereInput = {};
  if (actor) where.actorId = actor;
  if (action) where.action = action;

  const activities = await prisma.taskActivity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, action: true, detail: true, createdAt: true,
      actor: { select: { id: true, name: true, email: true, image: true } },
      task: { select: { id: true, title: true, department: true, status: true } },
    },
  });

  return NextResponse.json({ success: true, activities }, { headers: PRIVATE_NO_STORE_HEADERS });
}
