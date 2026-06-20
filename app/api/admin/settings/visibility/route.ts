import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_CATALOG_BY_ROLE,
  MENU_VISIBILITY_CONTRACT_VERSION,
  MENU_VISIBILITY_SETTINGS_KEY,
  normalizeVisibilitySettingsWithSystem,
  SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
} from '@/lib/visibility-controls';
import { MODULE_CATALOG } from '@/lib/module-controls';

export const dynamic = 'force-dynamic';

/**
 * Admin menü & özellik görünürlüğü.
 *
 * - GET: katalog + normalize edilmiş ayarlar + `meta` (sözleşme sürümü, anahtar sayıları).
 * - PUT: tam payload; menü/feature anahtarları `MODULE_CATALOG` ve `MENU_CATALOG_BY_ROLE` ile doğrulanır.
 * - Kayıtlı JSON’da fazladan / eski anahtarlar okumada yok sayılır; eksik anahtarlar `true` kabul edilir
 *   (`normalizeMenuVisibility` / `normalizeRoleVisibility` içinde `lib/visibility-controls.ts`).
 */
const roleSchema = z.object({}).catchall(z.boolean());
const payloadSchema = z.object({
  featureVisibility: z.object({
    dealer: roleSchema,
    customer: roleSchema,
  }),
  systemFeatureVisibility: roleSchema.optional().default({}),
  menuVisibility: z.object({
    dealer: roleSchema,
    customer: roleSchema,
  }),
});

type VisibilityPayload = z.infer<typeof payloadSchema>;

function validateVisibilityKeys(payload: VisibilityPayload): string[] {
  const errors: string[] = [];
  const allowedFeatureKeys = {
    dealer: new Set(MODULE_CATALOG.filter((item) => item.scope === 'dealer').map((item) => item.key)),
    customer: new Set(MODULE_CATALOG.filter((item) => item.scope === 'customer').map((item) => item.key)),
    system: new Set(
      MODULE_CATALOG.filter((item) => item.scope === 'admin' || item.scope === 'platform').map((item) => item.key)
    ),
  };
  const allowedMenuKeys = {
    dealer: new Set(MENU_CATALOG_BY_ROLE.dealer.map((item) => item.key)),
    customer: new Set(MENU_CATALOG_BY_ROLE.customer.map((item) => item.key)),
  };

  for (const role of ['dealer', 'customer'] as const) {
    for (const key of Object.keys(payload.featureVisibility[role])) {
      if (!allowedFeatureKeys[role].has(key)) errors.push(`featureVisibility.${role}.${key}`);
    }
    for (const key of Object.keys(payload.menuVisibility[role])) {
      if (!allowedMenuKeys[role].has(key)) errors.push(`menuVisibility.${role}.${key}`);
    }
  }
  for (const key of Object.keys(payload.systemFeatureVisibility)) {
    if (!allowedFeatureKeys.system.has(key)) errors.push(`systemFeatureVisibility.${key}`);
  }

  return errors;
}

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const [featureRow, menuRow, systemFeatureRow] = await Promise.all([
    prisma.settings.findUnique({
      where: { key: FEATURE_VISIBILITY_SETTINGS_KEY },
      select: { value: true },
    }),
    prisma.settings.findUnique({
      where: { key: MENU_VISIBILITY_SETTINGS_KEY },
      select: { value: true },
    }),
    prisma.settings.findUnique({
      where: { key: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY },
      select: { value: true },
    }),
  ]);

  const normalized = normalizeVisibilitySettingsWithSystem(featureRow?.value, menuRow?.value, systemFeatureRow?.value);

  return NextResponse.json({
    success: true,
    meta: {
      menuVisibilityContractVersion: MENU_VISIBILITY_CONTRACT_VERSION,
      menuItemCounts: {
        dealer: MENU_CATALOG_BY_ROLE.dealer.length,
        customer: MENU_CATALOG_BY_ROLE.customer.length,
      },
      settingsKeys: {
        featureVisibility: FEATURE_VISIBILITY_SETTINGS_KEY,
        menuVisibility: MENU_VISIBILITY_SETTINGS_KEY,
        systemFeatureVisibility: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
      },
    },
    catalog: {
      features: {
        dealer: MODULE_CATALOG.filter((item) => item.scope === 'dealer'),
        customer: MODULE_CATALOG.filter((item) => item.scope === 'customer'),
        system: MODULE_CATALOG.filter((item) => item.scope === 'admin' || item.scope === 'platform'),
      },
      menu: MENU_CATALOG_BY_ROLE,
    },
    ...normalized,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz görünürlük payload' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }
  const invalidKeys = validateVisibilityKeys(parsed.data);
  if (invalidKeys.length > 0) {
    return NextResponse.json(
      { success: false, error: 'Bilinmeyen görünürlük anahtarı', invalidKeys }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const normalized = normalizeVisibilitySettingsWithSystem(
    parsed.data.featureVisibility,
    parsed.data.menuVisibility,
    parsed.data.systemFeatureVisibility
  );

  const [featureExisting, menuExisting, systemFeatureExisting] = await Promise.all([
    prisma.settings.findUnique({
      where: { key: FEATURE_VISIBILITY_SETTINGS_KEY },
      select: { id: true, value: true },
    }),
    prisma.settings.findUnique({
      where: { key: MENU_VISIBILITY_SETTINGS_KEY },
      select: { id: true, value: true },
    }),
    prisma.settings.findUnique({
      where: { key: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY },
      select: { id: true, value: true },
    }),
  ]);

  const [featureSaved, menuSaved, systemFeatureSaved] = await prisma.$transaction([
    prisma.settings.upsert({
      where: { key: FEATURE_VISIBILITY_SETTINGS_KEY },
      create: {
        key: FEATURE_VISIBILITY_SETTINGS_KEY,
        category: 'admin',
        value: normalized.featureVisibility as Prisma.InputJsonValue,
      },
      update: {
        value: normalized.featureVisibility as Prisma.InputJsonValue,
      },
    }),
    prisma.settings.upsert({
      where: { key: MENU_VISIBILITY_SETTINGS_KEY },
      create: {
        key: MENU_VISIBILITY_SETTINGS_KEY,
        category: 'admin',
        value: normalized.menuVisibility as Prisma.InputJsonValue,
      },
      update: {
        value: normalized.menuVisibility as Prisma.InputJsonValue,
      },
    }),
    prisma.settings.upsert({
      where: { key: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY },
      create: {
        key: SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
        category: 'admin',
        value: normalized.featureVisibility.system as Prisma.InputJsonValue,
      },
      update: {
        value: normalized.featureVisibility.system as Prisma.InputJsonValue,
      },
    }),
  ]);

  await prisma.auditLog.createMany({
    data: [
      {
        userId: session.user.id,
        action: featureExisting ? 'update_feature_visibility' : 'create_feature_visibility',
        entity: 'settings',
        entityId: featureSaved.id,
        oldData: { [FEATURE_VISIBILITY_SETTINGS_KEY]: (featureExisting?.value ?? Prisma.JsonNull) } as Prisma.InputJsonValue,
        newData: { [FEATURE_VISIBILITY_SETTINGS_KEY]: normalized.featureVisibility } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
      {
        userId: session.user.id,
        action: systemFeatureExisting ? 'update_system_feature_visibility' : 'create_system_feature_visibility',
        entity: 'settings',
        entityId: systemFeatureSaved.id,
        oldData: {
          [SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY]: (systemFeatureExisting?.value ?? Prisma.JsonNull),
        } as Prisma.InputJsonValue,
        newData: {
          [SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY]: normalized.featureVisibility.system,
        } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
      {
        userId: session.user.id,
        action: menuExisting ? 'update_menu_visibility' : 'create_menu_visibility',
        entity: 'settings',
        entityId: menuSaved.id,
        oldData: { [MENU_VISIBILITY_SETTINGS_KEY]: (menuExisting?.value ?? Prisma.JsonNull) } as Prisma.InputJsonValue,
        newData: { [MENU_VISIBILITY_SETTINGS_KEY]: normalized.menuVisibility } as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    ],
  });

  // Module-gate görünürlük cache'ini geçersiz kıl.
  const { revalidateTag } = await import('next/cache');
  const { MODULE_GATE_CACHE_TAG } = await import('@/lib/module-gate');
  revalidateTag(MODULE_GATE_CACHE_TAG, 'max');

  return NextResponse.json({
    success: true,
    meta: {
      menuVisibilityContractVersion: MENU_VISIBILITY_CONTRACT_VERSION,
    },
    featureVisibility: normalized.featureVisibility,
    systemFeatureVisibility: normalized.featureVisibility.system,
    menuVisibility: normalized.menuVisibility,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
