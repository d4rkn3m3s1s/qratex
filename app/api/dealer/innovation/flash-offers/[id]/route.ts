import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
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
  try {
    const cfg = await getInnovationPlatformConfig();
    if (!cfg.features.flashOffers) {
      return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
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
      return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const forbidden = requireDealerResource(session, existing.dealerId);
    if (forbidden) return forbidden;

    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
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
    const data = {
      ...(d.title != null ? { title: d.title } : {}),
      ...(d.body != null ? { body: d.body } : {}),
      ...(d.offerType != null ? { offerType: d.offerType } : {}),
      ...(d.value !== undefined ? { value: d.value } : {}),
      ...(d.validFrom != null ? { validFrom: new Date(d.validFrom) } : {}),
      ...(d.validTo != null ? { validTo: new Date(d.validTo) } : {}),
      ...(d.maxRedemptions != null ? { maxRedemptions: d.maxRedemptions } : {}),
      ...(d.isActive != null ? { isActive: d.isActive } : {}),
      ...(geohash5 != null ? { geohash5 } : {}),
    };

    if (Object.keys(data).length === 0) {
      const offer = await prisma.dealerFlashOffer.findUnique({ where: { id } });
      return NextResponse.json({ success: true, offer }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (session.user.role === 'ADMIN') {
      const n = await prisma.dealerFlashOffer.updateMany({ where: { id }, data });
      if (n.count === 0) {
        return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    } else {
      const n = await prisma.dealerFlashOffer.updateMany({
        where: { id, dealerId: session.user.id },
        data,
      });
      if (n.count === 0) {
        return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    }

    const offer = await prisma.dealerFlashOffer.findUnique({ where: { id } });
    return NextResponse.json({ success: true, offer }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('flash-offers PATCH:', error);
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cfg = await getInnovationPlatformConfig();
    if (!cfg.features.flashOffers) {
      return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
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
      return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const forbidden = requireDealerResource(session, existing.dealerId);
    if (forbidden) return forbidden;

    if (session.user.role === 'ADMIN') {
      const n = await prisma.dealerFlashOffer.deleteMany({ where: { id } });
      if (n.count === 0) {
        return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    } else {
      const n = await prisma.dealerFlashOffer.deleteMany({
        where: { id, dealerId: session.user.id },
      });
      if (n.count === 0) {
        return NextResponse.json({ error: 'Bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
    }
    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('flash-offers DELETE:', error);
    return NextResponse.json({ error: 'Silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
