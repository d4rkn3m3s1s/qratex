/**
 * ROI paneli (madde 39): aksiyonların gelir, memnuniyet, tekrar ziyaret etkisi.
 * GET: özet metrikler, önceki ay karşılaştırma, haftalık ve günlük trend verisi.
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { startOfDayUTC as startOfDay, startOfWeekUTC as startOfWeek } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? undefined : session.user.id;
  if (session.user.role === 'ADMIN') {
    return NextResponse.json(
      {
        message: 'ROI paneli için dealerId query ile belirtin: ?dealerId=xxx',
        metrics: null,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // REDIS CACHE: 13 prisma cagrisi. ADMIN yukarida erken dondugu icin buraya yalniz
  // bayi gelir → anahtar dealerId ile IZOLE (baska bayinin verisi sizamaz).
  const { redisGetJson, redisSetJson } = await import('@/lib/redis');
  const cacheKey = `dealer-roi:${dealerId}`;
  const cachedRoi = await redisGetJson<object>(cacheKey);
  if (cachedRoi) return NextResponse.json(cachedRoi, { headers: PRIVATE_NO_STORE_HEADERS });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const baseWhere = { qrCode: { dealerId }, deletedAt: null };
  const thisMonthWhere = { ...baseWhere, createdAt: { gte: startOfMonth, lte: endOfMonth } };
  const prevMonthWhere = { ...baseWhere, createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } };

  const [
    feedbackTotal,
    feedbackReplied,
    actionItemsTotal,
    actionItemsDone,
    avgRatingAgg,
    prevFeedbackTotal,
    prevFeedbackReplied,
    prevActionTotal,
    prevActionDone,
    prevAvgRatingAgg,
  ] = await Promise.all([
    prisma.feedback.count({ where: { ...thisMonthWhere } }),
    prisma.feedback.count({ where: { ...thisMonthWhere, dealerRepliedAt: { not: null } } }),
    prisma.actionItem.count({ where: { dealerId, createdAt: { gte: startOfMonth } } }),
    prisma.actionItem.count({ where: { dealerId, status: 'done', createdAt: { gte: startOfMonth } } }),
    prisma.feedback.aggregate({ where: thisMonthWhere, _avg: { rating: true }, _count: true }),
    prisma.feedback.count({ where: { ...prevMonthWhere } }),
    prisma.feedback.count({ where: { ...prevMonthWhere, dealerRepliedAt: { not: null } } }),
    prisma.actionItem.count({ where: { dealerId, createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } } }),
    prisma.actionItem.count({ where: { dealerId, status: 'done', createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } } }),
    prisma.feedback.aggregate({ where: prevMonthWhere, _avg: { rating: true }, _count: true }),
  ]);

  const replyRate = feedbackTotal > 0 ? (feedbackReplied / feedbackTotal) * 100 : 0;
  const actionCompletionRate = actionItemsTotal > 0 ? (actionItemsDone / actionItemsTotal) * 100 : 0;
  const prevReplyRate = prevFeedbackTotal > 0 ? (prevFeedbackReplied / prevFeedbackTotal) * 100 : 0;
  const prevActionRate = prevActionTotal > 0 ? (prevActionDone / prevActionTotal) * 100 : 0;
  const avgRating = avgRatingAgg._avg.rating ?? null;
  const prevAvgRating = prevAvgRatingAgg._avg.rating ?? null;

  const replyRateChange = prevReplyRate > 0 ? replyRate - prevReplyRate : null;
  const actionRateChange = prevActionRate > 0 ? actionCompletionRate - prevActionRate : null;
  const ratingChange = prevAvgRating != null && avgRating != null ? Number((avgRating - prevAvgRating).toFixed(1)) : null;
  const feedbackChange = prevFeedbackTotal > 0 ? feedbackTotal - prevFeedbackTotal : null;

  // Son 6 hafta: her hafta için feedback sayısı, yanıt sayısı, ortalama puan, tamamlanan aksiyon.
  // Önceden hafta başına 4 sorgu (6×4=24) döngüde çalışıyordu; tek pass'te
  // date_trunc('week') ile gruplanmış 2 sorguya indirildi (feedback + aksiyon).
  const weekStarts: Date[] = [];
  for (let w = 5; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    weekStarts.push(startOfWeek(weekEnd));
  }
  const firstWeekStart = weekStarts[0];
  const lastWeekEnd = new Date(weekStarts[weekStarts.length - 1]);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
  lastWeekEnd.setUTCHours(23, 59, 59, 999);

  // Postgres'te date_trunc('week') ISO haftası (Pazartesi) ile aynıdır → weekStart'larla eşleşir.
  const weeklyFbRows = await prisma.$queryRaw<
    Array<{ bucket: Date; total: bigint; replied: bigint; avg_rating: number | null }>
  >(Prisma.sql`
    SELECT date_trunc('week', f."createdAt" AT TIME ZONE 'UTC') AS bucket,
           COUNT(*)::bigint AS total,
           COUNT(f."dealerRepliedAt")::bigint AS replied,
           AVG(f."rating")::float AS avg_rating
    FROM "Feedback" f
    JOIN "QRCode" q ON q."id" = f."qrCodeId"
    WHERE q."dealerId" = ${dealerId}
      AND f."deletedAt" IS NULL
      AND f."createdAt" >= ${firstWeekStart}
      AND f."createdAt" <= ${lastWeekEnd}
    GROUP BY 1
  `);
  const weeklyActionRows = await prisma.$queryRaw<Array<{ bucket: Date; done: bigint }>>(Prisma.sql`
    SELECT date_trunc('week', "createdAt" AT TIME ZONE 'UTC') AS bucket,
           COUNT(*)::bigint AS done
    FROM "ActionItem"
    WHERE "dealerId" = ${dealerId}
      AND "status" = 'done'
      AND "createdAt" >= ${firstWeekStart}
      AND "createdAt" <= ${lastWeekEnd}
    GROUP BY 1
  `);
  const weekKey = (d: Date) => d.toISOString().slice(0, 10);
  const fbByWeek = new Map(weeklyFbRows.map((r) => [weekKey(new Date(r.bucket)), r]));
  const actByWeek = new Map(weeklyActionRows.map((r) => [weekKey(new Date(r.bucket)), Number(r.done)]));

  const weeklyData = weekStarts.map((weekStart, i) => {
    const k = weekKey(weekStart);
    const fb = fbByWeek.get(k);
    return {
      weekLabel: `Hafta ${i + 1}`,
      weekStart: k,
      feedbacks: fb ? Number(fb.total) : 0,
      replied: fb ? Number(fb.replied) : 0,
      avgRating: fb?.avg_rating != null ? Number(fb.avg_rating.toFixed(1)) : 0,
      actionsDone: actByWeek.get(k) ?? 0,
    };
  });

  // Son 7 gün: günlük feedback ve yanıt. Önceden gün başına 3 sorgu (7×3=21)
  // döngüde; tek pass'te date_trunc('day') ile gruplanmış 1 sorguya indirildi.
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

  const dailyFbRows = await prisma.$queryRaw<
    Array<{ bucket: Date; total: bigint; replied: bigint; avg_rating: number | null }>
  >(Prisma.sql`
    SELECT date_trunc('day', f."createdAt" AT TIME ZONE 'UTC') AS bucket,
           COUNT(*)::bigint AS total,
           COUNT(f."dealerRepliedAt")::bigint AS replied,
           AVG(f."rating")::float AS avg_rating
    FROM "Feedback" f
    JOIN "QRCode" q ON q."id" = f."qrCodeId"
    WHERE q."dealerId" = ${dealerId}
      AND f."deletedAt" IS NULL
      AND f."createdAt" >= ${firstDayStart}
      AND f."createdAt" <= ${lastDayEnd}
    GROUP BY 1
  `);
  const fbByDay = new Map(dailyFbRows.map((r) => [weekKey(new Date(r.bucket)), r]));

  const dailyData = dayStarts.map((dayStart) => {
    const k = weekKey(dayStart);
    const fb = fbByDay.get(k);
    return {
      date: k,
      label: dayLabels[dayStart.getUTCDay()],
      feedbacks: fb ? Number(fb.total) : 0,
      replied: fb ? Number(fb.replied) : 0,
      avgRating: fb?.avg_rating != null ? Number(fb.avg_rating.toFixed(1)) : 0,
    };
  });

  const roiPayload = {
      metrics: {
        period: 'this_month',
        feedbackTotal,
        feedbackReplied,
        replyRate: Math.round(replyRate * 10) / 10,
        actionItemsTotal,
        actionItemsDone,
        actionCompletionRate: Math.round(actionCompletionRate * 10) / 10,
        avgRating,
        feedbackCount: avgRatingAgg._count,
        comparison: {
          feedbackTotalPrev: prevFeedbackTotal,
          feedbackRepliedPrev: prevFeedbackReplied,
          replyRatePrev: Math.round(prevReplyRate * 10) / 10,
          actionItemsTotalPrev: prevActionTotal,
          actionItemsDonePrev: prevActionDone,
          actionCompletionRatePrev: Math.round(prevActionRate * 10) / 10,
          avgRatingPrev: prevAvgRating,
          replyRateChange: replyRateChange != null ? Math.round(replyRateChange * 10) / 10 : null,
          actionRateChange: actionRateChange != null ? Math.round(actionRateChange * 10) / 10 : null,
          ratingChange,
          feedbackChange,
        },
      },
      weeklyTrend: weeklyData,
      dailyTrend: dailyData,
  };
  await redisSetJson(cacheKey, roiPayload, 60); // Redis yoksa sessizce gecer
  return NextResponse.json(roiPayload, { headers: PRIVATE_NO_STORE_HEADERS });
}
