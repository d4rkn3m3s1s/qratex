import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { feedbackSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const qrCodeId = searchParams.get('qrCodeId');
    const sentiment = searchParams.get('sentiment');
    const skip = (page - 1) * pageSize;

    let where: Record<string, unknown> = {};

    // Admin sees all feedbacks, others see their own
    if (session.user.role === 'CUSTOMER') {
      where.userId = session.user.id;
    } else if (session.user.role === 'DEALER') {
      where.qrCode = { dealerId: session.user.id };
    }
    // ADMIN sees all - no where filter

    if (qrCodeId) {
      where.qrCodeId = qrCodeId;
    }

    // Sentiment filter
    if (sentiment && sentiment !== 'all') {
      where.sentiment = sentiment;
    }

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
          qrCode: {
            select: { 
              id: true, 
              name: true, 
              code: true,
              dealer: {
                select: { businessName: true },
              },
            },
          },
        },
      }),
      prisma.feedback.count({ where }),
    ]);

    // Format response to include businessName and properly format JSON fields
    const formattedFeedbacks = feedbacks.map(f => {
      // Parse topics - could be array or JSON string
      let topics: string[] = [];
      if (f.topics) {
        if (Array.isArray(f.topics)) {
          topics = f.topics as string[];
        } else if (typeof f.topics === 'object') {
          topics = Object.keys(f.topics);
        }
      }

      // Parse emotions - object with emotion keys
      let emotions: string[] = [];
      if (f.emotions && typeof f.emotions === 'object') {
        emotions = Object.keys(f.emotions as Record<string, unknown>);
      }

      return {
        ...f,
        topics,
        emotions,
        qrCode: {
          ...f.qrCode,
          businessName: f.qrCode.dealer?.businessName || f.qrCode.name,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedFeedbacks,
      items: formattedFeedbacks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('Error fetching feedbacks:', error);
    return NextResponse.json(
      { error: 'Geri bildirimler getirilemedi' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    const body = await request.json();
    const validatedData = feedbackSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { qrCodeId, rating, text, media, isPublic } = validatedData.data;

    // Check if QR code exists and is active
    const qrCode = await prisma.qRCode.findUnique({
      where: { id: qrCodeId },
    });

    if (!qrCode || !qrCode.isActive) {
      return NextResponse.json(
        { error: 'QR kod bulunamadı veya aktif değil' },
        { status: 404 }
      );
    }

    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        qrCodeId,
        userId: session?.user?.id || null,
        rating,
        text,
        media: media ? (media as string[]) : [],
        isPublic: isPublic ?? true,
      },
    });

    // Update QR code scan count
    await prisma.qRCode.update({
      where: { id: qrCodeId },
      data: { scanCount: { increment: 1 } },
    });

    // Award points to user if logged in
    if (session?.user?.id) {
      const pointsToAward = text && text.length > 50 ? 100 : 50;
      const xpToAward = text && text.length > 50 ? 50 : 25;

      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          points: { increment: pointsToAward },
          xp: { increment: xpToAward },
        },
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          title: 'Puan Kazandınız! 🎉',
          message: `Geri bildiriminiz için ${pointsToAward} puan kazandınız.`,
          type: 'success',
        },
      });
    }

    // Log analytics
    await prisma.analyticsEvent.create({
      data: {
        userId: session?.user?.id || null,
        event: 'feedback_submitted',
        category: 'feedback',
        data: { feedbackId: feedback.id, rating, hasText: !!text },
      },
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json(
      { error: 'Geri bildirim gönderilemedi' },
      { status: 500 }
    );
  }
}

