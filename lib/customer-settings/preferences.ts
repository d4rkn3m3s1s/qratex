/**
 * Müşteri tercihleri — saf okuma/birleştirme (DB yok; jest ile test edilir).
 *
 * Saklama (şema değişmeden): `Settings` satırı `user_settings_<userId>`, değer
 *   { notifications: { emailReply, … eski anahtarlar }, preferences: { language, showLeaderboard,
 *     highContrast, reduceAnimations, colorblindMode, textScale } }
 * `preferences.showLeaderboard` yolu lib/league-board ve /api/leaderboard tarafından JSON yol
 * sorgusuyla okunur — yol DEĞİŞTİRİLMEZ.
 *
 * Denetim düzeltmeleri:
 *  - B1: tema artık hesapta tutulmaz (tüketicisi yoktu; gerçek tema next-themes, cihaz başına).
 *    Eski istemciler `theme` gönderirse 400 yerine yok sayılır → diğer alanlar düşmez.
 *  - B7: yama ALAN BAZLIDIR; yalnız gönderilen alan yazılır, okunamayan/bozuk saklı değer
 *    varsayılanla EZİLMEZ (bilinmeyen anahtarlar korunur).
 *  - "Profili göster" (showProfile) kaldırıldı: hiçbir sorgu okumuyordu.
 */
import { z } from 'zod';
import {
  TEXT_SCALES,
  type A11yPreferences,
  type CustomerPreferences,
  type TextScale,
} from './contract';

export const userSettingsKey = (userId: string) => `user_settings_${userId}`;

/** Eski "bildirim tercihleri" kartının saklı anahtarları (yalnız `emailReply` hâlâ okunuyor). */
const LEGACY_NOTIFICATION_KEYS = [
  'emailBadge',
  'emailQuest',
  'emailReward',
  'emailReply',
  'pushBadge',
  'pushQuest',
  'pushReward',
] as const;

const BOOLEAN_PREFERENCE_KEYS = ['showLeaderboard', 'highContrast', 'reduceAnimations', 'colorblindMode'] as const;

export const DEFAULT_A11Y: A11yPreferences = {
  highContrast: false,
  reduceAnimations: false,
  colorblindMode: false,
  textScale: 'default',
};

export interface StoredUserSettings {
  notifications: Record<string, boolean>;
  preferences: Record<string, unknown>;
  /** Tanımadığımız üst düzey anahtarlar — yazarken korunur. */
  rest: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Saklı JSON'u hoşgörülü okur: tip uymayan alanlar atılır, bilinmeyenler korunur. */
export function readStoredSettings(raw: unknown): StoredUserSettings {
  const root = isRecord(raw) ? raw : {};
  const notificationsRaw = isRecord(root.notifications) ? root.notifications : {};
  const preferencesRaw = isRecord(root.preferences) ? root.preferences : {};
  const notifications: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(notificationsRaw)) {
    if (typeof v === 'boolean') notifications[k] = v;
  }
  const { notifications: _n, preferences: _p, ...rest } = root;
  return { notifications, preferences: { ...preferencesRaw }, rest };
}

function isTextScale(v: unknown): v is TextScale {
  return typeof v === 'string' && (TEXT_SCALES as readonly string[]).includes(v);
}

/** Saklı değer + `User.preferredLanguage` → ekranın gösterdiği tercih seti. */
export function toCustomerPreferences(
  stored: StoredUserSettings,
  preferredLanguage: string | null | undefined,
): CustomerPreferences {
  const p = stored.preferences;
  const langFromSettings = p.language === 'en' || p.language === 'tr' ? p.language : null;
  const language: 'tr' | 'en' = preferredLanguage === 'en' ? 'en' : preferredLanguage === 'tr' ? 'tr' : langFromSettings ?? 'tr';
  const a11yStored = ['highContrast', 'reduceAnimations', 'colorblindMode', 'textScale'].some((k) => k in p);
  return {
    language,
    showLeaderboard: p.showLeaderboard !== false,
    a11y: {
      highContrast: p.highContrast === true,
      reduceAnimations: p.reduceAnimations === true,
      colorblindMode: p.colorblindMode === true,
      textScale: isTextScale(p.textScale) ? p.textScale : 'default',
    },
    a11yStored,
  };
}

/** İşletme yanıtı e-postası açık mı? (varsayılan açık; yalnız açık `false` kapatır) */
export function isReplyEmailEnabled(stored: StoredUserSettings): boolean {
  return stored.notifications.emailReply !== false;
}

/** Alan bazlı tercih yaması (yeni yüzey). Bilinmeyen alan → 400 (sessizce yutmaz). */
export const PreferencesPatchSchema = z
  .object({
    language: z.enum(['tr', 'en']).optional(),
    showLeaderboard: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    reduceAnimations: z.boolean().optional(),
    colorblindMode: z.boolean().optional(),
    textScale: z.enum(TEXT_SCALES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Değiştirilecek bir tercih gönderin.' });

export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;

/**
 * Eski `/api/customer/settings` gövdesi için hoşgörülü şema: `theme` ("system" dahil) ve
 * `showProfile` kabul edilir ama YAZILMAZ (tüketicisi yok). B1: "Sistem" seçmek artık
 * aynı gövdedeki diğer alanları düşürmez.
 */
export const LegacyPreferencesSchema = z
  .object({
    language: z.enum(['tr', 'en']).optional(),
    theme: z.enum(['dark', 'light', 'system']).optional(),
    showProfile: z.boolean().optional(),
    showLeaderboard: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    reduceAnimations: z.boolean().optional(),
    colorblindMode: z.boolean().optional(),
    textScale: z.enum(TEXT_SCALES).optional(),
  })
  .strict();

export const LegacyNotificationsSchema = z
  .object(Object.fromEntries(LEGACY_NOTIFICATION_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
    (typeof LEGACY_NOTIFICATION_KEYS)[number],
    z.ZodOptional<z.ZodBoolean>
  >)
  .strict();

/** Yalnız gönderilen ve tüketicisi olan tercih alanlarını saklı değere uygular. */
export function applyPreferencesPatch(
  stored: StoredUserSettings,
  patch: Partial<Record<'language' | (typeof BOOLEAN_PREFERENCE_KEYS)[number], unknown>> & { textScale?: unknown },
): StoredUserSettings {
  const preferences = { ...stored.preferences };
  if (patch.language === 'tr' || patch.language === 'en') preferences.language = patch.language;
  for (const key of BOOLEAN_PREFERENCE_KEYS) {
    const v = patch[key];
    if (typeof v === 'boolean') preferences[key] = v;
  }
  if (isTextScale(patch.textScale)) preferences.textScale = patch.textScale;
  // Tüketicisi olmayan eski alanlar saklı değerden temizlenir (bir daha "ayarlı" görünmesin).
  delete preferences.theme;
  delete preferences.showProfile;
  return { ...stored, preferences };
}

/** Eski bildirim anahtarlarından gönderilenleri yazar (yalnız boolean). */
export function applyLegacyNotificationsPatch(
  stored: StoredUserSettings,
  patch: Partial<Record<string, unknown>>,
): StoredUserSettings {
  const notifications = { ...stored.notifications };
  for (const key of LEGACY_NOTIFICATION_KEYS) {
    const v = patch[key];
    if (typeof v === 'boolean') notifications[key] = v;
  }
  return { ...stored, notifications };
}

/** Saklanacak JSON (bilinmeyen üst düzey anahtarlar korunur). */
export function serializeStoredSettings(stored: StoredUserSettings): Record<string, unknown> {
  return { ...stored.rest, notifications: stored.notifications, preferences: stored.preferences };
}

/**
 * Eski GET yanıtının şekli (m-lig vb. geriye uyum). `theme` cihaz başına olduğundan
 * sabit `system` döner; gerçek değer istemcide next-themes'ten okunur.
 */
export function toLegacyResponse(stored: StoredUserSettings, prefs: CustomerPreferences) {
  return {
    notifications: {
      emailBadge: stored.notifications.emailBadge !== false,
      emailQuest: stored.notifications.emailQuest !== false,
      emailReward: stored.notifications.emailReward !== false,
      emailReply: isReplyEmailEnabled(stored),
      pushBadge: stored.notifications.pushBadge !== false,
      pushQuest: stored.notifications.pushQuest !== false,
      pushReward: stored.notifications.pushReward !== false,
    },
    preferences: {
      language: prefs.language,
      theme: 'system' as const,
      showLeaderboard: prefs.showLeaderboard,
      highContrast: prefs.a11y.highContrast,
      reduceAnimations: prefs.a11y.reduceAnimations,
      colorblindMode: prefs.a11y.colorblindMode,
      textScale: prefs.a11y.textScale,
    },
  };
}
