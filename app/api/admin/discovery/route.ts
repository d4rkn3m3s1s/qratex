import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  DISCOVERY_CONFIG_CATEGORY,
  DISCOVERY_CONFIG_SETTING_KEY,
  normalizeDiscoveryConfig,
} from '@/lib/discovery-config';
import { adminDiscoveryPutSchema } from '@/lib/validations-admin';
import {
  baseVersionRequiredResponse,
  isVersionConflictError,
  readBaseVersion,
  versionConflictResponse,
  versionFromDate,
  writeVersionedSetting,
} from '@/lib/settings-version';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** GET — canlı keşif ayarı + sürüm. Okuma hatası 500 (istemci formu açmaz — P0-28). */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const row = await prisma.settings.findUnique({
      where: { key: DISCOVERY_CONFIG_SETTING_KEY },
      select: { value: true, updatedAt: true },
    });
    return NextResponse.json(
      {
        success: true,
        config: normalizeDiscoveryConfig(row?.value),
        version: versionFromDate(row?.updatedAt),
        isDefault: !row,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Admin discovery config fetch error:', error);
    return NextResponse.json({ success: false, error: 'Keşif ayarları alınamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/** PUT — `baseVersion` ZORUNLU; uyuşmazlıkta 409. Yazma + audit tek transaction. */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const auditMeta = getAuditRequestMeta(request);
    const raw = await request.json().catch(() => null);
    const parsed = adminDiscoveryPutSchema.safeParse(raw);
    if (!parsed.success || parsed.data.config == null || typeof parsed.data.config !== 'object') {
      const msg = parsed.success ? 'Keşif ayarı gerekli' : parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { success: false, error: msg, ...(parsed.success ? {} : { details: parsed.error.flatten() }) },
        { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const baseVersion = readBaseVersion(raw);
    if (!baseVersion) return baseVersionRequiredResponse();

    const normalized = normalizeDiscoveryConfig(parsed.data.config);

    const saved = await prisma.$transaction(async (tx) => {
      const written = await writeVersionedSetting(tx, {
        key: DISCOVERY_CONFIG_SETTING_KEY,
        value: normalized as Prisma.InputJsonValue,
        category: DISCOVERY_CONFIG_CATEGORY,
        baseVersion,
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE_DISCOVERY_CONFIG',
          entity: 'Settings',
          entityId: written.id,
          oldData: written.previous ?? Prisma.JsonNull,
          newData: normalized as Prisma.InputJsonValue,
          ...auditMeta,
        },
      });
      return written;
    });

    return NextResponse.json(
      { success: true, config: normalized, version: saved.version },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Admin discovery config update error:', error);
    return NextResponse.json({ success: false, error: 'Keşif ayarları güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
