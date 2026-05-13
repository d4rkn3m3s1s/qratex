import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  DISCOVERY_CONFIG_SETTING_KEY,
  getDiscoveryConfig,
  normalizeDiscoveryConfig,
  saveDiscoveryConfig,
} from '@/lib/discovery-config';
import { adminDiscoveryPutSchema } from '@/lib/validations-admin';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const config = await getDiscoveryConfig();
    return NextResponse.json({ success: true, config }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Admin discovery config fetch error:', error);
    return NextResponse.json({ success: false, error: 'Discovery ayarları alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const auditMeta = getAuditRequestMeta(request);
    const raw = await request.json();
    const parsed = adminDiscoveryPutSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { success: false, error: msg, details: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const normalized = normalizeDiscoveryConfig(parsed.data.config);

    const previous = await prisma.settings.findUnique({
      where: { key: DISCOVERY_CONFIG_SETTING_KEY },
      select: { id: true, value: true },
    });

    const saved = await saveDiscoveryConfig(normalized);

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_DISCOVERY_CONFIG',
        entity: 'Settings',
        entityId: saved.id,
        oldData: previous?.value ?? Prisma.JsonNull,
        newData: normalized as Prisma.InputJsonValue,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, config: normalized }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Admin discovery config update error:', error);
    return NextResponse.json({ success: false, error: 'Discovery ayarları güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
