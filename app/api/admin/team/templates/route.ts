import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TEAM_ROUTE_ROLES, assertDepartment, assertTeamMember, requireTeamViewer } from '@/lib/team/access';
import { TASK_PRIORITIES } from '@/lib/team/constants';
import { TASK_LIST_SELECT, notifyAssignment, parseDueDay, toTaskDto } from '@/lib/team/tasks';
import { TEAM_TASK_PRESETS } from '@/lib/team-task-presets';
import { isWeekKey, weekKeyOf } from '@/lib/team-week';

export const dynamic = 'force-dynamic';

/** GET — kayıtlı şablonlar (yönetici araçları). */
export const GET = defineRoute(
  { name: 'team.templates.list', roles: TEAM_ROUTE_ROLES, rateLimit: 'read' },
  async ({ user }) => {
    await requireTeamViewer(user.id, { manager: true });
    const templates = await prisma.taskTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        title: true,
        description: true,
        priority: true,
        department: true,
        tags: true,
        estimateMin: true,
        checklist: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    });
    return { items: templates };
  }
);

const createBody = z.object({
  name: z.string().trim().min(1, 'Şablon adı gerekli').max(120),
  title: z.string().trim().min(1, 'Görev başlığı gerekli').max(200),
  description: z.string().max(8000).nullish(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  department: z.string().max(60).nullish(),
  tags: z.string().max(300).nullish(),
  estimateMin: z.number().int().min(0).max(100_000).nullish(),
  checklist: z.string().max(8000).nullish(),
});

/** POST — şablon oluştur (yönetici). */
export const POST = defineRoute(
  { name: 'team.templates.create', roles: TEAM_ROUTE_ROLES, schema: createBody, rateLimit: 'mutation' },
  async ({ user, body }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await assertDepartment(body.department);
    const template = await prisma.taskTemplate.create({
      data: {
        name: body.name,
        title: body.title,
        description: body.description?.trim() || null,
        priority: body.priority,
        department: body.department || null,
        tags: body.tags || null,
        estimateMin: body.estimateMin ?? null,
        checklist: body.checklist || null,
        createdById: viewer.userId,
      },
    });
    return { item: template };
  }
);

const applyBody = z
  .object({
    templateId: z.string().max(60).optional(),
    /** Hazır galeri anahtarı — sunucu katalogdan çözer (eski akış geçici şablon POST→PUT→DELETE idi). */
    presetKey: z.string().max(60).optional(),
    weekKey: z.string().refine(isWeekKey, 'Geçersiz hafta').optional(),
    assignedToId: z.string().max(60).nullish(),
    dueDate: z.string().max(10).nullish(),
  })
  .refine((b) => !!b.templateId !== !!b.presetKey, { message: 'Bir şablon seçin.' });

/** PUT — şablondan ya da hazır galeriden TEK istekte görev üret (aktivite, audit, bildirim dahil). */
export const PUT = defineRoute(
  { name: 'team.templates.apply', roles: TEAM_ROUTE_ROLES, schema: applyBody, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await assertTeamMember(body.assignedToId);
    let src: { name: string; title: string; description: string | null; priority: string; department: string | null; tags: string | null; estimateMin: number | null; checklist: string[] };
    if (body.presetKey) {
      const p = TEAM_TASK_PRESETS.find((x) => x.key === body.presetKey);
      if (!p) throw new ApiError('NOT_FOUND', 'Hazır şablon bulunamadı.');
      src = { name: p.name, title: p.title, description: p.description, priority: p.priority, department: null, tags: p.tags, estimateMin: p.estimateMin, checklist: p.checklist };
    } else {
      const t = await prisma.taskTemplate.findUnique({ where: { id: body.templateId! } });
      if (!t) throw new ApiError('NOT_FOUND', 'Şablon bulunamadı.');
      const dep = t.department ? await prisma.department.findUnique({ where: { slug: t.department }, select: { isActive: true } }) : null;
      src = {
        name: t.name,
        title: t.title,
        description: t.description,
        priority: t.priority,
        department: dep?.isActive ? t.department : null,
        tags: t.tags,
        estimateMin: t.estimateMin,
        checklist: (t.checklist ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 50),
      };
    }
    const task = await prisma.companyTask.create({
      data: {
        title: src.title,
        description: src.description,
        priority: src.priority,
        department: src.department,
        tags: src.tags,
        estimateMin: src.estimateMin,
        weekKey: body.weekKey || weekKeyOf(),
        assignedToId: body.assignedToId || null,
        dueAt: parseDueDay(body.dueDate),
        createdById: viewer.userId,
        sourceType: 'manual',
        checklist: src.checklist.length ? { create: src.checklist.map((text, i) => ({ text, order: i })) } : undefined,
        activities: { create: { actorId: viewer.userId, action: 'created', detail: `"${src.name.slice(0, 80)}" şablonundan oluşturdu` } },
      },
      select: TASK_LIST_SELECT,
    });
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: 'create_from_template',
        entity: 'company_task',
        entityId: task.id,
        newData: { templateId: body.templateId ?? null, presetKey: body.presetKey ?? null } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    after(async () => {
      if (task.assignedToId) {
        await notifyAssignment({ taskId: task.id, assigneeId: task.assignedToId, title: task.title, priority: task.priority, dueAt: task.dueAt, description: task.description }).catch(() => undefined);
      }
      const { runAutomations } = await import('@/lib/team-automation-engine');
      const t = { id: task.id, title: task.title, department: task.department, assignedToId: task.assignedToId, tags: task.tags };
      await runAutomations({ trigger: 'created', task: t, actorId: viewer.userId });
      if (task.assignedToId) await runAutomations({ trigger: 'assigned', triggerValue: task.assignedToId, task: t, actorId: viewer.userId });
    });
    return { task: toTaskDto(task) };
  }
);

const idQuery = z.object({ id: z.string().min(1).max(60) });

/** DELETE ?id= — şablon sil (yönetici). Şablondan üretilmiş görevler etkilenmez. */
export const DELETE = defineRoute(
  { name: 'team.templates.delete', roles: TEAM_ROUTE_ROLES, query: idQuery, rateLimit: 'mutation' },
  async ({ user, query }) => {
    await requireTeamViewer(user.id, { manager: true });
    const res = await prisma.taskTemplate.deleteMany({ where: { id: query.id } });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Şablon bulunamadı.');
    return { deleted: true };
  }
);
