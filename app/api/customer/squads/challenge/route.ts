/**
 * POST — klan meydan okuması (yalnız lider). Ödül havuzu liderin bakiyesinden escrow'a
 * alınır (ret / süre dolumu / beraberlik / geri çekmede iade). İki klanın donmuşluğu,
 * açık savaş çakışması (süresi dolmuşlar önce kapatılır) ve bakiye sunucuda doğrulanır.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { BATTLE_MAX_HOURS, BATTLE_MAX_STAKE, BATTLE_MIN_HOURS } from '@/lib/squads/rules';
import { createChallenge } from '@/lib/squads/battles';

export const dynamic = 'force-dynamic';

const Body = z.object({
  targetSquadId: z.string().min(1).max(64),
  durationHours: z.coerce
    .number({ invalid_type_error: 'Süre saat cinsinden bir sayı olmalı.' })
    .int('Süre tam saat olmalı.')
    .min(BATTLE_MIN_HOURS, `Süre en az ${BATTLE_MIN_HOURS} saat olmalı.`)
    .max(BATTLE_MAX_HOURS, `Süre en fazla ${BATTLE_MAX_HOURS} saat (1 hafta) olabilir.`)
    .default(24),
  rewardPool: z.coerce
    .number({ invalid_type_error: 'Ödül havuzu bir sayı olmalı.' })
    .int('Ödül havuzu tam sayı olmalı.')
    .min(0, 'Ödül havuzu negatif olamaz.')
    .max(BATTLE_MAX_STAKE, `Ödül havuzu en fazla ${BATTLE_MAX_STAKE.toLocaleString('tr-TR')} puan olabilir.`)
    .default(0),
});

export const POST = defineRoute(
  {
    name: 'customer.squads.challenge',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
    schema: Body,
    idempotent: true,
  },
  async ({ user, body }) => ok(await createChallenge(user.id, body), { status: 201, legacySpread: true })
);
