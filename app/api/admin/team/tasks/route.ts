import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  TEAM_ROUTE_ROLES,
  assertDepartment,
  assertTeamMember,
  findVisibleTask,
  requireTeamViewer,
  scopedTaskWhere,
} from '@/lib/team/access';
import { TASK_PRIORITIES, TASK_RECURRENCES, TASK_STATUSES, hasTag } from '@/lib/team/constants';
import { canMoveTask } from '@/lib/team/permissions';
import {
  TASK_LIST_SELECT,
  TASK_SORTS,
  assertNoDependencyCycle,
  cleanupFiles,
  fieldActivities,
  hardDeleteTasks,
  notifyAssignment,
  parseDueDay,
  sortTasks,
  toTaskDto,
} from '@/lib/team/tasks';
import { runEffects, transitionTask } from '@/lib/team/transitions';
import { isWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 500;

const listQuery = z.object({
  view: z.enum(['board', 'mine', 'archive', 'search']).default('board'),
  weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional(),
  department: z.string().max(60).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedTo: z.string().max(60).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  mine: z.enum(['1', '0']).optional(),
  sort: z.enum(TASK_SORTS).default('default'),
});

/**
 * GET — görev listesi (görünürlük kapsamlı).
 *  - `view=board` (varsayılan): seçili hafta + (içinde bulunulan haftaysa) önceki haftalardan
 *    DEVREDEN açık görevler (denetim Y2: pazartesi biten olmayan işler kayboluyordu).
 *  - `view=mine`: bana atanan açık işler (tüm haftalar) + bu hafta onaylananlar.
 *  - `view=archive`: arşivlenmiş görevler.
 *  - `view=search&q=`: tüm haftalarda arşivsiz görev arama (bağımlılık seçici; en fazla 20).
 */
export const GET = defineRoute(
  { name: 'team.tasks.list', roles: TEAM_ROUTE_ROLES, query: listQuery, rateLimit: 'read' },
  async ({ user, query }) => {
    const viewer = await requireTeamViewer(user.id);
    const current = weekKeyOf();
    const week = query.weekKey ?? current;

    const filters: Prisma.CompanyTaskWhereInput[] = [];
    if (query.view === 'archive') {
      filters.push({ archivedAt: { not: null } });
    } else {
      filters.push({ archivedAt: null });
    }
    if (query.view === 'board') {
      filters.push(
        week >= current
          ? { OR: [{ weekKey: week }, ...(week === current ? [{ weekKey: { lt: week }, status: { not: 'done' } }] : [])] }
          : { weekKey: week }
      );
    }
    if (query.view === 'mine') {
      filters.push({ assignedToId: viewer.userId });
      filters.push({ OR: [{ status: { not: 'done' } }, { status: 'done', weekKey: current }] });
    }
    // Departman filtresi yalnız yöneticide anlamlı; üyenin kapsamı zaten sunucuda.
    if (query.department && viewer.isManager) filters.push({ department: query.department });
    if (query.status) filters.push({ status: query.status });
    if (query.priority) filters.push({ priority: query.priority });
    if (query.mine === '1') filters.push({ assignedToId: viewer.userId });
    else if (query.assignedTo === 'unassigned') filters.push({ assignedToId: null });
    else if (query.assignedTo) filters.push({ assignedToId: query.assignedTo });
    if (query.tag) filters.push({ tags: { contains: query.tag, mode: 'insensitive' } });
    const q = query.q?.trim();
    if (q) {
      filters.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tags: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const limit = query.view === 'search' ? 20 : LIST_LIMIT;
    const rows = await prisma.companyTask.findMany({
      where: scopedTaskWhere(viewer, ...filters),
      select: TASK_LIST_SELECT,
      orderBy: query.view === 'archive' ? { archivedAt: 'desc' } : query.view === 'search' ? { updatedAt: 'desc' } : { createdAt: 'desc' },
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    // Etiket: TAM jeton eşleşmesi (eski `contains` "#tas" ile "tasarım"ı da getiriyordu).
    const tagged = query.tag ? rows.slice(0, limit).filter((r) => hasTag(r.tags, query.tag!)) : rows.slice(0, limit);
    const sorted = sortTasks(tagged, query.sort);
    const now = new Date();
    const items = sorted.map((r) => toTaskDto(r, { weekKey: query.view === 'board' ? week : undefined, now }));
    return {
      items,
      weekKey: week,
      currentWeekKey: current,
      carriedCount: items.filter((t) => t.carriedOver).length,
      truncated,
    };
  }
);

const createBody = z.object({
  title: z.string().trim().min(1, 'Başlık gerekli').max(200),
  description: z.string().max(8000).nullish(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  department: z.string().max(60).nullish(),
  assignedToId: z.string().max(60).nullish(),
  weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').nullish(),
  tags: z.string().max(300).nullish(),
  /** İstanbul günü `YYYY-MM-DD`; sunucu gün sonuna çevirir. */
  dueDate: z.string().max(10).nullish(),
  estimateMin: z.number().int().min(0).max(100_000).nullish(),
  recurrence: z.enum(TASK_RECURRENCES).nullish(),
  blockedById: z.string().max(60).nullish(),
  /** Alt görevler tek seferde ve sıralı yazılır (eski kod N paralel istekle sıra çakıştırıyordu). */
  checklist: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
});

/** POST — yeni görev (yönetici). */
export const POST = defineRoute(
  { name: 'team.tasks.create', roles: TEAM_ROUTE_ROLES, schema: createBody, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await Promise.all([assertTeamMember(body.assignedToId), assertDepartment(body.department)]);
    if (body.blockedById) await findVisibleTask(viewer, body.blockedById, { id: true });
    const dueAt = parseDueDay(body.dueDate);
    const tags = body.tags?.split(',').map((t) => t.trim()).filter(Boolean).join(',') || null;

    const task = await prisma.companyTask.create({
      data: {
        title: body.title,
        description: body.description?.trim() || null,
        status: 'todo',
        priority: body.priority,
        department: body.department || null,
        weekKey: body.weekKey || weekKeyOf(),
        tags,
        assignedToId: body.assignedToId || null,
        createdById: viewer.userId,
        dueAt,
        estimateMin: body.estimateMin ?? null,
        blockedById: body.blockedById || null,
        recurrence: body.recurrence ?? null,
        sourceType: 'manual',
        checklist: body.checklist?.length ? { create: body.checklist.map((text, i) => ({ text, order: i })) } : undefined,
        activities: { create: { actorId: viewer.userId, action: 'created', detail: 'Görevi oluşturdu' } },
      },
      select: TASK_LIST_SELECT,
    });

    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: 'create',
        entity: 'company_task',
        entityId: task.id,
        newData: { title: task.title, assignedToId: task.assignedToId, department: task.department } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });

    after(async () => {
      if (task.assignedToId) {
        await notifyAssignment({
          taskId: task.id,
          assigneeId: task.assignedToId,
          title: task.title,
          priority: task.priority,
          dueAt: task.dueAt,
          description: task.description,
        }).catch(() => undefined);
      }
      const { runAutomations } = await import('@/lib/team-automation-engine');
      const t = { id: task.id, title: task.title, department: task.department, assignedToId: task.assignedToId, tags: task.tags };
      await runAutomations({ trigger: 'created', task: t, actorId: viewer.userId });
      if (task.assignedToId) await runAutomations({ trigger: 'assigned', triggerValue: task.assignedToId, task: t, actorId: viewer.userId });
    });

    return { task: toTaskDto(task) };
  }
);

const updateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(8000).nullish(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  department: z.string().max(60).nullish(),
  assignedToId: z.string().max(60).nullish(),
  weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional(),
  tags: z.string().max(300).nullish(),
  dueDate: z.string().max(10).nullish(),
  estimateMin: z.number().int().min(0).max(100_000).nullish(),
  recurrence: z.enum(TASK_RECURRENCES).nullish(),
  blockedById: z.string().max(60).nullish(),
  archived: z.boolean().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  /** Red notu / yeniden açma gerekçesi / onay notu. */
  note: z.string().max(2000).nullish(),
});

const idQuery = z.object({ id: z.string().min(1).max(60) });

/**
 * PUT ?id= — görev düzenleme (denetim Bulgu 5: oluşturulan görev hiç düzenlenemiyordu) ve
 * durum geçişi. Üye yalnız kendine atanmış görevin DURUMUNU değiştirebilir; geçiş kuralları
 * `lib/team/transitions.ts`.
 */
export const PUT = defineRoute(
  { name: 'team.tasks.update', roles: TEAM_ROUTE_ROLES, schema: updateBody, query: idQuery, rateLimit: 'mutation' },
  async ({ user, body, query, request }) => {
    const viewer = await requireTeamViewer(user.id);
    const existing = await findVisibleTask(viewer, query.id, {
      id: true,
      title: true,
      description: true,
      priority: true,
      department: true,
      dueAt: true,
      tags: true,
      estimateMin: true,
      recurrence: true,
      weekKey: true,
      blockedById: true,
      archivedAt: true,
      assignedToId: true,
      createdById: true,
      status: true,
    });

    const fieldKeys = (Object.keys(body) as Array<keyof typeof body>).filter(
      (k) => body[k] !== undefined && k !== 'status' && k !== 'note'
    );
    if (fieldKeys.length > 0 && !viewer.isManager) {
      throw new ApiError('FORBIDDEN', 'Görevin alanlarını yalnız ekip yöneticisi düzenleyebilir; sen durumunu ilerletebilirsin.');
    }

    // ── Alan güncellemeleri (yönetici) ──
    if (fieldKeys.length > 0) {
      if (body.assignedToId !== undefined) await assertTeamMember(body.assignedToId);
      if (body.department !== undefined) await assertDepartment(body.department);
      if (body.blockedById) {
        await findVisibleTask(viewer, body.blockedById, { id: true });
        await assertNoDependencyCycle(existing.id, body.blockedById);
      }
      const data: Prisma.CompanyTaskUncheckedUpdateInput = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description?.trim() || null;
      if (body.priority !== undefined) data.priority = body.priority;
      if (body.department !== undefined) data.department = body.department || null;
      if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;
      if (body.weekKey !== undefined) data.weekKey = body.weekKey;
      if (body.tags !== undefined) data.tags = body.tags?.split(',').map((t) => t.trim()).filter(Boolean).join(',') || null;
      if (body.dueDate !== undefined) {
        data.dueAt = parseDueDay(body.dueDate);
        data.dueReminderSentAt = null; // tarih değişince hatırlatma yeniden kurulur
      }
      if (body.estimateMin !== undefined) data.estimateMin = body.estimateMin ?? null;
      if (body.recurrence !== undefined) data.recurrence = body.recurrence ?? null;
      if (body.blockedById !== undefined) data.blockedById = body.blockedById || null;
      if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;

      const updated = await prisma.companyTask.update({
        where: { id: existing.id },
        data,
        select: {
          title: true,
          description: true,
          priority: true,
          department: true,
          dueAt: true,
          tags: true,
          estimateMin: true,
          recurrence: true,
          weekKey: true,
          blockedById: true,
          archivedAt: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
        },
      });
      const departments = new Map(
        (await prisma.department.findMany({ select: { slug: true, name: true } })).map((d) => [d.slug, d.name])
      );
      const rows = fieldActivities(existing, updated, { departments });
      if (body.assignedToId !== undefined && updated.assignedToId !== existing.assignedToId) {
        rows.push({
          action: 'assigned',
          detail: updated.assignedTo ? `${updated.assignedTo.name || 'Bir üyeye'} atadı` : 'Atamayı kaldırdı',
        });
      }
      if (rows.length > 0) {
        await prisma.taskActivity
          .createMany({ data: rows.map((r) => ({ taskId: existing.id, actorId: viewer.userId, action: r.action, detail: r.detail })) })
          .catch(() => undefined);
      }
      await prisma.auditLog.create({
        data: {
          userId: viewer.userId,
          action: 'update',
          entity: 'company_task',
          entityId: existing.id,
          oldData: { title: existing.title, assignedToId: existing.assignedToId, priority: existing.priority } as Prisma.InputJsonValue,
          newData: Object.fromEntries(fieldKeys.map((k) => [k, body[k] ?? null])) as Prisma.InputJsonValue,
          ...getAuditRequestMeta(request),
        },
      });
      if (updated.assignedToId && updated.assignedToId !== existing.assignedToId) {
        const assigneeId = updated.assignedToId;
        after(async () => {
          await notifyAssignment({
            taskId: existing.id,
            assigneeId,
            title: updated.title,
            priority: updated.priority,
            dueAt: updated.dueAt,
            description: updated.description,
          }).catch(() => undefined);
          const { runAutomations } = await import('@/lib/team-automation-engine');
          await runAutomations({
            trigger: 'assigned',
            triggerValue: assigneeId,
            task: { id: existing.id, title: updated.title, department: updated.department, assignedToId: assigneeId, tags: updated.tags },
            actorId: viewer.userId,
          });
        });
      }
    }

    // ── Durum geçişi ──
    let transition: Awaited<ReturnType<typeof transitionTask>> | null = null;
    if (body.status !== undefined) {
      if (!canMoveTask(viewer, existing)) {
        throw new ApiError('FORBIDDEN', 'Yalnız sana atanmış görevlerin durumunu değiştirebilirsin.');
      }
      transition = await transitionTask({
        taskId: existing.id,
        to: body.status,
        actor: { userId: viewer.userId, kind: viewer.isManager ? 'manager' : 'member', name: viewer.name },
        note: body.note,
      });
      const effects = transition.effects;
      if (effects.length > 0) after(() => runEffects(effects));
    }

    const fresh = await prisma.companyTask.findUniqueOrThrow({ where: { id: existing.id }, select: TASK_LIST_SELECT });
    return { task: toTaskDto(fresh, { weekKey: weekKeyOf() }), transition: transition ? { kind: transition.kind } : null };
  }
);

/**
 * DELETE ?id= — KALICI silme (yönetici). Yalnız arşivdeki görev silinebilir: "Sil" arayüzde
 * geri alınabilir arşivdir (denetim Bulgu 2 / D4). Ekleri depodan da kaldırılır.
 */
export const DELETE = defineRoute(
  { name: 'team.tasks.delete', roles: TEAM_ROUTE_ROLES, query: idQuery, rateLimit: 'mutation' },
  async ({ user, query, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const task = await findVisibleTask(viewer, query.id, { id: true, title: true, archivedAt: true, status: true, assignedToId: true });
    if (!task.archivedAt) throw new ApiError('CONFLICT', 'Kalıcı silmeden önce görevi arşivleyin.');
    const { deleted, files } = await hardDeleteTasks([task.id]);
    if (deleted === 0) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: 'delete',
        entity: 'company_task',
        entityId: task.id,
        oldData: { title: task.title, status: task.status, assignedToId: task.assignedToId } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    if (files.length > 0) after(() => cleanupFiles(files));
    return { deleted };
  }
);
