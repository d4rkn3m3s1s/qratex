import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, findVisibleTask, requireTeamViewer } from '@/lib/team/access';
import { TASK_LIST_SELECT, toTaskDto } from '@/lib/team/tasks';
import { isWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(60) });
const body = z.object({ weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional() }).optional();

/**
 * POST — görevi kopyalar (alt görev iskeletiyle; yorum/ek hariç). Kopya, istemcinin
 * görüntülediği haftaya yazılır (denetim Bulgu 62: geçmiş haftada "kopyalandı" deyip
 * ekranda göstermiyordu).
 */
export const POST = defineRoute(
  { name: 'team.task.duplicate', roles: TEAM_ROUTE_ROLES, params, schema: body, rateLimit: 'mutation' },
  async ({ user, params: p, body: b }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await findVisibleTask(viewer, p.id, { id: true });
    const src = await prisma.companyTask.findUniqueOrThrow({
      where: { id: p.id },
      include: { checklist: { orderBy: { order: 'asc' }, select: { text: true, order: true } } },
    });
    const copy = await prisma.companyTask.create({
      data: {
        title: `${src.title} (kopya)`.slice(0, 200),
        description: src.description,
        status: 'todo',
        priority: src.priority,
        department: src.department,
        weekKey: b?.weekKey ?? weekKeyOf(),
        tags: src.tags,
        assignedToId: src.assignedToId,
        estimateMin: src.estimateMin,
        dueAt: src.dueAt,
        createdById: viewer.userId,
        sourceType: 'manual',
        checklist: { create: src.checklist.map((c) => ({ text: c.text, order: c.order })) },
        activities: { create: { actorId: viewer.userId, action: 'created', detail: `"${src.title.slice(0, 80)}" görevinden kopyaladı` } },
      },
      select: TASK_LIST_SELECT,
    });
    after(async () => {
      const { runAutomations } = await import('@/lib/team-automation-engine');
      await runAutomations({
        trigger: 'created',
        task: { id: copy.id, title: copy.title, department: copy.department, assignedToId: copy.assignedToId, tags: copy.tags },
        actorId: viewer.userId,
      });
    });
    return { task: toTaskDto(copy) };
  }
);
