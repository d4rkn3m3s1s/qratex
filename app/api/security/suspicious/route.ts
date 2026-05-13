import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reportSuspiciousActivity } from '@/lib/security';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
} from '@/lib/api-http';
import { requireCronSecretOrAdmin } from '@/lib/internal-cron-or-admin';

// GET - Get suspicious activities (admin only)

export const dynamic = 'force-dynamic';

const LIST_DEFAULT_PAGE_SIZE = 20;
const LIST_MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const severity = searchParams.get('severity');
    const resolved = searchParams.get('resolved');
    const page = clampPageParam(searchParams.get('page'));
    const limit = clampPageSizeParam(searchParams.get('limit'), LIST_DEFAULT_PAGE_SIZE, LIST_MAX_PAGE_SIZE);
    const skip = paginationSkip(page, limit);

    const where: Record<string, unknown> = {};
    if (severity) where.severity = severity;
    if (resolved !== null && resolved !== '') where.isResolved = resolved === 'true';

    const [activities, total] = await Promise.all([
      prisma.suspiciousActivity.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          dealer: { select: { id: true, name: true, businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.suspiciousActivity.count({ where }),
    ]);

    // Stats
    const stats = await prisma.suspiciousActivity.groupBy({
      by: ['severity', 'isResolved'],
      _count: true,
    });

    return NextResponse.json(
      {
        success: true,
        activities,
        pagination: {
          page,
          limit,
          total,
          totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
        },
        stats,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching suspicious activities:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// POST - Report suspicious activity (internal use)
export async function POST(req: NextRequest) {
  try {
    const denied = await requireCronSecretOrAdmin(req);
    if (denied) return denied;

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

    return NextResponse.json({ success: true, activity }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error reporting suspicious activity:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// PATCH - Resolve suspicious activity
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await req.json();
    const { id, resolution } = body;

    const activity = await prisma.suspiciousActivity.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        resolution,
      },
    });

    return NextResponse.json({ success: true, activity }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error resolving suspicious activity:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
