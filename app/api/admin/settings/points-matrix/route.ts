import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  getDefaultPointsMatrix,
  normalizePointsMatrix,
  clearPointsMatrixCache,
  POINTS_MATRIX_SETTING_CATEGORY,
  POINTS_MATRIX_SETTING_KEY,
} from '@/lib/points-rules';
import { adminPointsMatrixPutSchema } from '@/lib/validations-admin';
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

/**
 * GET — canlı puan matrisi + sürüm (P0-28). Önbelleksiz, hatayı yutmayan okuma: DB okunamazsa
 * 500 döner; istemci formu açmaz. `defaults` yalnız "varsayılana dön" düğmesi içindir.
 */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const row = await prisma.settings.findUnique({
      where: { key: POINTS_MATRIX_SETTING_KEY },
      select: { value: true, updatedAt: true },
    });
    return NextResponse.json({
      success: true,
      key: POINTS_MATRIX_SETTING_KEY,
      matrix: normalizePointsMatrix(row?.value),
      version: versionFromDate(row?.updatedAt),
      isDefault: !row,
      defaults: getDefaultPointsMatrix(),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Points matrix fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Puan matrisi getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/** PUT — `baseVersion` ZORUNLU; uyuşmazlıkta 409. Yazma + audit tek transaction. */
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json().catch(() => null);
    const parsed = adminPointsMatrixPutSchema.safeParse(raw);
    if (!parsed.success || parsed.data.matrix == null) {
      const msg = parsed.success ? 'Puan matrisi gerekli' : parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { success: false, error: msg, ...(parsed.success ? {} : { details: parsed.error.flatten() }) },
        { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const baseVersion = readBaseVersion(raw);
    if (!baseVersion) return baseVersionRequiredResponse();

    const normalizedMatrix = normalizePointsMatrix(parsed.data.matrix);

    const saved = await prisma.$transaction(async (tx) => {
      const written = await writeVersionedSetting(tx, {
        key: POINTS_MATRIX_SETTING_KEY,
        value: normalizedMatrix as Prisma.InputJsonValue,
        category: POINTS_MATRIX_SETTING_CATEGORY,
        baseVersion,
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE_POINTS_MATRIX',
          entity: 'Settings',
          entityId: written.id,
          oldData: written.previous ?? Prisma.JsonNull,
          newData: normalizedMatrix as Prisma.InputJsonValue,
          ...auditMeta,
        },
      });
      return written;
    });
    clearPointsMatrixCache();

    return NextResponse.json({
      success: true,
      key: saved.key,
      matrix: normalizedMatrix,
      version: saved.version,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Points matrix update error:', error);
    return NextResponse.json(
      { success: false, error: 'Puan matrisi güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
