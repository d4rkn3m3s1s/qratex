import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TEAM_ROUTE_ROLES, assertDepartment, assertTeamMember, requireTeamViewer } from '@/lib/team/access';
import { INITIATIVE_PHASES, INITIATIVE_SOURCE, PHASE_META, TASK_PRIORITIES } from '@/lib/team/constants';
import { INITIATIVE_SELECT, doneMilestoneCounts, findInitiative, toInitiativeDto } from '@/lib/team/initiatives';
import { parseDueDay } from '@/lib/team/tasks';
import { dueDayOf } from '@/lib/team/dates';

export const dynamic = 'force-dynamic';

const listQuery = z.object({ archived: z.enum(['1', '0']).optional() });

/** GET — girişimler (tüm ekip okur; yalnız yönetici düzenler). İlerleme kilometre taşlarından türetilir. */
export const GET = defineRoute(
  { name: 'team.initiatives.list', roles: TEAM_ROUTE_ROLES, query: listQuery, rateLimit: 'read' },
  async ({ user, query }) => {
    await requireTeamViewer(user.id);
    const rows = await prisma.companyTask.findMany({
      where: { sourceType: INITIATIVE_SOURCE, archivedAt: query.archived === '1' ? { not: null } : null },
      select: INITIATIVE_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
    });
    const done = await doneMilestoneCounts(rows.map((r) => r.id));
    return { items: rows.map((r) => toInitiativeDto(r, done.get(r.id) ?? 0)) };
  }
);

const createBody = z.object({
  title: z.string().trim().min(2, 'Başlık en az 2 karakter olmalı').max(200),
  description: z.string().max(8000).nullish(),
  phase: z.enum(INITIATIVE_PHASES).default('later'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  ownerId: z.string().max(60).nullish(),
  targetDate: z.string().max(10).nullish(),
  department: z.string().max(60).nullish(),
  tags: z.string().max(300).nullish(),
  milestones: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
});

/** POST — girişim oluştur (yönetici). */
export const POST = defineRoute(
  { name: 'team.initiatives.create', roles: TEAM_ROUTE_ROLES, schema: createBody, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await Promise.all([assertTeamMember(body.ownerId), assertDepartment(body.department)]);
    const row = await prisma.companyTask.create({
      data: {
        title: body.title,
        description: body.description?.trim() || null,
        status: body.phase,
        priority: body.priority,
        department: body.department || null,
        weekKey: null,
        tags: body.tags?.split(',').map((t) => t.trim()).filter(Boolean).join(',') || null,
        assignedToId: body.ownerId || null,
        createdById: viewer.userId,
        dueAt: parseDueDay(body.targetDate),
        completedAt: body.phase === 'shipped' ? new Date() : null,
        sourceType: INITIATIVE_SOURCE,
        checklist: body.milestones?.length ? { create: body.milestones.map((text, i) => ({ text, order: i })) } : undefined,
        activities: { create: { actorId: viewer.userId, action: 'created', detail: `Girişimi oluşturdu (${PHASE_META[body.phase].label})` } },
      },
      select: INITIATIVE_SELECT,
    });
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: 'create',
        entity: 'team_initiative',
        entityId: row.id,
        newData: { title: row.title, phase: body.phase } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    return { item: toInitiativeDto(row, 0) };
  }
);

const patchBody = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(8000).nullish(),
  phase: z.enum(INITIATIVE_PHASES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  ownerId: z.string().max(60).nullish(),
  targetDate: z.string().max(10).nullish(),
  department: z.string().max(60).nullish(),
  tags: z.string().max(300).nullish(),
  archived: z.boolean().optional(),
});
const idQuery = z.object({ id: z.string().min(1).max(60) });

/** PATCH ?id= — düzenle, aşama değiştir, arşivle (yönetici). Her değişiklik geçmişe yazılır. */
export const PATCH = defineRoute(
  { name: 'team.initiatives.update', roles: TEAM_ROUTE_ROLES, query: idQuery, schema: patchBody, rateLimit: 'mutation' },
  async ({ user, query, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const before = await findInitiative(query.id);
    if (body.ownerId !== undefined) await assertTeamMember(body.ownerId);
    if (body.department !== undefined) await assertDepartment(body.department);
    const data: Prisma.CompanyTaskUncheckedUpdateInput = {};
    const log: string[] = [];
    if (body.title !== undefined && body.title !== before.title) {
      data.title = body.title;
      log.push(`Başlığı "${body.title.slice(0, 80)}" yaptı`);
    }
    if (body.description !== undefined) {
      data.description = body.description?.trim() || null;
      if ((before.description ?? '') !== (data.description ?? '')) log.push('Açıklamayı güncelledi');
    }
    if (body.phase !== undefined && body.phase !== before.status) {
      data.status = body.phase;
      data.completedAt = body.phase === 'shipped' ? new Date() : null;
      log.push(`Aşamayı "${PHASE_META[body.phase].label}" yaptı`);
    }
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.ownerId !== undefined && (body.ownerId || null) !== (before.assignedTo?.id ?? null)) {
      data.assignedToId = body.ownerId || null;
      log.push(body.ownerId ? 'Sorumluyu değiştirdi' : 'Sorumluyu kaldırdı');
    }
    if (body.targetDate !== undefined) {
      data.dueAt = parseDueDay(body.targetDate);
      if (dueDayOf(before.dueAt) !== (body.targetDate || null)) log.push(body.targetDate ? `Hedef tarihi ${body.targetDate} yaptı` : 'Hedef tarihi kaldırdı');
    }
    if (body.department !== undefined) data.department = body.department || null;
    if (body.tags !== undefined) data.tags = body.tags?.split(',').map((t) => t.trim()).filter(Boolean).join(',') || null;
    if (body.archived !== undefined) {
      data.archivedAt = body.archived ? new Date() : null;
      log.push(body.archived ? 'Arşivledi' : 'Arşivden çıkardı');
    }
    const row = await prisma.companyTask.update({ where: { id: before.id }, data, select: INITIATIVE_SELECT });
    if (log.length) {
      await prisma.taskActivity
        .createMany({ data: log.map((detail) => ({ taskId: row.id, actorId: viewer.userId, action: 'initiative', detail })) })
        .catch(() => undefined);
    }
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: 'update',
        entity: 'team_initiative',
        entityId: row.id,
        newData: body as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    const done = await doneMilestoneCounts([row.id]);
    return { item: toInitiativeDto(row, done.get(row.id) ?? 0) };
  }
);
