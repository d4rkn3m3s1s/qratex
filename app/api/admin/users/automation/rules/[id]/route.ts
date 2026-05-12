import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

const updateRuleSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  triggerType: z.enum(['manual', 'schedule', 'event']).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  requiresApproval: z.boolean().optional(),
  approved: z.boolean().optional(),
});

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
    if (!item) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 });
    return NextResponse.json({ success: true, item });
  } catch {
    return NextResponse.json({ error: 'Kural getirilemedi' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400 });
    }

    const existing = await prisma.userAutomationRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 });

    const data = parsed.data;
    const { approved, triggerConfig, condition, actions, ...scalarFields } = data;
    const approvedById = approved === true ? session.user.id : approved === false ? null : undefined;
    const approvedAt = approved === true ? new Date() : approved === false ? null : undefined;

    const item = await prisma.userAutomationRule.update({
      where: { id },
      data: {
        ...scalarFields,
        ...(triggerConfig !== undefined && {
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
        }),
        ...(condition !== undefined && { condition: condition as Prisma.InputJsonValue }),
        ...(actions !== undefined && { actions: actions as Prisma.InputJsonValue }),
        approvedById,
        approvedAt,
        updatedById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'automation_rule_update',
        entity: 'user_automation_rule',
        entityId: id,
        oldData: existing as unknown as object,
        newData: item as unknown as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, item });
  } catch {
    return NextResponse.json({ error: 'Kural güncellenemedi' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { id } = await context.params;
    const existing = await prisma.userAutomationRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 });
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
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Kural silinemedi' }, { status: 500 });
  }
}
