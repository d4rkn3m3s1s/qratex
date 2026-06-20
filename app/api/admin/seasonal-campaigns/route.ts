import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Sezonsal kampanya yönetimi (admin). SeasonalCampaign modeli artık gerçek puan
 * kazanımına bağlı (lib/seasonal-campaign-live → feedback + consumption pasif puanı).
 * Bu route kampanyaları oluşturup/güncelleyip listeler.
 */
const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(1).max(2000),
  type: z.enum(['BIRTHDAY', 'ANNIVERSARY', 'SEASONAL', 'SPECIAL']),
  multiplier: z.number().min(1).max(10).optional(),
  bonusPoints: z.number().int().min(0).max(100000).optional(),
  discount: z.number().min(0).max(100).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  conditions: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const updateSchema = createSchema.partial().extend({ id: z.string().min(1) });

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const isActiveParam = new URL(request.url).searchParams.get('isActive');
    const where =
      isActiveParam === 'true' ? { isActive: true } : isActiveParam === 'false' ? { isActive: false } : {};
    const campaigns = await prisma.seasonalCampaign.findMany({
      where,
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    return NextResponse.json(campaigns, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SeasonalCampaign GET error:', e);
    return NextResponse.json({ error: 'Kampanyalar alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Geçersiz istek' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const d = parsed.data;
    const start = new Date(d.startDate);
    const end = new Date(d.endDate);
    if (end <= start) {
      return NextResponse.json(
        { error: 'Bitiş tarihi başlangıçtan sonra olmalı' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const campaign = await prisma.seasonalCampaign.create({
      data: {
        name: d.name,
        description: d.description,
        type: d.type,
        multiplier: d.multiplier ?? 1.5,
        bonusPoints: d.bonusPoints ?? 0,
        discount: d.discount ?? null,
        imageUrl: d.imageUrl ?? null,
        conditions: (d.conditions ?? undefined) as object | undefined,
        isActive: d.isActive ?? true,
        startDate: start,
        endDate: end,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'CREATE_SEASONAL_CAMPAIGN',
        entity: 'SeasonalCampaign',
        entityId: campaign.id,
        newData: { name: campaign.name, type: campaign.type, multiplier: campaign.multiplier } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json(campaign, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SeasonalCampaign POST error:', e);
    return NextResponse.json({ error: 'Kampanya oluşturulamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Geçersiz istek' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { id, startDate, endDate, conditions, ...rest } = parsed.data;
    const existing = await prisma.seasonalCampaign.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const data: Record<string, unknown> = { ...rest };
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (conditions !== undefined) data.conditions = conditions ?? undefined;
    const updated = await prisma.seasonalCampaign.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'UPDATE_SEASONAL_CAMPAIGN',
        entity: 'SeasonalCampaign',
        entityId: id,
        newData: { name: updated.name, isActive: updated.isActive } as object,
        ...getAuditRequestMeta(request),
      },
    });
    return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    console.error('SeasonalCampaign PUT error:', e);
    return NextResponse.json({ error: 'Kampanya güncellenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
