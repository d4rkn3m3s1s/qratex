import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  approvalViolation,
  automationActionsSchema,
  automationConditionSchema,
  automationFingerprint,
} from '@/lib/users-automation/schema';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';


export const dynamic = 'force-dynamic';

/**
 * PUT kuralları (P0-19, dört göz):
 *  - `condition`/`actions` değişirse onay SIFIRLANIR (onaylanan içerik ≠ çalışacak içerik olamaz).
 *  - Onaylayan, kuralı oluşturan ya da içeriğini son değiştiren kişi olamaz.
 *  - Aynı istekte hem içerik değiştirip hem onaylamak reddedilir.
 */
const updateRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(1000).optional().nullable(),
    triggerType: z.enum(['manual', 'schedule', 'event']).optional(),
    triggerConfig: z.record(z.string(), z.unknown()).optional(),
    condition: automationConditionSchema.optional(),
    actions: automationActionsSchema.optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    requiresApproval: z.boolean().optional(),
    approved: z.boolean().optional(),
  })
  .strict();

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { id } = await context.params;
    const item = await prisma.userAutomationRule.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!item) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    return NextResponse.json({ success: true, item }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'Kural getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('admin.users.automation.rules.id.put', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = updateRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.userAutomationRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });

    const data = parsed.data;
    const { approved, triggerConfig, condition, actions, requiresApproval: _ignored, ...scalarFields } = data;
    void _ignored;

    const nextCondition = condition ?? existing.condition;
    const nextActions = actions ?? existing.actions;
    const contentChanged =
      automationFingerprint(nextCondition, nextActions) !==
      automationFingerprint(existing.condition, existing.actions);

    if (approved === true) {
      if (contentChanged) {
        return NextResponse.json(
          { error: 'İçeriği değiştirdiğiniz kuralı aynı anda onaylayamazsınız; onayı başka bir yönetici vermeli.', code: 'FOUR_EYES' },
          { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      const violation = approvalViolation({
        createdById: existing.createdById,
        updatedById: existing.updatedById,
        approverId: session.user.id,
      });
      if (violation) {
        return NextResponse.json({ error: violation, code: 'FOUR_EYES' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
      }
    }

    // Onay durumu: içerik değiştiyse sıfırla; açık onay/geri çekme isteğini uygula.
    let approvalPatch: { approvedById: string | null; approvedAt: Date | null } | Record<string, never> = {};
    if (contentChanged) approvalPatch = { approvedById: null, approvedAt: null };
    if (approved === true) approvalPatch = { approvedById: session.user.id, approvedAt: new Date() };
    if (approved === false) approvalPatch = { approvedById: null, approvedAt: null };

    // Yalnız onay veren istek "son değiştiren" sayılmaz (yoksa onaylayan = son değiştiren olur).
    const isPureApproval = approved !== undefined && !contentChanged && Object.keys(scalarFields).length === 0 && triggerConfig === undefined;

    const item = await prisma.userAutomationRule.update({
      where: { id },
      data: {
        ...scalarFields,
        ...(triggerConfig !== undefined && {
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
        }),
        ...(condition !== undefined && { condition: condition as Prisma.InputJsonValue }),
        ...(actions !== undefined && { actions: actions as Prisma.InputJsonValue }),
        ...approvalPatch,
        requiresApproval: true,
        ...(isPureApproval ? {} : { updatedById: session.user.id }),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: approved === true ? 'automation_rule_approve' : 'automation_rule_update',
        entity: 'user_automation_rule',
        entityId: id,
        oldData: existing as unknown as object,
        newData: { ...(item as unknown as object), contentChanged } as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, item, approvalReset: contentChanged && approved !== true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'Kural güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('admin.users.automation.rules.id.delete', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const { session } = auth;
    const { id } = await context.params;
    const existing = await prisma.userAutomationRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    // Kuyruktaki işleri iptal et (silinen kural çalışmasın; işlemci de ayrıca kontrol eder).
    await prisma.automationJob.updateMany({
      where: { ruleId: id, status: 'queued' },
      data: { status: 'cancelled', lastError: 'Kural silindi' },
    });
    await prisma.userAutomationRule.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'automation_rule_delete',
        entity: 'user_automation_rule',
        entityId: id,
        oldData: existing as unknown as object,
        ...auditMeta,
      },
    });
    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch {
    return NextResponse.json({ error: 'Kural silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
