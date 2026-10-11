/**
 * POST /api/admin/seo/rollback
 *  - `mode: 'restore'` (SEO Motoru): kaydın oluşturduğu sürümü (newData) geri yükler; iyimser kilit + tehlike onayı.
 *  - `mode: 'undo'` (varsayılan; /admin/audit yüzeyi): o değişikliği geri alır (oldData). Geriye uyumlu.
 * Her iki yolda Site URL doğrulanır (P0-39): bozuk sürüm siteyi düşüremez.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { seoRestoreBodySchema } from '@/lib/admin-seo/contract';
import { restoreSeoVersion } from '@/lib/admin-seo/seo.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.seo.restore', roles: ['ADMIN'], schema: seoRestoreBodySchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => {
    const state = await restoreSeoVersion({ actor: actorFromSession(session), request }, body);
    return ok({ ok: true, state, settings: state.payload }, { legacySpread: true });
  }
);
