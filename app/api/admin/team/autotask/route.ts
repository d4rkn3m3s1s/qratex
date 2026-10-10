import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { generateTasksFromBusinessData, previewBusinessTasks } from '@/lib/team-autotask';
import { isWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

/** GET — önizleme: kaç YENİ görev üretilecek (denetim Bulgu 18: arayüz önizlemeyi kullanmıyordu). */
export const GET = defineRoute(
  { name: 'team.autotask.preview', roles: TEAM_ROUTE_ROLES, rateLimit: 'read' },
  async ({ user }) => {
    await requireTeamViewer(user.id, { manager: true });
    return { candidates: await previewBusinessTasks() };
  }
);

const body = z.object({ weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional() }).optional();

/** POST — işletme verisinden görev üret (idempotent; görüntülenen haftaya). */
export const POST = defineRoute(
  { name: 'team.autotask.generate', roles: TEAM_ROUTE_ROLES, schema: body, rateLimit: 'mutation' },
  async ({ user, body: b, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const result = await generateTasksFromBusinessData(viewer.userId, b?.weekKey ?? weekKeyOf());
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: 'autotask_generate',
        entity: 'company_task',
        newData: { fromIncidents: result.fromIncidents, fromActionItems: result.fromActionItems } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    if (result.created.length) {
      after(async () => {
        const { runAutomations } = await import('@/lib/team-automation-engine');
        for (const t of result.created) {
          await runAutomations({
            trigger: 'created',
            task: { id: t.id, title: t.title, department: t.department, assignedToId: null, tags: t.tags },
            actorId: viewer.userId,
          });
        }
      });
    }
    return { fromIncidents: result.fromIncidents, fromActionItems: result.fromActionItems, total: result.total };
  }
);
