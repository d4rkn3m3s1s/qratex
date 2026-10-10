/**
 * GET ?name=…[&exceptSquadId=…] — klan adı müsaitlik kontrolü (kur/yeniden adlandır formu,
 * gecikmeli). Geçersiz ad 200 + `{ available: false, reason }` döner (form içi ipucu).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { squadNameSchema } from '@/lib/squads/rules';
import { isSquadNameAvailable } from '@/lib/squads/membership';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.squads.name-check',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
    query: z.object({ name: z.string().max(80), exceptSquadId: z.string().max(64).optional() }),
  },
  async ({ query }) => {
    const parsed = squadNameSchema.safeParse(query.name);
    if (!parsed.success) {
      return ok({ available: false, reason: parsed.error.issues[0]?.message ?? 'Geçersiz ad.' });
    }
    const available = await isSquadNameAvailable(parsed.data, query.exceptSquadId);
    return ok({ available, name: parsed.data, reason: available ? null : 'Bu klan adı alınmış.' });
  }
);
