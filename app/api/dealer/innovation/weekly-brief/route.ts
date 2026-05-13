import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { computeWeeklyBriefForDealer } from '@/lib/innovation-weekly-brief';
import { utcMondayWeekStart } from '@/lib/innovation-week';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.weeklyBrief) {
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

  const weekStart = utcMondayWeekStart();
  const brief = await prisma.dealerWeeklyBrief.findUnique({
    where: {
      dealerId_weekStart: { dealerId, weekStart },
    },
  });

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    brief,
    empty: !brief,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.weeklyBrief) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => ({}));
  const dealerId =
    session.user.role === 'ADMIN' && typeof body.dealerId === 'string'
      ? body.dealerId
      : session.user.id;

  const forbidden = requireDealerResource(session, dealerId);
  if (forbidden) return forbidden;

  const computed = await computeWeeklyBriefForDealer(dealerId);
  const weekStart = utcMondayWeekStart();

  const brief = await prisma.dealerWeeklyBrief.upsert({
    where: {
      dealerId_weekStart: { dealerId, weekStart },
    },
    create: {
      dealerId,
      weekStart,
      topThemes: computed.topThemes as object,
      recommendedAction: computed.recommendedAction,
    },
    update: {
      topThemes: computed.topThemes as object,
      recommendedAction: computed.recommendedAction,
    },
  });

  return NextResponse.json({
    success: true,
    brief,
    computed,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
