import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createFeatureFlagSchema = z.object({
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
  ownerId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isEnabled: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const patchFeatureFlagSchema = z.object({
  id: z.string().min(1, 'ID gerekli'),
  isEnabled: z.boolean(),
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/features - Get all feature flags
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const features = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });

    return NextResponse.json({ features }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json(
      { error: 'Özellik bayrakları getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/features - Create feature flag
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = createFeatureFlagSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Check if key already exists
    const existing = await prisma.featureFlag.findUnique({
      where: { key: validatedData.data.key },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Bu key zaten kullanılıyor' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const feature = await prisma.featureFlag.create({
      data: {
        key: validatedData.data.key,
        name: validatedData.data.name,
        description: validatedData.data.description,
        isEnabled: validatedData.data.isEnabled,
        expiresAt: validatedData.data.expiresAt ? new Date(validatedData.data.expiresAt) : null,
        ownerId: validatedData.data.ownerId ?? session.user.id,
        metadata: validatedData.data.metadata as object | undefined,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_FEATURE',
        entity: 'FeatureFlag',
        entityId: feature.id,
        newData: feature as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, feature }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/features - Update feature flag
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key parametresi gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    const validatedData = updateFeatureFlagSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Özellik bayrağı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const updateData: Record<string, unknown> = {};
    if (validatedData.data.name !== undefined) updateData.name = validatedData.data.name;
    if (validatedData.data.description !== undefined) updateData.description = validatedData.data.description;
    if (validatedData.data.isEnabled !== undefined) updateData.isEnabled = validatedData.data.isEnabled;
    if (validatedData.data.expiresAt !== undefined) updateData.expiresAt = validatedData.data.expiresAt ? new Date(validatedData.data.expiresAt) : null;
    if (validatedData.data.ownerId !== undefined) updateData.ownerId = validatedData.data.ownerId;
    if (validatedData.data.metadata !== undefined) updateData.metadata = validatedData.data.metadata as object;

    const feature = await prisma.featureFlag.update({
      where: { key },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_FEATURE',
        entity: 'FeatureFlag',
        entityId: feature.id,
        oldData: existing as object,
        newData: feature as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, feature }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/features - Toggle or partial update by id (admin UI)
// ─────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validated = patchFeatureFlagSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.featureFlag.findUnique({
      where: { id: validated.data.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Özellik bayrağı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const feature = await prisma.featureFlag.update({
      where: { id: validated.data.id },
      data: { isEnabled: validated.data.isEnabled },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_FEATURE',
        entity: 'FeatureFlag',
        entityId: feature.id,
        oldData: existing as object,
        newData: feature as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, feature }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error PATCH feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/features - Delete feature flag
// ─────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key parametresi gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const existing = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Özellik bayrağı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    await prisma.featureFlag.delete({
      where: { key },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE_FEATURE',
        entity: 'FeatureFlag',
        entityId: existing.id,
        oldData: existing as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error deleting feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

