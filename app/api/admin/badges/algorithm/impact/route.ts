import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { DEFAULT_BADGE_ALGORITHM_CONFIG, simulateBadgeScore } from '@/lib/badge-algorithm';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const configRow = await prisma.settings.findUnique({ where: { key: 'badge_algorithm_config' } });
  const config = (configRow?.value as any) ?? DEFAULT_BADGE_ALGORITHM_CONFIG;

  const users = await prisma.user.findMany({
    take: 300,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      points: true,
      level: true,
      _count: {
        select: {
          feedbacks: true,
          quests: true,
          referralsMade: true,
        },
      },
    },
  });

  const buckets = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
  let avgScore = 0;
  for (const u of users) {
    const res = simulateBadgeScore(config, {
      feedbackCount: u._count.feedbacks,
      totalPoints: u.points ?? 0,
      streak: 0,
      level: u.level ?? 1,
      referrals: u._count.referralsMade,
      quests: u._count.quests,
      weekend: false,
      campaign: false,
      retentionRisk: false,
    });
    avgScore += res.score;
    buckets[res.predictedRarity] += 1;
  }

  const total = Math.max(1, users.length);
  return NextResponse.json({
    success: true,
    sampleSize: users.length,
    averageScore: Number((avgScore / total).toFixed(2)),
    distribution: buckets,
  });
}

