/**
 * ROI paneli (madde 39): aksiyonların gelir, memnuniyet, tekrar ziyaret etkisi.
 * GET: özet metrikler, önceki ay karşılaştırma, haftalık ve günlük trend verisi.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

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

  // Son 6 hafta: her hafta için feedback sayısı, yanıt sayısı, ortalama puan, tamamlanan aksiyon
  const weeklyData: Array<{ weekLabel: string; weekStart: string; feedbacks: number; replied: number; avgRating: number; actionsDone: number }> = [];
  for (let w = 5; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = startOfWeek(weekEnd);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);
    const [fbCount, fbReplied, ag, actions] = await Promise.all([
      prisma.feedback.count({ where: { ...baseWhere, createdAt: { gte: weekStart, lte: weekEndDate } } }),
      prisma.feedback.count({ where: { ...baseWhere, dealerRepliedAt: { not: null }, createdAt: { gte: weekStart, lte: weekEndDate } } }),
      prisma.feedback.aggregate({ where: { ...baseWhere, createdAt: { gte: weekStart, lte: weekEndDate } }, _avg: { rating: true } }),
      prisma.actionItem.count({ where: { dealerId, status: 'done', createdAt: { gte: weekStart, lte: weekEndDate } } }),
    ]);
    weeklyData.push({
      weekLabel: `Hafta ${6 - w}`,
      weekStart: weekStart.toISOString().slice(0, 10),
      feedbacks: fbCount,
      replied: fbReplied,
      avgRating: ag._avg.rating != null ? Number(ag._avg.rating.toFixed(1)) : 0,
      actionsDone: actions,
    });
  }

  // Son 7 gün: günlük feedback ve yanıt
  const dailyData: Array<{ date: string; label: string; feedbacks: number; replied: number; avgRating: number }> = [];
  const dayLabels = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const [fbCount, fbReplied, ag] = await Promise.all([
      prisma.feedback.count({ where: { ...baseWhere, createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.feedback.count({ where: { ...baseWhere, dealerRepliedAt: { not: null }, createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.feedback.aggregate({ where: { ...baseWhere, createdAt: { gte: dayStart, lte: dayEnd } }, _avg: { rating: true } }),
    ]);
    dailyData.push({
      date: dayStart.toISOString().slice(0, 10),
      label: dayLabels[dayStart.getDay()],
      feedbacks: fbCount,
      replied: fbReplied,
      avgRating: ag._avg.rating != null ? Number(ag._avg.rating.toFixed(1)) : 0,
    });
  }

  return NextResponse.json(
    {
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
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
