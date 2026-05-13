/**
 * Benchmark modülü (madde 40): dealer metriklerini platform ortalamasıyla kıyaslama.
 * GET: dealer ortalama rating, yanıt oranı, aksiyon tamamlama vs platform ortalaması.
 * Haftalık trend ve yüzdelik sıra.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? request.nextUrl.searchParams.get('dealerId') : session.user.id;
  if (!dealerId) {
    return NextResponse.json({ error: 'dealerId gerekli (admin için query)' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (session.user.role === 'DEALER' && dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const baseWhere = { deletedAt: null, createdAt: { gte: since } };
  const dealerWhere = { qrCode: { dealerId }, ...baseWhere };

  const [
    dealerAgg,
    dealerReplied,
    platformAgg,
    platformReplied,
    dealerActionTotal,
    dealerActionDone,
    platformActionTotal,
    platformActionDone,
  ] = await Promise.all([
    prisma.feedback.aggregate({ where: dealerWhere, _avg: { rating: true }, _count: true }),
    prisma.feedback.count({ where: { ...dealerWhere, dealerRepliedAt: { not: null } } }),
    prisma.feedback.aggregate({ where: baseWhere, _avg: { rating: true }, _count: true }),
    prisma.feedback.count({ where: { ...baseWhere, dealerRepliedAt: { not: null } } }),
    prisma.actionItem.count({ where: { dealerId, createdAt: { gte: since } } }),
    prisma.actionItem.count({ where: { dealerId, status: 'done', createdAt: { gte: since } } }),
    prisma.actionItem.count({ where: { createdAt: { gte: since } } }),
    prisma.actionItem.count({ where: { status: 'done', createdAt: { gte: since } } }),
  ]);

  const dealerStats = {
    totalFeedback: dealerAgg._count,
    repliedCount: dealerReplied,
    replyRate: dealerAgg._count > 0 ? (dealerReplied / dealerAgg._count) * 100 : 0,
    avgRating: dealerAgg._avg.rating ?? 0,
    actionTotal: dealerActionTotal,
    actionDone: dealerActionDone,
    actionRate: dealerActionTotal > 0 ? (dealerActionDone / dealerActionTotal) * 100 : 0,
  };
  const platformStats = {
    avgRating: platformAgg._avg.rating ?? 0,
    totalFeedback: platformAgg._count,
    replyRate: platformAgg._count > 0 ? (platformReplied / platformAgg._count) * 100 : 0,
    actionTotal: platformActionTotal,
    actionDone: platformActionDone,
    actionRate: platformActionTotal > 0 ? (platformActionDone / platformActionTotal) * 100 : 0,
  };

  // Yüzdelik sıra: platformdaki dealer'lara göre (basitleştirilmiş)
  let percentile = 50;
  let totalDealers = 1;
  try {
    const allFeedbacks = await prisma.feedback.findMany({
      where: baseWhere,
      select: { rating: true, qrCodeId: true },
      take: 25000,
    });
    const qrIds = Array.from(new Set(allFeedbacks.map((f) => f.qrCodeId)));
    const qrCodes = await prisma.qRCode.findMany({
      where: { id: { in: qrIds } },
      select: { id: true, dealerId: true },
    });
    const dealerMap = new Map<string, { sum: number; count: number }>();
    for (const f of allFeedbacks) {
      const qr = qrCodes.find((q) => q.id === f.qrCodeId);
      if (!qr) continue;
      const existing = dealerMap.get(qr.dealerId);
      if (existing) {
        existing.sum += f.rating;
        existing.count += 1;
      } else {
        dealerMap.set(qr.dealerId, { sum: f.rating, count: 1 });
      }
    }
    const dealerAvgs = Array.from(dealerMap.values()).map((v) => v.count > 0 ? v.sum / v.count : 0);
    totalDealers = dealerAvgs.length || 1;
    const ourAvg = dealerStats.avgRating;
    const lowerCount = dealerAvgs.filter((avg) => avg < ourAvg).length;
    percentile = totalDealers > 0 ? Math.round((lowerCount / totalDealers) * 100) : 50;
  } catch {
    // Fallback
  }

  // Haftalık karşılaştırma: son 4 hafta
  const weeklyData: Array<{
    weekLabel: string;
    dealerRating: number;
    platformRating: number;
    dealerReplyRate: number;
    platformReplyRate: number;
  }> = [];

  for (let w = 3; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = startOfWeek(weekEnd);
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);

    const [dealerAggWeek, dealerRepliedWeek, platformAggWeek, platformRepliedWeek] = await Promise.all([
      prisma.feedback.aggregate({
        where: { ...dealerWhere, createdAt: { gte: weekStart, lte: weekEndDate } },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.feedback.count({
        where: { ...dealerWhere, dealerRepliedAt: { not: null }, createdAt: { gte: weekStart, lte: weekEndDate } },
      }),
      prisma.feedback.aggregate({
        where: { ...baseWhere, createdAt: { gte: weekStart, lte: weekEndDate } },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.feedback.count({
        where: { ...baseWhere, dealerRepliedAt: { not: null }, createdAt: { gte: weekStart, lte: weekEndDate } },
      }),
    ]);

    const dCount = dealerAggWeek._count;
    const pCount = platformAggWeek._count;
    weeklyData.push({
      weekLabel: `Hafta ${4 - w}`,
      dealerRating: dealerAggWeek._avg.rating != null ? Number(dealerAggWeek._avg.rating.toFixed(2)) : 0,
      platformRating: platformAggWeek._avg.rating != null ? Number(platformAggWeek._avg.rating.toFixed(2)) : 0,
      dealerReplyRate: dCount > 0 ? Math.round((dealerRepliedWeek / dCount) * 1000) / 10 : 0,
      platformReplyRate: pCount > 0 ? Math.round((platformRepliedWeek / pCount) * 1000) / 10 : 0,
    });
  }

  // Günlük trend: son 7 gün (siz vs platform ortalama puan)
  function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  const dailyData: Array<{ date: string; label: string; dealerRating: number; platformRating: number }> = [];
  const dayLabels = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dayStart = startOfDay(date);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const [dealerDay, platformDay] = await Promise.all([
      prisma.feedback.aggregate({
        where: { ...dealerWhere, createdAt: { gte: dayStart, lte: dayEnd } },
        _avg: { rating: true },
      }),
      prisma.feedback.aggregate({
        where: { ...baseWhere, createdAt: { gte: dayStart, lte: dayEnd } },
        _avg: { rating: true },
      }),
    ]);
    dailyData.push({
      date: dayStart.toISOString().slice(0, 10),
      label: dayLabels[dayStart.getDay()],
      dealerRating: dealerDay._avg.rating != null ? Number(dealerDay._avg.rating.toFixed(2)) : 0,
      platformRating: platformDay._avg.rating != null ? Number(platformDay._avg.rating.toFixed(2)) : 0,
    });
  }

  let neighborSegment: {
    category: string;
    peerDealerSample: number;
    peerAvgRating: number;
    peerFeedbackCount: number;
    note: string;
  } | null = null;

  const dealerProfile = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { businessCategory: true },
  });
  const cat = dealerProfile?.businessCategory?.trim();
  if (cat) {
    const peers = await prisma.user.findMany({
      where: {
        role: 'DEALER',
        businessCategory: cat,
        id: { not: dealerId },
      },
      select: { id: true },
      take: 120,
    });
    const peerIds = peers.map((p) => p.id);
    if (peerIds.length >= 3) {
      const peerAgg = await prisma.feedback.aggregate({
        where: {
          deletedAt: null,
          createdAt: { gte: since },
          qrCode: { dealerId: { in: peerIds } },
        },
        _avg: { rating: true },
        _count: true,
      });
      neighborSegment = {
        category: cat,
        peerDealerSample: peerIds.length,
        peerAvgRating: Math.round((peerAgg._avg.rating ?? 0) * 100) / 100,
        peerFeedbackCount: peerAgg._count,
        note: 'Aynı iş kategorisindeki anonim ortalamalar; rekabet değil öğrenme amaçlıdır.',
      };
    }
  }

  return NextResponse.json({
    benchmark: {
      dealerId,
      period: 'last_30_days',
      neighborSegment,
      dealer: {
        avgRating: Math.round(dealerStats.avgRating * 100) / 100,
        replyRate: Math.round(dealerStats.replyRate * 10) / 10,
        totalFeedback: dealerStats.totalFeedback,
        actionRate: Math.round(dealerStats.actionRate * 10) / 10,
        actionTotal: dealerStats.actionTotal,
        actionDone: dealerStats.actionDone,
      },
      platform: {
        avgRating: Math.round(platformStats.avgRating * 100) / 100,
        replyRate: Math.round(platformStats.replyRate * 10) / 10,
        totalFeedback: platformStats.totalFeedback,
        actionRate: Math.round(platformStats.actionRate * 10) / 10,
      },
      vsPlatform: {
        ratingDiff: Math.round((dealerStats.avgRating - platformStats.avgRating) * 100) / 100,
        replyRateDiff: Math.round((dealerStats.replyRate - platformStats.replyRate) * 10) / 10,
        actionRateDiff: Math.round((dealerStats.actionRate - platformStats.actionRate) * 10) / 10,
      },
      percentile,
      totalDealers,
    },
    weeklyTrend: weeklyData,
    dailyTrend: dailyData,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
