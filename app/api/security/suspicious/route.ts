import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reportSuspiciousActivity } from '@/lib/security';

// GET - Get suspicious activities (admin only)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const severity = searchParams.get('severity');
    const resolved = searchParams.get('resolved');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = {};
    if (severity) where.severity = severity;
    if (resolved !== null) where.isResolved = resolved === 'true';

    const [activities, total] = await Promise.all([
      (prisma as any).suspiciousActivity.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          dealer: { select: { id: true, name: true, businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).suspiciousActivity.count({ where }),
    ]);

    // Stats
    const stats = await (prisma as any).suspiciousActivity.groupBy({
      by: ['severity', 'isResolved'],
      _count: true,
    });

    return NextResponse.json({
      success: true,
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching suspicious activities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Report suspicious activity (internal use)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, dealerId, cardId, type, severity, description, metadata, ipAddress, userAgent } = body;

    const activity = await reportSuspiciousActivity({
      userId,
      dealerId,
      cardId,
      type,
      severity: severity || 'MEDIUM',
      description,
      metadata,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({ success: true, activity });
  } catch (error) {
    console.error('Error reporting suspicious activity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Resolve suspicious activity
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, resolution } = body;

    const activity = await (prisma as any).suspiciousActivity.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        resolution,
      },
    });

    return NextResponse.json({ success: true, activity });
  } catch (error) {
    console.error('Error resolving suspicious activity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
