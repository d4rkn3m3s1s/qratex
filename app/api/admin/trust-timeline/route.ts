import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

const WINDOW_MS = 48 * 60 * 60 * 1000;
const TAKE_EACH = 40;

export type TrustTimelineItem = {
  id: string;
  kind:
    | 'suspicious'
    | 'audit'
    | 'remedy_queue'
    | 'incident'
    | 'security'
    | 'action_item'
    | 'feedback_rule';
  title: string;
  subtitle: string;
  severity?: string | null;
  href?: string | null;
  createdAt: string;
  meta?: Record<string, string | null | undefined>;
};

/**
 * Operasyonel güven zaman çizelgesi: şüpheli → denetim → telafi kuyruğu → olay → güvenlik uyarısı → aksiyon.
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const since = new Date(Date.now() - WINDOW_MS);

  const [
    suspicious,
    audits,
    remedyQueue,
    incidents,
    security,
    councilActions,
    lowRatingFeedbacks,
  ] = await Promise.all([
    prisma.suspiciousActivity.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: TAKE_EACH,
      select: {
        id: true,
        type: true,
        severity: true,
        description: true,
        isResolved: true,
        dealerId: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: TAKE_EACH,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        userId: true,
        createdAt: true,
      },
    }),
    prisma.remedyOffer.findMany({
      where: { status: 'awaiting_dealer_approval', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: TAKE_EACH,
      select: {
        id: true,
        dealerId: true,
        userId: true,
        createdAt: true,
        feedbackId: true,
      },
    }),
    prisma.incident.findMany({
      where: { createdAt: { gte: since }, status: { not: 'resolved' } },
      orderBy: { createdAt: 'desc' },
      take: TAKE_EACH,
      select: {
        id: true,
        title: true,
        status: true,
        dealerId: true,
        createdAt: true,
      },
    }),
    prisma.securityAlert.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: TAKE_EACH,
      select: {
        id: true,
        type: true,
        severity: true,
        message: true,
        createdAt: true,
      },
    }),
    prisma.actionItem.findMany({
      where: { createdAt: { gte: since }, sourceModule: 'agent_council' },
      orderBy: { createdAt: 'desc' },
      take: TAKE_EACH,
      select: {
        id: true,
        dealerId: true,
        status: true,
        priority: true,
        suggestionText: true,
        createdAt: true,
      },
    }),
    prisma.feedback.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: since },
        OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        qrCode: { select: { dealerId: true } },
      },
    }),
  ]);

  const items: TrustTimelineItem[] = [];

  for (const s of suspicious) {
    items.push({
      id: `sus-${s.id}`,
      kind: 'suspicious',
      title: s.type,
      subtitle: (s.description || '').slice(0, 200),
      severity: s.severity,
      href: '/admin/fraud-prevention',
      createdAt: s.createdAt.toISOString(),
      meta: { dealerId: s.dealerId, resolved: s.isResolved ? 'yes' : 'no' },
    });
  }

  for (const a of audits) {
    items.push({
      id: `aud-${a.id}`,
      kind: 'audit',
      title: a.action,
      subtitle: `${a.entity}${a.entityId ? ` · ${a.entityId}` : ''}`,
      href: '/admin/audit',
      createdAt: a.createdAt.toISOString(),
      meta: { userId: a.userId },
    });
  }

  for (const r of remedyQueue) {
    items.push({
      id: `rem-${r.id}`,
      kind: 'remedy_queue',
      title: 'Telafi onay bekliyor',
      subtitle: `Bayi ${r.dealerId.slice(0, 8)}… · müşteri ${r.userId.slice(0, 8)}…`,
      href: '/dealer/remedy-queue',
      createdAt: r.createdAt.toISOString(),
      meta: { feedbackId: r.feedbackId },
    });
  }

  for (const i of incidents) {
    items.push({
      id: `inc-${i.id}`,
      kind: 'incident',
      title: i.title,
      subtitle: `Durum: ${i.status}`,
      href: '/admin/audit',
      createdAt: i.createdAt.toISOString(),
      meta: { dealerId: i.dealerId },
    });
  }

  for (const sec of security) {
    items.push({
      id: `sec-${sec.id}`,
      kind: 'security',
      title: sec.type,
      subtitle: (sec.message || '').slice(0, 180),
      severity: sec.severity,
      href: '/admin/observability',
      createdAt: sec.createdAt.toISOString(),
    });
  }

  for (const c of councilActions) {
    const excerpt = (c.suggestionText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    items.push({
      id: `act-${c.id}`,
      kind: 'action_item',
      title: 'Agent Council → aksiyon',
      subtitle: excerpt || c.status,
      href: '/admin/agent-council',
      createdAt: c.createdAt.toISOString(),
      meta: { dealerId: c.dealerId, status: c.status, priority: c.priority },
    });
  }

  for (const f of lowRatingFeedbacks) {
    const ex = (f.text || '').slice(0, 120);
    items.push({
      id: `fb-${f.id}`,
      kind: 'feedback_rule',
      title: `Düşük puanlı geri bildirim (${f.rating})`,
      subtitle: ex || 'Metin yok',
      href: '/admin/feedbacks',
      createdAt: f.createdAt.toISOString(),
      meta: { dealerId: f.qrCode.dealerId },
    });
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    success: true,
    windowHours: WINDOW_MS / 3600000,
    items: items.slice(0, 120),
  });
}
