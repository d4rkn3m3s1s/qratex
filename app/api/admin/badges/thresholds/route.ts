/**
 * GET /api/admin/badges/thresholds — kategori eşikleri (varsayılan/etkin/override, sürüm, son
 *     değişiklik). Fail-closed: okunamazsa hata (asla "override yok").
 * PUT — aralık doğrulamalı kayıt (`baseVersion` zorunlu, çakışmada 409; yazma + denetim tek tx).
 * Eski `/api/admin/settings/character-thresholds` bu uca taşındı.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { thresholdsPutSchema } from '@/lib/admin-badges/contract';
import { getThresholdsState, saveThresholds } from '@/lib/admin-badges/thresholds.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.badges.thresholds.get', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getThresholdsState()));

export const PUT = defineRoute(
  { name: 'admin.badges.thresholds.put', roles: ['ADMIN'], schema: thresholdsPutSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await saveThresholds(body, actorFromSession(session), request))
);
