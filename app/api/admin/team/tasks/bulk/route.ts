import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TEAM_ROUTE_ROLES, assertDepartment, assertTeamMember, requireTeamViewer, scopedTaskWhere } from '@/lib/team/access';
import { PRIORITY_META, TASK_PRIORITIES, TASK_STATUSES, parseTags } from '@/lib/team/constants';
import { cleanupFiles, hardDeleteTasks, notifyAssignment } from '@/lib/team/tasks';
import { runEffects, transitionTask, type TransitionSideEffect } from '@/lib/team/transitions';

export const dynamic = 'force-dynamic';

const bulkBody = z.object({
  ids: z.array(z.string().min(1).max(60)).min(1).max(200),
  action: z.discriminatedUnion('op', [
    z.object({ op: z.literal('status'), value: z.enum(TASK_STATUSES), note: z.string().max(2000).nullish() }),
    z.object({ op: z.literal('priority'), value: z.enum(TASK_PRIORITIES) }),
    z.object({ op: z.literal('assign'), value: z.string().max(60).nullable() }),
    z.object({ op: z.literal('department'), value: z.string().max(60).nullable() }),
    z.object({ op: z.literal('archive'), value: z.boolean() }),
    z.object({ op: z.literal('tag_add'), value: z.string().trim().min(1).max(40) }),
    /** Kalıcı silme: yalnız arşivdeki görevler. Arayüz tipli onay ister. */
    z.object({ op: z.literal('delete') }),
  ]),
});

type Skipped = { id: string; title: string; reason: string };

/**
 * POST — toplu işlem (yönetici). Denetim Bulgu 37–42: toplu "Onayda" kanıtsız geçiyordu,
 * toplu işlemler aktivite/bildirim/otomasyon üretmiyordu, atlanan görevler söylenmiyordu,
 * toplu sil onaysız kalıcı siliyordu. Artık durum değişikliği tekil geçişle aynı kurallardan
 * geçer ve yanıt atlananları gerekçesiyle döner.
 */
export const POST = defineRoute(
  { name: 'team.tasks.bulk', roles: TEAM_ROUTE_ROLES, schema: bulkBody, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const { action } = body;
    const rows = await prisma.companyTask.findMany({
      where: scopedTaskWhere(viewer, { id: { in: body.ids } }),
      select: { id: true, title: true, tags: true, priority: true, department: true, assignedToId: true, dueAt: true, description: true, archivedAt: true },
    });
    const skipped: Skipped[] = [];
    let affected = 0;
    const effects: TransitionSideEffect[] = [];
    const activity: Prisma.TaskActivityCreateManyInput[] = [];

    if (action.op === 'status') {
      for (const r of rows) {
        try {
          const res = await transitionTask({
            taskId: r.id,
            to: action.value,
            actor: { userId: viewer.userId, kind: 'manager', name: viewer.name },
            note: action.note,
          });
          if (res.kind !== 'noop') affected++;
          effects.push(...res.effects);
        } catch (err) {
          skipped.push({ id: r.id, title: r.title, reason: err instanceof ApiError ? err.message : 'Güncellenemedi' });
        }
      }
    } else if (action.op === 'priority') {
      const res = await prisma.companyTask.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { priority: action.value } });
      affected = res.count;
      for (const r of rows) {
        if (r.priority !== action.value) {
          activity.push({ taskId: r.id, actorId: viewer.userId, action: 'priority', detail: `Toplu: önceliği "${PRIORITY_META[action.value].label}" yaptı` });
        }
      }
    } else if (action.op === 'assign') {
      await assertTeamMember(action.value);
      const assignee = action.value ? await prisma.user.findUnique({ where: { id: action.value }, select: { name: true } }) : null;
      const changed = rows.filter((r) => r.assignedToId !== action.value);
      const res = await prisma.companyTask.updateMany({ where: { id: { in: changed.map((r) => r.id) } }, data: { assignedToId: action.value } });
      affected = res.count;
      for (const r of changed) {
        activity.push({ taskId: r.id, actorId: viewer.userId, action: 'assigned', detail: action.value ? `Toplu: ${assignee?.name || 'bir üyeye'} atadı` : 'Toplu: atamayı kaldırdı' });
        if (action.value) {
          const assigneeId = action.value;
          effects.push(() =>
            notifyAssignment({ taskId: r.id, assigneeId, title: r.title, priority: r.priority, dueAt: r.dueAt, description: r.description })
          );
          effects.push(() =>
            import('@/lib/team-automation-engine').then((m) =>
              m.runAutomations({
                trigger: 'assigned',
                triggerValue: assigneeId,
                task: { id: r.id, title: r.title, department: r.department, assignedToId: assigneeId, tags: r.tags },
                actorId: viewer.userId,
              })
            )
          );
        }
      }
    } else if (action.op === 'department') {
      await assertDepartment(action.value);
      const res = await prisma.companyTask.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { department: action.value } });
      affected = res.count;
      for (const r of rows) activity.push({ taskId: r.id, actorId: viewer.userId, action: 'edited', detail: action.value ? 'Toplu: departmanı değiştirdi' : 'Toplu: departmanı kaldırdı' });
    } else if (action.op === 'archive') {
      const target = rows.filter((r) => !!r.archivedAt !== action.value);
      const res = await prisma.companyTask.updateMany({
        where: { id: { in: target.map((r) => r.id) } },
        data: { archivedAt: action.value ? new Date() : null },
      });
      affected = res.count;
      for (const r of target) activity.push({ taskId: r.id, actorId: viewer.userId, action: 'archived', detail: action.value ? 'Toplu: arşivledi' : 'Toplu: arşivden çıkardı' });
    } else if (action.op === 'tag_add') {
      for (const r of rows) {
        const set = new Set(parseTags(r.tags));
        if ([...set].some((t) => t.toLocaleLowerCase('tr') === action.value.toLocaleLowerCase('tr'))) continue;
        set.add(action.value);
        await prisma.companyTask.update({ where: { id: r.id }, data: { tags: [...set].join(',') } });
        activity.push({ taskId: r.id, actorId: viewer.userId, action: 'edited', detail: `Toplu: #${action.value} etiketi ekledi` });
        affected++;
      }
    } else if (action.op === 'delete') {
      const notArchived = rows.filter((r) => !r.archivedAt);
      for (const r of notArchived) skipped.push({ id: r.id, title: r.title, reason: 'Önce arşivlenmeli' });
      const { deleted, files } = await hardDeleteTasks(rows.filter((r) => r.archivedAt).map((r) => r.id));
      affected = deleted;
      if (files.length) after(() => cleanupFiles(files));
    }

    const missing = body.ids.filter((id) => !rows.some((r) => r.id === id));
    for (const id of missing) skipped.push({ id, title: '', reason: 'Bulunamadı' });

    if (activity.length > 0) await prisma.taskActivity.createMany({ data: activity }).catch(() => undefined);
    await prisma.auditLog.create({
      data: {
        userId: viewer.userId,
        action: `bulk_${action.op}`,
        entity: 'company_task',
        entityId: body.ids[0],
        newData: { ids: body.ids, action, affected, skipped: skipped.length } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });
    if (effects.length > 0) after(() => runEffects(effects));
    return { affected, skipped };
  }
);
