/**
 * `getShellConfig(role)` — panel kabuğunun menüsü SUNUCUDA, önbellekli çözülür
 * (yol haritası §4.3, ilke 11). Önceden her panel açılışında istemci 3 istekle
 * 5 önbelleksiz DB sorgusu yapıyordu (B8); şimdi tek `findMany`, 5 dk önbellek,
 * admin kaydedince `revalidateTag(NAV_SETTINGS_TAG)` ile anında tazelenir.
 *
 * FAIL-SAFE: DB erişilemezse kabuk varsayılan (her şey açık) menüyle çizilir —
 * görünürlük yalnız menü düzeyidir; asıl erişim kararı API'lerin modül kapısındadır.
 */
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { MODULE_GATE_CACHE_TAG } from '@/lib/module-gate';
import { MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_VISIBILITY_SETTINGS_KEY,
  normalizeVisibilitySettings,
} from '@/lib/visibility-controls';
import { SIDEBAR_NAV_ORDER_SETTINGS_KEY, normalizeSidebarNavOrder } from '@/lib/sidebar-order-settings';
import { SIDEBAR_NAV_GROUPS_SETTINGS_KEY, normalizeSidebarNavGroups } from '@/lib/sidebar-groups-settings';
import { buildShellConfig, type NavSettingsSnapshot, type ShellConfig } from './shell-config';
import type { NavRole } from './registry';
import { NAV_SETTINGS_TAG } from './cache-tags';

export { NAV_SETTINGS_TAG };

const NAV_SETTING_KEYS = [
  SIDEBAR_NAV_ORDER_SETTINGS_KEY,
  SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
  MENU_VISIBILITY_SETTINGS_KEY,
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MODULE_CONTROLS_SETTINGS_KEY,
];

/** Ayar satırlarını rol anlık görüntüsüne çevirir (saf; test edilir). */
export function snapshotFromRows(role: NavRole, rows: { key: string; value: unknown }[]): NavSettingsSnapshot {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const order = normalizeSidebarNavOrder(byKey.get(SIDEBAR_NAV_ORDER_SETTINGS_KEY));
  const groups = normalizeSidebarNavGroups(byKey.get(SIDEBAR_NAV_GROUPS_SETTINGS_KEY));
  const visibility = normalizeVisibilitySettings(
    byKey.get(FEATURE_VISIBILITY_SETTINGS_KEY),
    byKey.get(MENU_VISIBILITY_SETTINGS_KEY)
  );
  const moduleControls = normalizeModuleControls(byKey.get(MODULE_CONTROLS_SETTINGS_KEY));
  const visRole = role === 'dealer' || role === 'customer' ? role : null;
  const groupRole = role === 'staff' ? null : role;
  return {
    order: role === 'staff' ? null : order[role] ?? null,
    groups: groupRole ? groups[groupRole] ?? null : null,
    menuVisibility: visRole ? visibility.menuVisibility[visRole] : null,
    featureVisibility: visRole ? visibility.featureVisibility[visRole] : null,
    moduleControls,
  };
}

export async function loadShellConfig(role: NavRole): Promise<ShellConfig> {
  try {
    const rows = await prisma.settings.findMany({
      where: { key: { in: NAV_SETTING_KEYS } },
      select: { key: true, value: true },
    });
    return buildShellConfig(role, snapshotFromRows(role, rows));
  } catch (error) {
    console.warn('[navigation] kabuk ayarları okunamadı; varsayılan menü kullanılıyor:', error);
    return buildShellConfig(role, {});
  }
}

const cachedByRole = cache((role: NavRole) =>
  unstable_cache(() => loadShellConfig(role), ['nav-shell', role], {
    revalidate: 300,
    tags: [NAV_SETTINGS_TAG, MODULE_GATE_CACHE_TAG],
  })()
);

export async function getShellConfig(role: NavRole): Promise<ShellConfig> {
  return cachedByRole(role);
}
