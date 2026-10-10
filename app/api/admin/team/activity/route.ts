import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { NOT_INITIATIVE, TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';

export const dynamic = 'force-dynamic';

const PAGE = 50;

const ACTION_GROUPS: Record<string, string[]> = {
  status: ['status', 'system_status'],
  comment: ['commented', 'mentioned'],
  assign: ['assigned'],
  edit: ['edited', 'priority', 'archived', 'created'],
  file: ['attachment'],
  checklist: ['checklist', 'time'],
  automation: ['automation'],
  system: ['system_due_soon', 'system_overdue', 'system_review_late', 'system_status'],
};

const query = z.object({
  actor: z.string().max(60).optional(),
  group: z.enum(['status', 'comment', 'assign', 'edit', 'file', 'checklist', 'automation', 'system']).optional(),
  cursor: z.string().max(60).optional(),
});

/**
 * GET — ekip aktivite akışı (yönetici). Kişi ve tür filtresi, imleçli "daha fazla yükle"
 * (denetim Bulgu 72: filtreler arayüzde yoktu, 100 kayıtla kesiliyordu, toplu işlemler hiç
 * loglanmıyordu — artık loglanıyor).
 */
export const GET = defineRoute(
  { name: 'team.activity.list', roles: TEAM_ROUTE_ROLES, query, rateLimit: 'read' },
  async ({ user, query: q }) => {
    await requireTeamViewer(user.id, { manager: true });
    const where: Prisma.TaskActivityWhereInput = { task: NOT_INITIATIVE };
    if (q.actor) where.actorId = q.actor;
    if (q.group) where.action = { in: ACTION_GROUPS[q.group] };
    const rows = await prisma.taskActivity.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        detail: true,
        createdAt: true,
        actor: { select: { id: true, name: true, image: true } },
        task: { select: { id: true, title: true, status: true } },
      },
    });
    const hasMore = rows.length > PAGE;
    const items = rows.slice(0, PAGE).map((a) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      createdAt: a.createdAt.toISOString(),
      actor: a.action.startsWith('system_') ? null : a.actor,
      task: a.task,
    }));
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }
);
