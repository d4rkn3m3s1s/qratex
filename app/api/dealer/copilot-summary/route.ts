/**
 * Manager Copilot (madde 46): haftalık özet + istatistikler + günlük trend + next-best-actions.
 * GET: son 7 gün kritik sorunlar, önerilen aksiyonlar, istatistikler, günlük grafik verisi.
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { buildNextBestActions } from '@/lib/next-best-action';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { startOfDayUTC as startOfDay } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? undefined : session.user.id;
  if (session.user.role === 'ADMIN') {
    return NextResponse.json(
      {
        message: 'Copilot özeti için dealerId query ile belirtin: ?dealerId=xxx',
        summary: null,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const baseWhere = { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: since } };
  const negativeWhere = {
    ...baseWhere,
    OR: [{ rating: { lte: 3 } }, { sentiment: 'negative' }],
  };

  const [
    feedbacks,
    totalCount,
    negativeCount,
    repliedCount,
    avgRatingAgg,
    totalQRCodes,
    worstQrRow,
    actionItemsPending,
    churnCount,
    incidentCount,
  ] = await Promise.all([
    prisma.feedback.findMany({
      where: negativeWhere,
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        rating: true,
        text: true,
        sentiment: true,
        actionSuggestions: true,
        urgency: true,
        createdAt: true,
      },
    }),
    prisma.feedback.count({ where: baseWhere }),
    prisma.feedback.count({ where: negativeWhere }),
    prisma.feedback.count({ where: { ...baseWhere, dealerRepliedAt: { not: null } } }),
    prisma.feedback.aggregate({ where: baseWhere, _avg: { rating: true }, _count: true }),
    prisma.qRCode.count({ where: { dealerId } }),
    prisma.feedback.groupBy({
      by: ['qrCodeId'],
      where: { deletedAt: null, qrCode: { dealerId }, createdAt: { gte: since } },
      _avg: { rating: true },
      _count: { _all: true },
      orderBy: { _avg: { rating: 'asc' } },
      take: 1,
    }),
    prisma.actionItem.count({
      where: { dealerId, status: { in: ['pending', 'assigned', 'in_progress'] } },
    }),
    prisma.feedback.count({
      where: { ...baseWhere, churnRisk: { gte: 0.7 } },
    }),
    prisma.incident.count({
      where: { dealerId, status: { not: 'resolved' } },
    }),
  ]);

  const criticalIssues = feedbacks
    .filter((f) => f.text && f.text.length > 10)
    .slice(0, 6)
    .map((f) => ({
      feedbackId: f.id,
      rating: f.rating,
      sentiment: f.sentiment,
      excerpt: f.text!.slice(0, 150) + (f.text!.length > 150 ? '…' : ''),
      urgency: f.urgency,
      createdAt: f.createdAt,
    }));

  const allSuggestions: Array<{ action: string; priority?: string; feedbackId: string }> = [];
  for (const f of feedbacks) {
    const suggestions = f.actionSuggestions as Array<{ action?: string; priority?: string }> | null;
    if (Array.isArray(suggestions)) {
      for (const s of suggestions.slice(0, 2)) {
        if (s.action) allSuggestions.push({ action: s.action, priority: s.priority, feedbackId: f.id });
      }
    }
  }
  const topActions = allSuggestions.slice(0, 6);

  const worstAvg7d = worstQrRow[0]?._avg.rating;
  const lowestRatedQrId =
    worstQrRow[0] &&
    (worstQrRow[0]._count._all ?? 0) > 0 &&
    worstAvg7d != null &&
    worstAvg7d < 4
      ? worstQrRow[0].qrCodeId
      : undefined;

  const nextBestActions = buildNextBestActions({
    totalQRCodes,
    totalFeedbacks: totalCount,
    negativeCount,
    pendingActionCount: actionItemsPending,
    highChurnCount: churnCount,
    lowestRatedQrId,
  });

  const replyRate = totalCount > 0 ? Math.round((repliedCount / totalCount) * 1000) / 10 : 0;
  const avgRating = avgRatingAgg._avg.rating ?? null;
  const positiveCount = totalCount - negativeCount;

  // Son 7 gün günlük veri. Önceden gün başına 3 sorgu (7×3=21) döngüde
  // çalışıyordu; tek pass'te date_trunc('day') ile gruplanmış 1 sorguya indirildi.
  const dayLabels = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const dayStarts: Date[] = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    dayStarts.push(startOfDay(date));
  }
  const firstDayStart = dayStarts[0];
  const lastDayEnd = new Date(dayStarts[dayStarts.length - 1]);
  lastDayEnd.setUTCHours(23, 59, 59, 999);

  const dailyRows = await prisma.$queryRaw<
    Array<{ bucket: Date; total: bigint; negative: bigint; avg_rating: number | null }>
  >(Prisma.sql`
    SELECT date_trunc('day', f."createdAt" AT TIME ZONE 'UTC') AS bucket,
           COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE f."rating" <= 3 OR f."sentiment" = 'negative')::bigint AS negative,
           AVG(f."rating")::float AS avg_rating
    FROM "Feedback" f
    JOIN "QRCode" q ON q."id" = f."qrCodeId"
    WHERE q."dealerId" = ${dealerId}
      AND f."deletedAt" IS NULL
      AND f."createdAt" >= ${firstDayStart}
      AND f."createdAt" <= ${lastDayEnd}
    GROUP BY 1
  `);
  const dayKey = (dt: Date) => dt.toISOString().slice(0, 10);
  const byDay = new Map(dailyRows.map((r) => [dayKey(new Date(r.bucket)), r]));

  const dailyTrend = dayStarts.map((dayStart) => {
    const row = byDay.get(dayKey(dayStart));
    return {
      date: dayKey(dayStart),
      label: dayLabels[dayStart.getUTCDay()],
      total: row ? Number(row.total) : 0,
      negative: row ? Number(row.negative) : 0,
      avgRating: row?.avg_rating != null ? Number(row.avg_rating.toFixed(1)) : 0,
    };
  });

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentCampaigns = await prisma.campaign.findMany({
    where: { dealerId, status: 'sent', sentAt: { gte: thirtyDaysAgo } },
    orderBy: { sentAt: 'desc' },
    take: 4,
    select: { id: true, title: true, sentCount: true, sentAt: true },
  });

  const campaignRoiHints = await Promise.all(
    recentCampaigns.map(async (c) => {
      const token = c.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 20);
      if (token.length < 3) {
        return {
          campaignId: c.id,
          title: c.title,
          attributedFeedbackCount: 0,
          sentCount: c.sentCount,
          hint: 'Başlıktan kısa UTM eşlemesi için en az 3 harf içeren bir ad kullanın.',
        };
      }
      const n = await prisma.feedback.count({
        where: {
          deletedAt: null,
          createdAt: { gte: thirtyDaysAgo },
          qrCode: { dealerId },
          utmCampaign: { contains: token, mode: 'insensitive' },
        },
      });
      return {
        campaignId: c.id,
        title: c.title,
        attributedFeedbackCount: n,
        sentCount: c.sentCount,
        hint:
          n === 0
            ? 'utm_campaign ile kampanya adını hizalayın veya performans sayfasına bakın.'
            : `${n} geri bildirim son 30 günde UTM ile eşleşti.`,
      };
    })
  );

  return NextResponse.json(
    {
      summary: {
      period: 'last_7_days',
      criticalIssues,
      topActions,
      totalNegativeFeedback: negativeCount,
      stats: {
        totalFeedback: totalCount,
        negativeCount,
        positiveCount,
        replyRate,
        avgRating: avgRating != null ? Math.round(avgRating * 100) / 100 : null,
        repliedCount,
        actionItemsPending,
        churnCount,
        openIncidents: incidentCount,
      },
      nextBestActions: nextBestActions.slice(0, 5),
      campaignRoiHints,
    },
    dailyTrend,
  },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Copilot summary error:', error);
    return NextResponse.json(
      { error: 'Özet yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
