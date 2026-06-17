import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { startOfWeekUTC as startOfWeekMonday } from '@/lib/timezone';


export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await assertModuleEnabled('squads');
  if (gate) return gate;
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const member = await prisma.squadMember.findFirst({
    where: { userId },
    include: {
      squad: {
        select: {
          id: true,
          name: true,
          weeklyTeamTarget: true,
          weeklyTeamProgress: true,
          members: { select: { userId: true } },
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json(
      { success: true, squad: null },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const squad = member.squad;
  const memberIds = squad.members.map((m) => m.userId);
  const weekStart = startOfWeekMonday(new Date());

  const feedbacksThisWeek = await prisma.feedback.count({
    where: {
      userId: { in: memberIds },
      deletedAt: null,
      createdAt: { gte: weekStart },
    },
  });

  const target = Math.max(1, squad.weeklyTeamTarget);
  const progress = Math.min(target, feedbacksThisWeek);

  return NextResponse.json(
    {
      success: true,
      squad: {
        id: squad.id,
        name: squad.name,
        weekStart: weekStart.toISOString(),
        target,
        progress,
        percent: Math.round((progress / target) * 100),
        memberCount: memberIds.length,
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
