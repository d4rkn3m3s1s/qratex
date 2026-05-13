import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { getSamplingConfig } from '@/lib/analytics-sampling';
import { adminFeedbacksDeleteSchema, adminFeedbacksQuerySchema } from '@/lib/validations-admin';
import { checkAdminRateLimit } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const queryParsed = adminFeedbacksQuerySchema.safeParse({
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
      search: searchParams.get('search') || undefined,
    });
    const { page, pageSize, search: searchTrim } = queryParsed.success ? queryParsed.data : { page: 1, pageSize: 20, search: undefined as string | undefined };
    const sentiment = searchParams.get('sentiment');
    const dealerId = searchParams.get('dealerId');
    const minRating = searchParams.get('minRating');
    const maxRating = searchParams.get('maxRating');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type'); // 'all' | 'qr' | 'consumption'
    const maxFraudScore = searchParams.get('maxFraudScore'); // 0-1; sahte yorum filtre (madde 41)
    const needsReview = searchParams.get('needsReview') === 'true'; // P2-27: intentScore < 0.7 manuel inceleme
    const skip = (page - 1) * pageSize;

    const qrWhere: any = { deletedAt: null };
    if (needsReview) qrWhere.intentScore = { lt: 0.7 };
    if (sentiment && sentiment !== 'all') qrWhere.sentiment = sentiment;
    if (maxFraudScore != null && maxFraudScore !== '') {
      const v = parseFloat(maxFraudScore);
      if (!Number.isNaN(v)) qrWhere.fraudScore = { lte: v };
    }
    if (minRating) qrWhere.rating = { ...qrWhere.rating, gte: parseInt(minRating) };
    if (maxRating) qrWhere.rating = { ...qrWhere.rating, lte: parseInt(maxRating) };
    if (startDate) qrWhere.createdAt = { ...qrWhere.createdAt, gte: new Date(startDate) };
    if (endDate) qrWhere.createdAt = { ...qrWhere.createdAt, lte: new Date(endDate) };
    if (searchTrim) {
      qrWhere.OR = [
        { text: { contains: searchTrim, mode: 'insensitive' } },
        { user: { name: { contains: searchTrim, mode: 'insensitive' } } },
        { user: { email: { contains: searchTrim, mode: 'insensitive' } } },
      ];
    }
    if (dealerId && dealerId !== 'all') {
      qrWhere.qrCode = { dealerId };
    }

    const sampling = startDate && endDate
      ? getSamplingConfig(new Date(startDate), new Date(endDate))
      : { sampleRatio: 1 as const };
    const takeLimit = sampling.sampleRatio < 1 && sampling.maxTake
      ? Math.min(pageSize * 10, sampling.maxTake)
      : 100;

    // Fetch QR feedbacks
    let qrFeedbacks: any[] = [];
    let qrTotal = 0;
    
    if (type === 'all' || type === 'qr' || !type) {
      const [feedbacks, total] = await Promise.all([
        prisma.feedback.findMany({
          where: qrWhere,
          skip: type === 'qr' ? skip : 0,
          take: type === 'qr' ? pageSize : takeLimit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
            qrCode: {
              select: {
                id: true,
                name: true,
                dealer: { select: { id: true, businessName: true, name: true } },
              },
            },
          },
        }),
        prisma.feedback.count({ where: qrWhere }),
      ]);
      
      qrFeedbacks = feedbacks.map(f => ({
        ...f,
        type: 'qr',
        businessName: f.qrCode?.dealer?.businessName || f.qrCode?.name,
        dealerName: f.qrCode?.dealer?.name,
        topics: Array.isArray(f.topics) ? f.topics : [],
        emotions: f.emotions && typeof f.emotions === 'object' ? Object.keys(f.emotions) : [],
      }));
      qrTotal = total;
    }

    // Tüketim yorumları filtreleri (liste + istatistik için ortak)
    let consumptionWhere: any = null;
    if (type === 'all' || type === 'consumption' || !type) {
      const cw: any = {};
      if (minRating) cw.rating = { ...cw.rating, gte: parseInt(minRating) };
      if (maxRating) cw.rating = { ...cw.rating, lte: parseInt(maxRating) };
      if (startDate) cw.createdAt = { ...cw.createdAt, gte: new Date(startDate) };
      if (endDate) cw.createdAt = { ...cw.createdAt, lte: new Date(endDate) };
      if (searchTrim) {
        cw.OR = [
          { text: { contains: searchTrim, mode: 'insensitive' } },
          { customer: { name: { contains: searchTrim, mode: 'insensitive' } } },
        ];
      }
      if (dealerId && dealerId !== 'all') {
        cw.consumption = { dealerId };
      }
      if (sentiment && sentiment !== 'all') {
        if (sentiment === 'positive') cw.rating = { gte: 4 };
        else if (sentiment === 'negative') cw.rating = { lte: 2 };
        else if (sentiment === 'neutral') cw.rating = { gte: 3, lte: 3 };
      }
      consumptionWhere = cw;
    }

    // Fetch consumption reviews
    let consumptionReviews: any[] = [];
    let consumptionTotal = 0;

    if (consumptionWhere) {
      try {
        const [reviews, total] = await Promise.all([
          prisma.consumptionReview.findMany({
            where: consumptionWhere,
            skip: type === 'consumption' ? skip : 0,
            take: type === 'consumption' ? pageSize : 100,
            orderBy: { createdAt: 'desc' },
            include: {
              customer: { select: { id: true, name: true, email: true, image: true } },
              consumption: {
                include: {
                  dealer: { select: { id: true, businessName: true, name: true } },
                  product: { select: { id: true, name: true } },
                },
              },
            },
          }),
          prisma.consumptionReview.count({ where: consumptionWhere }),
        ]);

        consumptionReviews = reviews.map((r: any) => ({
          id: r.id,
          rating: r.rating,
          text: r.text,
          sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
          createdAt: r.createdAt,
          type: 'consumption',
          user: r.customer,
          productName: r.consumption?.product?.name,
          businessName: r.consumption?.dealer?.businessName,
          dealerName: r.consumption?.dealer?.name,
          dealerId: r.consumption?.dealer?.id,
          topics: [],
          emotions: [],
          dimensions: r.dimensions,
        }));
        consumptionTotal = total;
      } catch (e) {
        console.error('Consumption reviews not available:', e);
      }
    }

    // Combine and sort
    let allFeedbacks = [...qrFeedbacks, ...consumptionReviews];
    allFeedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate combined results if type is 'all'
    const totalItems = type === 'all' || !type ? qrTotal + consumptionTotal : (type === 'qr' ? qrTotal : consumptionTotal);
    if (type === 'all' || !type) {
      allFeedbacks = allFeedbacks.slice(skip, skip + pageSize);
    }

    // İstatistikler: bellek dostu aggregate / groupBy (tüm satırları çekme)
    const includeQrInStats = type === 'all' || type === 'qr' || !type;
    const includeConsumptionInStats = type === 'all' || type === 'consumption' || !type;

    let qrPos = 0;
    let qrNeu = 0;
    let qrNeg = 0;
    let qrSum = 0;
    let qrN = 0;
    const qrDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (includeQrInStats) {
      const [qrAgg, qrSentimentRows, qrRatingRows] = await Promise.all([
        prisma.feedback.aggregate({
          where: qrWhere,
          _sum: { rating: true },
          _count: { _all: true },
        }),
        prisma.feedback.groupBy({
          by: ['sentiment'],
          where: qrWhere,
          _count: { _all: true },
        }),
        prisma.feedback.groupBy({
          by: ['rating'],
          where: qrWhere,
          _count: { _all: true },
        }),
      ]);
      qrSum = qrAgg._sum.rating ?? 0;
      qrN = qrAgg._count._all;
      for (const row of qrSentimentRows) {
        const c = row._count._all;
        if (row.sentiment === 'positive') qrPos += c;
        else if (row.sentiment === 'negative') qrNeg += c;
        else qrNeu += c;
      }
      for (const row of qrRatingRows) {
        const r = row.rating;
        if (r >= 1 && r <= 5) qrDist[r] = (qrDist[r] || 0) + row._count._all;
      }
    }

    const [npsPromoters, npsPassives, npsDetractors] = await Promise.all([
      prisma.feedback.count({
        where: { ...qrWhere, npsScore: { not: null, gte: 9 } },
      }),
      prisma.feedback.count({
        where: { ...qrWhere, npsScore: { not: null, gte: 7, lte: 8 } },
      }),
      prisma.feedback.count({
        where: { ...qrWhere, npsScore: { not: null, lte: 6 } },
      }),
    ]);
    const npsTotal = npsPromoters + npsPassives + npsDetractors;
    const npsValue =
      npsTotal > 0 ? Math.round((npsPromoters / npsTotal) * 100 - (npsDetractors / npsTotal) * 100) : null;

    let revSum = 0;
    let revN = 0;
    const revDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let revPos = 0;
    let revNeu = 0;
    let revNeg = 0;

    if (includeConsumptionInStats && consumptionWhere) {
      try {
        const [revAgg, revRatingRows] = await Promise.all([
          prisma.consumptionReview.aggregate({
            where: consumptionWhere,
            _sum: { rating: true },
            _count: { _all: true },
          }),
          prisma.consumptionReview.groupBy({
            by: ['rating'],
            where: consumptionWhere,
            _count: { _all: true },
          }),
        ]);
        revSum = revAgg._sum.rating ?? 0;
        revN = revAgg._count._all;
        for (const row of revRatingRows) {
          const r = row.rating;
          const c = row._count._all;
          if (r >= 1 && r <= 5) revDist[r] = (revDist[r] || 0) + c;
          if (r >= 4) revPos += c;
          else if (r === 3) revNeu += c;
          else revNeg += c;
        }
      } catch (e) {
        console.error('Consumption stats not available:', e);
      }
    }

    const statQrN = includeQrInStats ? qrN : 0;
    const statRevN = includeConsumptionInStats ? revN : 0;
    const statDenom = statQrN + statRevN;
    const statSum = (includeQrInStats ? qrSum : 0) + (includeConsumptionInStats ? revSum : 0);

    const stats = {
      total: qrTotal + consumptionTotal,
      qrFeedbacks: qrTotal,
      consumptionReviews: consumptionTotal,
      avgRating: statDenom > 0 ? (statSum / statDenom).toFixed(1) : '0',
      positive: (includeQrInStats ? qrPos : 0) + (includeConsumptionInStats ? revPos : 0),
      neutral: (includeQrInStats ? qrNeu : 0) + (includeConsumptionInStats ? revNeu : 0),
      negative: (includeQrInStats ? qrNeg : 0) + (includeConsumptionInStats ? revNeg : 0),
      ratingDistribution: {
        5: (includeQrInStats ? qrDist[5] : 0) + (includeConsumptionInStats ? revDist[5] : 0),
        4: (includeQrInStats ? qrDist[4] : 0) + (includeConsumptionInStats ? revDist[4] : 0),
        3: (includeQrInStats ? qrDist[3] : 0) + (includeConsumptionInStats ? revDist[3] : 0),
        2: (includeQrInStats ? qrDist[2] : 0) + (includeConsumptionInStats ? revDist[2] : 0),
        1: (includeQrInStats ? qrDist[1] : 0) + (includeConsumptionInStats ? revDist[1] : 0),
      },
      nps: npsValue,
      npsTotal,
      npsPromoters,
      npsPassives,
      npsDetractors,
    };

    // Get dealers for filter
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true, businessName: true, name: true },
      take: 5000,
      orderBy: { id: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: allFeedbacks,
      stats,
      dealers: dealers.map(d => ({ id: d.id, name: d.businessName || d.name })),
      pagination: {
        total: totalItems,
        page,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
      },
      ...(sampling.note && { samplingNote: sampling.note }),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Admin feedbacks error:', error);
    return NextResponse.json({ error: 'Geri bildirimler getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// DELETE - Soft delete or remove feedback
export async function DELETE(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const rl = checkAdminRateLimit(session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }

    const raw = await request.json();
    const parsed = adminFeedbacksDeleteSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const { feedbackIds, type } = parsed.data;

    if (type === 'consumption') {
      await prisma.consumptionReview.deleteMany({
        where: { id: { in: feedbackIds } },
      });
    } else {
      await prisma.feedback.updateMany({
        where: { id: { in: feedbackIds } },
        data: { deletedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: type === 'consumption' ? 'DELETE_FEEDBACKS' : 'SOFT_DELETE_FEEDBACKS',
        entity: type === 'consumption' ? 'ConsumptionReview' : 'Feedback',
        entityId: feedbackIds.join(','),
        newData: { count: feedbackIds.length, type },
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, deleted: feedbackIds.length }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Delete feedbacks error:', error);
    return NextResponse.json({ error: 'Silme işlemi başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
