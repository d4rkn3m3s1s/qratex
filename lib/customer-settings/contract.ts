/**
 * Müşteri Ayarlar yüzeyi (`/customer/me/settings`) — istemci-güvenli sözleşme.
 * Sunucu yükleyicisi (`load.server.ts`) bu şekli üretir; istemci adası yalnız gösterir.
 * Prisma İÇE AKTARMAZ.
 */
import type { NotificationChannel } from '@/lib/notification-prefs';
import type { BirthdayClaimReason } from '@/lib/birthday';

/** Ayarlar bölümleri (URL: `?tab=`). Sıra = sekme sırası. */
export const SETTINGS_SECTIONS = ['profile', 'notifications', 'privacy', 'appearance', 'security'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * Eski `/customer/settings?tab=` değerleri → yeni bölüm. Bildirimlerdeki, e-postalardaki
 * (KVKK "paketiniz hazır") ve yasal sayfalardaki derin linkler kırılmasın.
 */
export const LEGACY_TAB_ALIASES: Readonly<Record<string, SettingsSection>> = {
  profile: 'profile',
  notifications: 'notifications',
  security: 'security',
  preferences: 'appearance',
  appearance: 'appearance',
  cosmetics: 'profile',
  privacy: 'privacy',
};

export function resolveSettingsSection(raw: string | null | undefined): SettingsSection | null {
  if (!raw) return null;
  return LEGACY_TAB_ALIASES[raw.toLowerCase()] ?? null;
}

/** Yazı boyutu ölçeği (kök `font-size`; tüm rem tabanlı tipografi birlikte büyür). */
export const TEXT_SCALES = ['default', 'lg', 'xl'] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface A11yPreferences {
  highContrast: boolean;
  reduceAnimations: boolean;
  colorblindMode: boolean;
  textScale: TextScale;
}

export interface CustomerPreferences {
  language: 'tr' | 'en';
  /** Liderlik/lig tablosunda adınla görün (lib/league-board + /api/leaderboard uygular). */
  showLeaderboard: boolean;
  a11y: A11yPreferences;
  /** Hesapta erişilebilirlik tercihi hiç kaydedilmiş mi? (yoksa cihazdaki değer korunur) */
  a11yStored: boolean;
}

export interface NotificationCell {
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationRow {
  key: string;
  cells: NotificationCell[];
}

export interface PushDevice {
  id: string;
  /** "Chrome · Android" gibi okunur etiket (UA'dan; ham UA istemciye gitmez). */
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface BirthdayState {
  /** `YYYY-MM-DD` ya da kayıtlı değilse null. */
  date: string | null;
  /** Bir kez kaydedildi → değiştirilemez (sunucu 409 verir). */
  locked: boolean;
  isToday: boolean;
  canClaim: boolean;
  claimReason: BirthdayClaimReason;
  /** Yıllık doğum günü bonusu (puan matrisi). Okunamazsa null. */
  bonusAmount: number | null;
}

export type ReauthMethod = 'password' | 'totp' | 'recent-login';

export interface SecurityState {
  hasPassword: boolean;
  /** Bağlı giriş sağlayıcıları (ör. `google`). */
  providers: string[];
  twoFactor: { enabled: boolean; since: string | null; remainingRecoveryCodes: number };
  lastPasswordChangeAt: string | null;
  lastSessionsRevokedAt: string | null;
  /** Bu tarayıcının okunur etiketi. */
  currentDevice: string | null;
  /** Bu oturumun ilk görüldüğü an (giriş zamanı yaklaşığı). */
  sessionStartedAt: string | null;
}

export interface CustomerSettingsSnapshot {
  profile: { name: string; email: string; image: string | null; memberSince: string };
  frame: { equipped: string | null; hue: number | null };
  showcase: { pinned: number; limit: number };
  birthday: BirthdayState;
  preferences: CustomerPreferences;
  notifications: { rows: NotificationRow[]; pushDevices: PushDevice[] };
  security: SecurityState;
  /** Ekip üyesi mi (ekip bildirim satırı yalnız onlara). */
  isTeamMember: boolean;
}

/** Sunucu hata kodları — istemci kendi dilinde karşılar. */
export const SETTINGS_ERROR_CODES = [
  'AVATAR_NOT_ALLOWED',
  'CELL_NOT_SUPPORTED',
  'REAUTH_REQUIRED',
  'REAUTH_PASSWORD',
  'REAUTH_TOTP',
  'REAUTH_RECENT_LOGIN',
  'EMAIL_MISMATCH',
  'ADMIN_SELF_DELETE',
  'ARCHIVE_BLOCKED',
] as const;
export type SettingsErrorCode = (typeof SETTINGS_ERROR_CODES)[number];
