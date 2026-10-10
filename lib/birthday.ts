/**
 * Doğum günü kuralları — TEK kaynak (`/api/birthday`, cüzdan Kartım statü bölümü).
 * Saf; jest ile test edilir (`__tests__/lib/birthday.test.ts`).
 *
 * Önceki sorunlar (lounge raporu B3, B7):
 *  - "Bugün" sunucu saatiyle (Vercel UTC) hesaplanıyordu: TR'de doğum gününün ilk 3 saati
 *    görünmüyor, ertesi günün ilk 3 saatinde hâlâ "bugün" deniyordu → artık Europe/Istanbul.
 *  - 29 Şubat doğumlular 4 yılın 3'ünde hiç talep edemiyordu → artık olmayan yıllarda 28 Şubat.
 *  - Yeni hesap tarihi bugüne kaydedip aynı dakika bonus alabiliyordu → tarih en az
 *    `BIRTHDAY_MIN_REGISTRATION_DAYS` gün önce kaydedilmiş olmalı.
 *
 * Saklama: `UserBirthday.birthDate` `YYYY-MM-DD` girdisinden UTC gece yarısı olarak yazılır;
 * takvim günü bu yüzden UTC ay/gün alanlarından okunur.
 */

export const BIRTHDAY_TZ = 'Europe/Istanbul';
/** Doğum tarihi kaydedildikten sonra bonus için beklenmesi gereken en az gün. */
export const BIRTHDAY_MIN_REGISTRATION_DAYS = 30;

const DAY_MS = 86_400_000;

export interface Ymd {
  y: number;
  /** 1–12 */
  m: number;
  d: number;
}

function partsIn(timeZone: string, at: Date): Ymd & { h: number; min: number; s: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const get = (type: string) => Number(fmt.formatToParts(at).find((p) => p.type === type)?.value ?? '0');
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute'), s: get('second') };
}

/** İstanbul takvim günü. */
export function istanbulYmd(now: Date): Ymd {
  const { y, m, d } = partsIn(BIRTHDAY_TZ, now);
  return { y, m, d };
}

/** İstanbul'da verilen yılın 1 Ocak 00:00 anı (UTC `Date`). */
export function istanbulYearStart(year: number, reference: Date = new Date(Date.UTC(year, 0, 1, 12))): Date {
  const p = partsIn(BIRTHDAY_TZ, reference);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offsetMs = asUtc - Math.floor(reference.getTime() / 1000) * 1000;
  return new Date(Date.UTC(year, 0, 1) - offsetMs);
}

/** İstanbul'da `now`'ın içinde bulunduğu günün 00:00 anı (UTC `Date`). */
export function istanbulDayStart(now: Date): Date {
  const p = partsIn(BIRTHDAY_TZ, now);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - offsetMs);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Saklanan doğum tarihinin takvim ay/günü (UTC alanları). */
export function birthMonthDay(birthDate: Date): { month: number; day: number } {
  return { month: birthDate.getUTCMonth() + 1, day: birthDate.getUTCDate() };
}

/** O yıl kutlanacak gün: 29 Şubat artık olmayan yılda 28 Şubat sayılır. */
export function birthdayInYear(month: number, day: number, year: number): Ymd {
  if (month === 2 && day === 29 && !isLeapYear(year)) return { y: year, m: 2, d: 28 };
  return { y: year, m: month, d: day };
}

function ymdIndex(v: Ymd): number {
  return Math.round(Date.UTC(v.y, v.m - 1, v.d) / DAY_MS);
}

export function isBirthdayToday(birthDate: Date, now: Date): boolean {
  const today = istanbulYmd(now);
  const { month, day } = birthMonthDay(birthDate);
  const target = birthdayInYear(month, day, today.y);
  return target.m === today.m && target.d === today.d;
}

/** Bugünden bir sonraki doğum gününe kalan gün (bugünse 0). */
export function daysUntilBirthday(birthDate: Date, now: Date): number {
  const today = istanbulYmd(now);
  const { month, day } = birthMonthDay(birthDate);
  let target = birthdayInYear(month, day, today.y);
  if (ymdIndex(target) < ymdIndex(today)) target = birthdayInYear(month, day, today.y + 1);
  return ymdIndex(target) - ymdIndex(today);
}

export type BirthdayClaimReason = 'NOT_SET' | 'NOT_TODAY' | 'ALREADY_CLAIMED' | 'TOO_RECENT' | 'OK';

export interface BirthdayRecordLike {
  birthDate: Date;
  /** Doğum tarihinin kaydedildiği an. */
  createdAt: Date;
  lastBonusAt: Date | null;
}

export interface BirthdayClaimDecision {
  canClaim: boolean;
  reason: BirthdayClaimReason;
  isToday: boolean;
  /** Talep yılının başlangıcı (İstanbul 1 Ocak 00:00) — atomik guard bu sınırı kullanır. */
  yearStart: Date;
  /** Tek-kez anahtarı için İstanbul yılı. */
  year: number;
}

/** Talep uygunluğu (sunucu otoriter; istemci yalnız gösterir). */
export function evaluateBirthdayClaim(record: BirthdayRecordLike | null, now: Date): BirthdayClaimDecision {
  const year = istanbulYmd(now).y;
  const yearStart = istanbulYearStart(year);
  if (!record) return { canClaim: false, reason: 'NOT_SET', isToday: false, yearStart, year };
  const isToday = isBirthdayToday(record.birthDate, now);
  if (record.lastBonusAt && record.lastBonusAt.getTime() >= yearStart.getTime()) {
    return { canClaim: false, reason: 'ALREADY_CLAIMED', isToday, yearStart, year };
  }
  if (!isToday) return { canClaim: false, reason: 'NOT_TODAY', isToday, yearStart, year };
  if (now.getTime() - record.createdAt.getTime() < BIRTHDAY_MIN_REGISTRATION_DAYS * DAY_MS) {
    return { canClaim: false, reason: 'TOO_RECENT', isToday, yearStart, year };
  }
  return { canClaim: true, reason: 'OK', isToday, yearStart, year };
}

/** `YYYY-MM-DD` doğum tarihi girdisi: geçerli takvim günü, gelecekte değil, makul yaş aralığı. */
export function parseBirthDateInput(raw: string, now: Date): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const today = istanbulYmd(now);
  if (ymdIndex({ y, m, d }) > ymdIndex(today)) return null;
  if (today.y - y > 120) return null;
  return date;
}

export const BIRTHDAY_CLAIM_MESSAGES: Record<Exclude<BirthdayClaimReason, 'OK'>, string> = {
  NOT_SET: 'Önce doğum tarihini kaydetmelisin.',
  NOT_TODAY: 'Doğum günü bonusu yalnız doğum gününde alınabilir.',
  ALREADY_CLAIMED: 'Bu yılın doğum günü bonusunu zaten aldın.',
  TOO_RECENT: `Doğum günü bonusu, doğum tarihi en az ${BIRTHDAY_MIN_REGISTRATION_DAYS} gün önce kaydedildiyse verilir.`,
};
