/**
 * Voice of Customer wall (madde 50): şube içi canlı müşteri sesi panosu.
 * GET: son feedback'ler, özet metrikler, sentiment/rating dağılımı, günlük trend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? request.nextUrl.searchParams.get('dealerId') : session.user.id;
  if (!dealerId) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 });
  }
  if (session.user.role === 'DEALER' && dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Sadece kendi VoC panonuzu görüntüleyebilirsiniz' }, { status: 403 });
  }

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50') || 50, 100);

  const baseWhere = { qrCode: { dealerId }, deletedAt: null };
  const publicWhere = { ...baseWhere, isPublic: true };

  const last24h = new Date();
  last24h.setHours(last24h.getHours() - 24);

  const [recent, stats, countLast24h, sentimentAgg, ratingAgg, recent7dFeedbacks, totalPublic] = await Promise.all([
    prisma.feedback.findMany({
      where: publicWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        rating: true,
        text: true,
        sentiment: true,
        intent: true,
        topics: true,
        themes: true,
        createdAt: true,
        user: { select: { name: true } },
        qrCode: { select: { name: true } },
      },
    }),
    prisma.feedback.aggregate({
      where: baseWhere,
      _avg: { rating: true },
      _count: true,
    }),
    prisma.feedback.count({
      where: { ...baseWhere, createdAt: { gte: last24h } },
    }),
    prisma.feedback.groupBy({
      by: ['sentiment'],
      where: publicWhere,
      _count: true,
    }),
    prisma.feedback.groupBy({
      by: ['rating'],
      where: publicWhere,
      _count: true,
    }),
    // Son 7 günlük geri bildirim sayıları: feedback createdAt'leri alıp JS'te grupla
    prisma.feedback.findMany({
      where: { ...baseWhere, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true },
    }),
    prisma.feedback.count({ where: publicWhere }),
  ]);

  const sentimentMap: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
  for (const s of sentimentAgg) {
    const key = (s.sentiment || 'neutral').toLowerCase();
    sentimentMap[key] = sentimentMap[key] ?? 0;
    sentimentMap[key] += s._count;
  }

  const ratingMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingAgg) {
    ratingMap[r.rating] = r._count;
  }

  // Son 7 günlük sayıları hesapla
  const dayCounts: Record<string, number> = {};
  for (const f of recent7dFeedbacks) {
    const dateStr = new Date(f.createdAt).toISOString().slice(0, 10);
    dayCounts[dateStr] = (dayCounts[dateStr] ?? 0) + 1;
  }
  const today = new Date();
  const dailyTrendFull: { date: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(d);
    dailyTrendFull.push({ date: dateStr, label, count: dayCounts[dateStr] ?? 0 });
  }

  return NextResponse.json({
    voc: {
      recent: recent.map((f) => ({
        id: f.id,
        rating: f.rating,
        text: f.text ? f.text.slice(0, 300) + (f.text.length > 300 ? '…' : '') : null,
        sentiment: f.sentiment,
        intent: f.intent,
        topics: f.topics,
        themes: f.themes,
        createdAt: f.createdAt,
        userName: f.user?.name ?? 'Anonim',
        locationName: f.qrCode?.name ?? '—',
      })),
      stats: {
        avgRating: stats._avg.rating ?? 0,
        totalFeedback: stats._count,
        totalPublic,
        last24hCount: countLast24h,
      },
      sentiment: sentimentMap,
      ratingDistribution: [ratingMap[1], ratingMap[2], ratingMap[3], ratingMap[4], ratingMap[5]],
      dailyTrend: dailyTrendFull,
    },
  });
}
