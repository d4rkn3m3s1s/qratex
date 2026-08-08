/**
 * Menü / özellik görünürlüğü — tek doğruluk kaynağı bu dosyadaki kataloglardır.
 *
 * **Yeni bayi menü özelliği eklerken**
 * 1. `DEALER_MENU_CATALOG` içine `{ key, href, label, role: 'dealer' }` ekleyin (`key` snake_case, benzersiz).
 * 2. `components/dashboard/sidebar.tsx` → `dealerNavItems` içinde aynı `key` ve `href` ile satır ekleyin.
 * 3. `messages/en.json` & `messages/tr.json` → `sidebarNav.dealer.<labelKey>` çevirileri (sidebar `labelKey` kullanır).
 * 4. Gerekirse `app/dealer/...` sayfası ve API route’ları.
 *
 * Veritabanında kayıtlı `menuVisibility` eski anahtarları içerebilir; `normalizeMenuVisibility` yalnızca
 * katalogdaki anahtarları okur. Katalogda yeni olan anahtarlar DB’de yoksa **varsayılan açık** (`true`) sayılır.
 *
 * Admin: `GET/PUT /api/admin/settings/visibility` — payload’daki menü anahtarları katalog ile doğrulanır.
 * Bayi/müşteri: `GET /api/settings/visibility` — oturum rolüne göre ilgili `menuVisibility` haritası döner.
 */
import { MODULE_CATALOG, type ModuleScope, type ModuleControlsMap } from '@/lib/module-controls';

/** Admin API ve istemciler için sürüm; katalog yapısı değişince artırılabilir. */
export const MENU_VISIBILITY_CONTRACT_VERSION = 1;

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

export const DEALER_MENU_CATALOG: MenuItemCatalogItem[] = [
  { key: 'dashboard', href: '/dealer', label: 'Dashboard', role: 'dealer' },
  { key: 'business_outcomes', href: '/dealer/business-outcomes', label: 'İş Sonuçları', role: 'dealer' },
  { key: 'growth_hub', href: '/dealer/growth-hub', label: 'Büyüme merkezi', role: 'dealer' },
  { key: 'scan', href: '/dealer/scan', label: 'Kart Tara', role: 'dealer' },
  { key: 'products', href: '/dealer/products', label: 'Ürünlerim', role: 'dealer' },
  { key: 'qr_codes', href: '/dealer/qr-codes', label: 'QR Kodlar', role: 'dealer' },
  { key: 'consumptions', href: '/dealer/consumptions', label: 'Tüketim kayıtları', role: 'dealer' },
  { key: 'feedbacks', href: '/dealer/feedbacks', label: 'Geri Bildirimler', role: 'dealer' },
  { key: 'reviews', href: '/dealer/reviews', label: 'Yorumlar', role: 'dealer' },
  { key: 'remedy_queue', href: '/dealer/remedy-queue', label: 'Telafi merkezi', role: 'dealer' },
  { key: 'remedy_automation', href: '/dealer/remedy-automation', label: 'Telafi otomasyonu', role: 'dealer' },
  { key: 'analytics', href: '/dealer/analytics', label: 'Analitik', role: 'dealer' },
  { key: 'operations_brief', href: '/dealer/operations-brief', label: 'Operasyon özeti', role: 'dealer' },
  { key: 'campaigns', href: '/dealer/campaigns', label: 'Kampanyalar', role: 'dealer' },
  { key: 'innovation_hub', href: '/dealer/innovation', label: 'İnovasyon', role: 'dealer' },
  { key: 'surveys', href: '/dealer/surveys', label: 'Anketler', role: 'dealer' },
  { key: 'incidents', href: '/dealer/incidents', label: 'Olaylar', role: 'dealer' },
  { key: 'action_items', href: '/dealer/action-items', label: 'Aksiyonlar', role: 'dealer' },
  { key: 'churn_risk', href: '/dealer/churn-risk', label: 'Churn Risk', role: 'dealer' },
  { key: 'segment_actions', href: '/dealer/segment-actions', label: 'Segment Aksiyon Merkezi', role: 'dealer' },
  { key: 'roi', href: '/dealer/roi', label: 'ROI', role: 'dealer' },
  { key: 'benchmark', href: '/dealer/benchmark', label: 'Benchmark', role: 'dealer' },
  { key: 'copilot', href: '/dealer/copilot', label: 'Copilot', role: 'dealer' },
  { key: 'ai_chat', href: '/dealer/ai-chat', label: 'AI Sohbet', role: 'dealer' },
  { key: 'voc_wall', href: '/dealer/voc-wall', label: 'VoC Wall', role: 'dealer' },
  { key: 'heatmap', href: '/dealer/heatmap', label: 'Isı Haritası', role: 'dealer' },
  { key: 'radar', href: '/dealer/radar', label: 'Müşteri Radarı', role: 'dealer' },
  { key: 'ai_insights', href: '/dealer/ai-insights', label: 'AI İçgörüler', role: 'dealer' },
  { key: 'ai_settings', href: '/dealer/ai-settings', label: 'AI Ayarları', role: 'dealer' },
  { key: 'team', href: '/dealer/team', label: 'Personel', role: 'dealer' },
  { key: 'discover', href: '/dealer/discover', label: 'Keşfet', role: 'dealer' },
  { key: 'settings', href: '/dealer/settings', label: 'Ayarlar', role: 'dealer' },
];

export const CUSTOMER_MENU_CATALOG: MenuItemCatalogItem[] = [
  { key: 'dashboard', href: '/customer', label: 'Dashboard', role: 'customer' },
  { key: 'progress_hub', href: '/customer/progress-hub', label: 'Gelişim merkezi', role: 'customer' },
  { key: 'my_card', href: '/customer/my-card', label: 'Kartım', role: 'customer' },
  { key: 'consumptions', href: '/customer/consumptions', label: 'Tüketimlerim', role: 'customer' },
  { key: 'scan', href: '/customer/scan', label: 'QR Tara', role: 'customer' },
  { key: 'feedbacks', href: '/customer/feedbacks', label: 'Geri Bildirimlerim', role: 'customer' },
  { key: 'remedy', href: '/customer/remedy', label: 'Telafi Tekliflerim', role: 'customer' },
  { key: 'ai_insights', href: '/customer/ai-insights', label: 'AI Analizlerim', role: 'customer' },
  { key: 'trends', href: '/customer/trends', label: 'Trend Analizi', role: 'customer' },
  { key: 'journey_score', href: '/customer/journey-score', label: 'Yolculuk Skorum', role: 'customer' },
  { key: 'experiences', href: '/customer/experiences', label: 'Deneyimlerim', role: 'customer' },
  { key: 'nearby', href: '/customer/nearby', label: 'Yakınımdakiler', role: 'customer' },
  { key: 'analytics', href: '/customer/analytics', label: 'Kişisel Analitik', role: 'customer' },
  { key: 'spending_overview', href: '/customer/spending-overview', label: 'Harcama özeti', role: 'customer' },
  { key: 'badges', href: '/customer/badges', label: 'Rozetlerim', role: 'customer' },
  { key: 'shop', href: '/customer/shop', label: 'Avatar Dükkanı', role: 'customer' },
  { key: 'squads', href: '/customer/squads', label: 'Ekipler & Klanlar', role: 'customer' },
  { key: 'quests', href: '/customer/quests', label: 'Görevler', role: 'customer' },
  { key: 'rewards', href: '/customer/rewards', label: 'Ödüller', role: 'customer' },
  { key: 'surprise_boxes', href: '/customer/surprise-boxes', label: 'Sürpriz Kutularım', role: 'customer' },
  { key: 'campaigns', href: '/customer/campaigns', label: 'Kampanyalar & Davet', role: 'customer' },
  { key: 'donations', href: '/customer/donations', label: 'Sosyal Sorumluluk', role: 'customer' },
  { key: 'leaderboard', href: '/customer/leaderboard', label: 'Liderlik', role: 'customer' },
  { key: 'discover', href: '/customer/discover', label: 'Keşfet', role: 'customer' },
  { key: 'settings', href: '/customer/settings', label: 'Ayarlar', role: 'customer' },
];

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
