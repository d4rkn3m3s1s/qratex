/**
 * Voice of Customer wall (madde 50): şube içi canlı müşteri sesi panosu.
 * GET: son feedback'ler, özet metrikler, sentiment/rating dağılımı, günlük trend.
 *
 * P0-35: duvar mağaza TV'sinde herkese açık gösterilir → yalnız yayınlanabilir yorumlar
 * (toksik/güven-işaretli/sahte değil, denetimden geçmiş) ve MASKELENMİŞ adlar döner.
 * Politika: ./wall-policy.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS, clampTakeParam } from '@/lib/api-http';
import { containsBlockedLanguage, maskCustomerName, toWallText, wallEligibleWhere } from './wall-policy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const dealerId = session.user.role === 'ADMIN' ? request.nextUrl.searchParams.get('dealerId') : session.user.id;
  if (!dealerId) {
    return NextResponse.json(
      { error: 'dealerId gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  if (session.user.role === 'DEALER' && dealerId !== session.user.id) {
    return NextResponse.json(
      { error: 'Sadece kendi VoC panonuzu görüntüleyebilirsiniz' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const limit = clampTakeParam(request.nextUrl.searchParams.get('limit'), 50, 100);

  // REDIS CACHE: 7 ağır sorgu (5000 satırlık 7-gün taraması dahil) → bayi+limit başına 45s. Redis yoksa DB.
  const { redisGetJson, redisSetJson } = await import('@/lib/redis');
  // v2: maskesiz/filtresiz eski önbellek kayıtları yeni sürümden sonra servis edilmesin.
  const cacheKey = `voc-wall:v2:${dealerId}:${limit}`;
  const cachedVoc = await redisGetJson<object>(cacheKey);
  if (cachedVoc) return NextResponse.json(cachedVoc, { headers: PRIVATE_NO_STORE_HEADERS });

  const baseWhere = { qrCode: { dealerId }, deletedAt: null };
  const wallWhere = wallEligibleWhere(dealerId);

  const last24h = new Date();
  last24h.setHours(last24h.getHours() - 24);

  const [recent, stats, countLast24h, sentimentAgg, ratingAgg, recent7dFeedbacks, totalPublic] = await Promise.all([
    prisma.feedback.findMany({
      where: wallWhere,
      orderBy: { createdAt: 'desc' },
      // Yerel sözlük süzgeci birkaç kaydı eleyebilir → biraz fazla çek, sonra kes.
      take: Math.min(limit * 2, 200),
      select: {
        id: true,
        rating: true,
        text: true,
        sentiment: true,
        intent: true,
        topics: true,
        themes: true,
        createdAt: true,
        user: { select: { name: true, anonymizedAt: true } },
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
    // Dağılımlar içerik değil, sayım: tüm (silinmemiş) geri bildirimler üzerinden — toksik
    // olumsuzları gizlemek tabloyu olduğundan iyi gösterirdi.
    prisma.feedback.groupBy({
      by: ['sentiment'],
      where: baseWhere,
      _count: true,
    }),
    prisma.feedback.groupBy({
      by: ['rating'],
      where: baseWhere,
      _count: true,
    }),
    // Son 7 günlük geri bildirim sayıları: feedback createdAt'leri alıp JS'te grupla
    prisma.feedback.findMany({
      where: { ...baseWhere, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    }),
    prisma.feedback.count({ where: wallWhere }),
  ]);

  const sentimentMap: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
  for (const s of sentimentAgg) {
    const key = (s.sentiment || 'neutral').toLowerCase();
    const c = typeof s._count === 'number' ? s._count : (s._count as { _all?: number })?._all ?? 0;
    sentimentMap[key] = sentimentMap[key] ?? 0;
    sentimentMap[key] += c;
  }

  const ratingMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingAgg) {
    const c = typeof r._count === 'number' ? r._count : (r._count as { _all?: number })?._all ?? 0;
    ratingMap[r.rating] = c;
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

  const vocPayload = {
      voc: {
        recent: recent
          .filter((f) => !containsBlockedLanguage(f.text))
          .slice(0, limit)
          .map((f) => ({
            id: f.id,
            rating: f.rating,
            text: toWallText(f.text),
            sentiment: f.sentiment,
            intent: f.intent,
            topics: f.topics,
            themes: f.themes,
            createdAt: f.createdAt,
            userName: f.user?.anonymizedAt ? maskCustomerName(null) : maskCustomerName(f.user?.name),
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
  };
  await redisSetJson(cacheKey, vocPayload, 45); // Redis yoksa sessizce geçer
  return NextResponse.json(vocPayload, { headers: PRIVATE_NO_STORE_HEADERS });
}
