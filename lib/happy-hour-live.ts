/**
 * Mutlu saat (HappyHour) canlılık hesabı + yazma şeması — TEK kaynak.
 *
 * Saat dilimi: bayi `SS:dd` değerlerini duvar saati olarak (İstanbul) girer ve müşteri aynı
 * metni okur. Önceden canlılık UTC ile hesaplanıyordu → TR'de çarpan 3 saat kayık
 * uygulanıyordu (müşteri "12:00–14:00" görüyor, puan 15:00–17:00'de katlanıyordu).
 * Artık gün + saat `Europe/Istanbul` duvar saatine göre hesaplanır (sunucu TZ'inden bağımsız).
 *
 * Çarpan: yazmada zod ile [1, 3]; okumada (canlıdaki eski kayıtlar için) aynı aralığa kırpılır
 * (P0-13). Bkz. lib/points-multipliers.ts.
 */
import { z } from 'zod';
import {
  HAPPY_HOUR_MULTIPLIER_MAX,
  HAPPY_HOUR_MULTIPLIER_MIN,
  clampHappyHourMultiplier,
} from '@/lib/points-multipliers';

/** HappyHour duvar saatinin yorumlandığı saat dilimi (şemada ayrı alan yok). */
export const HAPPY_HOUR_TIME_ZONE = 'Europe/Istanbul';

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type HappyHourWindow = {
  startTime: string;
  endTime: string;
  daysOfWeek: unknown;
  isActive: boolean;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
};

export type ZonedClock = {
  /** 0 = Pazar … 6 = Cumartesi (JS getDay ile aynı). */
  day: number;
  /** Gece yarısından beri dakika. */
  minutes: number;
  /** "SS:dd" */
  hhmm: string;
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Verilen anın `timeZone` duvar saatindeki gün/saat karşılığı. */
export function getZonedClock(now: Date, timeZone: string = HAPPY_HOUR_TIME_ZONE): ZonedClock {
  const parts = getFormatter(timeZone).formatToParts(now);
  let day = now.getUTCDay();
  let hour = now.getUTCHours();
  let minute = now.getUTCMinutes();
  for (const p of parts) {
    if (p.type === 'weekday' && p.value in WEEKDAY_INDEX) day = WEEKDAY_INDEX[p.value];
    else if (p.type === 'hour') hour = Number(p.value) % 24;
    else if (p.type === 'minute') minute = Number(p.value);
  }
  return {
    day,
    minutes: hour * 60 + minute,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/** "SS:dd" → gece yarısından beri dakika; geçersizse null. */
export function parseHHmm(value: unknown): number | null {
  if (typeof value !== 'string' || !HHMM_RE.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** daysOfWeek Json'unu 0–6 tam sayı kümesine çevirir; boş/bozuk → her gün. */
export function normalizeDaysOfWeek(raw: unknown): number[] {
  const days = Array.isArray(raw)
    ? raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
  return days.length > 0 ? Array.from(new Set(days)).sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Happy hour penceresi şu an açık mı? Gün + `SS:dd` aralığı, İstanbul duvar saatiyle.
 * Gece taşması (ör. Cuma 22:00–02:00): gece yarısından sonraki kısım ÖNCEKİ günün
 * (Cuma) seçili olmasına bakar — Cumartesi seçilmemiş olsa da Cuma gecesi 01:00 canlıdır.
 */
export function isHappyHourLive(
  hh: HappyHourWindow,
  now: Date,
  timeZone: string = HAPPY_HOUR_TIME_ZONE
): boolean {
  if (!hh.isActive) return false;
  if (hh.validFrom && now < new Date(hh.validFrom)) return false;
  if (hh.validUntil && now > new Date(hh.validUntil)) return false;

  const startM = parseHHmm(hh.startTime);
  const endM = parseHHmm(hh.endTime);
  if (startM == null || endM == null || startM === endM) return false;

  const allowed = normalizeDaysOfWeek(hh.daysOfWeek);
  const clock = getZonedClock(now, timeZone);

  if (endM > startM) {
    return allowed.includes(clock.day) && clock.minutes >= startM && clock.minutes <= endM;
  }
  // Gece taşması.
  if (clock.minutes >= startM) return allowed.includes(clock.day);
  if (clock.minutes <= endM) return allowed.includes((clock.day + 6) % 7);
  return false;
}

/**
 * Bugün daha sonra ya da yarın başlayacak mı (müşteri "yaklaşan" listesi için).
 */
export function isHappyHourUpcoming(
  hh: HappyHourWindow,
  now: Date,
  timeZone: string = HAPPY_HOUR_TIME_ZONE
): boolean {
  if (!hh.isActive) return false;
  if (hh.validUntil && now > new Date(hh.validUntil)) return false;
  const startM = parseHHmm(hh.startTime);
  if (startM == null) return false;
  const allowed = normalizeDaysOfWeek(hh.daysOfWeek);
  const clock = getZonedClock(now, timeZone);
  if (allowed.includes(clock.day) && startM > clock.minutes) return true;
  return allowed.includes((clock.day + 1) % 7);
}

/**
 * Canlı pencereler arasındaki en yüksek çarpan, politika aralığına kırpılmış olarak.
 * Canlı pencere yoksa 1 (etkisiz).
 */
export function getLiveHappyHourMultiplier<T extends HappyHourWindow & { id?: string; multiplier: unknown }>(
  rows: readonly T[],
  now: Date,
  timeZone: string = HAPPY_HOUR_TIME_ZONE
): { multiplier: number; happyHourId: string | null } {
  let best = 1;
  let bestId: string | null = null;
  for (const hh of rows) {
    if (!isHappyHourLive(hh, now, timeZone)) continue;
    const m = clampHappyHourMultiplier(hh.multiplier);
    if (m > best) {
      best = m;
      bestId = hh.id ?? null;
    }
  }
  return { multiplier: best, happyHourId: bestId };
}

// ─────────────────────────────── Yazma şeması ───────────────────────────────

const optionalIsoDate = z
  .union([z.string().datetime({ offset: true, message: 'Geçersiz tarih' }), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

/** POST /api/happy-hour gövdesi (P0-13): çarpan [1,3], SS:dd, gün 0–6. */
export const happyHourCreateSchema = z
  .object({
    name: z
      .string({ required_error: 'Ad gerekli', invalid_type_error: 'Ad metin olmalı' })
      .trim()
      .min(2, 'Ad en az 2 karakter olmalı')
      .max(120, 'Ad en fazla 120 karakter olabilir'),
    description: z
      .string({ invalid_type_error: 'Açıklama metin olmalı' })
      .trim()
      .max(500, 'Açıklama en fazla 500 karakter olabilir')
      .nullable()
      .optional(),
    multiplier: z
      .number({ invalid_type_error: 'Çarpan sayı olmalı' })
      .finite('Çarpan sayı olmalı')
      .min(HAPPY_HOUR_MULTIPLIER_MIN, `Çarpan en az ${HAPPY_HOUR_MULTIPLIER_MIN} olmalı`)
      .max(HAPPY_HOUR_MULTIPLIER_MAX, `Çarpan en fazla ${HAPPY_HOUR_MULTIPLIER_MAX} olabilir`)
      .optional(),
    startTime: z
      .string({ required_error: 'Başlangıç saati gerekli' })
      .regex(HHMM_RE, 'Başlangıç saati SS:dd biçiminde olmalı (ör. 17:00)'),
    endTime: z
      .string({ required_error: 'Bitiş saati gerekli' })
      .regex(HHMM_RE, 'Bitiş saati SS:dd biçiminde olmalı (ör. 19:00)'),
    daysOfWeek: z
      .array(
        z
          .number({ invalid_type_error: 'Gün 0–6 arası tam sayı olmalı' })
          .int('Gün 0–6 arası tam sayı olmalı')
          .min(0, 'Gün 0–6 arası tam sayı olmalı')
          .max(6, 'Gün 0–6 arası tam sayı olmalı'),
        { required_error: 'En az bir gün seçin', invalid_type_error: 'Günler liste olmalı' }
      )
      .min(1, 'En az bir gün seçin')
      .max(7, 'En fazla 7 gün seçilebilir')
      .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b)),
    validFrom: optionalIsoDate,
    validUntil: optionalIsoDate,
  })
  .superRefine((v, ctx) => {
    if (v.startTime === v.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Bitiş saati başlangıçla aynı olamaz' });
    }
    if (v.validFrom && v.validUntil && v.validUntil <= v.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'Geçerlilik bitişi başlangıçtan sonra olmalı',
      });
    }
  });

export type HappyHourCreateInput = z.infer<typeof happyHourCreateSchema>;
