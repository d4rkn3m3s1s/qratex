import { NextRequest, NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { generateTasksFromBusinessData } from '@/lib/team-autotask';

export const dynamic = 'force-dynamic';

/** GET: kaç aday kaynak var (önizleme — açık incident + bekleyen action item). */
export async function GET() {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const [incidents, actionItems] = await Promise.all([
    prisma.incident.count({ where: { status: { in: ['open', 'assigned'] }, severity: { in: ['high', 'critical'] } } }),
    prisma.actionItem.count({ where: { status: { in: ['pending', 'assigned'] }, priority: 'high' } }),
  ]);
  return NextResponse.json({ success: true, candidates: { incidents, actionItems } }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** POST: işletme verisinden görev üret (idempotent). Yönetici. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;

  const result = await generateTasksFromBusinessData(auth.session.user.id);

  await prisma.auditLog.create({
    data: {
      userId: auth.session.user.id,
      action: 'autotask_generate',
      entity: 'company_task',
      newData: result as object,
    },
  });

  return NextResponse.json({ success: true, ...result }, { headers: PRIVATE_NO_STORE_HEADERS });
}
