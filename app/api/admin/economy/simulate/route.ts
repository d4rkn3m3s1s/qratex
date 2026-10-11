/**
 * POST /api/admin/economy/simulate — taslak matris/çarpanların etkisi, gerçek defter verisiyle.
 * Salt okunur: hiçbir şey yazmaz. Taslak matris sunucu şemasıyla doğrulanır (400 + alan mesajı).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { simulateBodySchema } from '@/lib/admin-economy/contract';
import { getEconomyFlow, readMultipliers, readSavedMatrix } from '@/lib/admin-economy/server';
import { simulateEconomy } from '@/lib/admin-economy/simulate';
import { pointsMatrixSchema } from '@/lib/points-matrix-schema';
import { normalizePointsMatrix } from '@/lib/points-rules';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.economy.simulate', roles: ['ADMIN'], schema: simulateBodySchema, rateLimit: 'read' },
  async ({ body }) => {
    let draftMatrix = null;
    if (body.matrix !== undefined) {
      const parsed = pointsMatrixSchema.safeParse(body.matrix);
      if (!parsed.success) {
        throw new ApiError('VALIDATION', parsed.error.issues[0]?.message ?? 'Taslak matris geçersiz', {
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      draftMatrix = normalizePointsMatrix(parsed.data);
    }
    const [flow, savedMatrix, savedMultipliers] = await Promise.all([
      getEconomyFlow(body.days),
      readSavedMatrix(),
      readMultipliers(),
    ]);
    return ok(
      simulateEconomy({
        flow,
        saved: { matrix: savedMatrix, multipliers: savedMultipliers },
        draft: { matrix: draftMatrix ?? savedMatrix, multipliers: body.multipliers ?? savedMultipliers },
      })
    );
  }
);
