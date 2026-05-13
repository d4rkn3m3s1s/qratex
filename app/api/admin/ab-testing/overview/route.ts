import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

type CohortKey = 'A' | 'B' | 'C';

const LABELS: Record<CohortKey, string> = {
  A: 'A (Kontrol)',
  B: 'B (x1.5 XP)',
  C: 'C (x2.0 XP)',
};

const MULT: Record<CohortKey, number> = {
  A: 1,
  B: 1.5,
  C: 2,
};

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER' },
    select: { id: true, businessName: true, name: true, abCohort: true },
  });

  const cohortRows: Array<{
    key: CohortKey;
    label: string;
    multiplier: number;
    dealerCount: number;
    feedbackCount: number;
    avgRating: number;
    avgReplyRate: number;
  }> = [];

  for (const key of ['A', 'B', 'C'] as CohortKey[]) {
    const cohortDealers = dealers.filter((d) => d.abCohort === key);
    const dealerIds = cohortDealers.map((d) => d.id);
    if (dealerIds.length === 0) {
      cohortRows.push({
        key,
        label: LABELS[key],
        multiplier: MULT[key],
        dealerCount: 0,
        feedbackCount: 0,
        avgRating: 0,
        avgReplyRate: 0,
      });
      continue;
    }

    const [agg, replied] = await Promise.all([
      prisma.feedback.aggregate({
        where: { deletedAt: null, qrCode: { dealerId: { in: dealerIds } } },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.feedback.count({
        where: {
          deletedAt: null,
          dealerRepliedAt: { not: null },
          qrCode: { dealerId: { in: dealerIds } },
        },
      }),
    ]);

    const total = agg._count;
    const replyRate = total > 0 ? (replied / total) * 100 : 0;
    cohortRows.push({
      key,
      label: LABELS[key],
      multiplier: MULT[key],
      dealerCount: dealerIds.length,
      feedbackCount: total,
      avgRating: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : 0,
      avgReplyRate: Number(replyRate.toFixed(1)),
    });
  }

  const unassigned = dealers.filter((d) => !d.abCohort).length;

  return NextResponse.json({
    success: true,
    cohorts: cohortRows,
    totals: {
      dealerCount: dealers.length,
      unassigned,
    },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
