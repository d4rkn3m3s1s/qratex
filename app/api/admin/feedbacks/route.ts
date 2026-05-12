import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
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

    // Fetch consumption reviews
    let consumptionReviews: any[] = [];
    let consumptionTotal = 0;
    
    if (type === 'all' || type === 'consumption' || !type) {
      try {
        const consumptionWhere: any = {};
        if (minRating) consumptionWhere.rating = { ...consumptionWhere.rating, gte: parseInt(minRating) };
        if (maxRating) consumptionWhere.rating = { ...consumptionWhere.rating, lte: parseInt(maxRating) };
        if (startDate) consumptionWhere.createdAt = { ...consumptionWhere.createdAt, gte: new Date(startDate) };
        if (endDate) consumptionWhere.createdAt = { ...consumptionWhere.createdAt, lte: new Date(endDate) };
        if (searchTrim) {
          consumptionWhere.OR = [
            { text: { contains: searchTrim, mode: 'insensitive' } },
            { customer: { name: { contains: searchTrim, mode: 'insensitive' } } },
          ];
        }
        if (dealerId && dealerId !== 'all') {
          consumptionWhere.consumption = { dealerId };
        }
        // Map sentiment to rating for consumption reviews
        if (sentiment && sentiment !== 'all') {
          if (sentiment === 'positive') consumptionWhere.rating = { gte: 4 };
          else if (sentiment === 'negative') consumptionWhere.rating = { lte: 2 };
          else if (sentiment === 'neutral') consumptionWhere.rating = { gte: 3, lte: 3 };
        }

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

    // Calculate statistics
    const allQRFeedbacks = await prisma.feedback.findMany({
      where: qrWhere,
      select: { rating: true, sentiment: true, npsScore: true },
    });
    
    let allConsumptionReviews: any[] = [];
    try {
      allConsumptionReviews = await prisma.consumptionReview.findMany({
        select: { rating: true },
      });
    } catch (e) {
      console.error('Consumption stats not available:', e);
    }

    const combinedForStats = [
      ...allQRFeedbacks.map(f => ({ rating: f.rating, sentiment: f.sentiment })),
      ...allConsumptionReviews.map((r: any) => ({
        rating: r.rating,
        sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
      })),
    ];

    const npsScores = allQRFeedbacks.map(f => f.npsScore).filter((n): n is number => n != null && n >= 0 && n <= 10);
    const npsTotal = npsScores.length;
    const npsPromoters = npsScores.filter(n => n >= 9).length;
    const npsPassives = npsScores.filter(n => n >= 7 && n <= 8).length;
    const npsDetractors = npsScores.filter(n => n <= 6).length;
    const npsValue = npsTotal > 0
      ? Math.round((npsPromoters / npsTotal) * 100 - (npsDetractors / npsTotal) * 100)
      : null;

    const stats = {
      total: qrTotal + consumptionTotal,
      qrFeedbacks: qrTotal,
      consumptionReviews: consumptionTotal,
      avgRating: combinedForStats.length > 0
        ? (combinedForStats.reduce((sum, f) => sum + f.rating, 0) / combinedForStats.length).toFixed(1)
        : '0',
      positive: combinedForStats.filter(f => f.sentiment === 'positive').length,
      neutral: combinedForStats.filter(f => f.sentiment === 'neutral' || !f.sentiment).length,
      negative: combinedForStats.filter(f => f.sentiment === 'negative').length,
      ratingDistribution: {
        5: combinedForStats.filter(f => f.rating === 5).length,
        4: combinedForStats.filter(f => f.rating === 4).length,
        3: combinedForStats.filter(f => f.rating === 3).length,
        2: combinedForStats.filter(f => f.rating === 2).length,
        1: combinedForStats.filter(f => f.rating === 1).length,
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
    });
  } catch (error) {
    console.error('Admin feedbacks error:', error);
    return NextResponse.json({ error: 'Geri bildirimler getirilemedi' }, { status: 500 });
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
        { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
      );
    }

    const raw = await request.json();
    const parsed = adminFeedbacksDeleteSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json({ error: msg, details: parsed.error.flatten() }, { status: 400 });
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

    return NextResponse.json({ success: true, deleted: feedbackIds.length });
  } catch (error) {
    console.error('Delete feedbacks error:', error);
    return NextResponse.json({ error: 'Silme işlemi başarısız' }, { status: 500 });
  }
}
