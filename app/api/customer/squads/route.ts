/**
 * GET  — klan odası özeti (geri uyum yolu; `overview` ile aynı veri).
 * POST — klan kur. Ad: trim + 3–30 + karakter kümesi + kaba dil süzgeci; aynı ad (harf
 *        duyarsız) 409 `SQUAD_NAME_TAKEN`. Kullanıcı satırı kilitlenir: eşzamanlı kur/katıl
 *        iki klana sokamaz (customer_squads.md Bulgu 5, 9).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { squadDescriptionSchema, squadNameSchema } from '@/lib/squads/rules';
import { createSquad } from '@/lib/squads/membership';
import { getSquadOverview } from '@/lib/squads/overview';

export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  name: squadNameSchema,
  description: squadDescriptionSchema.optional(),
});

export const GET = defineRoute(
  { name: 'customer.squads.overview.legacy', roles: ['CUSTOMER'], module: 'squads', rateLimit: 'read' },
  async ({ user }) => ok(await getSquadOverview(user.id))
);

export const POST = defineRoute(
  {
    name: 'customer.squads.create',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    schema: CreateBody,
  },
  async ({ user, body }) => {
    const squad = await createSquad(user.id, { name: body.name, description: body.description ?? null });
    return ok({ squad, message: `${squad.name} klanı kuruldu.` }, { status: 201, legacySpread: true });
  }
);
