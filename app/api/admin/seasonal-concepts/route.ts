import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { syncActiveSeasonalConcept } from '@/lib/seasonal-concept-core';

export const dynamic = 'force-dynamic';

const baseSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  backgroundEffect: z.string().max(40).nullable().optional(),
  themePresetId: z.string().max(40).nullable().optional(),
  bannerText: z.string().max(200).nullable().optional(),
  bannerEmoji: z.string().max(8).nullable().optional(),
  bonusMultiplier: z.number().min(1).max(10).nullable().optional(),
});

const createSchema = baseSchema.refine(
  (d) => new Date(d.endDate) > new Date(d.startDate),
  { message: 'Bitiş tarihi başlangıçtan sonra olmalı', path: ['endDate'] }
);
const updateSchema = baseSchema.partial().extend({ id: z.string().min(1) });

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const concepts = await prisma.seasonalConcept.findMany({
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    return NextResponse.json({ concepts }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    console.error('SeasonalConcept GET error:', e);
    return NextResponse.json(
      { error: 'Konseptler alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const d = parsed.data;
    const concept = await prisma.seasonalConcept.create({
      data: {
        name: d.name,
        description: d.description ?? null,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        isActive: d.isActive ?? true,
        priority: d.priority ?? 0,
        backgroundEffect: d.backgroundEffect ?? null,
        themePresetId: d.themePresetId ?? null,
        bannerText: d.bannerText ?? null,
        bannerEmoji: d.bannerEmoji ?? null,
        bonusMultiplier: d.bonusMultiplier ?? 1.0,
      },
    });

    const meta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'SEASONAL_CONCEPT_CREATE',
        entity: 'SeasonalConcept',
        entityId: concept.id,
        newData: { name: concept.name } as object,
        ...meta,
      },
    });

    await syncActiveSeasonalConcept(); // değişikliği anında yansıt
    return NextResponse.json({ concept }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    console.error('SeasonalConcept POST error:', e);
    return NextResponse.json(
      { error: 'Konsept oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { id, ...rest } = parsed.data;
    const data: Record<string, unknown> = {};
    if (rest.name !== undefined) data.name = rest.name;
    if (rest.description !== undefined) data.description = rest.description;
    if (rest.startDate !== undefined) data.startDate = new Date(rest.startDate);
    if (rest.endDate !== undefined) data.endDate = new Date(rest.endDate);
    if (rest.isActive !== undefined) data.isActive = rest.isActive;
    if (rest.priority !== undefined) data.priority = rest.priority;
    if (rest.backgroundEffect !== undefined) data.backgroundEffect = rest.backgroundEffect;
    if (rest.themePresetId !== undefined) data.themePresetId = rest.themePresetId;
    if (rest.bannerText !== undefined) data.bannerText = rest.bannerText;
    if (rest.bannerEmoji !== undefined) data.bannerEmoji = rest.bannerEmoji;
    if (rest.bonusMultiplier !== undefined) data.bonusMultiplier = rest.bonusMultiplier;

    const concept = await prisma.seasonalConcept.update({ where: { id }, data });

    const meta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'SEASONAL_CONCEPT_UPDATE',
        entity: 'SeasonalConcept',
        entityId: id,
        newData: data as object,
        ...meta,
      },
    });

    await syncActiveSeasonalConcept();
    return NextResponse.json({ concept }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    console.error('SeasonalConcept PUT error:', e);
    return NextResponse.json(
      { error: 'Konsept güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'id gerekli' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    await prisma.seasonalConcept.delete({ where: { id } });

    const meta = getAuditRequestMeta(request);
    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'SEASONAL_CONCEPT_DELETE',
        entity: 'SeasonalConcept',
        entityId: id,
        ...meta,
      },
    });

    await syncActiveSeasonalConcept();
    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (e) {
    const db = responseIfDatabaseUnavailable(e);
    if (db) return db;
    console.error('SeasonalConcept DELETE error:', e);
    return NextResponse.json(
      { error: 'Konsept silinemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
