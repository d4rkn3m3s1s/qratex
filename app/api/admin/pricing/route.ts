import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { Prisma } from '@prisma/client';
import { archiveGateResponse, archivedListFilter, readArchiveIntent, type DeletionImpact } from '@/lib/data-safety/archive';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';
import { PLAN_GRANTING_STATUSES } from '@/lib/billing-core';


export const dynamic = 'force-dynamic';

const intervalSchema = z.enum(['monthly', 'yearly', 'lifetime']);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  price: z.number().min(0).max(1_000_000),
  currency: z.string().min(1).max(8).default('TRY'),
  interval: intervalSchema.default('monthly'),
  features: z.array(z.string().min(1).max(200)).min(1).max(80),
  maxQRCodes: z.number().int().min(0).optional().nullable(),
  maxBranches: z.number().int().min(0).optional().nullable(),
  pricePerBranch: z.number().min(0).optional().nullable(),
  stripePriceId: z.string().max(255).optional().nullable(),
  isPopular: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  order: z.number().int().min(0).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  /** Arşivdeki planı geri al (P0-26). */
  restore: z.boolean().optional(),
});

/**
 * GET /api/admin/pricing — arşivlenmiş ("silinmiş") planlar varsayılan listede yok;
 * `?archived=only` arşivi, `?archived=include` hepsini döndürür. Her plan için abone sayısı
 * (`_count.dealers`) eklenir (silme/pasifleştirme etkisini UI gösterebilsin).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const plans = await prisma.pricingPlan.findMany({
      where: archivedListFilter(request),
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { dealers: true } } },
      take: 200,
    });
    return NextResponse.json({ success: true, plans }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Pricing list error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Planlar yüklenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const maxOrder = await prisma.pricingPlan.aggregate({ _max: { order: true } });
  const order =
    typeof parsed.data.order === 'number' ? parsed.data.order : (maxOrder._max.order ?? -1) + 1;

  const created = await prisma.pricingPlan.create({
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      price: parsed.data.price,
      currency: parsed.data.currency,
      interval: parsed.data.interval,
      features: parsed.data.features as unknown as Prisma.InputJsonValue,
      maxQRCodes: parsed.data.maxQRCodes ?? null,
      maxBranches: parsed.data.maxBranches ?? null,
      pricePerBranch: parsed.data.pricePerBranch ?? null,
      stripePriceId: parsed.data.stripePriceId?.trim() || null,
      isPopular: parsed.data.isPopular,
      isActive: parsed.data.isActive,
      order,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE_PRICING_PLAN',
      entity: 'PricingPlan',
      entityId: created.id,
      newData: created as unknown as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });

  return NextResponse.json({ success: true, plan: created }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { id, restore, ...fields } = parsed.data;
  const existing = await prisma.pricingPlan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (restore === true) {
    if (!existing.archivedAt) {
      return NextResponse.json({ error: 'Bu plan arşivde değil' }, { status: 409 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const restored = await prisma.$transaction(async (tx) => {
      const p = await tx.pricingPlan.update({ where: { id }, data: { archivedAt: null } });
      await tx.auditLog.create({
        data: auditEntry(actorFromSession(session), { action: 'RESTORE_PRICING_PLAN', entity: 'PricingPlan', entityId: id }, request),
      });
      return p;
    });
    return NextResponse.json({ success: true, plan: restored }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (existing.archivedAt) {
    return NextResponse.json(
      { error: 'Arşivlenmiş plan düzenlenemez. Önce arşivden geri alın.', code: 'ARCHIVED' },
      { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const updated = await prisma.pricingPlan.update({
    where: { id },
    data: {
      ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
      ...(fields.description !== undefined ? { description: fields.description?.trim() || null } : {}),
      ...(fields.price !== undefined ? { price: fields.price } : {}),
      ...(fields.currency !== undefined ? { currency: fields.currency } : {}),
      ...(fields.interval !== undefined ? { interval: fields.interval } : {}),
      ...(fields.features !== undefined
        ? { features: fields.features as unknown as Prisma.InputJsonValue }
        : {}),
      ...(fields.maxQRCodes !== undefined ? { maxQRCodes: fields.maxQRCodes ?? null } : {}),
      ...(fields.maxBranches !== undefined ? { maxBranches: fields.maxBranches ?? null } : {}),
      ...(fields.pricePerBranch !== undefined
        ? { pricePerBranch: fields.pricePerBranch ?? null }
        : {}),
      ...(fields.stripePriceId !== undefined
        ? { stripePriceId: fields.stripePriceId?.trim() || null }
        : {}),
      ...(fields.isPopular !== undefined ? { isPopular: fields.isPopular } : {}),
      ...(fields.isActive !== undefined ? { isActive: fields.isActive } : {}),
      ...(fields.order !== undefined ? { order: fields.order } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'UPDATE_PRICING_PLAN',
      entity: 'PricingPlan',
      entityId: id,
      oldData: existing as unknown as Prisma.InputJsonValue,
      newData: updated as unknown as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });

  return NextResponse.json({ success: true, plan: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * DELETE /api/admin/pricing?id= — "silme" artık ARŞİVDİR (P0-26).
 *
 * Önceden `pricingPlan.delete` → `User.pricingPlan onDelete: SetNull`: plana bağlı bütün
 * bayiler (ücretli Stripe aboneleri dahil) sessizce ücretsiz kademeye (3 QR) düşüyor,
 * Stripe webhook'u silinmiş plan id'sini yazmaya çalışıp FK hatası verebiliyordu.
 *
 * Şimdi: abone varsa `?confirm=archive` olmadan 409 + etki önizlemesi. Arşiv
 * (`archivedAt`, `isActive=false`) yalnız yeni satışı kapatır; aboneler planda ve
 * limitlerinde kalır (lib/plan-limits.ts arşivli planın limitlerini uygular).
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });

    const existing = await prisma.pricingPlan.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });

    const [subscribers, paying] = await Promise.all([
      prisma.user.count({ where: { pricingPlanId: id } }),
      prisma.user.count({ where: { pricingPlanId: id, subscriptionStatus: { in: Array.from(PLAN_GRANTING_STATUSES) } } }),
    ]);

    const impact: DeletionImpact = {
      entity: 'PricingPlan',
      entityId: id,
      entityLabel: existing.name,
      items: [
        { key: 'subscribers', label: 'Bu plandaki işletme', value: subscribers, emphasis: subscribers > 0 },
        { key: 'paying', label: 'Aktif ücretli abonelik', value: paying, emphasis: paying > 0 },
      ],
      warning: 'Plan arşivlenir ve yeni satışa kapanır. Mevcut aboneler planda ve limitlerinde kalır.',
    };

    const early = archiveGateResponse(
      impact,
      readArchiveIntent(request),
      `Bu planda ${subscribers} işletme var (${paying} aktif ücretli abonelik). Arşivlemek yalnız yeni satışı kapatır; aboneler etkilenmez. Onaylamak için isteği confirm=archive ile tekrarlayın.`
    );
    if (early) return early;

    if (existing.archivedAt) {
      return NextResponse.json({ success: true, archived: true, alreadyArchived: true }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.pricingPlan.update({ where: { id }, data: { archivedAt: now, isActive: false } });
      await tx.auditLog.create({
        data: auditEntry(
          actorFromSession(session),
          {
            action: 'ARCHIVE_PRICING_PLAN',
            entity: 'PricingPlan',
            entityId: id,
            oldData: { name: existing.name, isActive: existing.isActive, price: existing.price, stripePriceId: existing.stripePriceId },
            newData: { archivedAt: now, subscribersPreserved: subscribers, payingPreserved: paying },
          },
          request
        ),
      });
    });
    return NextResponse.json({ success: true, archived: true, impact }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Pricing archive error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'Plan arşivlenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
