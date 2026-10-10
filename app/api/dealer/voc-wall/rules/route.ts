/** Yayın kuralları (PUT): en az yıldız, yalnız yazılı, ad gösterimi, döngü süresi, varsayılan QR. Yalnız bayi sahibi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { WallRulesSchema } from '@/lib/dealer/voc-wall/config';
import { updateWallRules } from '@/lib/dealer/voc-wall/server';
import { rethrowWallError } from '@/lib/dealer/voc-wall/http';

export const dynamic = 'force-dynamic';

export const PUT = defineRoute(
  {
    name: 'dealer.voc-wall.rules',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'voc_wall',
    rateLimit: 'mutation',
    schema: WallRulesSchema,
  },
  async ({ tenant, body }) => {
    try {
      return ok({ rules: await updateWallRules(tenant.dealerId, body) });
    } catch (err) {
      rethrowWallError(err);
    }
  }
);
