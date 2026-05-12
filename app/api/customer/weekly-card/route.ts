import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { getPointsMatrix, getQuestReward } from '@/lib/points-rules';


export const dynamic = 'force-dynamic';

/**
 * Haftalık mini görev kartı: en fazla 3 aktif görev + ilerleme.
 */
export async function GET() {
  const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const userId = session.user.id;

  const quests = await prisma.quest.findMany({
    where: { isActive: true },
    take: 24,
    orderBy: { createdAt: 'desc' },
    include: {
      users: {
        where: { userId },
        select: { id: true, progress: true, completedAt: true },
      },
    },
  });

  const matrix = await getPointsMatrix();

  const allRows = quests.map((quest) => {
    const userQuest = quest.users[0] || null;
    const requirement = (quest.requirement || {}) as { count?: number };
    const target = typeof requirement.count === 'number' && requirement.count > 0 ? requirement.count : 1;
    const progress = userQuest?.progress || 0;
    const completed = !!userQuest?.completedAt || progress >= target;
    return {
      id: quest.id,
      title: quest.name,
      description: quest.description,
      target,
      progress,
      completed,
      reward: getQuestReward(quest.reward, matrix),
      enrolled: !!userQuest,
    };
  });

  const normalized = allRows.filter((q) => !q.completed).slice(0, 3);

  const enrolled = allRows.filter((q) => q.enrolled);
  const weeklyVictory =
    enrolled.length > 0 && enrolled.every((q) => q.completed)
      ? {
          eligible: true,
          message:
            'Bu dönemki kayıtlı görevlerinizin tamamı tamamlandı. Sürpriz kutularda ek şans ve bağış çarpanı kampanyalarını kontrol edin.',
          ctaHref: '/customer/surprise-boxes',
          ctaLabel: 'Sürpriz kutular',
        }
      : null;

  return NextResponse.json({
    success: true,
    weekLabel: `Hafta ${getIsoWeek(new Date())}`,
    quests: normalized,
    weeklyVictory,
  });
}

function getIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
