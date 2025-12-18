import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createFeatureFlagSchema = z.object({
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

const updateFeatureFlagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isEnabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/features - Get all feature flags
// ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const features = await prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });

    return NextResponse.json({ features });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json(
      { error: 'Özellik bayrakları getirilemedi' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/features - Create feature flag
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createFeatureFlagSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    // Check if key already exists
    const existing = await prisma.featureFlag.findUnique({
      where: { key: validatedData.data.key },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Bu key zaten kullanılıyor' },
        { status: 400 }
      );
    }

    const feature = await prisma.featureFlag.create({
      data: validatedData.data,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'create',
        entity: 'feature_flag',
        entityId: feature.id,
        newData: feature,
      },
    });

    return NextResponse.json({ success: true, feature });
  } catch (error) {
    console.error('Error creating feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı oluşturulamadı' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/features - Update feature flag
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key parametresi gerekli' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updateFeatureFlagSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const existing = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Özellik bayrağı bulunamadı' },
        { status: 404 }
      );
    }

    const feature = await prisma.featureFlag.update({
      where: { key },
      data: validatedData.data,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'update',
        entity: 'feature_flag',
        entityId: feature.id,
        oldData: existing,
        newData: feature,
      },
    });

    return NextResponse.json({ success: true, feature });
  } catch (error) {
    console.error('Error updating feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı güncellenemedi' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/features - Delete feature flag
// ─────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key parametresi gerekli' },
        { status: 400 }
      );
    }

    const existing = await prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Özellik bayrağı bulunamadı' },
        { status: 404 }
      );
    }

    await prisma.featureFlag.delete({
      where: { key },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'delete',
        entity: 'feature_flag',
        entityId: existing.id,
        oldData: existing,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting feature flag:', error);
    return NextResponse.json(
      { error: 'Özellik bayrağı silinemedi' },
      { status: 500 }
    );
  }
}

