/**
 * GET — kullanıcının klanının güncel savaşı + son sonuç (canlı skor yoklaması).
 * Süresi dolmuş savaş okumada claim'li olarak kapatılır: "CANLI" görünmez, yeni meydan okumayı
 * bloke etmez, sonuç günlük cron'u beklemez (customer_squads.md Bulgu 7).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { membershipOf } from '@/lib/squads/membership';
import { getBattleState } from '@/lib/squads/battles';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.squads.battle.current', roles: ['CUSTOMER'], module: 'squads', rateLimit: 'read' },
  async ({ user }) => {
    const membership = await membershipOf(prisma, user.id);
    if (!membership) return ok({ battle: null, recentResult: null, isOwner: false }, { legacySpread: true });
    const squad = await prisma.squad.findUnique({ where: { id: membership.squadId }, select: { ownerId: true } });
    const isOwner = squad?.ownerId === user.id;
    const state = await getBattleState(membership.squadId, user.id, isOwner);
    return ok({ ...state, isOwner }, { legacySpread: true });
  }
);
