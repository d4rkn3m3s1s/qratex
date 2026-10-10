/**
 * Teklifler (/dealer/offers) — saf kurallar ve paylaşılan zod şemaları.
 *
 * Sunucu (defineRoute) ve istemci (useZodForm) AYNI şemayı içe aktarır; Prisma/Node bağımlılığı
 * yoktur. Denetim raporu `bayi/dealer_innovation.md` bulgularının kapandığı yer:
 *  - Flash teklif değeri serbest metindi (`0 || 10` = %10, `-20`, `%500` kabul) → tür başına sınır.
 *  - Süre sabit 30 dk, ileri tarih yok → süre seçenekleri + İstanbul duvar saatiyle planlama.
 *  - "Aktif" liste süresi dolanları da gösteriyordu → `flashStatus` tek doğruluk kaynağı.
 */
import { z } from 'zod';

// ───────────────────────────── Flash (kısa süreli) teklif ─────────────────────────────

export const FLASH_OFFER_TYPES = ['PERCENT', 'FIXED_TRY', 'COMPLIMENTARY'] as const;
export type FlashOfferType = (typeof FLASH_OFFER_TYPES)[number];

/** Seçilebilir süreler (dakika). Bir teklif en fazla 4 saat canlı kalır. */
export const FLASH_DURATIONS = [15, 30, 60, 120, 240] as const;
export type FlashDuration = (typeof FLASH_DURATIONS)[number];

/** Aynı anda canlı + planlı en fazla teklif sayısı (müşteri akışını boğmamak için). */
export const FLASH_MAX_OPEN = 3;
/** En fazla kaç gün sonrasına planlanabilir. */
export const FLASH_MAX_SCHEDULE_DAYS = 7;
export const FLASH_TITLE_MAX = 80;
export const FLASH_BODY_MAX = 280;

/** Tür başına değer aralığı. İkramda değer yoktur. */
export const FLASH_VALUE_LIMITS: Readonly<Record<Exclude<FlashOfferType, 'COMPLIMENTARY'>, { min: number; max: number }>> = {
  PERCENT: { min: 1, max: 90 },
  FIXED_TRY: { min: 1, max: 5000 },
};

/** `YYYY-MM-DDTHH:mm` — İstanbul duvar saati (tarayıcının saat diliminden bağımsız). */
export const WALL_TIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export const flashCreateSchema = z
  .object({
    title: z
      .string({ required_error: 'Başlık gerekli' })
      .trim()
      .min(3, 'Başlık en az 3 karakter olmalı')
      .max(FLASH_TITLE_MAX, `Başlık en fazla ${FLASH_TITLE_MAX} karakter olabilir`),
    body: z
      .string({ required_error: 'Açıklama gerekli' })
      .trim()
      .min(5, 'Açıklama en az 5 karakter olmalı')
      .max(FLASH_BODY_MAX, `Açıklama en fazla ${FLASH_BODY_MAX} karakter olabilir`),
    offerType: z.enum(FLASH_OFFER_TYPES, { errorMap: () => ({ message: 'Teklif türü seçin' }) }),
    value: z.number({ invalid_type_error: 'Değer sayı olmalı' }).finite().nullable(),
    durationMinutes: z
      .number({ invalid_type_error: 'Süre seçin' })
      .int()
      .refine((n) => (FLASH_DURATIONS as readonly number[]).includes(n), 'Süre listeden seçilmeli'),
    startMode: z.enum(['now', 'at']),
    startAt: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.offerType === 'COMPLIMENTARY') {
      if (v.value != null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'İkram teklifinde değer girilmez' });
      }
    } else {
      const lim = FLASH_VALUE_LIMITS[v.offerType];
      if (v.value == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Değer gerekli' });
      } else if (!Number.isInteger(v.value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Değer tam sayı olmalı' });
      } else if (v.value < lim.min || v.value > lim.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message:
            v.offerType === 'PERCENT'
              ? `İndirim %${lim.min} ile %${lim.max} arasında olmalı`
              : `Tutar ${lim.min} ile ${lim.max.toLocaleString('tr-TR')} ₺ arasında olmalı`,
        });
      }
    }
    if (v.startMode === 'at' && (!v.startAt || !WALL_TIME_RE.test(v.startAt))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startAt'], message: 'Başlangıç tarih ve saatini seçin' });
    }
  });

export type FlashCreateInput = z.infer<typeof flashCreateSchema>;

export const flashPatchSchema = z.object({ action: z.literal('stop') });

export type FlashStatus = 'live' | 'scheduled' | 'stopped' | 'ended';

/** Teklifin bugünkü durumu — liste, rozet ve sayaçların TEK kaynağı. */
export function flashStatus(
  o: { isActive: boolean; validFrom: Date | string; validTo: Date | string },
  now: Date = new Date()
): FlashStatus {
  const from = new Date(o.validFrom).getTime();
  const to = new Date(o.validTo).getTime();
  if (!o.isActive) return 'stopped';
  if (to <= now.getTime()) return 'ended';
  if (from > now.getTime()) return 'scheduled';
  return 'live';
}

export function isFlashOpen(status: FlashStatus): boolean {
  return status === 'live' || status === 'scheduled';
}

const ISTANBUL_TZ = 'Europe/Istanbul';
let wallFormatter: Intl.DateTimeFormat | null = null;

function istanbulParts(at: Date): { y: number; mo: number; d: number; h: number; mi: number } {
  wallFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(wallFormatter.formatToParts(at).map((p) => [p.type, p.value]));
  return { y: +parts.year, mo: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute };
}

/** İstanbul duvar saatini (`YYYY-MM-DDTHH:mm`) UTC ana çevirir. Geçersizse null. */
export function istanbulWallToUtc(wall: string): Date | null {
  if (!WALL_TIME_RE.test(wall)) return null;
  const [datePart, timePart] = wall.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(guess)) return null;
  // Tahmini anın İstanbul'daki duvar saatiyle fark = ofset (DST'siz bölgede tek adım yeter;
  // ikinci adım ofset değişimi olan sınır durumunu da düzeltir).
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = istanbulParts(new Date(ts));
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    ts = guess - (asUtc - ts);
  }
  const check = istanbulParts(new Date(ts));
  if (check.y !== y || check.mo !== mo || check.d !== d || check.h !== h || check.mi !== mi) return null;
  return new Date(ts);
}

/** Bir anı İstanbul duvar saati metnine çevirir (`YYYY-MM-DDTHH:mm`) — datetime-local varsayılanı için. */
export function utcToIstanbulWall(at: Date): string {
  const p = istanbulParts(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

export type FlashWindowResult =
  | { ok: true; validFrom: Date; validTo: Date }
  | { ok: false; path: 'startAt'; message: string };

/**
 * Sunucu otoriter zaman penceresi: "hemen" = sunucu saati; "planla" = İstanbul duvar saati,
 * geçmişte olamaz (1 dk tolerans) ve en fazla `FLASH_MAX_SCHEDULE_DAYS` gün ileride olabilir.
 */
export function resolveFlashWindow(
  input: Pick<FlashCreateInput, 'startMode' | 'startAt' | 'durationMinutes'>,
  now: Date = new Date()
): FlashWindowResult {
  let from = now;
  if (input.startMode === 'at') {
    const at = input.startAt ? istanbulWallToUtc(input.startAt) : null;
    if (!at) return { ok: false, path: 'startAt', message: 'Başlangıç zamanı geçersiz' };
    if (at.getTime() < now.getTime() - 60_000) {
      return { ok: false, path: 'startAt', message: 'Başlangıç zamanı geçmişte olamaz' };
    }
    if (at.getTime() > now.getTime() + FLASH_MAX_SCHEDULE_DAYS * 86_400_000) {
      return { ok: false, path: 'startAt', message: `En fazla ${FLASH_MAX_SCHEDULE_DAYS} gün sonrasına planlanabilir` };
    }
    from = at.getTime() < now.getTime() ? now : at;
  }
  return { ok: true, validFrom: from, validTo: new Date(from.getTime() + input.durationMinutes * 60_000) };
}

/** "%15 indirim", "50 ₺ indirim", "İkram" — bayi ve müşteri metni. */
export function flashValueLabel(type: string, value: number | null, locale: 'tr' | 'en' = 'tr'): string {
  if (type === 'PERCENT' && value != null) return locale === 'en' ? `${value}% off` : `%${value} indirim`;
  if (type === 'FIXED_TRY' && value != null) {
    const n = value.toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR');
    return locale === 'en' ? `₺${n} off` : `${n} ₺ indirim`;
  }
  if (type === 'COMPLIMENTARY') return locale === 'en' ? 'On the house' : 'İkram';
  return locale === 'en' ? 'Offer' : 'Teklif';
}

// ───────────────────────────── Mutlu saat ─────────────────────────────

/** Bayinin aynı anda açık tutabileceği mutlu saat sayısı (Teklifler yüzeyi). */
export const HAPPY_HOUR_MAX_ACTIVE = 10;
export const HAPPY_HOUR_MULTIPLIER_CHOICES = [1.5, 2, 2.5, 3] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Bayi formu şeması. Sunucu ayrıca platformun tek mutlu saat şemasıyla
 * (`lib/happy-hour-live.happyHourCreateSchema`, çarpan [1,3]) yeniden doğrular.
 */
export const dealerHappyHourSchema = z
  .object({
    name: z.string({ required_error: 'Ad gerekli' }).trim().min(2, 'Ad en az 2 karakter olmalı').max(60, 'Ad en fazla 60 karakter olabilir'),
    multiplier: z
      .number({ invalid_type_error: 'Çarpan seçin' })
      .refine((n) => (HAPPY_HOUR_MULTIPLIER_CHOICES as readonly number[]).includes(n), 'Çarpan listeden seçilmeli'),
    startTime: z.string().regex(HHMM, 'Başlangıç saati SS:dd olmalı'),
    endTime: z.string().regex(HHMM, 'Bitiş saati SS:dd olmalı'),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'En az bir gün seçin')
      .max(7)
      .transform((d) => Array.from(new Set(d)).sort((a, b) => a - b)),
  })
  .superRefine((v, ctx) => {
    if (v.startTime === v.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Bitiş saati başlangıçla aynı olamaz' });
    }
  });

export type DealerHappyHourInput = z.infer<typeof dealerHappyHourSchema>;

export const happyHourPatchSchema = z.object({ isActive: z.boolean() });

// ───────────────────────────── Kişiye özel teklif ─────────────────────────────

export const PERSONAL_OFFER_TYPES = ['discount', 'points', 'free_item'] as const;
export type PersonalOfferType = (typeof PERSONAL_OFFER_TYPES)[number];
export const PERSONAL_MESSAGE_MAX = 500;
/** Bayi başına günlük kişiye özel teklif tavanı (spam ve puan basma yüzeyi sınırı). */
export const PERSONAL_DAILY_LIMIT = 20;

export const personalOfferSchema = z.object({
  ref: z.string().trim().regex(/^o_[a-f0-9]{16}$/, 'Müşteri seçin'),
  message: z
    .string({ required_error: 'Mesaj gerekli' })
    .trim()
    .min(10, 'Mesaj en az 10 karakter olmalı')
    .max(PERSONAL_MESSAGE_MAX, `Mesaj en fazla ${PERSONAL_MESSAGE_MAX} karakter olabilir`),
  types: z
    .array(z.enum(PERSONAL_OFFER_TYPES))
    .min(1, 'En az bir telafi türü seçin')
    .max(PERSONAL_OFFER_TYPES.length)
    .transform((t) => Array.from(new Set(t))),
});

export type PersonalOfferInput = z.infer<typeof personalOfferSchema>;

export const personalCandidatesQuerySchema = z.object({
  q: z.string().trim().max(60).optional().default(''),
});

/** Türkçe duyarlı küçük harf + aksan katlama (İ/ı/ş/ğ...) — arama eşleşmesi için. */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
