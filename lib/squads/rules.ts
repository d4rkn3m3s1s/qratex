/**
 * Klan kuralları — TEK kaynak (sunucu + istemci okur; saf modül, DB yok).
 *
 * Denetim bulgusu 2/8 (customer_squads.md): sayfa metni ile kod ayrışıyordu (%5 ↔ %10,
 * "/10 üye" ↔ sınırsız). Bundan sonra oran, kapasite, hedef ve ödül yalnız buradan okunur;
 * sayfa metinleri de bu sabitlerle üretilir.
 */
import { z } from 'zod';
import { istanbulWallParts, nextIstanbulWeekStart } from '@/components/ds/play/istanbul-time';

/** Bir klandaki en fazla üye (katılım sunucuda bu sınırla reddedilir). */
export const SQUAD_MAX_MEMBERS = 10;

/**
 * Üyenin geri bildirimden kazandığı puanın klan gücüne yansıyan payı.
 * Bakiyeden DÜŞÜLMEZ; klan gücü harcanamaz, klan seviyesini belirler.
 */
export const SQUAD_POWER_SHARE = 0.1;

export const SQUAD_NAME_MIN = 3;
export const SQUAD_NAME_MAX = 30;
export const SQUAD_DESCRIPTION_MAX = 140;

export const INVITE_CODE_LENGTH = 6;
/** Karışan karakterler (0/O, 1/I/L) yok — sözlü paylaşımda hata azalır. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Savaş süresi seçenekleri (saat) ve sınırlar. */
export const BATTLE_DURATION_OPTIONS = [6, 12, 24, 48, 72, 168] as const;
export const BATTLE_MIN_HOURS = 1;
export const BATTLE_MAX_HOURS = 168;
/** Ödül havuzu hızlı seçimleri (0 = onur savaşı, puan konmaz). */
export const BATTLE_STAKE_PRESETS = [0, 100, 250, 500, 1000] as const;
export const BATTLE_MAX_STAKE = 100_000;

/** Biten savaşın sonuç kartı bu süre boyunca gösterilir. */
export const BATTLE_RESULT_VISIBLE_MS = 72 * 3600_000;

// ───────────────────────────── Haftalık klan hedefi ─────────────────────────────

export type WeeklyGoalTier = 1 | 2 | 3;

export const WEEKLY_GOAL_TIERS: Readonly<
  Record<WeeklyGoalTier, { key: 'relaxed' | 'balanced' | 'ambitious'; perMember: number; reward: number }>
> = {
  1: { key: 'relaxed', perMember: 1, reward: 20 },
  2: { key: 'balanced', perMember: 2, reward: 40 },
  3: { key: 'ambitious', perMember: 3, reward: 70 },
};

/** En küçük hedef (tek kişilik klan bile 3 geri bildirimle hedef tamamlar). */
export const WEEKLY_GOAL_MIN_TARGET = 3;

/**
 * `Squad.weeklyTeamTarget` artık kademe kodudur (1/2/3). Eski satırlardaki varsayılan 5
 * (hiç kimsenin değiştiremediği sabit) ve tanımsız değerler "dengeli" kademeye düşer.
 */
export function resolveGoalTier(stored: number | null | undefined): WeeklyGoalTier {
  return stored === 1 || stored === 2 || stored === 3 ? stored : 2;
}

/** Hedef üye sayısıyla ölçeklenir: 10 kişilik klanın hedefi 1 kişilik klanınkiyle aynı değildir. */
export function weeklyGoalTarget(tier: WeeklyGoalTier, memberCount: number): number {
  return Math.max(WEEKLY_GOAL_MIN_TARGET, WEEKLY_GOAL_TIERS[tier].perMember * Math.max(1, memberCount));
}

/** İçinde bulunulan İstanbul haftasının başlangıcı (Pazartesi 00:00, Europe/Istanbul). */
export function istanbulWeekStart(now: Date = new Date()): Date {
  return new Date(nextIstanbulWeekStart(now).getTime() - 7 * 86_400_000);
}

/** Haftanın kararlı anahtarı (İstanbul Pazartesi günü, YYYY-MM-DD) — tek-kez ödül anahtarında. */
export function istanbulWeekKey(now: Date = new Date()): string {
  // Pazartesi 00:00 İstanbul anının bir saat sonrası hâlâ aynı İstanbul gününde.
  const w = istanbulWallParts(new Date(istanbulWeekStart(now).getTime() + 3600_000));
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

// ───────────────────────────── Klan seviyesi ─────────────────────────────

/** Klan seviyesi klan gücünden türer (kozmetik prestij; ekonomiye etkisi yok). */
export function squadLevel(power: number): { level: number; current: number; next: number; progress: number } {
  const p = Math.max(0, Math.floor(power || 0));
  const level = Math.floor(Math.sqrt(p / 50)) + 1;
  const current = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, current, next, progress: next > current ? (p - current) / (next - current) : 0 };
}

// ───────────────────────────── Ad ve davet kodu ─────────────────────────────

/** Baş/son boşlukları atar, iç boşlukları teke indirir. */
export function normalizeSquadName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

const SHORT_BLOCK = new Set(['amk', 'aq', 'sik', 'göt', 'got', 'piç', 'pic', 'oç', 'oc', 'mk']);
const STEM_BLOCK = ['orospu', 'yarrak', 'pezevenk', 'kahpe', 'siktir', 'sikiş', 'ibne', 'fuck', 'bitch', 'shit', 'kaltak', 'gavat'];

/** Kaba dil süzgeci (klan adı herkese açık sıralamada görünür). */
export function containsBlockedWord(text: string): boolean {
  const tokens = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[0@]/g, 'o')
    .replace(/[1!]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$/g, 's')
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  return tokens.some((t) => SHORT_BLOCK.has(t) || STEM_BLOCK.some((s) => t.startsWith(s)));
}

export const squadNameSchema = z
  .string({ required_error: 'Klan adı gerekli.' })
  .transform(normalizeSquadName)
  .pipe(
    z
      .string()
      .min(SQUAD_NAME_MIN, `Klan adı en az ${SQUAD_NAME_MIN} karakter olmalı.`)
      .max(SQUAD_NAME_MAX, `Klan adı en fazla ${SQUAD_NAME_MAX} karakter olabilir.`)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u, 'Klan adında yalnız harf, rakam, boşluk ve . _ \' - kullanılabilir.')
      .refine((v) => !containsBlockedWord(v), 'Bu klan adı kullanılamaz.')
  );

export const squadDescriptionSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .max(SQUAD_DESCRIPTION_MAX, `Slogan en fazla ${SQUAD_DESCRIPTION_MAX} karakter olabilir.`)
      .refine((v) => !containsBlockedWord(v), 'Bu slogan kullanılamaz.')
  );

/** Kullanıcı girdisini davet koduna çevirir (büyük harf, yalnız harf/rakam). */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export const inviteCodeSchema = z
  .string({ required_error: 'Davet kodu gerekli.' })
  .transform(normalizeInviteCode)
  .pipe(z.string().min(4, 'Davet kodu geçersiz.').max(12, 'Davet kodu geçersiz.'));

/** Kriptografik rastgele davet kodu (Math.random değil). */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += INVITE_CODE_ALPHABET[b % INVITE_CODE_ALPHABET.length];
  return out;
}

/** Davet derin linki (oturum yoksa giriş sonrası buraya döner). */
export const SQUADS_PATH = '/customer/squads';
export function inviteLinkPath(code: string): string {
  return `${SQUADS_PATH}?join=${encodeURIComponent(code)}`;
}

// ───────────────────────────── Hata kodları ─────────────────────────────

export const SQUAD_ERROR_CODES = [
  'SQUAD_NAME_TAKEN',
  'SQUAD_NAME_INVALID',
  'INVITE_INVALID',
  'ALREADY_IN_SQUAD',
  'ALREADY_MEMBER',
  'SQUAD_FULL',
  'SQUAD_FROZEN',
  'NOT_SQUAD_MEMBER',
  'NOT_SQUAD_OWNER',
  'TARGET_NOT_MEMBER',
  'TARGET_OWNS_SQUAD',
  'BATTLE_LOCKED',
  'BATTLE_CONFLICT',
  'BATTLE_NOT_PENDING',
  'BATTLE_NOT_FOUND',
  'BATTLE_SELF',
  'GOAL_NOT_COMPLETE',
  'GOAL_NOT_ELIGIBLE',
  'GOAL_ALREADY_CLAIMED',
] as const;

export type SquadErrorCode = (typeof SQUAD_ERROR_CODES)[number];

export const SQUAD_ERROR_STATUS: Readonly<Record<SquadErrorCode, number>> = {
  SQUAD_NAME_TAKEN: 409,
  SQUAD_NAME_INVALID: 400,
  INVITE_INVALID: 404,
  ALREADY_IN_SQUAD: 409,
  ALREADY_MEMBER: 409,
  SQUAD_FULL: 409,
  SQUAD_FROZEN: 423,
  NOT_SQUAD_MEMBER: 403,
  NOT_SQUAD_OWNER: 403,
  TARGET_NOT_MEMBER: 404,
  TARGET_OWNS_SQUAD: 409,
  BATTLE_LOCKED: 409,
  BATTLE_CONFLICT: 409,
  BATTLE_NOT_PENDING: 409,
  BATTLE_NOT_FOUND: 404,
  BATTLE_SELF: 400,
  GOAL_NOT_COMPLETE: 409,
  GOAL_NOT_ELIGIBLE: 403,
  GOAL_ALREADY_CLAIMED: 409,
};

export const SQUAD_ERROR_MESSAGES: Readonly<Record<'tr' | 'en', Record<SquadErrorCode, string>>> = {
  tr: {
    SQUAD_NAME_TAKEN: 'Bu klan adı alınmış. Başka bir ad dene.',
    SQUAD_NAME_INVALID: 'Klan adı geçersiz.',
    INVITE_INVALID: 'Bu davet kodu geçerli değil. Kodu kontrol edip tekrar dene.',
    ALREADY_IN_SQUAD: 'Zaten bir klandasın. Yeni klana geçmek için önce mevcut klanından ayrıl.',
    ALREADY_MEMBER: 'Bu klanın zaten üyesisin.',
    SQUAD_FULL: `Bu klan dolu (en fazla ${SQUAD_MAX_MEMBERS} üye).`,
    SQUAD_FROZEN: 'Bu klan yönetici tarafından geçici olarak askıya alındı.',
    NOT_SQUAD_MEMBER: 'Bu klanın üyesi değilsin.',
    NOT_SQUAD_OWNER: 'Bu işlemi yalnız klan lideri yapabilir.',
    TARGET_NOT_MEMBER: 'Seçilen kişi bu klanın üyesi değil.',
    TARGET_OWNS_SQUAD: 'Seçilen üye başka bir klanın lideri; liderlik ona devredilemez.',
    BATTLE_LOCKED: 'Klan aktif bir savaşta. Bu işlem savaş bitince yapılabilir.',
    BATTLE_CONFLICT: 'Klanlardan biri zaten bir savaşta ya da bekleyen bir meydan okuması var.',
    BATTLE_NOT_PENDING: 'Bu meydan okuma artık beklemede değil.',
    BATTLE_NOT_FOUND: 'Savaş bulunamadı.',
    BATTLE_SELF: 'Kendi klanına meydan okuyamazsın.',
    GOAL_NOT_COMPLETE: 'Haftalık klan hedefi henüz tamamlanmadı.',
    GOAL_NOT_ELIGIBLE: 'Ödülü almak için bu hafta klana en az bir geri bildirimle katkı vermelisin.',
    GOAL_ALREADY_CLAIMED: 'Bu haftanın ödülünü zaten aldın.',
  },
  en: {
    SQUAD_NAME_TAKEN: 'This squad name is taken. Try another one.',
    SQUAD_NAME_INVALID: 'Invalid squad name.',
    INVITE_INVALID: 'This invite code is not valid. Check it and try again.',
    ALREADY_IN_SQUAD: 'You are already in a squad. Leave it first to switch.',
    ALREADY_MEMBER: 'You are already a member of this squad.',
    SQUAD_FULL: `This squad is full (max ${SQUAD_MAX_MEMBERS} members).`,
    SQUAD_FROZEN: 'This squad has been temporarily suspended by an administrator.',
    NOT_SQUAD_MEMBER: 'You are not a member of this squad.',
    NOT_SQUAD_OWNER: 'Only the squad leader can do this.',
    TARGET_NOT_MEMBER: 'The selected person is not in this squad.',
    TARGET_OWNS_SQUAD: 'The selected member leads another squad and cannot take over.',
    BATTLE_LOCKED: 'The squad is in an active battle. Try again after it ends.',
    BATTLE_CONFLICT: 'One of the squads is already in a battle or has a pending challenge.',
    BATTLE_NOT_PENDING: 'This challenge is no longer pending.',
    BATTLE_NOT_FOUND: 'Battle not found.',
    BATTLE_SELF: 'You cannot challenge your own squad.',
    GOAL_NOT_COMPLETE: 'The weekly squad goal is not complete yet.',
    GOAL_NOT_ELIGIBLE: 'Contribute at least one review to the squad this week to claim the reward.',
    GOAL_ALREADY_CLAIMED: 'You already claimed this week’s reward.',
  },
};

export function isSquadErrorCode(code: unknown): code is SquadErrorCode {
  return typeof code === 'string' && (SQUAD_ERROR_CODES as readonly string[]).includes(code);
}
