import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  getCategoryThresholdOverrides,
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
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET — Karakter kategori eşiği/uzunluk ayarları. Her kategori için kod-içi DEFAULT
 * (gizemli=20, diğer=6) + admin OVERRIDE'ı döndürür (UI ikisini de gösterir).
 */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const overrides = await getCategoryThresholdOverrides();
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
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Character thresholds fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Kategori eşikleri getirilemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * PUT — Override tablosunu kaydeder ({ overrides: { <categoryKey>: { threshold?, minReviewLength? } } }).
 * normalize whitelist uygular (bilinmeyen kategori/geçersiz değer atılır). Audit + cache invalidate.
 */
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const raw = await request.json().catch(() => ({}));
    const normalized = normalizeCategoryThresholds((raw as { overrides?: unknown })?.overrides);

    const previous = await prisma.settings.findUnique({
      where: { key: CATEGORY_THRESHOLDS_SETTING_KEY },
    });

    const saved = await prisma.settings.upsert({
      where: { key: CATEGORY_THRESHOLDS_SETTING_KEY },
      update: { value: normalized as Prisma.InputJsonValue, category: CATEGORY_THRESHOLDS_SETTING_CATEGORY },
      create: {
        key: CATEGORY_THRESHOLDS_SETTING_KEY,
        value: normalized as Prisma.InputJsonValue,
        category: CATEGORY_THRESHOLDS_SETTING_CATEGORY,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_CATEGORY_THRESHOLDS',
        entity: 'Settings',
        entityId: saved.id,
        oldData: previous?.value ?? Prisma.JsonNull,
        newData: normalized as Prisma.InputJsonValue,
        ...auditMeta,
      },
    });
    clearCategoryThresholdsCache();

    return NextResponse.json({
      success: true,
      key: saved.key,
      overrides: normalized,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Character thresholds update error:', error);
    return NextResponse.json(
      { success: false, error: 'Kategori eşikleri güncellenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
