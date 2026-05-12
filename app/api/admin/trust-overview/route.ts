import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

/**
 * Trust & Safety özet: denetim, şüpheli aktivite, fraud bayrakları, açık güvenlik uyarıları.
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    auditLogs24h,
    suspiciousOpen,
    dealersFlagged,
    remedyAwaitingGlobal,
    securityOpen,
  ] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    prisma.suspiciousActivity.count({ where: { isResolved: false } }),
    prisma.user.count({
      where: {
        role: 'DEALER',
        fraudStatus: { in: ['flagged', 'shadow_ban'] },
      },
    }),
    prisma.remedyOffer.count({ where: { status: 'awaiting_dealer_approval' } }),
    prisma.securityAlert.count({
      where: {
        createdAt: { gte: since },
        severity: { in: ['WARNING', 'ERROR', 'CRITICAL'] },
      },
    }),
  ]);

  const recentSuspicious = await prisma.suspiciousActivity.findMany({
    where: { isResolved: false },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      type: true,
      severity: true,
      description: true,
      createdAt: true,
      dealerId: true,
    },
  });

  const recentAudit = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      userId: true,
    },
  });

  return NextResponse.json({
    success: true,
    summary: {
      auditLogs24h,
      suspiciousOpen,
      dealersFlagged,
      remedyAwaitingApprovalGlobal: remedyAwaitingGlobal,
      securityAlerts24h: securityOpen,
    },
    recentSuspicious,
    recentAudit,
  });
}
