import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { resolveInnovationSegmentUserIds } from '@/lib/innovation-segment-users';
import { sendPushNotification } from '@/lib/push';

export const dynamic = 'force-dynamic';

const MAX_SEND = 500;

/**
 * Admin onaylı segment taslağını hedef müşterilere bildirim + push ile gönderir.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cfg = await getInnovationPlatformConfig();
    if (!cfg.features.segmentProposals) {
      return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const proposal = await prisma.segmentCampaignProposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const forbidden = requireDealerResource(session, proposal.dealerId);
    if (forbidden) return forbidden;

    if (proposal.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Sadece onaylanmış (APPROVED) taslaklar gönderilebilir', status: proposal.status }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const customerIds = await resolveInnovationSegmentUserIds(proposal.dealerId, proposal.segmentKey);
    const unique = [...new Set(customerIds)].slice(0, MAX_SEND);

    if (unique.length === 0) {
      return NextResponse.json({ error: 'Bu segmentte uygun müşteri bulunamadı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const claimWhere =
      session.user.role === 'ADMIN'
        ? { id, status: 'APPROVED' as const }
        : { id, dealerId: session.user.id, status: 'APPROVED' as const };

    const claimed = await prisma.segmentCampaignProposal.updateMany({
      where: claimWhere,
      data: { status: 'SENT' },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: 'Taslak gönderilemedi (durum değişti veya eşzamanlı gönderim)', status: proposal.status },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        title: proposal.title,
        message: proposal.message,
        type: 'campaign',
        data: {
          type: 'innovation_segment_proposal',
          proposalId: proposal.id,
          segmentKey: proposal.segmentKey,
          dealerId: proposal.dealerId,
        } as object,
      })),
    });

    await Promise.allSettled(
      unique.map((userId) =>
        sendPushNotification(
          userId,
          proposal.title,
          proposal.message,
          '/customer/campaigns',
          '/icon512_rounded.png'
        )
      )
    );

    const updated = await prisma.segmentCampaignProposal.findUnique({ where: { id } });

    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'innovation_segment_proposal_sent',
        category: 'innovation',
        data: {
          proposalId: id,
          segmentKey: proposal.segmentKey,
          sentCount: unique.length,
        } as object,
      },
    });

    return NextResponse.json({
      success: true,
      sentCount: unique.length,
      proposal: updated,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('segment-proposals send:', error);
    return NextResponse.json({ error: 'Gönderim başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
