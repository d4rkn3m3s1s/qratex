import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Suspicious activity detection thresholds
const THRESHOLDS = {
  RAPID_SCAN: 5, // Max scans per minute
  RAPID_CONSUMPTION: 10, // Max consumptions per hour
  UNUSUAL_AMOUNT: 10000, // Max single transaction amount
  DUPLICATE_WINDOW: 60, // Seconds to check for duplicates
};

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

    // Create suspicious activity record
    const activity = await (prisma as any).suspiciousActivity.create({
      data: {
        userId,
        dealerId,
        cardId,
        type,
        severity: severity || 'MEDIUM',
        description,
        metadata,
        ipAddress,
        userAgent,
      },
    });

    // Create security alert for high severity
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      await (prisma as any).securityAlert.create({
        data: {
          type: type,
          message: description,
          severity,
          targetId: userId || dealerId,
          targetType: userId ? 'USER' : dealerId ? 'DEALER' : 'CARD',
          metadata,
        },
      });

      // Notify admins
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      });

      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map(admin => ({
            userId: admin.id,
            type: 'SECURITY_ALERT',
            title: `🚨 ${severity} Güvenlik Uyarısı`,
            message: description,
          })),
        });
      }
    }

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

// Helper function to check for suspicious patterns
export async function checkSuspiciousActivity(
  dealerId: string,
  cardId: string,
  amount?: number,
  ipAddress?: string
): Promise<{ isSuspicious: boolean; type?: string; severity?: string; description?: string }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Check for rapid scanning
  const recentScans = await prisma.cardAuditLog.count({
    where: {
      cardId,
      action: 'SCANNED',
      createdAt: { gte: oneMinuteAgo },
    },
  });

  if (recentScans >= THRESHOLDS.RAPID_SCAN) {
    return {
      isSuspicious: true,
      type: 'RAPID_SCAN',
      severity: 'HIGH',
      description: `Kart ${cardId} son 1 dakikada ${recentScans} kez tarandı`,
    };
  }

  // Check for rapid consumptions
  const recentConsumptions = await prisma.consumption.count({
    where: {
      cardId,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentConsumptions >= THRESHOLDS.RAPID_CONSUMPTION) {
    return {
      isSuspicious: true,
      type: 'RAPID_CONSUMPTION',
      severity: 'MEDIUM',
      description: `Kart ${cardId} son 1 saatte ${recentConsumptions} tüketim kaydı`,
    };
  }

  // Check for unusual amount
  if (amount && amount > THRESHOLDS.UNUSUAL_AMOUNT) {
    return {
      isSuspicious: true,
      type: 'UNUSUAL_AMOUNT',
      severity: 'MEDIUM',
      description: `Olağandışı tutar: ${amount} TL`,
    };
  }

  return { isSuspicious: false };
}
