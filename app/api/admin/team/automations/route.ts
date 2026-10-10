import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { TEAM_ROUTE_ROLES, assertDepartment, assertTeamMember, requireTeamViewer } from '@/lib/team/access';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/team/constants';
import { AUTOMATION_SET_STATUS_TARGETS } from '@/lib/team-automation-engine';

export const dynamic = 'force-dynamic';

const TRIGGER_TYPES = ['status_changed', 'assigned', 'created', 'overdue'] as const;
const ACTION_TYPES = ['notify', 'add_tag', 'set_priority', 'assign', 'set_status'] as const;

/** Kural tutarlılığı: değer tetik/aksiyon türüne uymalı (eski API serbest metin kabul ediyordu). */
async function validateRule(r: {
  triggerType: string;
  triggerValue?: string | null;
  actionType: string;
  actionValue?: string | null;
  department?: string | null;
}): Promise<void> {
  if (r.triggerType === 'status_changed' && r.triggerValue && !(TASK_STATUSES as readonly string[]).includes(r.triggerValue)) {
    throw new ApiError('VALIDATION', 'Geçersiz durum tetiği.');
  }
  if (r.triggerType === 'assigned' && r.triggerValue) await assertTeamMember(r.triggerValue);
  if ((r.triggerType === 'created' || r.triggerType === 'overdue') && r.triggerValue) {
    throw new ApiError('VALIDATION', 'Bu tetik bir değer almaz.');
  }
  switch (r.actionType) {
    case 'notify':
      break;
    case 'add_tag':
      if (!r.actionValue?.trim()) throw new ApiError('VALIDATION', 'Eklenecek etiketi yazın.');
      break;
    case 'set_priority':
      if (!r.actionValue || !(TASK_PRIORITIES as readonly string[]).includes(r.actionValue)) throw new ApiError('VALIDATION', 'Öncelik seçin.');
      break;
    case 'assign':
      if (!r.actionValue) throw new ApiError('VALIDATION', 'Atanacak kişiyi seçin.');
      await assertTeamMember(r.actionValue);
      break;
    case 'set_status':
      if (!r.actionValue || !(AUTOMATION_SET_STATUS_TARGETS as readonly string[]).includes(r.actionValue)) {
        throw new ApiError('VALIDATION', 'Otomasyon görevi yalnız Yapılacak, Devam ya da Onayda durumuna alabilir (onay yöneticide).');
      }
      break;
  }
  await assertDepartment(r.department);
}

/** GET — kurallar + son 30 günün çalışma/hata sayısı ve son çalışma zamanı (gözlemlenebilirlik). */
export const GET = defineRoute(
  { name: 'team.automations.list', roles: TEAM_ROUTE_ROLES, rateLimit: 'read' },
  async ({ user }) => {
    await requireTeamViewer(user.id, { manager: true });
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [rules, runs] = await Promise.all([
      prisma.teamAutomation.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { createdBy: { select: { name: true } } } }),
      prisma.taskActivity.findMany({
        where: { action: 'automation', createdAt: { gte: since }, detail: { startsWith: 'Otomasyon "' } },
        select: { detail: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);
    return {
      items: rules.map((r) => {
        const prefix = `Otomasyon "${r.name}":`;
        const mine = runs.filter((x) => x.detail?.startsWith(prefix));
        return {
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          triggerType: r.triggerType,
          triggerValue: r.triggerValue,
          actionType: r.actionType,
          actionValue: r.actionValue,
          department: r.department,
          createdByName: r.createdBy?.name ?? null,
          runs30d: mine.length,
          errors30d: mine.filter((x) => x.detail?.includes('çalışamadı')).length,
          lastRunAt: mine[0]?.createdAt.toISOString() ?? null,
          lastError: mine.find((x) => x.detail?.includes('çalışamadı'))?.detail ?? null,
        };
      }),
    };
  }
);

const createBody = z.object({
  name: z.string().trim().min(1, 'Kural adı gerekli').max(80),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerValue: z.string().max(60).nullish(),
  actionType: z.enum(ACTION_TYPES),
  actionValue: z.string().max(60).nullish(),
  department: z.string().max(60).nullish(),
  enabled: z.boolean().default(true),
});

/** POST — kural oluştur (yönetici). */
export const POST = defineRoute(
  { name: 'team.automations.create', roles: TEAM_ROUTE_ROLES, schema: createBody, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    await validateRule(body);
    const rule = await prisma.teamAutomation.create({
      data: {
        name: body.name,
        triggerType: body.triggerType,
        triggerValue: body.triggerValue || null,
        actionType: body.actionType,
        actionValue: body.actionValue?.trim() || null,
        department: body.department || null,
        enabled: body.enabled,
        createdById: viewer.userId,
      },
    });
    await prisma.auditLog.create({
      data: { userId: viewer.userId, action: 'create', entity: 'team_automation', entityId: rule.id, newData: body as Prisma.InputJsonValue, ...getAuditRequestMeta(request) },
    });
    return { item: rule };
  }
);

const updateBody = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  triggerValue: z.string().max(60).nullish(),
  actionValue: z.string().max(60).nullish(),
  department: z.string().max(60).nullish(),
});
const idQuery = z.object({ id: z.string().min(1).max(60) });

/** PUT ?id= — kuralı düzenle / aç-kapa (yönetici). */
export const PUT = defineRoute(
  { name: 'team.automations.update', roles: TEAM_ROUTE_ROLES, query: idQuery, schema: updateBody, rateLimit: 'mutation' },
  async ({ user, query, body, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const rule = await prisma.teamAutomation.findUnique({ where: { id: query.id } });
    if (!rule) throw new ApiError('NOT_FOUND', 'Kural bulunamadı.');
    const next = {
      triggerType: rule.triggerType,
      triggerValue: body.triggerValue !== undefined ? body.triggerValue : rule.triggerValue,
      actionType: rule.actionType,
      actionValue: body.actionValue !== undefined ? body.actionValue : rule.actionValue,
      department: body.department !== undefined ? body.department : rule.department,
    };
    await validateRule(next);
    const updated = await prisma.teamAutomation.update({
      where: { id: rule.id },
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        triggerValue: next.triggerValue || null,
        actionValue: next.actionValue?.trim() || null,
        department: next.department || null,
      },
    });
    await prisma.auditLog.create({
      data: { userId: viewer.userId, action: 'update', entity: 'team_automation', entityId: rule.id, newData: body as Prisma.InputJsonValue, ...getAuditRequestMeta(request) },
    });
    return { item: updated };
  }
);

/** DELETE ?id= — kuralı sil (yönetici). */
export const DELETE = defineRoute(
  { name: 'team.automations.delete', roles: TEAM_ROUTE_ROLES, query: idQuery, rateLimit: 'mutation' },
  async ({ user, query, request }) => {
    const viewer = await requireTeamViewer(user.id, { manager: true });
    const res = await prisma.teamAutomation.deleteMany({ where: { id: query.id } });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Kural bulunamadı.');
    await prisma.auditLog.create({
      data: { userId: viewer.userId, action: 'delete', entity: 'team_automation', entityId: query.id, ...getAuditRequestMeta(request) },
    });
    return { deleted: true };
  }
);
