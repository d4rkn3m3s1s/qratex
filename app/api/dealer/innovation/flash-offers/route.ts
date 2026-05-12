import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { dealerFlashGeoKey } from '@/lib/innovation-geo';

export const dynamic = 'force-dynamic';

const upsertSchema = z.object({
  dealerId: z.string().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1),
  offerType: z.enum(['PERCENT', 'FIXED_TRY', 'COMPLIMENTARY']),
  value: z.number().optional().nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.flashOffers) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const dealerIdParam = searchParams.get('dealerId');
  const targetDealerId =
    session.user.role === 'ADMIN' && dealerIdParam ? dealerIdParam : session.user.id;

  const forbidden = requireDealerResource(session, targetDealerId);
  if (forbidden) return forbidden;

  const offers = await prisma.dealerFlashOffer.findMany({
    where: { dealerId: targetDealerId },
    orderBy: { validTo: 'desc' },
    take: 100,
  });

  return NextResponse.json({ offers });
}

export async function POST(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.flashOffers) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Geçersiz' }, { status: 400 });
  }

  const dealerId =
    session.user.role === 'ADMIN'
      ? parsed.data.dealerId || ''
      : session.user.id;

  if (session.user.role === 'ADMIN' && !dealerId) {
    return NextResponse.json({ error: 'Admin için dealerId gerekli' }, { status: 400 });
  }

  const forbidden = requireDealerResource(session, dealerId);
  if (forbidden) return forbidden;

  const dealer = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { latitude: true, longitude: true, role: true },
  });
  if (!dealer || dealer.role !== 'DEALER') {
    return NextResponse.json({ error: 'Geçersiz bayi' }, { status: 400 });
  }

  let geohash5: string | null = null;
  if (dealer.latitude != null && dealer.longitude != null) {
    geohash5 = dealerFlashGeoKey(dealer.latitude, dealer.longitude);
  }

  const d = parsed.data;
  const offer = await prisma.dealerFlashOffer.create({
    data: {
      dealerId,
      title: d.title,
      body: d.body,
      offerType: d.offerType,
      value: d.value ?? null,
      validFrom: new Date(d.validFrom),
      validTo: new Date(d.validTo),
      maxRedemptions: d.maxRedemptions ?? 200,
      isActive: d.isActive ?? true,
      geohash5,
    },
  });

  return NextResponse.json({ success: true, offer });
}
