import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { segmentCampaignDraft, type SegmentKey } from '@/lib/innovation-segment-templates';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  segmentKey: z.enum(['sleeping', 'loyal', 'first_visit']),
  title: z.string().trim().min(1).max(200).optional(),
  // Bildirim gövdesi: kampanya mesajıyla aynı üst sınır (eskiden sınırsızdı — D5).
  message: z.string().trim().min(1).max(2000).optional(),
  useTemplate: z.boolean().optional(),
  // Yalnız ADMIN için anlamlı (bayi adına taslak); bayide yok sayılır.
  dealerId: z.string().trim().min(1).max(191).optional(),
});

/** Bayi başına admin onayı bekleyen taslak tavanı (onay kuyruğunu doldurma engeli). */
const MAX_PENDING_PROPOSALS_PER_DEALER = 10;

export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.segmentProposals) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const dealerIdParam = searchParams.get('dealerId');
  const dealerId =
    session.user.role === 'ADMIN' && dealerIdParam ? dealerIdParam : session.user.id;

  const forbidden = requireDealerResource(session, dealerId);
  if (forbidden) return forbidden;

  const proposals = await prisma.segmentCampaignProposal.findMany({
    where: { dealerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ proposals }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.segmentProposals) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limited = await enforceRouteRateLimit('dealer.innovation.segment-proposals.create', session.user.id, {
    max: 10,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const dealerId =
    session.user.role === 'ADMIN' && parsed.data.dealerId ? parsed.data.dealerId : session.user.id;

  const forbidden = requireDealerResource(session, dealerId);
  if (forbidden) return forbidden;

  const pending = await prisma.segmentCampaignProposal.count({ where: { dealerId, status: 'PENDING' } });
  if (pending >= MAX_PENDING_PROPOSALS_PER_DEALER) {
    return NextResponse.json(
      { error: `Onay bekleyen en fazla ${MAX_PENDING_PROPOSALS_PER_DEALER} taslağınız olabilir. Önce mevcut taslakların sonuçlanmasını bekleyin.` },
      { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const seg = parsed.data.segmentKey as SegmentKey;
  const draft =
    parsed.data.useTemplate !== false && !parsed.data.title && !parsed.data.message
      ? segmentCampaignDraft(seg)
      : {
          title: parsed.data.title || segmentCampaignDraft(seg).title,
          message: parsed.data.message || segmentCampaignDraft(seg).message,
        };

  const proposal = await prisma.segmentCampaignProposal.create({
    data: {
      dealerId,
      segmentKey: seg,
      title: draft.title,
      message: draft.message,
      status: 'PENDING',
    },
  });

  return NextResponse.json({ success: true, proposal }, { headers: PRIVATE_NO_STORE_HEADERS });
}
