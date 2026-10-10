import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { TEAM_ROUTE_ROLES, requireTeamViewer } from '@/lib/team/access';

export const dynamic = 'force-dynamic';

const ENTITIES = ['department', 'admin_team_member', 'team_automation', 'team_initiative'] as const;

const ACTION_LABEL: Record<string, string> = {
  add_team_member: 'ekibe ekledi',
  update_team_member: 'üyeyi güncelledi',
  remove_team_member: 'ekipten çıkardı',
  create: 'oluşturdu',
  update: 'düzenledi',
  archive: 'arşivledi',
  restore: 'arşivden çıkardı',
  delete: 'sildi',
  merge: 'birleştirdi',
  seed: 'varsayılan departmanları yükledi',
};

const ENTITY_LABEL: Record<string, string> = {
  department: 'Departman',
  admin_team_member: 'Üye',
  team_automation: 'Otomasyon',
  team_initiative: 'Girişim',
};

const query = z.object({ cursor: z.string().max(60).optional() });

/**
 * GET — ekip yönetimi değişiklik geçmişi (kim, kimi, ne zaman). Denetim departmanlar
 * "değişiklik geçmişi görüntüleme" EKSİK: audit zaten yazılıyordu, görüntüleyicisi yoktu.
 */
export const GET = defineRoute(
  { name: 'team.audit.list', roles: TEAM_ROUTE_ROLES, query, rateLimit: 'read' },
  async ({ user, query: q }) => {
    await requireTeamViewer(user.id, { manager: true });
    const rows = await prisma.auditLog.findMany({
      where: { entity: { in: [...ENTITIES] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 41,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, action: true, entity: true, entityId: true, createdAt: true, newData: true, user: { select: { name: true } } },
    });
    const memberIds = rows.filter((r) => r.entity === 'admin_team_member' && r.entityId).map((r) => r.entityId!);
    const deptIds = rows.filter((r) => r.entity === 'department' && r.entityId).map((r) => r.entityId!);
    const [members, depts] = await Promise.all([
      memberIds.length ? prisma.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } }) : [],
      deptIds.length ? prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }) : [],
    ]);
    const names = new Map<string, string>([
      ...members.map((m) => [m.id, m.name ?? 'üye'] as [string, string]),
      ...depts.map((d) => [d.id, d.name] as [string, string]),
    ]);
    const items = rows.slice(0, 40).map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actorName: r.user?.name ?? 'Silinmiş kullanıcı',
      entity: ENTITY_LABEL[r.entity] ?? r.entity,
      target: r.entityId ? names.get(r.entityId) ?? null : null,
      action: ACTION_LABEL[r.action] ?? r.action,
    }));
    return { items, nextCursor: rows.length > 40 ? items[items.length - 1]?.id ?? null : null };
  }
);
