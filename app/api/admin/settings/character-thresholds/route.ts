import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  readCategoryThresholdsStrict,
  normalizeCategoryThresholds,
  clearCategoryThresholdsCache,
  CATEGORY_THRESHOLDS_SETTING_KEY,
  CATEGORY_THRESHOLDS_SETTING_CATEGORY,
} from '@/lib/character-thresholds';
import {
  CHARACTER_CATEGORIES,
  categoryThreshold,
  categoryMinReviewLength,
} from '@/lib/character-categories';
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
 * GET — Karakter kategori eşiği/uzunluk ayarları. Her kategori için kod-içi DEFAULT
 * (gizemli=20, diğer=6) + admin OVERRIDE'ı + sürümü döndürür (UI ikisini de gösterir).
 * Okuma cache'siz ve fail-closed (P0-28): DB okunamazsa 500 — "override yok" sanılmaz.
 */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const { overrides, updatedAt } = await readCategoryThresholdsStrict();
    const categories = CHARACTER_CATEGORIES.map((c) => ({
      key: c.key,
      name: c.name,
      emoji: c.emoji,
      // Kod-içi varsayılanlar (override YOK varsayımıyla).
      defaultThreshold: categoryThreshold(c),
      defaultMinReviewLength: categoryMinReviewLength(c),
    }));

    return NextResponse.json({
      success: true,
      key: CATEGORY_THRESHOLDS_SETTING_KEY,
      categories,
      overrides,
      version: versionFromDate(updatedAt),
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Character thresholds fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Kategori eşikleri getirilemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * PUT — Override tablosunu kaydeder ({ overrides: { <categoryKey>: { threshold?, minReviewLength? } } }).
 * normalize whitelist uygular (bilinmeyen kategori/geçersiz değer atılır). `baseVersion` ZORUNLU
 * (uyuşmazlık → 409); yazma + audit tek transaction; ardından cache invalidate.
 */
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json().catch(() => null);
    const rawOverrides = (raw as { overrides?: unknown } | null)?.overrides;
    if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
      return NextResponse.json(
        { success: false, error: 'Override tablosu gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const baseVersion = readBaseVersion(raw);
    if (!baseVersion) return baseVersionRequiredResponse();
    const normalized = normalizeCategoryThresholds(rawOverrides);

    const saved = await prisma.$transaction(async (tx) => {
      const written = await writeVersionedSetting(tx, {
        key: CATEGORY_THRESHOLDS_SETTING_KEY,
        value: normalized as Prisma.InputJsonValue,
        category: CATEGORY_THRESHOLDS_SETTING_CATEGORY,
        baseVersion,
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE_CATEGORY_THRESHOLDS',
          entity: 'Settings',
          entityId: written.id,
          oldData: written.previous ?? Prisma.JsonNull,
          newData: normalized as Prisma.InputJsonValue,
          ...auditMeta,
        },
      });
      return written;
    });
    clearCategoryThresholdsCache();

    return NextResponse.json({
      success: true,
      key: saved.key,
      overrides: normalized,
      version: saved.version,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Character thresholds update error:', error);
    return NextResponse.json(
      { success: false, error: 'Kategori eşikleri güncellenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
