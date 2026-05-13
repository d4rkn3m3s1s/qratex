import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { withIdempotency } from '@/lib/idempotency';
import { enqueueAutomationJob, processNextAutomationJob } from '@/lib/users-automation/queue';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

const executeSchema = z.object({
  ruleId: z.string().cuid().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).optional(),
  limit: z.number().int().min(1).max(1000).default(500),
  processNow: z.boolean().default(true),
});

type AutomationExecuteBody =
  | { error: string }
  | { success: boolean; runId: string; jobId: string };

export async function POST(request: NextRequest) {
  return withIdempotency<AutomationExecuteBody>(request, 'admin-users-automation-execute', async () => {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return { statusCode: 401, body: { error: 'Yetkisiz' } };
    const { session } = auth;
    const rl = checkAdminRateLimit(session.user.id);
    if (!rl.ok) return { statusCode: 429, body: { error: 'Çok fazla istek' } };

    const body = await request.json();
    const parsed = executeSchema.safeParse(body);
    if (!parsed.success) {
      return { statusCode: 400, body: { error: parsed.error.errors[0]?.message || 'Geçersiz veri' } };
    }

    const input = parsed.data;
    let condition = input.condition || {};
    let actions = (input.actions || []) as Array<Record<string, unknown>>;
    let rule = null as Awaited<ReturnType<typeof prisma.userAutomationRule.findUnique>> | null;

    if (input.ruleId) {
      rule = await prisma.userAutomationRule.findUnique({ where: { id: input.ruleId } });
      if (!rule) return { statusCode: 404, body: { error: 'Kural bulunamadı' } };
      if (!rule.isActive) return { statusCode: 400, body: { error: 'Pasif kural çalıştırılamaz' } };
      if (rule.requiresApproval && !rule.approvedAt) {
        return { statusCode: 403, body: { error: 'Kural onay bekliyor' } };
      }
      condition = (rule.condition || {}) as Record<string, unknown>;
      actions = ((rule.actions as unknown[]) || []) as Array<Record<string, unknown>>;
    }

    const run = await prisma.userAutomationRun.create({
      data: {
        ruleId: rule?.id || null,
        mode: 'execute',
        status: 'pending',
        triggeredById: session.user.id,
        source: 'api',
        startedAt: new Date(),
      },
    });

    const job = await enqueueAutomationJob({
      ruleId: rule?.id || null,
      runId: run.id,
      idempotencyKey: request.headers.get('idempotency-key') || undefined,
      payload: { condition, actions: actions as never[], limit: input.limit },
    });

    if (input.processNow) {
      try {
        await processNextAutomationJob('execute-route');
      } catch {
        // retry flow handles status
      }
    }

    if (rule?.id) {
      await prisma.userAutomationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'automation_execute',
        entity: 'user_automation_run',
        entityId: run.id,
        newData: { ruleId: rule?.id, jobId: job.id, processNow: input.processNow },
        ...auditMeta,
      },
    });

    return { statusCode: 202, body: { success: true, runId: run.id, jobId: job.id } };
  });
}
