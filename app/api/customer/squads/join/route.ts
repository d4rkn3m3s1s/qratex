/**
 * POST — davet koduyla klana katıl. Tek transaction: kullanıcı + klan satırı kilidi,
 * dondurma (`Squad.isFrozen`), mevcut üyelik, kapasite (`SQUAD_MAX_MEMBERS`) kontrolü.
 * Hatalar kodludur: INVITE_INVALID, ALREADY_IN_SQUAD, ALREADY_MEMBER, SQUAD_FULL, SQUAD_FROZEN.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { inviteCodeSchema } from '@/lib/squads/rules';
import { joinSquad } from '@/lib/squads/membership';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.squads.join',
    roles: ['CUSTOMER'],
    module: 'squads',
    // Davet kodu tahminine karşı sıkı tavan.
    rateLimit: { max: 10, windowMs: 10 * 60_000, by: 'user' },
    schema: z.object({ inviteCode: inviteCodeSchema }),
  },
  async ({ user, body }) => {
    const r = await joinSquad(user.id, body.inviteCode);
    return ok({ ...r, message: `${r.name} klanına katıldın.` }, { legacySpread: true });
  }
);
