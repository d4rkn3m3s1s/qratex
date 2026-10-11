/**
 * Bayi Ayarlar yüzeyi (`/dealer/settings`) — istemci-güvenli sözleşme.
 *
 * Sekmeler: İşletme · Hesabım · Bildirimler · Güvenlik · AI · Abonelik. Eski
 * `/dealer/ai-settings` ve `/dealer/billing` buraya kalıcı yönlenir (sorgu korunur).
 * Sunucu yükleyicisi (`load.server.ts`) bu şekli üretir; istemci adası yalnız gösterir.
 * Zod şemaları hem `defineRoute` (sunucu) hem `useZodForm` (istemci) tarafından kullanılır.
 * Prisma İÇE AKTARMAZ.
 */
import { z } from 'zod';

/** Ayarlar sekmeleri (URL: `?tab=`). Sıra = sekme sırası. */
export const DEALER_SETTINGS_TABS = ['business', 'account', 'notifications', 'security', 'ai', 'billing'] as const;
export type DealerSettingsTab = (typeof DEALER_SETTINGS_TABS)[number];

/**
 * Eski/Türkçe sekme adları → kanonik sekme. Onboarding ("profil", "konum"), eski sayfaların
 * derin linkleri ve `/dealer/billing` · `/dealer/ai-settings` yönlendirmeleri kırılmasın.
 */
export const DEALER_TAB_ALIASES: Readonly<Record<string, DealerSettingsTab>> = {
  business: 'business',
  isletme: 'business',
  profile: 'business',
  profil: 'business',
  location: 'business',
  konum: 'business',
  hours: 'business',
  account: 'account',
  hesabim: 'account',
  me: 'account',
  appearance: 'account',
  gorunum: 'account',
  preferences: 'account',
  notifications: 'notifications',
  bildirimler: 'notifications',
  security: 'security',
  guvenlik: 'security',
  ai: 'ai',
  'ai-settings': 'ai',
  learning: 'ai',
  billing: 'billing',
  abonelik: 'billing',
  plan: 'billing',
  subscription: 'billing',
};

export function resolveDealerSettingsTab(raw: string | null | undefined): DealerSettingsTab | null {
  if (!raw) return null;
  return DEALER_TAB_ALIASES[raw.trim().toLowerCase()] ?? null;
}

// ───────────────────────────── İşletme ─────────────────────────────

/** "SS:dd" (00:00–23:59) ya da gün sonu "24:00". */
export const TIME_RE = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const timeRangeSchema = z
  .object({
    open: z.string().regex(TIME_RE, 'Saat SS:dd biçiminde olmalı'),
    close: z.string().regex(TIME_RE, 'Saat SS:dd biçiminde olmalı'),
  })
  .refine((r) => r.open !== '24:00', { message: 'Açılış 24:00 olamaz', path: ['open'] });

export const dayHoursSchema = z.object({
  open: z.boolean(),
  ranges: z.array(timeRangeSchema).max(3, 'Bir güne en çok 3 aralık eklenebilir'),
});

/** Pazartesi → Pazar (7 gün). */
export const weeklyHoursSchema = z.array(dayHoursSchema).length(7);
export type DayHours = z.infer<typeof dayHoursSchema>;
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

const nullableTrimmed = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

export const businessFormSchema = z.object({
  businessName: z.string().trim().min(2, 'İşletme adı en az 2 karakter olmalı').max(100, 'İşletme adı en çok 100 karakter olabilir'),
  businessDesc: nullableTrimmed(500, 'Açıklama en çok 500 karakter olabilir'),
  address: nullableTrimmed(200, 'Adres en çok 200 karakter olabilir'),
  latitude: z.number().min(-90, 'Enlem -90 ile 90 arasında olmalı').max(90, 'Enlem -90 ile 90 arasında olmalı').nullable(),
  longitude: z.number().min(-180, 'Boylam -180 ile 180 arasında olmalı').max(180, 'Boylam -180 ile 180 arasında olmalı').nullable(),
  hours: weeklyHoursSchema,
  holidayMode: z.boolean(),
  defaultReplyTemplate: nullableTrimmed(2000, 'Şablon en çok 2000 karakter olabilir'),
});
export type BusinessFormValues = z.input<typeof businessFormSchema>;

/** PATCH gövdesi: yalnız değişen alanlar + iyimser kilit. */
export const businessPatchSchema = businessFormSchema
  .partial()
  .extend({ baseVersion: z.string().min(1).max(128) })
  .strict()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'Enlem ve boylam birlikte gönderilmeli',
    path: ['latitude'],
  })
  .refine((v) => v.latitude === undefined || (v.latitude === null) === (v.longitude === null), {
    message: 'Konum için enlem ve boylamın ikisi de gerekli',
    path: ['longitude'],
  });
export type BusinessPatch = z.input<typeof businessPatchSchema>;

export interface BusinessSettings {
  businessName: string;
  businessDesc: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  logo: string | null;
  hours: WeeklyHours;
  /** Kayıtlı değer eski serbest metindi (ve çözümlenebildi / çözümlenemedi). */
  hoursLegacy: { raw: string; parsed: boolean } | null;
  holidayMode: boolean;
  defaultReplyTemplate: string | null;
  /** İşletme alanlarının içerik sürümü (409 için). */
  version: string;
  /** Logo yükleme (R2) yapılandırılmış mı. */
  logoUploadEnabled: boolean;
}

// ───────────────────────────── Hesabım ─────────────────────────────

export const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

export const accountFormSchema = z.object({
  name: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalı').max(80, 'Ad soyad en çok 80 karakter olabilir'),
  phone: z
    .string()
    .trim()
    .max(30, 'Telefon en çok 30 karakter olabilir')
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || PHONE_RE.test(v), { message: 'Geçerli bir telefon numarası girin (ör. +90 532 000 00 00)' }),
  image: z.string().max(2048).nullable(),
  preferredLanguage: z.enum(['tr', 'en']),
});
export type AccountFormValues = z.input<typeof accountFormSchema>;

export const accountPatchSchema = accountFormSchema
  .partial()
  .extend({ baseVersion: z.string().min(1).max(128) })
  .strict();
export type AccountPatch = z.input<typeof accountPatchSchema>;

export interface AccountSettings {
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  preferredLanguage: 'tr' | 'en';
  memberSince: string;
  version: string;
}

// ───────────────────────────── AI ─────────────────────────────

/** Sistem promptuna "işletme bağlamı" olarak eklenen metnin üst sınırı (lib/ai-prompt-safety). */
export const AI_CONTEXT_MAX = 1000;

export const aiPatchSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    autoAnalyze: z.boolean().optional(),
    alertOnToxic: z.boolean().optional(),
    alertOnUrgent: z.boolean().optional(),
    alertOnChurnRisk: z.boolean().optional(),
    weeklyReportEnabled: z.boolean().optional(),
    customPrompt: z
      .string()
      .trim()
      .max(AI_CONTEXT_MAX, `İşletme bağlamı en çok ${AI_CONTEXT_MAX} karakter olabilir`)
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    baseVersion: z.string().min(1).max(128),
  })
  .strict();
export type AiPatch = z.input<typeof aiPatchSchema>;

export interface AiSettingsView {
  isEnabled: boolean;
  autoAnalyze: boolean;
  alertOnToxic: boolean;
  alertOnUrgent: boolean;
  alertOnChurnRisk: boolean;
  weeklyReportEnabled: boolean;
  customPrompt: string | null;
  version: string;
  /** Kayıt yok → şema varsayılanları geçerli. */
  isDefault: boolean;
}

export type LearningStatus = 'idle' | 'training' | 'ready' | 'unknown';

export interface AiLearning {
  status: LearningStatus;
  lastTrainedAt: string | null;
  trainingFeedbackCount: number;
  correctionsUsed: number;
  correctionsTotal: number;
  retrain: { shouldRetrain: boolean; reason: string | null; newFeedbackCount: number; newCorrectionsCount: number } | null;
}

export interface AiStats {
  analyzedTotal: number;
  analyzedLast24h: number;
  /** Metni olup henüz analiz edilmemiş (son 30 gün). */
  pendingLast30d: number;
  /** Son 7 gündeki AI çağrısı (analiz, sohbet, içgörü…). */
  usageLast7d: number;
  /** İstanbul günleri, eskiden yeniye 7 gün. */
  daily: Array<{ date: string; count: number }>;
  learning: AiLearning | null;
}

export interface AiSection {
  /** Admin `ai_features` modülünü kapattıysa false (ayarlar salt-okunur, uyarı gösterilir). */
  moduleEnabled: boolean;
  settings: AiSettingsView;
  stats: AiStats;
}

// ───────────────────────────── Bildirimler / Güvenlik ─────────────────────────────

export interface PushDevice {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SecurityEvent {
  id: string;
  action: string;
  at: string;
  device: string | null;
}

export interface SecurityState {
  hasPassword: boolean;
  providers: string[];
  twoFactor: { enabled: boolean; since: string | null; remainingRecoveryCodes: number };
  lastPasswordChangeAt: string | null;
  lastSessionsRevokedAt: string | null;
  currentDevice: string | null;
  sessionStartedAt: string | null;
  events: SecurityEvent[];
}

export interface DealerSettingsSnapshot {
  business: BusinessSettings;
  account: AccountSettings;
  ai: AiSection;
  pushDevices: PushDevice[];
  security: SecurityState;
}

export const sessionsRevokeSchema = z.object({ scope: z.enum(['others', 'all']) }).strict();

/** Güvenlik etkinliğinde gösterilen denetim eylemleri. */
export const SECURITY_EVENT_ACTIONS = [
  'CHANGE_PASSWORD',
  'SET_INITIAL_PASSWORD',
  'PASSWORD_RESET',
  'REVOKE_SESSIONS',
  'UPDATE_ACCOUNT',
  'UPDATE_BUSINESS_PROFILE',
  'UPDATE_AI_SETTINGS',
] as const;

export const REVOKE_SESSIONS_ACTION = 'REVOKE_SESSIONS';
