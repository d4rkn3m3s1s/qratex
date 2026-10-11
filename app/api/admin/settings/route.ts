import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { revalidatePublicThemeSettings } from '@/lib/revalidate-public-theme';
import {
  THEME_SETTINGS_CATEGORY,
  THEME_SETTINGS_KEYS,
} from '@/lib/theme-settings-keys';
import { updateSettingsSchema } from '@/lib/validations';
import { adminSettingsBatchSchema } from '@/lib/validations-admin';
import { Prisma } from '@prisma/client';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import {
  getDefaultPointsMatrix,
  normalizePointsMatrix,
  POINTS_MATRIX_SETTING_KEY,
} from '@/lib/points-rules';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
// P0-01: gizli kapı ayarı bu genel uçtan okunamaz/yazılamaz (yalnız kendi uçları).
import { PROTECTED_SETTING_KEYS, isProtectedSettingKey as isGateProtectedKey } from '@/lib/admin-gate';
// B4: eski ekranın düz metin yazdığı OpenAI anahtarı vb. listelenmez/yazılmaz.
import { RETIRED_SECRET_SETTING_KEYS, isDedicatedSettingKey } from '@/lib/platform-settings/registry';

const HIDDEN_SETTING_KEYS = [...PROTECTED_SETTING_KEYS, ...RETIRED_SECRET_SETTING_KEYS];
/** Yazma yasağı: gizli kapı, emekli sır anahtarları ve kendi uçları olan kayıt defteri/güven anahtarları. */
function isProtectedSettingKey(key: unknown): boolean {
  return (
    isGateProtectedKey(key) ||
    (typeof key === 'string' && RETIRED_SECRET_SETTING_KEYS.has(key.trim())) ||
    isDedicatedSettingKey(key)
  );
}
import {
  isVersionConflictError,
  readBaseVersion,
  readBaseVersionMap,
  versionConflictResponse,
  versionFromDate,
  writeVersionedSetting,
  writeVersionedSettingsBatch,
} from '@/lib/settings-version';

const SETTINGS_LIST_SELECT = {
  id: true,
  key: true,
  category: true,
  value: true,
  updatedAt: true,
} as const;

const THEME_SETTING_KEYS = new Set<string>(Object.values(THEME_SETTINGS_KEYS));

function isThemeSetting(key: string, category: string): boolean {
  return category === THEME_SETTINGS_CATEGORY || THEME_SETTING_KEYS.has(key);
}

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────
// GET /api/admin/settings - Get all settings
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

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
      where: { AND: [where as Prisma.SettingsWhereInput, { key: { notIn: HIDDEN_SETTING_KEYS } }] },
      orderBy: { category: 'asc' },
      select: SETTINGS_LIST_SELECT,
      take: 5000,
    });

    // If specific key requested, return single value
    if (key && settings.length === 1) {
      return NextResponse.json(
        { setting: { ...settings[0], version: versionFromDate(settings[0].updatedAt) } },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (key === POINTS_MATRIX_SETTING_KEY && settings.length === 0) {
      return NextResponse.json(
        {
          setting: {
            key: POINTS_MATRIX_SETTING_KEY,
            value: getDefaultPointsMatrix(),
            category: 'gamification',
          },
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Group by category
    const grouped = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = {};
      }
      acc[setting.category][setting.key] = setting.value;
      return acc;
    }, {} as Record<string, Record<string, unknown>>);

    const entries = settings.map((s) => ({
      id: s.id,
      key: s.key,
      category: s.category,
      value: s.value,
      updatedAt: s.updatedAt,
      // İyimser kilit (P0-28): istemci kaydederken bunu `baseVersions[key]` olarak geri gönderir.
      version: versionFromDate(s.updatedAt),
    }));

    return NextResponse.json(
      {
        settings: grouped,
        entries,
        meta: { keysCount: settings.length },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Ayarlar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/settings - Update a setting
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = updateSettingsSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { key, value, category } = validatedData.data;
    if (isProtectedSettingKey(key)) {
      return NextResponse.json(
        { error: 'Bu ayar yalnız kendi ekranından değiştirilebilir.', code: 'PROTECTED_SETTING' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const normalizedValue =
      key === POINTS_MATRIX_SETTING_KEY ? normalizePointsMatrix(value) : value;

    // `baseVersion` verilirse sürüm kontrolü (uyuşmazlık → 409); verilmezse eski davranış
    // (tema/ajan ayarları gibi eski istemciler). Her iki yolda da yazma + audit tek transaction.
    const baseVersion = readBaseVersion(body);
    const { setting, resolvedCategory } = await prisma.$transaction(async (tx) => {
      const existingSetting = await tx.settings.findUnique({ where: { key } });
      const resolvedCategory =
        category ||
        existingSetting?.category ||
        (key === POINTS_MATRIX_SETTING_KEY ? 'gamification' : 'general');

      let saved: { id: string; key: string; category: string; value: Prisma.JsonValue; updatedAt: Date };
      let oldDataValue: Prisma.JsonValue | null | undefined = existingSetting?.value;
      if (baseVersion) {
        const written = await writeVersionedSetting(tx, {
          key,
          value: normalizedValue as Prisma.InputJsonValue,
          category: resolvedCategory,
          baseVersion,
        });
        oldDataValue = written.previous;
        saved = await tx.settings.findUniqueOrThrow({ where: { key }, select: SETTINGS_LIST_SELECT });
      } else {
        saved = await tx.settings.upsert({
          where: { key },
          update: {
            value: normalizedValue as Prisma.InputJsonValue,
            category: resolvedCategory,
          },
          create: {
            key,
            value: normalizedValue as Prisma.InputJsonValue,
            category: resolvedCategory,
          },
          select: SETTINGS_LIST_SELECT,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: existingSetting ? 'update' : 'create',
          entity: 'settings',
          entityId: saved.id,
          oldData: oldDataValue !== null && oldDataValue !== undefined
            ? oldDataValue as Prisma.InputJsonValue
            : Prisma.JsonNull,
          newData: normalizedValue as Prisma.InputJsonValue,
          ...auditMeta,
        },
      });
      return { setting: saved, resolvedCategory };
    });

    revalidateTag('settings', 'max');
    if (isThemeSetting(key, resolvedCategory)) {
      revalidatePublicThemeSettings();
    }
    return NextResponse.json(
      { success: true, setting: { ...setting, version: versionFromDate(setting.updatedAt) } },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Error updating setting:', error);
    return NextResponse.json(
      { error: 'Ayar güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/settings/batch - Batch update settings
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const rl = checkAdminRateLimit(session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            ...(rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : {}),
          },
        }
      );
    }

    const raw = await request.json();
    const parsed = adminSettingsBatchSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? 'Geçersiz istek';
      return NextResponse.json(
        { error: msg, details: parsed.error.flatten() },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { settings } = parsed.data;
    if (settings.some((s: { key: string }) => isProtectedSettingKey(s.key))) {
      return NextResponse.json(
        { error: 'Bu ayar yalnız kendi ekranından değiştirilebilir.', code: 'PROTECTED_SETTING' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    // İsteğe bağlı iyimser kilit (P0-28): `baseVersions: { [key]: version }`. Verilen her anahtar
    // kilit altında kontrol edilir; biri bile uyuşmazsa HİÇBİRİ yazılmaz (409). Vermeyen eski
    // istemciler (tema, ajan ağırlıkları) koşulsuz yazmaya devam eder.
    const baseVersions = readBaseVersionMap(raw);
    const valueFor = (s: { key: string; value?: unknown }) =>
      (s.key === POINTS_MATRIX_SETTING_KEY
        ? normalizePointsMatrix(s.value)
        : s.value ?? {}) as Prisma.InputJsonValue;

    const batch = await prisma.$transaction(async (tx) => {
      const written = await writeVersionedSettingsBatch(
        tx,
        settings.map((s: { key: string; value?: unknown; category?: string }) => ({
          key: s.key,
          value: valueFor(s),
          categoryOnCreate:
            s.category || (s.key === POINTS_MATRIX_SETTING_KEY ? 'gamification' : 'general'),
          baseVersion: baseVersions[s.key] ?? null,
        }))
      );
      const newMap = settings.reduce<Record<string, unknown>>((acc, row) => {
        acc[row.key] = valueFor(row);
        return acc;
      }, {});

      // Create single audit log for batch update (aynı transaction)
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'batch_update',
          entity: 'settings',
          oldData: written.previous as Prisma.InputJsonValue,
          newData: newMap as Prisma.InputJsonValue,
          ...auditMeta,
        },
      });
      return written;
    });

    revalidateTag('settings', 'max');
    if (settings.some((s: { key: string }) => THEME_SETTING_KEYS.has(s.key))) {
      revalidatePublicThemeSettings();
    }
    return NextResponse.json(
      { success: true, count: batch.count, versions: batch.versions },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isVersionConflictError(error)) return versionConflictResponse(error);
    console.error('Error batch updating settings:', error);
    return NextResponse.json(
      { error: 'Ayarlar toplu güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
