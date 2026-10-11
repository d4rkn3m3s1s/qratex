/**
 * PLATFORM AYAR KAYIT DEFTERİ (a-ayarlar-kapi, B8/B10).
 *
 * Kural: OKUYUCUSU OLMAYAN AYAR BU DEFTERE GİREMEZ. Her anahtar için:
 *  - `section`  → /admin/settings'teki bölüm (genel · kimlik · bakım)
 *  - `schema`   → yazmada zod doğrulaması (uymayan değer 400)
 *  - `parse`    → okumada güvenli yorum (bozuk değer → varsayılan)
 *  - `readers`  → değeri GERÇEKTEN okuyan kod yolları (test bunları dosya sisteminde arar)
 *
 * Eski sahte alanlar (siteName, primaryColor, openaiApiKey, pointsPerFeedback, …) deftere
 * alınmadı; DB satırları silinmedi (cascade/temizlik yok), yalnız hiçbir ekran yazmıyor.
 *
 * ÖNEMLİ: Bakım/kayıt/Google anahtarları eskiden SAHTE idi ve `maintenanceMode` /
 * `enableRegistration` / `enableGoogleAuth` adlarıyla rastgele değerlerde kaydedilmiş olabilir.
 * Gerçek etki kazandıkları için YENİ anahtar adları kullanılır — dağıtım anında eski bir
 * "kapalı" değer siteyi kendiliğinden bakıma almaz / kaydı kapatmaz.
 *
 * Bu dosya istemci-güvenlidir (prisma/node API yok).
 */
import { z } from 'zod';

export const BACKGROUND_EFFECTS = [
  'original',
  'aurora',
  'sparkles',
  'beams',
  'gradient',
  'meteors',
  'grid',
  'dots',
  'matrix',
  'particles',
  'waves',
  'starfield',
  'cyberpunk',
  'geometric',
  'fireflies',
  'christmas',
  'valentine',
  'birthday',
  'nebula',
  'northern-lights',
  'holographic',
  'galaxy',
  'summer',
  'winter',
  'autumn',
  'spring',
  'ice-kingdom',
  'none',
] as const;
export type BackgroundEffect = (typeof BACKGROUND_EFFECTS)[number];

export const MAINTENANCE_MESSAGE_MAX = 280;

export const maintenanceSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().trim().max(MAINTENANCE_MESSAGE_MAX, `Mesaj en fazla ${MAINTENANCE_MESSAGE_MAX} karakter olabilir.`),
    /** Planlanan bitiş (ISO). Yalnız bilgi amaçlı; bakım elle kapatılır. */
    plannedEndAt: z
      .string()
      .datetime({ offset: true, message: 'Bitiş zamanı geçersiz.' })
      .nullable(),
  })
  .strict();
export type MaintenanceState = z.infer<typeof maintenanceSchema>;
export const MAINTENANCE_DEFAULT: MaintenanceState = { enabled: false, message: '', plannedEndAt: null };

export type SettingSection = 'genel' | 'kimlik' | 'bakim';

interface RegistryEntry<T> {
  key: string;
  section: SettingSection;
  label: string;
  /** Bu ayarın gerçek etkisi (ekranda anahtarın yanında gösterilir). */
  effect: string;
  schema: z.ZodType<T>;
  default: T;
  parse: (raw: unknown) => T;
  /** Değeri okuyan dosyalar (depo köküne göre; test bunların varlığını ve anahtarı içerdiğini doğrular). */
  readers: string[];
  /** Kaydedilince temizlenecek önbellek etiketleri. */
  cacheTags: string[];
  /** Kayıtta yeni Settings satırı açılırsa kategori. */
  category: string;
}

function parseBool(def: boolean) {
  return (raw: unknown): boolean => {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return def;
  };
}

export function parseMaintenance(raw: unknown): MaintenanceState {
  const r = maintenanceSchema.safeParse(raw);
  return r.success ? r.data : { ...MAINTENANCE_DEFAULT };
}

export function parseBackgroundEffect(raw: unknown): BackgroundEffect {
  const v =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && typeof (raw as { value?: unknown }).value === 'string'
        ? (raw as { value: string }).value
        : null;
  return v && (BACKGROUND_EFFECTS as readonly string[]).includes(v) ? (v as BackgroundEffect) : 'original';
}

export const SETTINGS_KEYS = {
  backgroundEffect: 'backgroundEffect',
  registrationOpen: 'platform_registration_open',
  googleAuth: 'platform_google_auth',
  magicLink: 'enableMagicLink',
  maintenance: 'platform_maintenance',
} as const;

export const PLATFORM_SETTINGS = {
  [SETTINGS_KEYS.backgroundEffect]: {
    key: SETTINGS_KEYS.backgroundEffect,
    section: 'genel',
    label: 'Ana sayfa arka plan efekti',
    effect: 'Herkese açık ana sayfanın arka plan animasyonu. Etkin bir dönemsel konsept varsa o efekt öne geçer.',
    schema: z.enum(BACKGROUND_EFFECTS),
    default: 'original',
    parse: parseBackgroundEffect,
    readers: ['lib/get-background-effect.ts', 'lib/background-effect-shared.ts'],
    cacheTags: ['settings'],
    category: 'appearance',
  } satisfies RegistryEntry<BackgroundEffect>,
  [SETTINGS_KEYS.registrationOpen]: {
    key: SETTINGS_KEYS.registrationOpen,
    section: 'kimlik',
    label: 'Yeni kayıtlar',
    effect: 'Kapalıyken e-posta ile kayıt reddedilir ve Google ile ilk kez gelen hesap açılamaz. Mevcut hesaplar giriş yapabilir.',
    schema: z.boolean(),
    default: true,
    parse: parseBool(true),
    readers: ['lib/platform-settings/flags.ts', 'app/api/auth/register/route.ts', 'lib/auth.ts'],
    cacheTags: [],
    category: 'auth',
  } satisfies RegistryEntry<boolean>,
  [SETTINGS_KEYS.googleAuth]: {
    key: SETTINGS_KEYS.googleAuth,
    section: 'kimlik',
    label: 'Google ile giriş',
    effect: 'Kapalıyken Google düğmesi giriş ve kayıt ekranlarından kalkar, Google ile giriş denemesi reddedilir.',
    schema: z.boolean(),
    default: true,
    parse: parseBool(true),
    readers: ['lib/platform-settings/flags.ts', 'lib/auth.ts', 'components/auth/p-auth/server-data.ts'],
    cacheTags: [],
    category: 'auth',
  } satisfies RegistryEntry<boolean>,
  [SETTINGS_KEYS.magicLink]: {
    key: SETTINGS_KEYS.magicLink,
    section: 'kimlik',
    label: 'Bağlantıyla giriş (magic link)',
    effect: 'Açıkken giriş ekranında e-postaya tek kullanımlık giriş bağlantısı gönderilebilir. E-posta gönderimi yapılandırılmamışsa açık olsa da görünmez.',
    schema: z.boolean(),
    default: false,
    parse: parseBool(false),
    readers: ['app/api/auth/magic-link/route.ts', 'components/auth/p-auth/server-data.ts'],
    cacheTags: [],
    category: 'auth',
  } satisfies RegistryEntry<boolean>,
  [SETTINGS_KEYS.maintenance]: {
    key: SETTINGS_KEYS.maintenance,
    section: 'bakim',
    label: 'Bakım modu',
    effect: 'Açıkken müşteri ve bayi panelleri bakım ekranına yönlenir, panel API uçları 503 döner. Yöneticiler etkilenmez; herkese açık sayfalar açık kalır.',
    schema: maintenanceSchema,
    default: MAINTENANCE_DEFAULT,
    parse: parseMaintenance,
    readers: ['lib/platform-settings/maintenance-edge.ts', 'proxy.ts', 'app/bakim/page.tsx'],
    cacheTags: [],
    category: 'platform',
  } satisfies RegistryEntry<MaintenanceState>,
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS;
export type PlatformSettingValues = {
  backgroundEffect: BackgroundEffect;
  platform_registration_open: boolean;
  platform_google_auth: boolean;
  enableMagicLink: boolean;
  platform_maintenance: MaintenanceState;
};

export const PLATFORM_SETTING_KEYS = Object.keys(PLATFORM_SETTINGS) as PlatformSettingKey[];

export function isPlatformSettingKey(key: unknown): key is PlatformSettingKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_SETTINGS, key);
}

/** Ham DB değerini kayıt defteri üzerinden yorumlar (bozuksa varsayılan). */
export function parsePlatformSetting<K extends PlatformSettingKey>(key: K, raw: unknown): PlatformSettingValues[K] {
  const entry = PLATFORM_SETTINGS[key] as unknown as RegistryEntry<PlatformSettingValues[K]>;
  if (raw === undefined || raw === null) return entry.default;
  return entry.parse(raw);
}

/** Yazma doğrulaması: geçerliyse temiz değer, değilse Türkçe hata mesajı. */
export function validatePlatformSetting(
  key: PlatformSettingKey,
  value: unknown
): { ok: true; value: unknown } | { ok: false; message: string } {
  const entry = PLATFORM_SETTINGS[key] as unknown as RegistryEntry<unknown>;
  const r = entry.schema.safeParse(value);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, message: r.error.errors[0]?.message || 'Değer geçersiz.' };
}

/**
 * Eski "Ayarlar" ekranının yazdığı, okuyucusu olmayan ya da gizli olan anahtarlar.
 * Genel `/api/admin/settings` listesi bunları DÖNDÜRMEZ ve YAZMAZ (B4: OpenAI anahtarı
 * düz metin sızıntısı).
 */
export const RETIRED_SECRET_SETTING_KEYS: ReadonlySet<string> = new Set(['openaiApiKey']);

/** Kendi sahibi uçtan yazılan anahtar önekleri (Güven Merkezi kuralları + tarama özeti). */
const DEDICATED_SETTING_PREFIXES = ['trust.'] as const;
/** Yan etkili / onaylı kayıt defteri anahtarları (Redis yayını, tipli onay, etki önizlemesi). */
const DEDICATED_PLATFORM_KEYS: ReadonlySet<string> = new Set([
  SETTINGS_KEYS.maintenance,
  SETTINGS_KEYS.registrationOpen,
  SETTINGS_KEYS.googleAuth,
]);

/**
 * Kendi uçları olan (zod + sürüm + denetim + yan etki) anahtarlar: genel `/api/admin/settings`
 * PUT/POST ve eski rollback bunları YAZAMAZ. Aksi hâlde bakım modu Redis'e yayınlanmadan DB'de
 * "açık" görünür, kayıt/Google anahtarları onaysız değişir, `trust.scan.last` sahte "son tarama"
 * özetiyle doldurulabilir, tespit kuralları gerekçesiz ve 409'suz değişirdi.
 * (`backgroundEffect` / `enableMagicLink` eski toplu istemcilerle sürüm kilitli yazılmaya devam eder.)
 */
export function isDedicatedSettingKey(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  const k = key.trim();
  return DEDICATED_PLATFORM_KEYS.has(k) || DEDICATED_SETTING_PREFIXES.some((p) => k.startsWith(p));
}

// ───────────────────────────── API sözleşmesi ─────────────────────────────

export const platformSettingsPatchSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            key: z.string().min(1).max(64),
            value: z.unknown(),
            /** İstemcinin gördüğü sürüm (`updatedAt` ISO ya da 'none'). */
            baseVersion: z.string().min(1).max(200),
          })
          .strict()
      )
      .min(1, 'Kaydedilecek değişiklik yok.')
      .max(PLATFORM_SETTING_KEYS.length),
  })
  .strict();
export type PlatformSettingsPatch = z.infer<typeof platformSettingsPatchSchema>;

export const platformRevertSchema = z
  .object({
    auditLogId: z.string().min(1).max(64),
    baseVersion: z.string().min(1).max(200).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

export const PLATFORM_AUDIT = {
  UPDATE: 'platform_setting_update',
  REVERT: 'platform_setting_revert',
} as const;
export const PLATFORM_AUDIT_ENTITY = 'settings';
