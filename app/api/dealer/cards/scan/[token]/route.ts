import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { lookupCard } from '@/lib/dealer/kasa/server';
import { mapKasaErrors } from '@/lib/dealer/kasa/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/cards/scan/[token] — kasada kart doğrulama.
 *
 * Bayi ya da AKTİF personeli (kiracı DB'den). Yanıt maskeli: ad "Ayşe K.", e-posta/telefon ve
 * ham müşteri kimliği yok; bu işletmedeki ziyaret sayısı, son ziyaret, toplam harcama ve son 5
 * işlem. Aktör başına dakikada 60 sorgu; aynı kart + aktör için 60 sn içinde tek `SCANNED`
 * denetim kaydı. Kendi kartı (bayi/personel) reddedilir.
 */
export const GET = defineRoute(
  {
    name: 'dealer.kasa.lookup',
    roles: ['DEALER', 'STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER', 'STAFF'] },
    params: z.object({ token: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/, 'Geçersiz kart kodu') }),
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
  },
  async ({ params, tenant, user, request }) =>
    ok(
      {
        card: await mapKasaErrors(() =>
          lookupCard({ dealerId: tenant.dealerId, actorId: user.id, token: params.token, ...getAuditRequestMeta(request) })
        ),
      },
      { legacySpread: true }
    )
);
