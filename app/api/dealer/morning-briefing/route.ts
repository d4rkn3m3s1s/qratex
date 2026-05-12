import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

/**
 * Son 24 saat özeti: düşük puan, yeni geri bildirim, açık olaylar, telafi onay kuyruğu.
 */
export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.id;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const baseFeedbackWhere = {
    deletedAt: null,
    qrCode: { dealerId: dealerId },
    createdAt: { gte: since },
  };

  const customerIds = await prisma.feedback.findMany({
    where: {
      qrCode: { dealerId },
      deletedAt: null,
      createdAt: { gte: since },
      userId: { not: null },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const distinctCustomerIds = customerIds.map((c) => c.userId).filter(Boolean) as string[];

  const [lowRating24h, newFeedback24h, openIncidents, remedyQueueCount, vocSnippetCount, pushReach] =
    await Promise.all([
    prisma.feedback.count({
      where: {
        ...baseFeedbackWhere,
        rating: { lte: 2 },
      },
    }),
    prisma.feedback.count({
      where: baseFeedbackWhere,
    }),
    prisma.incident.count({
      where: {
        dealerId,
        status: { in: ['open', 'assigned', 'in_progress'] },
      },
    }),
    prisma.remedyOffer.count({
      where: {
        dealerId,
        status: 'awaiting_dealer_approval',
      },
    }),
    prisma.feedback.count({
      where: {
        ...baseFeedbackWhere,
        text: { not: null },
      },
    }),
    distinctCustomerIds.length
      ? prisma.pushSubscription.count({
          where: { userId: { in: distinctCustomerIds }, isActive: true },
        })
      : Promise.resolve(0),
  ]);

  const urgentFeedbacks = await prisma.feedback.findMany({
    where: {
      ...baseFeedbackWhere,
      rating: { lte: 2 },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      rating: true,
      text: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const highlights: string[] = [];
  if (remedyQueueCount > 0) {
    highlights.push(`${remedyQueueCount} telafi onayı bekliyor`);
  }
  if (openIncidents > 0) {
    highlights.push(`${openIncidents} açık olay`);
  }
  if (lowRating24h > 0) {
    highlights.push(`Son 24 saatte ${lowRating24h} düşük puanlı geri bildirim`);
  }
  if (vocSnippetCount > 0) {
    highlights.push(`${vocSnippetCount} metinli geri bildirim (VoC)`);
  }
  if (pushReach > 0) {
    highlights.push(`Son 24 saatte geri bildirim veren müşterilerden ${pushReach} push abonesi`);
  }

  const suggestedPlaybook =
    lowRating24h > 0
      ? {
          id: 'low_nps_churn',
          title: 'Düşük NPS + telafi playbook',
          dealerCtaHref: '/dealer/feedbacks',
          dealerCtaLabel: 'Geri bildirimlere git',
        }
      : newFeedback24h > 8
        ? {
            id: 'silent_happy',
            title: 'Sessiz memnunlar — geri bildirim teşviki',
            dealerCtaHref: '/dealer/campaigns',
            dealerCtaLabel: 'Kampanyalar',
          }
        : null;

  return NextResponse.json({
    success: true,
    last24h: {
      lowRatingFeedbackCount: lowRating24h,
      newFeedbackCount: newFeedback24h,
      openIncidents,
      remedyQueueCount,
      vocTextFeedbackCount: vocSnippetCount,
      pushSubscribersAmongActiveCustomers: pushReach,
    },
    highlights,
    urgentFeedbacks: urgentFeedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      excerpt: (f.text || '').slice(0, 140) + ((f.text?.length ?? 0) > 140 ? '…' : ''),
      createdAt: f.createdAt.toISOString(),
      customerLabel: f.user?.name || f.user?.email || 'Anonim',
    })),
    suggestedPlaybook,
  });
}
