import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_points'), amount: z.number(), reason: z.string().optional() }),
  z.object({ type: z.literal('add_xp'), amount: z.number() }),
  z.object({ type: z.literal('set_role'), role: z.enum(['ADMIN', 'DEALER', 'CUSTOMER']) }),
  z.object({
    type: z.literal('send_notification'),
    title: z.string().min(1),
    message: z.string().min(1),
    notificationType: z.enum(['info', 'success', 'warning', 'error']).optional(),
  }),
]);

const createRuleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  triggerType: z.enum(['manual', 'schedule', 'event']).default('manual'),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  condition: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(actionSchema).min(1),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
  requiresApproval: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');

    const rules = await prisma.userAutomationRule.findMany({
      where: isActive === null ? {} : { isActive: isActive === 'true' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { runs: true } },
      },
    });

    return NextResponse.json({ success: true, items: rules });
  } catch (error) {
    return NextResponse.json({ error: 'Kurallar getirilemedi' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const rl = checkAdminRateLimit(session.user.id);
    if (!rl.ok) return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429 });

    const body = await request.json();
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400 });
    }

    const data = parsed.data;
    const rule = await prisma.userAutomationRule.create({
      data: {
        name: data.name,
        description: data.description,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig as Prisma.InputJsonValue | undefined,
        condition: data.condition as Prisma.InputJsonValue,
        actions: data.actions as Prisma.InputJsonValue,
        isActive: data.isActive,
        priority: data.priority,
        requiresApproval: data.requiresApproval,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'automation_rule_create',
        entity: 'user_automation_rule',
        entityId: rule.id,
        newData: rule as unknown as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, item: rule }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Kural oluşturulamadı' }, { status: 500 });
  }
}
