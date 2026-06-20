import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { Prisma } from '@prisma/client';


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
});

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const plans = await prisma.pricingPlan.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
  return NextResponse.json({ success: true, plans }, { headers: PRIVATE_NO_STORE_HEADERS });
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

  const { id, ...fields } = parsed.data;
  const existing = await prisma.pricingPlan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
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

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });

  const existing = await prisma.pricingPlan.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });

  await prisma.pricingPlan.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DELETE_PRICING_PLAN',
      entity: 'PricingPlan',
      entityId: id,
      oldData: existing as unknown as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
