/**
 * Menü / özellik görünürlüğü.
 *
 * **Menü kataloğu artık `lib/navigation/registry.ts`'ten TÜRETİLİR** (tek navigasyon kaydı,
 * yol haritası §4.3). Admin'in gizleyebildiği her öğe, kayıtta `menuKey` taşıyan bayi/müşteri
 * rotasıdır; anahtar adları DB'deki eski değerler bozulmasın diye eski katalog anahtarlarıyla
 * aynı tutulur (ör. Cüzdan → Kartım = `my_card`). Yeni öğe eklemek için yalnız kayda satır
 * ekleyin; sidebar, alt sekme, ⌘K ve bu katalog kendiliğinden güncellenir. Koruma testi:
 * `__tests__/menu-visibility-catalog.test.ts` (`npm run verify:menu`).
 *
 * Veritabanında kayıtlı `menuVisibility` eski anahtarları içerebilir; `normalizeMenuVisibility` yalnızca
 * katalogdaki anahtarları okur. Katalogda yeni olan anahtarlar DB’de yoksa **varsayılan açık** (`true`) sayılır.
 *
 * Admin: `GET/PUT /api/admin/settings/visibility` — payload’daki menü anahtarları katalog ile doğrulanır.
 * Bayi/müşteri: menü sunucuda `getShellConfig` ile çözülür (istemci isteği yok).
 */
import { MODULE_CATALOG, type ModuleScope, type ModuleControlsMap } from '@/lib/module-controls';
import { MENU_STATUSES, routesForRole } from '@/lib/navigation/registry';

/** Admin API ve istemciler için sürüm; katalog yapısı değişince artırılabilir. */
export const MENU_VISIBILITY_CONTRACT_VERSION = 3;

export type VisibilityRole = 'dealer' | 'customer';
export type FeatureVisibilityRole = VisibilityRole | 'system';

export type MenuItemCatalogItem = {
  key: string;
  href: string;
  label: string;
  role: VisibilityRole;
};

export type RoleVisibilityMap = Record<string, boolean>;

export type VisibilitySettings = {
  featureVisibility: Record<FeatureVisibilityRole, RoleVisibilityMap>;
  menuVisibility: Record<VisibilityRole, RoleVisibilityMap>;
};

export const FEATURE_VISIBILITY_SETTINGS_KEY = 'featureVisibility';
export const MENU_VISIBILITY_SETTINGS_KEY = 'menuVisibility';
export const SYSTEM_FEATURE_VISIBILITY_SETTINGS_KEY = 'systemFeatureVisibility';

/** Kayıttan: menüde görünen (primary/secondary) ve `menuKey` taşıyan rotalar. */
function catalogFromRegistry(role: VisibilityRole): MenuItemCatalogItem[] {
  return routesForRole(role)
    .filter((r) => r.menuKey && MENU_STATUSES.has(r.status))
    .map((r) => ({ key: r.menuKey as string, href: r.href, label: r.label.tr, role }));
}

// Sürüm 3: kayıttan türetildi. Birleşen sayfaların anahtarları (ör. journey_score, radar)
// düştü; yeni yüzeyler (wallet, me, offers, auto_replies, alerts) eklendi.
export const DEALER_MENU_CATALOG: MenuItemCatalogItem[] = catalogFromRegistry('dealer');

export const CUSTOMER_MENU_CATALOG: MenuItemCatalogItem[] = catalogFromRegistry('customer');

export const MENU_CATALOG_BY_ROLE: Record<VisibilityRole, MenuItemCatalogItem[]> = {
  dealer: DEALER_MENU_CATALOG,
  customer: CUSTOMER_MENU_CATALOG,
};

function featureKeysForRole(role: VisibilityRole): string[] {
  const scope: ModuleScope = role;
  return MODULE_CATALOG.filter((item) => item.scope === scope).map((item) => item.key);
}

function featureKeysForSystem(): string[] {
  return MODULE_CATALOG.filter((item) => item.scope === 'admin' || item.scope === 'platform').map((item) => item.key);
}

function menuKeysForRole(role: VisibilityRole): string[] {
  return MENU_CATALOG_BY_ROLE[role].map((item) => item.key);
}

/** Katalogla hizalı menü anahtarları (normalizasyon / testler için). */
export function getMenuCatalogKeys(role: VisibilityRole): string[] {
  return menuKeysForRole(role);
}

function normalizeRoleVisibility(raw: unknown, allowedKeys: string[]): RoleVisibilityMap {
  const normalized: RoleVisibilityMap = Object.fromEntries(allowedKeys.map((key) => [key, true]));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalized;
  const src = raw as Record<string, unknown>;
  for (const key of allowedKeys) {
    if (typeof src[key] === 'boolean') normalized[key] = src[key];
  }
  return normalized;
}

export function getDefaultVisibilitySettings(): VisibilitySettings {
  return {
    featureVisibility: {
      dealer: normalizeRoleVisibility(null, featureKeysForRole('dealer')),
      customer: normalizeRoleVisibility(null, featureKeysForRole('customer')),
      system: normalizeRoleVisibility(null, featureKeysForSystem()),
    },
    menuVisibility: {
      dealer: normalizeRoleVisibility(null, menuKeysForRole('dealer')),
      customer: normalizeRoleVisibility(null, menuKeysForRole('customer')),
    },
  };
}

export function normalizeFeatureVisibility(
  roleRaw: unknown,
  systemRaw: unknown
): Record<FeatureVisibilityRole, RoleVisibilityMap> {
  return {
    dealer: normalizeRoleVisibility((roleRaw as Record<string, unknown> | null)?.dealer, featureKeysForRole('dealer')),
    customer: normalizeRoleVisibility((roleRaw as Record<string, unknown> | null)?.customer, featureKeysForRole('customer')),
    system: normalizeRoleVisibility(systemRaw, featureKeysForSystem()),
  };
}

export function normalizeMenuVisibility(raw: unknown): Record<VisibilityRole, RoleVisibilityMap> {
  return {
    dealer: normalizeRoleVisibility((raw as Record<string, unknown> | null)?.dealer, menuKeysForRole('dealer')),
    customer: normalizeRoleVisibility((raw as Record<string, unknown> | null)?.customer, menuKeysForRole('customer')),
  };
}

export function normalizeVisibilitySettings(featureRaw: unknown, menuRaw: unknown): VisibilitySettings {
  return {
    featureVisibility: normalizeFeatureVisibility(featureRaw, null),
    menuVisibility: normalizeMenuVisibility(menuRaw),
  };
}

export function normalizeVisibilitySettingsWithSystem(
  roleFeatureRaw: unknown,
  menuRaw: unknown,
  systemFeatureRaw: unknown
): VisibilitySettings {
  return {
    featureVisibility: normalizeFeatureVisibility(roleFeatureRaw, systemFeatureRaw),
    menuVisibility: normalizeMenuVisibility(menuRaw),
  };
}

export function isFeatureVisible(
  moduleControls: ModuleControlsMap,
  featureVisibility: Record<FeatureVisibilityRole, RoleVisibilityMap>,
  role: FeatureVisibilityRole,
  featureKey: string
): boolean {
  const globallyEnabled = moduleControls[featureKey] !== false;
  const roleEnabled = featureVisibility[role]?.[featureKey] !== false;
  return globallyEnabled && roleEnabled;
}

export function isMenuItemVisible(
  menuVisibility: Record<VisibilityRole, RoleVisibilityMap>,
  role: VisibilityRole,
  menuKey: string
): boolean {
  return menuVisibility[role]?.[menuKey] !== false;
}
