/**
 * GET — haftalık klan hedefi (geri uyum yolu). Hafta Europe/Istanbul; hedef üye sayısıyla
 * ölçeklenir; katkı yalnız katılım anından sonraki geçerli geri bildirimler.
 * Klansız kullanıcıya `{ squad: null }` (hata değil, gerçek boş durum).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { membershipOf } from '@/lib/squads/membership';
import { computeWeeklyGoal, hasClaimedWeeklyGoal, toWeeklyGoalDto } from '@/lib/squads/goal';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.squads.weekly-goal', roles: ['CUSTOMER'], module: 'squads', rateLimit: 'read' },
  async ({ user }) => {
    const membership = await membershipOf(prisma, user.id);
    if (!membership) return ok({ squad: null }, { legacySpread: true });
    const squad = await prisma.squad.findUnique({
      where: { id: membership.squadId },
      select: {
        id: true,
        name: true,
        isFrozen: true,
        weeklyTeamTarget: true,
        members: { select: { userId: true, joinedAt: true } },
      },
    });
    if (!squad) return ok({ squad: null }, { legacySpread: true });
    const goal = await computeWeeklyGoal(prisma, squad, squad.members);
    const claimed = await hasClaimedWeeklyGoal(prisma, goal.weekKey, user.id);
    return ok(
      {
        squad: {
          id: squad.id,
          name: squad.name,
          memberCount: squad.members.length,
          ...toWeeklyGoalDto(goal, user.id, claimed, squad.isFrozen),
        },
      },
      { legacySpread: true }
    );
  }
);
