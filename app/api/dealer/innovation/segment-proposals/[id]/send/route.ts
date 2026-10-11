import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { FREQUENCY_CAP } from '@/components/dealer/b-kampanyalar/domain';
import { loadRecentMarketingCounts } from '@/components/dealer/b-kampanyalar/server/audience';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { resolveInnovationSegmentUserIds } from '@/lib/innovation-segment-users';
import {
  MARKETING_KINDS,
  buildMarketingNotificationRows,
  resolveMarketingAudience,
  sendMarketingPush,
} from '@/lib/marketing-delivery';

export const dynamic = 'force-dynamic';

const MAX_SEND = 500;

/**
 * Admin onaylı segment taslağını hedef müşterilere bildirim + push ile gönderir.
 *
 * P0-35: alıcılar `lib/marketing-delivery` kapısından geçer — "Kampanya & Sürprizler"
 * tercihi kanal bazında (uygulama içi / push) uygulanır, bildirimler `data.kind` taşır.
 * Taslağın SENT işareti ile uygulama içi bildirimler aynı transaction'da yazılır.
 *
 * Y7 (frekans): kampanya merkeziyle AYNI sıklık tavanı — son 7 günde bu işletmeden ≥ 2 pazarlama
 * iletisi almış müşteri bu gönderimde atlanır (admin onayı içeriği denetler, sıklığı değil).
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
    const limited = await enforceRouteRateLimit('dealer.innovation.segment-proposals.send', session.user.id, {
      max: 10,
      windowMs: 24 * 60 * 60_000,
    });
    if (limited) return limited;

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

    // Bildirim tercihine saygı (fail-closed: okunamazsa catch → gönderim yok, taslak APPROVED kalır).
    const consent = await resolveMarketingAudience(unique);
    if (consent.reachCount === 0) {
      return NextResponse.json(
        {
          error: 'Bu segmentteki müşterilerin tümü kampanya bildirimlerini kapatmış; gönderilecek kimse yok.',
          code: 'NO_CONSENTING_RECIPIENTS',
          candidateCount: consent.candidateCount,
          optedOutCount: consent.optedOutCount,
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Sıklık tavanı (kampanya merkeziyle aynı sayaç: kampanya gönderimleri + bu işletmenin
    // uygulama içi pazarlama bildirimleri).
    const reachable = [...new Set([...consent.appUserIds, ...consent.pushUserIds])];
    const recent = await loadRecentMarketingCounts(proposal.dealerId, reachable);
    const capped = new Set(reachable.filter((uid) => (recent.get(uid) ?? 0) >= FREQUENCY_CAP.max));
    const audience = {
      ...consent,
      appUserIds: consent.appUserIds.filter((uid) => !capped.has(uid)),
      pushUserIds: consent.pushUserIds.filter((uid) => !capped.has(uid)),
      reachCount: reachable.length - capped.size,
    };
    if (audience.reachCount === 0) {
      return NextResponse.json(
        {
          error: `Bu segmentteki müşterilerin tümü son ${FREQUENCY_CAP.days} günde işletmenizden ${FREQUENCY_CAP.max} pazarlama iletisi aldı; şu an gönderilecek kimse yok. Birkaç gün sonra tekrar deneyin.`,
          code: 'FREQUENCY_CAPPED',
          candidateCount: consent.candidateCount,
          optedOutCount: consent.optedOutCount,
          frequencyCappedCount: capped.size,
        },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const claimWhere =
      session.user.role === 'ADMIN'
        ? { id, status: 'APPROVED' as const }
        : { id, dealerId: session.user.id, status: 'APPROVED' as const };

    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.segmentCampaignProposal.updateMany({
        where: claimWhere,
        data: { status: 'SENT' },
      });
      if (claim.count === 0) return claim;
      if (audience.appUserIds.length > 0) {
        await tx.notification.createMany({
          data: buildMarketingNotificationRows(audience.appUserIds, {
            title: proposal.title,
            message: proposal.message,
            type: 'campaign',
            kind: MARKETING_KINDS.segmentProposal,
            data: {
              proposalId: proposal.id,
              segmentKey: proposal.segmentKey,
              dealerId: proposal.dealerId,
            },
          }),
        });
      }
      return claim;
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: 'Taslak gönderilemedi (durum değişti veya eşzamanlı gönderim)', status: proposal.status },
        { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const pushDelivered = await sendMarketingPush(audience.pushUserIds, {
      title: proposal.title,
      message: proposal.message,
      url: '/customer/places',
      icon: '/icon512_rounded.png',
    });

    const updated = await prisma.segmentCampaignProposal.findUnique({ where: { id } });

    // Gönderim tamamlandı: analitik kaydı başarısız olsa bile "gönderilemedi" denmez.
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: session.user.id,
          event: 'innovation_segment_proposal_sent',
          category: 'innovation',
          data: {
            proposalId: id,
            segmentKey: proposal.segmentKey,
            sentCount: audience.reachCount,
            candidateCount: audience.candidateCount,
            optedOutCount: audience.optedOutCount,
          } as object,
        },
      });
    } catch (err) {
      console.error('segment-proposals send: analitik kaydı yazılamadı', err);
    }

    return NextResponse.json({
      success: true,
      sentCount: audience.reachCount,
      inAppCount: audience.appUserIds.length,
      pushDelivered,
      optedOutCount: audience.optedOutCount,
      ineligibleCount: audience.ineligibleCount,
      frequencyCappedCount: capped.size,
      proposal: updated,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('segment-proposals send:', error);
    return NextResponse.json({ error: 'Gönderim başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
