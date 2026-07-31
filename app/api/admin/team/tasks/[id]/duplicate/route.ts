import { NextRequest, NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

/** POST: görevi kopyala (checklist iskeletiyle, yorumlar/ekler hariç). Yönetici. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess({ manager: true });
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const src = await prisma.companyTask.findUnique({
    where: { id },
    include: { checklist: { orderBy: { order: 'asc' }, select: { text: true, order: true } } },
  });
  if (!src) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  const copy = await prisma.companyTask.create({
    data: {
      title: `${src.title} (kopya)`,
      description: src.description,
      status: 'todo',
      priority: src.priority,
      department: src.department,
      weekKey: weekKeyOf(),
      tags: src.tags,
      assignedToId: src.assignedToId,
      estimateMin: src.estimateMin,
      createdById: auth.session.user.id,
      sourceType: 'manual',
      checklist: { create: src.checklist.map((c) => ({ text: c.text, order: c.order })) },
    },
    include: { assignedTo: { select: { id: true, name: true, email: true, image: true } } },
  });
  await prisma.taskActivity.create({
    data: { taskId: copy.id, actorId: auth.session.user.id, action: 'created', detail: `"${src.title}" görevinden kopyalandı` },
  }).catch(() => {});

  return NextResponse.json({ success: true, task: copy }, { headers: PRIVATE_NO_STORE_HEADERS });
}
