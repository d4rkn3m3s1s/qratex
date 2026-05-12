import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { dealerFlashGeoKey } from '@/lib/innovation-geo';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).optional(),
  offerType: z.enum(['PERCENT', 'FIXED_TRY', 'COMPLIMENTARY']).optional(),
  value: z.number().optional().nullable(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.flashOffers) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const existing = await prisma.dealerFlashOffer.findUnique({
    where: { id },
    select: { dealerId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });
  }

  const forbidden = requireDealerResource(session, existing.dealerId);
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 });
  }

  const dealer = await prisma.user.findUnique({
    where: { id: existing.dealerId },
    select: { latitude: true, longitude: true },
  });
  let geohash5: string | undefined;
  if (dealer?.latitude != null && dealer?.longitude != null) {
    geohash5 = dealerFlashGeoKey(dealer.latitude, dealer.longitude);
  }

  const d = parsed.data;
  const offer = await prisma.dealerFlashOffer.update({
    where: { id },
    data: {
      ...(d.title != null ? { title: d.title } : {}),
      ...(d.body != null ? { body: d.body } : {}),
      ...(d.offerType != null ? { offerType: d.offerType } : {}),
      ...(d.value !== undefined ? { value: d.value } : {}),
      ...(d.validFrom != null ? { validFrom: new Date(d.validFrom) } : {}),
      ...(d.validTo != null ? { validTo: new Date(d.validTo) } : {}),
      ...(d.maxRedemptions != null ? { maxRedemptions: d.maxRedemptions } : {}),
      ...(d.isActive != null ? { isActive: d.isActive } : {}),
      ...(geohash5 != null ? { geohash5 } : {}),
    },
  });

  return NextResponse.json({ success: true, offer });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.flashOffers) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const existing = await prisma.dealerFlashOffer.findUnique({
    where: { id },
    select: { dealerId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 });
  }

  const forbidden = requireDealerResource(session, existing.dealerId);
  if (forbidden) return forbidden;

  await prisma.dealerFlashOffer.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
