/**
 * PATCH — klan kimliği ve haftalık hedef kademesi (yalnız lider). Ad değişikliği aynı ad
 * kurallarına tabidir; askıdaki klan düzenlenemez. Her değişiklik AuditLog'a (klan günlüğü).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { squadDescriptionSchema, squadNameSchema } from '@/lib/squads/rules';
import { updateSquadProfile } from '@/lib/squads/membership';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    name: squadNameSchema.optional(),
    description: squadDescriptionSchema.nullable().optional(),
    goalTier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.goalTier !== undefined, {
    message: 'Değiştirilecek bir alan gönderin.',
  });

export const PATCH = defineRoute(
  {
    name: 'customer.squads.update',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: Body,
  },
  async ({ user, params, body }) => ok(await updateSquadProfile(user.id, params.id, body))
);
