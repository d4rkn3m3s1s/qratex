/**
 * `PATCH /api/dealer/settings/business` — işletme profili (ad, açıklama, adres/konum, çalışma
 * saatleri, tatil modu, varsayılan yanıt şablonu). Yalnız değişen alanlar + `baseVersion`
 * (409 çakışma). Çalışma saatleri yapılandırılmış JSON olarak yazılır; Keşfet ve mekân detayı
 * aynı kuralla "Açık / Kapalı / Tatilde" gösterir.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { businessPatchSchema } from '@/lib/dealer-settings/contract';
import { updateDealerBusiness } from '@/lib/dealer-settings/write.server';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  { name: 'dealer.settings.business', roles: ['DEALER'], schema: businessPatchSchema, rateLimit: 'mutation' },
  async ({ user, body, request }) => ok(await updateDealerBusiness(user.id, body, getAuditRequestMeta(request)))
);
