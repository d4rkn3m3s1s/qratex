import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NEGATIVE_FEEDBACK_SLA_HOURS = parsePositiveIntEnv(process.env.NEGATIVE_FEEDBACK_SLA_HOURS, 24);

export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const cutoff = new Date(Date.now() - NEGATIVE_FEEDBACK_SLA_HOURS * 60 * 60 * 1000);
  const negatives = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      dealerRepliedAt: null,
      createdAt: { lte: cutoff },
      OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
    },
    include: { qrCode: { select: { dealerId: true } } },
  });

  let created = 0;
  for (const fb of negatives) {
    const dealerId = fb.qrCode?.dealerId;
    if (!dealerId) continue;
    const existing = await prisma.incident.findFirst({
      where: {
        dealerId,
        type: 'negative_feedback_sla_breach',
        status: { in: ['open', 'assigned', 'in_progress'] },
        metadata: { path: ['feedbackId'], equals: fb.id },
      },
    });
    if (existing) continue;
    await prisma.incident.create({
      data: {
        dealerId,
        type: 'negative_feedback_sla_breach',
        severity: 'high',
        status: 'open',
        title: `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan negatif geri bildirim`,
        description: `Geri bildirim ID: ${fb.id}. SLA aşıldı, lütfen yanıtlayın.`,
        metadata: { feedbackId: fb.id },
      },
    });
    await prisma.notification.create({
      data: {
        userId: dealerId,
        title: '⏰ SLA Aşımı',
        message: `${NEGATIVE_FEEDBACK_SLA_HOURS} saat içinde yanıtlanmayan negatif geri bildirim var. Lütfen yanıtlayın.`,
        type: 'warning',
      },
    });
    created++;
  }
  return NextResponse.json({ checked: negatives.length, incidentsCreated: created });
}
