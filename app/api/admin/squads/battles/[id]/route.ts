/**
 * GET   /api/admin/squads/battles/[id] — savaş detayı (kadro + katkı, puan defteri dökümü, denetim).
 * PATCH /api/admin/squads/battles/[id] — yalnız adlandırılmış geçişler (durum makinesi):
 *   finish (aktif → tamamlandı + ödeme) · cancel (bekleyen/aktif → iptal + escrow iadesi)
 *   extend (açık savaşın bitişini ileri al) · adjust_score (aktif savaşta gerekçeli düzeltme).
 * Hard DELETE kaldırıldı: savaş satırı hiçbir yolla silinmez.
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { battleActionSchema, squadIdParamsSchema } from '@/lib/admin-squads/contract';
import { getBattleDetail } from '@/lib/admin-squads/server';
import { applyBattleAction } from '@/lib/admin-squads/actions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.squads.battles.detail', roles: ['ADMIN'], params: squadIdParamsSchema, rateLimit: 'read' },
  async ({ params }) => {
    const data = await getBattleDetail(params.id);
    if (!data) throw new ApiError('NOT_FOUND', 'Savaş bulunamadı.');
    return ok(data);
  }
);

export const PATCH = defineRoute(
  { name: 'admin.squads.battles.action', roles: ['ADMIN'], params: squadIdParamsSchema, schema: battleActionSchema, rateLimit: 'mutation' },
  async ({ params, body, user, request }) => ok(await applyBattleAction(params.id, body, { userId: user.id, ...getAuditRequestMeta(request) }))
);
