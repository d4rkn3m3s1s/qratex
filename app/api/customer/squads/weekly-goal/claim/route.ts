/**
 * POST — haftalık klan hedefi ödülünü al. Sunucu hedefi, katkıyı ve tek-kez anahtarını
 * (`squad-weekly-goal:<hafta>:<kullanıcı>`) doğrular; kredi `mintPoints` ile defterli ve
 * `points_credited` görünür. Hata kodları: GOAL_NOT_COMPLETE, GOAL_NOT_ELIGIBLE,
 * GOAL_ALREADY_CLAIMED, SQUAD_FROZEN, NOT_SQUAD_MEMBER.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { claimWeeklyGoal } from '@/lib/squads/goal';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.squads.weekly-goal.claim',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: { max: 10, windowMs: 60_000, by: 'user' },
  },
  async ({ user }) => ok(await claimWeeklyGoal(user.id))
);
