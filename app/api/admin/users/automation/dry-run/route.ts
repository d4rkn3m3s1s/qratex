import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { buildTargetQuery } from '@/lib/users-automation/engine';
import { AUTOMATION_LIMITS, parseAutomation, runImpact } from '@/lib/users-automation/schema';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/automation/dry-run — hiçbir şey yazmadan etki önizlemesi.
 * Kayıtlı kural (`ruleId`) ya da taslak koşul/aksiyon kabul eder (taslak çalıştırılamaz,
 * yalnız önizlenir). Döner: etkilenecek kişi sayısı, toplam puan/XP etkisi, tavan durumu ve
 * insan-okur 5 örnek (ad + e-posta). Execute ucu bu değerlerle onay ister.
 */
const dryRunSchema = z
  .object({
    ruleId: z.string().min(1).max(64).optional(),
    condition: z.unknown().optional(),
    actions: z.unknown().optional(),
    limit: z.number().int().min(1).max(AUTOMATION_LIMITS.maxUsersPerRun).default(AUTOMATION_LIMITS.defaultUsersPerRun),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('admin.users.automation.dry-run.post', auth.session.user.id, 'mutation');
    if (limited) return limited;
    const parsed = dryRunSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Geçersiz veri' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    let condition: unknown = parsed.data.condition ?? {};
    let actions: unknown = parsed.data.actions ?? [];
    if (parsed.data.ruleId) {
      const rule = await prisma.userAutomationRule.findUnique({
        where: { id: parsed.data.ruleId },
        select: { condition: true, actions: true },
      });
      if (!rule) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
      condition = rule.condition;
      actions = rule.actions;
    }

    const automation = parseAutomation(condition, actions);
    if (!automation.ok) {
      return NextResponse.json({ error: automation.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const q = buildTargetQuery(automation.condition, { excludeUserId: auth.session.user.id, limit: parsed.data.limit });
    const [total, sample] = await Promise.all([
      prisma.user.count({ where: q.where }),
      prisma.user.findMany({ ...q, take: 5, select: { id: true, name: true, email: true, points: true } }),
    ]);
    const affectedCount = Math.min(total, q.take);
    const impact = runImpact(automation.actions, affectedCount);

    return NextResponse.json(
      {
        success: true,
        result: {
          affectedCount,
          matchedCount: total,
          limit: q.take,
          ...impact,
          maxRunPointsAbs: AUTOMATION_LIMITS.maxRunPointsAbs,
          sample,
          sampleUserIds: sample.map((u) => u.id),
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json({ error: 'Önizleme başarısız' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
