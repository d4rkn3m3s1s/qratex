/**
 * `settings` tablosu / API — `category: 'theme'` satırlarının `key` değerleri (tek kaynak).
 */
export type ThemeSettingRow = { key: string; value: unknown };

export const THEME_SETTINGS_CATEGORY = 'theme' as const;

/** `unstable_cache` / `revalidateTag` — kök layout + GET /api/settings/theme */
export const PUBLIC_THEME_SETTINGS_CACHE_TAG = 'public-theme-settings' as const;

export const THEME_SETTINGS_KEYS = {
  activeTheme: 'activeTheme',
  customColors: 'customColors',
  defaultMode: 'defaultMode',
} as const;

/** Açık tema ayarları (GET) — `{ entries: ThemeSettingRow[] }`; eski istemciler için `raw` yedek okunur. */
export const THEME_SETTINGS_PUBLIC_API_PATH = '/api/settings/theme' as const;

/** Admin tema listesi / kayıt */
export const THEME_SETTINGS_ADMIN_API_BASE = '/api/admin/settings' as const;

/** Eski tek JSON satırı (seed); runtime `THEME_SETTINGS_KEYS` ile ayrı satırlar kullanır. */
export const THEME_LEGACY_CONFIG_SETTING_KEY = 'theme_config' as const;

/** `GET` — admin tema ayarlarını kategoriyle çeker */
export function themeAdminSettingsListUrl(): string {
  return `${THEME_SETTINGS_ADMIN_API_BASE}?category=${THEME_SETTINGS_CATEGORY}`;
}
