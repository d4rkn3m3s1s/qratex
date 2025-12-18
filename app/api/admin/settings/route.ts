import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateSettingsSchema } from '@/lib/validations';
import { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────
// GET /api/admin/settings - Get all settings
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const key = searchParams.get('key');

    let where: Record<string, unknown> = {};
    
    if (category) {
      where.category = category;
    }
    
    if (key) {
      where.key = key;
    }

    const settings = await prisma.settings.findMany({
      where,
      orderBy: { category: 'asc' },
    });

    // If specific key requested, return single value
    if (key && settings.length === 1) {
      return NextResponse.json({ setting: settings[0] });
    }

    // Group by category
    const grouped = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {};
      }
      acc[setting.category][setting.key] = setting.value;
      return acc;
    }, {} as Record<string, Record<string, unknown>>);

    return NextResponse.json({ settings: grouped, raw: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Ayarlar getirilemedi' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/settings - Update a setting
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateSettingsSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { key, value, category } = validatedData.data;

    // Get existing setting for audit
    const existingSetting = await prisma.settings.findUnique({
      where: { key },
    });

    // Upsert the setting
    const setting = await prisma.settings.upsert({
      where: { key },
      update: {
        value: value as Prisma.InputJsonValue,
        category: category || existingSetting?.category || 'general',
      },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        category: category || 'general',
      },
    });

    // Create audit log - handle null value properly
    const oldDataValue = existingSetting?.value;
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: existingSetting ? 'update' : 'create',
        entity: 'settings',
        entityId: setting.id,
        oldData: oldDataValue !== null && oldDataValue !== undefined 
          ? oldDataValue as Prisma.InputJsonValue 
          : Prisma.JsonNull,
        newData: value as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, setting });
  } catch (error) {
    console.error('Error updating setting:', error);
    return NextResponse.json(
      { error: 'Ayar güncellenemedi' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/settings/batch - Batch update settings
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { settings } = await request.json();

    if (!Array.isArray(settings)) {
      return NextResponse.json(
        { error: 'Settings must be an array' },
        { status: 400 }
      );
    }

    const results = await prisma.$transaction(
      settings.map((s: { key: string; value: unknown; category?: string }) =>
        prisma.settings.upsert({
          where: { key: s.key },
          update: { value: (s.value ?? {}) as Prisma.InputJsonValue },
          create: {
            key: s.key,
            value: (s.value ?? {}) as Prisma.InputJsonValue,
            category: s.category || 'general',
          },
        })
      )
    );

    // Create single audit log for batch update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'batch_update',
        entity: 'settings',
        newData: { keys: settings.map((s: { key: string }) => s.key) } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, count: results.length });
  } catch (error) {
    console.error('Error batch updating settings:', error);
    return NextResponse.json(
      { error: 'Ayarlar toplu güncellenemedi' },
      { status: 500 }
    );
  }
}
