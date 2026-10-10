import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { claimSeasonalChallenge, loadSeasonalEvents } from '@/lib/places/deals.server';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { claimBodySchema } from '@/lib/places/query-schemas';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/seasonal-event — kullanıcıya UYGUN sezonluk etkinlikler (çoğul; aktif +
 * talep süresindeki bitmiş görevler) ve yaklaşanlar. Keşfet → Fırsatlar bu veriyi
 * `/api/customer/places/deals` içinde de alır.
 *
 * Geriye uyum (`legacySpread`): kökte eski `{ active, event, challenge }` alanları da durur
 * (ilk aktif etkinlik). Hata artık "etkinlik yok" (200) diye gizlenmez; zarf v2 hata döner.
 */
export const GET = defineRoute(
  {
    name: 'customer.seasonal-event.get',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
  },
  async ({ user, request }) => {
    await assertPlacesAccess(user.id, request, 'deals');
    const now = new Date();
    const { events, upcoming } = await loadSeasonalEvents(prisma, user.id, now);
    const first = events.find((e) => e.phase === 'active') ?? null;
    return ok(
      {
        events,
        upcomingEvents: upcoming,
        active: first !== null,
        event: first
          ? {
              id: first.id,
              name: first.name,
              description: first.description,
              type: first.type,
              multiplier: first.multiplier,
              bonusPoints: first.bonusPoints,
              imageUrl: first.imageUrl,
              endDate: first.endDate,
              endsInMs: Math.max(0, new Date(first.endDate).getTime() - now.getTime()),
            }
          : null,
        challenge: first?.challenge
          ? {
              type: first.challenge.type,
              goal: first.challenge.goal,
              current: first.challenge.current,
              ratio: Math.min(1, first.challenge.current / Math.max(1, first.challenge.goal)),
              complete: first.challenge.complete,
              rewardPoints: first.challenge.rewardPoints,
              claimed: first.challenge.claimed,
            }
          : null,
      },
      { legacySpread: true },
    );
  },
);

const CLAIM_STATUS: Record<string, 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' | 'FORBIDDEN'> = {
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_CLAIMED: 'CONFLICT',
  NOT_ELIGIBLE: 'FORBIDDEN',
  NO_CHALLENGE: 'BAD_REQUEST',
  NOT_COMPLETE: 'BAD_REQUEST',
  CLAIM_EXPIRED: 'BAD_REQUEST',
  NOT_STARTED: 'BAD_REQUEST',
};

/**
 * POST /api/customer/seasonal-event — etkinlik görevi ödülü. Gövde `{ campaignId }` (önerilen);
 * gövdesiz eski istemci için kullanıcıya uygun ilk görevli etkinlik hedeflenir. Sunucu ilerlemeyi
 * yeniden sayar; tek-kez `SeasonalChallengeClaim @@unique` + `mintPoints` defter anahtarı ile.
 * Etkinlik bittikten sonra 3 gün talep edilebilir.
 */
export const POST = defineRoute(
  {
    name: 'customer.seasonal-event.claim',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    schema: claimBodySchema,
  },
  async ({ user, body, request }) => {
    await assertPlacesAccess(user.id, request, 'deals');
    const r = await claimSeasonalChallenge(user.id, body?.campaignId ?? null);
    if (!r.ok) throw new ApiError(CLAIM_STATUS[r.code] ?? 'BAD_REQUEST', r.message, { details: { reason: r.code } });
    return ok({ points: r.points, badgeAwarded: r.badgeAwarded, campaignId: r.campaignId }, { legacySpread: true });
  },
);
