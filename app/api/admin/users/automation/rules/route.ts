import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { automationActionsSchema, automationConditionSchema } from '@/lib/users-automation/schema';


export const dynamic = 'force-dynamic';

// P0-19: koşul ve aksiyonlar ortak, sıkı şemadan (tutar tavanı, ADMIN'e yükseltme yok).
// Yeni kural ONAYSIZ doğar; çalıştırılabilmesi için oluşturandan farklı bir yönetici onaylamalı
// (`requiresApproval` artık yalnız gösterim amaçlı geriye uyum alanıdır).
const createRuleSchema = z.object({
  name: z.string().trim().min(2, 'Kural adı en az 2 karakter olmalı').max(120),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(['manual', 'schedule', 'event']).default('manual'),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  condition: automationConditionSchema.default({}),
  actions: automationActionsSchema,
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
  requiresApproval: z.boolean().default(true),
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
      take: 500,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { runs: true } },
      },
    });

    return NextResponse.json({ success: true, items: rules }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: 'Kurallar getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const rl = checkAdminRateLimit(session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }

    const body = await request.json();
    const parsed = createRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
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
        // Her kural dört göz ister (execute onaysız kuralı reddeder).
        requiresApproval: true,
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

    return NextResponse.json({ success: true, item: rule }, { status: 201 , headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: 'Kural oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
