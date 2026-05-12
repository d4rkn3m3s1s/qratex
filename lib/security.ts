import { prisma } from '@/lib/prisma';

// Suspicious activity detection thresholds
export const SECURITY_THRESHOLDS = {
  RAPID_SCAN: 5, // Max scans per minute
  RAPID_CONSUMPTION: 10, // Max consumptions per hour
  UNUSUAL_AMOUNT: 10000, // Max single transaction amount
  DUPLICATE_WINDOW: 60, // Seconds to check for duplicates
};

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

  if (recentScans >= SECURITY_THRESHOLDS.RAPID_SCAN) {
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

  if (recentConsumptions >= SECURITY_THRESHOLDS.RAPID_CONSUMPTION) {
    return {
      isSuspicious: true,
      type: 'RAPID_CONSUMPTION',
      severity: 'MEDIUM',
      description: `Kart ${cardId} son 1 saatte ${recentConsumptions} tüketim kaydı`,
    };
  }

  // Check for unusual amount
  if (amount && amount > SECURITY_THRESHOLDS.UNUSUAL_AMOUNT) {
    return {
      isSuspicious: true,
      type: 'UNUSUAL_AMOUNT',
      severity: 'MEDIUM',
      description: `Olağandışı tutar: ${amount} TL`,
    };
  }

  return { isSuspicious: false };
}

// Report suspicious activity
export async function reportSuspiciousActivity(data: {
  userId?: string;
  dealerId?: string;
  cardId?: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    // Create suspicious activity record
    const activity = await prisma.suspiciousActivity.create({
      data: {
        userId: data.userId,
        dealerId: data.dealerId,
        cardId: data.cardId,
        type: data.type,
        severity: data.severity,
        description: data.description,
        metadata: data.metadata,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });

    // Create security alert for high severity
    if (data.severity === 'HIGH' || data.severity === 'CRITICAL') {
      await prisma.securityAlert.create({
        data: {
          type: data.type,
          message: data.description,
          severity: data.severity,
          targetId: data.userId || data.dealerId,
          targetType: data.userId ? 'USER' : data.dealerId ? 'DEALER' : 'CARD',
          metadata: data.metadata,
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
            title: `🚨 ${data.severity} Güvenlik Uyarısı`,
            message: data.description,
          })),
        });
      }
    }

    return activity;
  } catch (error) {
    console.error('Error reporting suspicious activity:', error);
    throw error;
  }
}
