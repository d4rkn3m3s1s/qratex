import { NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { withIdempotency } from '@/lib/idempotency';
import { enqueueAutomationJob, processNextAutomationJob } from '@/lib/users-automation/queue';
import { buildTargetQuery } from '@/lib/users-automation/engine';
import { AUTOMATION_LIMITS, executionBlocker, parseAutomation, runImpact } from '@/lib/users-automation/schema';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/automation/execute — "Şimdi çalıştır" (P0-19).
 *
 *  - YALNIZ kayıtlı kural (`ruleId` zorunlu). Kayıtsız formla çalıştırma kaldırıldı:
 *    eskiden kural seçilmeden basılan düğme ilk 500 müşteriye onaysız 100'er puan basıyordu.
 *  - Kural aktif + onaylı olmalı; onaylayan kuralı oluşturandan farklı bir yönetici olmalı
 *    (`requiresApproval` bayrağından bağımsız: puan/rol değiştiren her kural dört göz ister).
 *  - Sunucu tarafı onay: istemci dry-run'da gördüğü `affectedCount` ve `totalPointsDelta`
 *    değerlerini geri yollar; tutmazsa 409 + güncel önizleme (yanlış tık 500 kişiye gitmez).
 *  - Çalıştırma toplam etkisi |puan| ≤ 200.000.
 */
const executeSchema = z
  .object({
    ruleId: z.string({ required_error: 'Çalıştırmak için kayıtlı bir kural seçin' }).min(1).max(64),
    limit: z.number().int().min(1).max(AUTOMATION_LIMITS.maxUsersPerRun).default(AUTOMATION_LIMITS.defaultUsersPerRun),
    processNow: z.boolean().default(true),
    confirm: z
      .object({
        affectedCount: z.number().int().min(0),
        totalPointsDelta: z.number().int(),
      })
      .optional(),
  })
  .strict();

type AutomationExecuteBody =
  | { error: string; code?: string; preview?: Record<string, unknown> }
  | { success: boolean; runId: string; jobId: string; status?: string };

export async function POST(request: NextRequest) {
  return withIdempotency<AutomationExecuteBody>(request, 'admin-users-automation-execute', async () => {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return { statusCode: 401, body: { error: 'Yetkisiz' } };
    const { session } = auth;
    const rl = await checkAdminRateLimit(session.user.id);
    if (!rl.ok) return { statusCode: 429, body: { error: 'Çok fazla istek' } };

    const body = await request.json().catch(() => null);
    const parsed = executeSchema.safeParse(body);
    if (!parsed.success) {
      const unknownKeys = parsed.error.errors.some((e) => e.code === 'unrecognized_keys');
      return {
        statusCode: 400,
        body: {
          error: unknownKeys
            ? 'Kayıtsız koşul/aksiyonla çalıştırma kapatıldı. Önce kuralı kaydedin ve onaylatın.'
            : parsed.error.errors[0]?.message || 'Geçersiz veri',
          code: unknownKeys ? 'RULE_REQUIRED' : 'VALIDATION',
        },
      };
    }
    const input = parsed.data;

    const rule = await prisma.userAutomationRule.findUnique({ where: { id: input.ruleId } });
    if (!rule) return { statusCode: 404, body: { error: 'Kural bulunamadı' } };
    const blocker = executionBlocker(rule);
    if (blocker) return { statusCode: 403, body: { error: blocker, code: 'RULE_NOT_APPROVED' } };

    const automation = parseAutomation(rule.condition, rule.actions);
    if (!automation.ok) {
      return { statusCode: 422, body: { error: `Kural çalıştırılamaz: ${automation.error}`, code: 'RULE_INVALID' } };
    }

    // Sunucu tarafı önizleme: hedef sayısı + toplam etki (dry-run ile aynı sorgu).
    const q = buildTargetQuery(automation.condition, { excludeUserId: session.user.id, limit: input.limit });
    const affectedCount = await prisma.user.count({ where: q.where }).then((n) => Math.min(n, q.take));
    const impact = runImpact(automation.actions, affectedCount);
    const preview = { affectedCount, ...impact, limit: q.take };

    if (!impact.withinCap) {
      return {
        statusCode: 422,
        body: {
          error: `Bu çalıştırmanın toplam puan etkisi ${impact.totalPointsAbs.toLocaleString('tr-TR')}; tek çalıştırmada en fazla ${AUTOMATION_LIMITS.maxRunPointsAbs.toLocaleString('tr-TR')} olabilir. Hedef sayısını düşürün.`,
          code: 'RUN_CAP_EXCEEDED',
          preview,
        },
      };
    }
    if (
      !input.confirm ||
      input.confirm.affectedCount !== affectedCount ||
      input.confirm.totalPointsDelta !== impact.totalPointsDelta
    ) {
      return {
        statusCode: 409,
        body: {
          error: `Çalıştırmayı onaylayın: ${affectedCount.toLocaleString('tr-TR')} kullanıcı, toplam ${impact.totalPointsDelta.toLocaleString('tr-TR')} puan.`,
          code: 'CONFIRMATION_REQUIRED',
          preview,
        },
      };
    }

    const run = await prisma.userAutomationRun.create({
      data: {
        ruleId: rule.id,
        mode: 'execute',
        status: 'pending',
        triggeredById: session.user.id,
        source: 'api',
        startedAt: new Date(),
        idempotencyKey: request.headers.get('idempotency-key') || null,
      },
    });

    const job = await enqueueAutomationJob({
      ruleId: rule.id,
      runId: run.id,
      idempotencyKey: request.headers.get('idempotency-key') || undefined,
      payload: {
        // Kural içeriği aynen (parmak izi işlenirken kural ile karşılaştırılır).
        condition: rule.condition as never,
        actions: rule.actions as never,
        limit: input.limit,
        actorId: session.user.id,
      },
    });

    let status: string | undefined;
    if (input.processNow) {
      try {
        const processed = await processNextAutomationJob('execute-route');
        status = processed?.status;
      } catch {
        // retry flow handles status
      }
    }

    await prisma.userAutomationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'automation_execute',
        entity: 'user_automation_run',
        entityId: run.id,
        newData: {
          ruleId: rule.id,
          jobId: job.id,
          processNow: input.processNow,
          approvedById: rule.approvedById,
          affectedCount,
          totalPointsDelta: impact.totalPointsDelta,
          totalXp: impact.totalXp,
        } as Prisma.InputJsonObject,
        ...auditMeta,
      },
    });

    return { statusCode: 202, body: { success: true, runId: run.id, jobId: job.id, status } };
  });
}
