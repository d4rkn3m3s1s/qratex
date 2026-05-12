import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MODULE_CATALOG, MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_VISIBILITY_SETTINGS_KEY,
  normalizeVisibilitySettingsWithSystem,
  SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY,
  type FeatureVisibilityRole,
  type VisibilityRole,
} from '@/lib/visibility-controls';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export async function getModuleControls() {
  const row = await prisma.settings.findUnique({
    where: { key: MODULE_CONTROLS_SETTINGS_KEY },
    select: { value: true },
  });
  return normalizeModuleControls(row?.value);
}

type RequestMetaSource = {
  headers: {
    get(name: string): string | null;
  };
};

type ModuleGateOptions = {
  role?: FeatureVisibilityRole;
  request?: RequestMetaSource;
  userId?: string | null;
  routeKey?: string;
};

async function getVisibilitySettings() {
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
  return normalizeVisibilitySettingsWithSystem(featureRow?.value, menuRow?.value, systemFeatureRow?.value);
}

export async function assertModuleEnabled(moduleKey: string, options: ModuleGateOptions = {}) {
  const controls = await getModuleControls();
  const visibility = await getVisibilitySettings();
  const explicitRole = options.role;
  const moduleScope = MODULE_CATALOG.find((item) => item.key === moduleKey)?.scope;
  const role: FeatureVisibilityRole | undefined =
    explicitRole ?? (moduleScope === 'admin' || moduleScope === 'platform' ? 'system' : undefined);

  const blockedByGlobalControl = controls[moduleKey] === false;
  const blockedByRoleVisibility = role ? visibility.featureVisibility[role]?.[moduleKey] === false : false;

  if (blockedByGlobalControl || blockedByRoleVisibility) {
    const reason = blockedByGlobalControl ? 'module_disabled_globally' : 'module_disabled_for_role';
    await prisma.analyticsEvent.create({
      data: {
        userId: options.userId || null,
        event: 'module_gate_blocked',
        category: 'module_gate',
        data: {
          moduleKey,
          reason,
          role: role ?? null,
          routeKey: options.routeKey ?? null,
          ...getAuditRequestMeta(options.request ?? { headers: { get: () => null } }),
        } as object,
      },
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Bu modül yönetici tarafından geçici olarak devre dışı bırakıldı.',
        moduleKey,
        reason,
      },
      { status: 403 }
    );
  }
  return null;
}

export async function assertMenuItemVisible(
  menuKey: string,
  role: VisibilityRole,
  options: Omit<ModuleGateOptions, 'role'> = {}
) {
  const visibility = await getVisibilitySettings();
  if (visibility.menuVisibility[role]?.[menuKey] === false) {
    await prisma.analyticsEvent.create({
      data: {
        userId: options.userId || null,
        event: 'menu_visibility_blocked',
        category: 'menu_visibility',
        data: {
          menuKey,
          role,
          reason: 'menu_hidden_for_role',
          routeKey: options.routeKey ?? null,
          ...getAuditRequestMeta(options.request ?? { headers: { get: () => null } }),
        } as object,
      },
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Bu sayfa yönetici tarafından geçici olarak gizlendi.',
        menuKey,
        reason: 'menu_hidden_for_role',
      },
      { status: 403 }
    );
  }
  return null;
}
