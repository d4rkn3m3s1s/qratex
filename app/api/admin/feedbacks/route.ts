import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const sentiment = searchParams.get('sentiment');
    const dealerId = searchParams.get('dealerId');
    const minRating = searchParams.get('minRating');
    const maxRating = searchParams.get('maxRating');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');
    const type = searchParams.get('type'); // 'all' | 'qr' | 'consumption'
    const skip = (page - 1) * pageSize;

    // Build QR feedback where clause
    const qrWhere: any = {};
    if (sentiment && sentiment !== 'all') qrWhere.sentiment = sentiment;
    if (minRating) qrWhere.rating = { ...qrWhere.rating, gte: parseInt(minRating) };
    if (maxRating) qrWhere.rating = { ...qrWhere.rating, lte: parseInt(maxRating) };
    if (startDate) qrWhere.createdAt = { ...qrWhere.createdAt, gte: new Date(startDate) };
    if (endDate) qrWhere.createdAt = { ...qrWhere.createdAt, lte: new Date(endDate) };
    if (search) {
      qrWhere.OR = [
        { text: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (dealerId && dealerId !== 'all') {
      qrWhere.qrCode = { dealerId };
    }

    // Fetch QR feedbacks
    let qrFeedbacks: any[] = [];
    let qrTotal = 0;
    
    if (type === 'all' || type === 'qr' || !type) {
      const [feedbacks, total] = await Promise.all([
        prisma.feedback.findMany({
          where: qrWhere,
          skip: type === 'qr' ? skip : 0,
          take: type === 'qr' ? pageSize : 100,
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
        if (search) {
          consumptionWhere.OR = [
            { text: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
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
          (prisma as any).consumptionReview.findMany({
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
          (prisma as any).consumptionReview.count({ where: consumptionWhere }),
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
        console.log('Consumption reviews not available');
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
      select: { rating: true, sentiment: true },
    });
    
    let allConsumptionReviews: any[] = [];
    try {
      allConsumptionReviews = await (prisma as any).consumptionReview.findMany({
        select: { rating: true },
      });
    } catch (e) {}

    const combinedForStats = [
      ...allQRFeedbacks.map(f => ({ rating: f.rating, sentiment: f.sentiment })),
      ...allConsumptionReviews.map((r: any) => ({
        rating: r.rating,
        sentiment: r.rating >= 4 ? 'positive' : r.rating >= 3 ? 'neutral' : 'negative',
      })),
    ];

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
    });
  } catch (error) {
    console.error('Admin feedbacks error:', error);
    return NextResponse.json({ error: 'Geri bildirimler getirilemedi' }, { status: 500 });
  }
}

// DELETE - Soft delete or remove feedback
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { feedbackIds, type } = await request.json();

    if (!feedbackIds || !Array.isArray(feedbackIds) || feedbackIds.length === 0) {
      return NextResponse.json({ error: 'Feedback IDs gerekli' }, { status: 400 });
    }

    if (type === 'consumption') {
      await (prisma as any).consumptionReview.deleteMany({
        where: { id: { in: feedbackIds } },
      });
    } else {
      await prisma.feedback.deleteMany({
        where: { id: { in: feedbackIds } },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_FEEDBACKS',
        entity: 'Feedback',
        entityId: feedbackIds.join(','),
        metadata: { count: feedbackIds.length, type },
      },
    });

    return NextResponse.json({ success: true, deleted: feedbackIds.length });
  } catch (error) {
    console.error('Delete feedbacks error:', error);
    return NextResponse.json({ error: 'Silme işlemi başarısız' }, { status: 500 });
  }
}
