import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';
import { INITIATIVE_SOURCE } from '@/lib/team/constants';
import { doneMilestoneCounts, findInitiative, toInitiativeDto } from '@/lib/team/initiatives';
import { canDeleteComment } from '@/lib/team/permissions';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(60) });

async function detail(id: string, viewer: { userId: string; isManager: boolean }) {
  const row = await findInitiative(id);
  const [done, milestones, notes, history] = await Promise.all([
    doneMilestoneCounts([row.id]),
    prisma.taskChecklistItem.findMany({
      where: { taskId: row.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, text: true, done: true },
    }),
    prisma.taskComment.findMany({
      where: { taskId: row.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, text: true, createdAt: true, authorId: true, author: { select: { id: true, name: true, image: true } } },
    }),
    prisma.taskActivity.findMany({
      where: { taskId: row.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, detail: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);
  return {
    item: toInitiativeDto(row, done.get(row.id) ?? 0),
    milestones,
    notes: notes.map((n) => ({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt.toISOString(),
      author: n.author,
      canDelete: canDeleteComment(viewer, n),
    })),
    history: history.map((h) => ({ id: h.id, detail: h.detail, createdAt: h.createdAt.toISOString(), actorName: h.actor?.name ?? 'Eski üye' })),
  };
}

/** GET — girişim detayı: kilometre taşları, karar notları, değişiklik geçmişi. */
export const GET = defineRoute(
  { name: 'team.initiative.detail', roles: TEAM_ROUTE_ROLES, params, rateLimit: 'read' },
  async ({ user, params: p }) => {
    const viewer = await requireTeamViewer(user.id);
    return detail(p.id, viewer);
  }
);

const opBody = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_milestone'), text: z.string().trim().min(1).max(300) }),
  z.object({ op: z.literal('toggle_milestone'), itemId: z.string().max(60), done: z.boolean() }),
  z.object({ op: z.literal('delete_milestone'), itemId: z.string().max(60) }),
  z.object({ op: z.literal('add_note'), text: z.string().trim().min(1).max(4000) }),
  z.object({ op: z.literal('delete_note'), noteId: z.string().max(60) }),
]);

/** POST — kilometre taşı (yönetici) ve karar notu (tüm ekip) işlemleri. */
export const POST = defineRoute(
  { name: 'team.initiative.action', roles: TEAM_ROUTE_ROLES, params, schema: opBody, rateLimit: 'mutation' },
  async ({ user, params: p, body }) => {
    const viewer = await requireTeamViewer(user.id);
    const row = await prisma.companyTask.findFirst({ where: { id: p.id, sourceType: INITIATIVE_SOURCE }, select: { id: true } });
    if (!row) throw new ApiError('NOT_FOUND', 'Girişim bulunamadı.');
    const log = (detail: string) =>
      prisma.taskActivity.create({ data: { taskId: row.id, actorId: viewer.userId, action: 'initiative', detail } }).catch(() => undefined);
    const managerOnly = () => {
      if (!viewer.isManager) throw new ApiError('FORBIDDEN', 'Kilometre taşlarını yalnız ekip yöneticisi düzenler.');
    };
    const milestone = async (itemId: string) => {
      const m = await prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId: row.id }, select: { id: true, text: true } });
      if (!m) throw new ApiError('NOT_FOUND', 'Kilometre taşı bulunamadı.');
      return m;
    };

    switch (body.op) {
      case 'add_milestone': {
        managerOnly();
        const max = await prisma.taskChecklistItem.aggregate({ where: { taskId: row.id }, _max: { order: true } });
        await prisma.taskChecklistItem.create({ data: { taskId: row.id, text: body.text, order: (max._max.order ?? -1) + 1 } });
        await log(`Kilometre taşı ekledi: ${body.text.slice(0, 80)}`);
        break;
      }
      case 'toggle_milestone': {
        managerOnly();
        const m = await milestone(body.itemId);
        await prisma.taskChecklistItem.update({ where: { id: m.id }, data: { done: body.done } });
        await log(`${body.done ? 'Tamamladı' : 'Yeniden açtı'}: ${m.text.slice(0, 80)}`);
        break;
      }
      case 'delete_milestone': {
        managerOnly();
        const m = await milestone(body.itemId);
        await prisma.taskChecklistItem.delete({ where: { id: m.id } });
        await log(`Kilometre taşını sildi: ${m.text.slice(0, 80)}`);
        break;
      }
      case 'add_note': {
        await prisma.taskComment.create({ data: { taskId: row.id, authorId: viewer.userId, text: body.text } });
        await log('Karar notu ekledi');
        break;
      }
      case 'delete_note': {
        const n = await prisma.taskComment.findFirst({ where: { id: body.noteId, taskId: row.id }, select: { id: true, authorId: true } });
        if (!n) throw new ApiError('NOT_FOUND', 'Not bulunamadı.');
        if (!canDeleteComment(viewer, n)) throw new ApiError('FORBIDDEN', 'Bu notu silemezsin.');
        await prisma.taskComment.delete({ where: { id: n.id } });
        break;
      }
    }
    return detail(row.id, viewer);
  }
);
