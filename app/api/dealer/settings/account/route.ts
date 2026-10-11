/**
 * `PATCH /api/dealer/settings/account` — kişisel hesap (ad, telefon, avatar, panel dili).
 * Avatar yalnız hazır listeden ya da zaten kayıtlı görsel (harici URL yazılamaz). Panel dili
 * DB'ye yazılır; istemci oturumu (`update({ preferredLanguage })`) ve arayüz dilini anında günceller.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { accountPatchSchema } from '@/lib/dealer-settings/contract';
import { updateDealerAccount } from '@/lib/dealer-settings/write.server';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  { name: 'dealer.settings.account', roles: ['DEALER'], schema: accountPatchSchema, rateLimit: 'mutation' },
  async ({ user, body, request }) => ok(await updateDealerAccount(user.id, body, getAuditRequestMeta(request)))
);
