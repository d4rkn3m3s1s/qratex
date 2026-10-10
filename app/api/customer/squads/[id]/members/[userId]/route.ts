/**
 * DELETE — üyeyi klandan çıkar (yalnız lider). Aktif savaş sürerken kilitli: lider son anda
 * kadroyu küçültüp ödül payını şişiremez (customer_squads.md Bulgu 6).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { kickMember } from '@/lib/squads/membership';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute(
  {
    name: 'customer.squads.kick',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64), userId: z.string().min(1).max(64) }),
  },
  async ({ user, params }) => {
    const r = await kickMember(user.id, params.id, params.userId);
    return ok({ ...r, message: `${r.name} klandan çıkarıldı.` }, { legacySpread: true });
  }
);
