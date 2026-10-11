/**
 * Platform çarpanları (GamificationSettings) — Ekonomi Stüdyosu "Çarpan ve tavanlar" sekmesi.
 *
 * GET: salt okunur (satır yoksa OLUŞTURMAZ; varsayılan 1× + sürüm `none`), tavan anlık görüntüsü.
 * PUT/PATCH: yalnız GERÇEKTEN uygulanan iki alan (puan/XP çarpanı, 0,1–5) + `baseVersion`
 * zorunlu (409 çakışma). Etkisiz alanlar (günlük XP tavanı, seviye ödülü, sezon) artık
 * yazılmaz — hiçbir tüketici okumuyordu (gamification-settings raporu Bulgu 1).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { multipliersPutSchema } from '@/lib/admin-economy/contract';
import { loadMultipliersResource, saveMultipliers } from '@/lib/admin-economy/server';
import { isVersionConflictError, versionConflictResponse } from '@/lib/settings-version';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.economy.multipliers.get', roles: ['ADMIN'], rateLimit: 'read' }, async () => {
  const res = await loadMultipliersResource();
  return ok({ ...res.data, version: res.version });
});

const write = defineRoute(
  { name: 'admin.economy.multipliers.put', roles: ['ADMIN'], schema: multipliersPutSchema, rateLimit: 'mutation' },
  async ({ body, user, request }) => {
    try {
      const saved = await saveMultipliers(body, { userId: user.id, ...getAuditRequestMeta(request) });
      return ok({ multipliers: saved.data, version: saved.version });
    } catch (err) {
      if (isVersionConflictError(err)) return versionConflictResponse(err);
      throw err;
    }
  }
);

export const PUT = write;
export const PATCH = write;
