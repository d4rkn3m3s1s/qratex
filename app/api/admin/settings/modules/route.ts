import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { MODULE_CATALOG, MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import { Prisma } from '@prisma/client';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const row = await prisma.settings.findUnique({
    where: { key: MODULE_CONTROLS_SETTINGS_KEY },
    select: { value: true },
  });
  const controls = normalizeModuleControls(row?.value);

  return NextResponse.json({
    success: true,
    catalog: MODULE_CATALOG,
    controls,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => ({}));
  const controls = normalizeModuleControls(body?.controls);

  const existing = await prisma.settings.findUnique({
    where: { key: MODULE_CONTROLS_SETTINGS_KEY },
    select: { id: true, value: true },
  });

  const saved = await prisma.settings.upsert({
    where: { key: MODULE_CONTROLS_SETTINGS_KEY },
    create: {
      key: MODULE_CONTROLS_SETTINGS_KEY,
      category: 'admin',
      value: controls as object,
    },
    update: {
      value: controls as object,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: existing ? 'update_modules' : 'create_modules',
      entity: 'settings',
      entityId: saved.id,
      oldData: (existing?.value ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      newData: controls as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ success: true, controls }, { headers: PRIVATE_NO_STORE_HEADERS });
}
