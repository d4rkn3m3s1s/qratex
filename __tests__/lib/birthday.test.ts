/**
 * lib/birthday — doğum günü kuralları (lounge raporu B3, B7).
 *  - "Bugün" Europe/Istanbul'a göre (sunucu UTC'ydi: TR'de ilk 3 saat görünmüyordu).
 *  - 29 Şubat artık olmayan yılda 28 Şubat.
 *  - Tarih en az 30 gün önce kaydedilmiş olmalı (bugüne ayarla → anında bonus kapandı).
 */
import {
  BIRTHDAY_MIN_REGISTRATION_DAYS,
  birthdayInYear,
  daysUntilBirthday,
  evaluateBirthdayClaim,
  isBirthdayToday,
  istanbulDayStart,
  istanbulYearStart,
  istanbulYmd,
  parseBirthDateInput,
} from '@/lib/birthday';

const birth = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const longAgo = new Date('2020-01-01T00:00:00Z');

describe('İstanbul takvimi', () => {
  it('UTC 21:30 → İstanbul ertesi gün', () => {
    expect(istanbulYmd(new Date('2026-03-14T21:30:00Z'))).toEqual({ y: 2026, m: 3, d: 15 });
  });

  it('İstanbul gün ve yıl başlangıcı UTC+3', () => {
    expect(istanbulDayStart(new Date('2026-03-15T10:00:00Z')).toISOString()).toBe('2026-03-14T21:00:00.000Z');
    expect(istanbulYearStart(2027).toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
});

describe('isBirthdayToday', () => {
  const b = birth(1995, 3, 15);
  it('TR gece 00:30 (UTC önceki gün 21:30) → bugün', () => {
    expect(isBirthdayToday(b, new Date('2026-03-14T21:30:00Z'))).toBe(true);
  });
  it('ertesi gün TR 01:00 (UTC hâlâ 15 Mart) → bugün DEĞİL', () => {
    expect(isBirthdayToday(b, new Date('2026-03-15T22:00:00Z'))).toBe(false);
  });
  it('29 Şubat doğumlu artık olmayan yılda 28 Şubat kutlar', () => {
    const leap = birth(2000, 2, 29);
    expect(birthdayInYear(2, 29, 2026)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(isBirthdayToday(leap, new Date('2026-02-28T09:00:00Z'))).toBe(true);
    expect(isBirthdayToday(leap, new Date('2028-02-29T09:00:00Z'))).toBe(true);
    expect(isBirthdayToday(leap, new Date('2028-02-28T09:00:00Z'))).toBe(false);
  });
});

describe('daysUntilBirthday', () => {
  it('bugün → 0, yarın → 1, geçtiyse gelecek yıl', () => {
    const b = birth(1990, 6, 10);
    expect(daysUntilBirthday(b, new Date('2026-06-10T08:00:00Z'))).toBe(0);
    expect(daysUntilBirthday(b, new Date('2026-06-09T08:00:00Z'))).toBe(1);
    expect(daysUntilBirthday(b, new Date('2026-06-11T08:00:00Z'))).toBe(364);
  });
});

describe('evaluateBirthdayClaim', () => {
  const now = new Date('2026-06-10T08:00:00Z');
  const b = birth(1990, 6, 10);

  it('kayıt yok → NOT_SET', () => {
    expect(evaluateBirthdayClaim(null, now).reason).toBe('NOT_SET');
  });
  it('doğum günü değil → NOT_TODAY', () => {
    expect(evaluateBirthdayClaim({ birthDate: birth(1990, 7, 1), createdAt: longAgo, lastBonusAt: null }, now).reason).toBe('NOT_TODAY');
  });
  it('tarih bugün kaydedildi → TOO_RECENT (bugüne ayarla + anında bonus kapalı)', () => {
    const d = evaluateBirthdayClaim({ birthDate: b, createdAt: new Date('2026-06-10T07:59:00Z'), lastBonusAt: null }, now);
    expect(d).toMatchObject({ canClaim: false, reason: 'TOO_RECENT', isToday: true });
  });
  it(`${BIRTHDAY_MIN_REGISTRATION_DAYS} gün önce kaydedilmiş → OK, tek-kez yılı İstanbul yılı`, () => {
    const d = evaluateBirthdayClaim({ birthDate: b, createdAt: new Date('2026-05-01T00:00:00Z'), lastBonusAt: null }, now);
    expect(d).toMatchObject({ canClaim: true, reason: 'OK', year: 2026 });
  });
  it('bu yıl alınmış → ALREADY_CLAIMED; geçen yıl alınmış → OK', () => {
    expect(evaluateBirthdayClaim({ birthDate: b, createdAt: longAgo, lastBonusAt: new Date('2026-01-05T00:00:00Z') }, now).reason).toBe('ALREADY_CLAIMED');
    expect(evaluateBirthdayClaim({ birthDate: b, createdAt: longAgo, lastBonusAt: new Date('2025-06-10T00:00:00Z') }, now).reason).toBe('OK');
  });
  it('1 Ocak doğumlu: TR 00:30 talebi yeni yıl sayılır (UTC hâlâ 31 Aralık)', () => {
    const jan1 = birth(1990, 1, 1);
    const at = new Date('2026-12-31T21:30:00Z');
    const d = evaluateBirthdayClaim({ birthDate: jan1, createdAt: longAgo, lastBonusAt: new Date('2026-01-01T08:00:00Z') }, at);
    expect(d).toMatchObject({ canClaim: true, year: 2027 });
  });
});

describe('parseBirthDateInput', () => {
  const now = new Date('2026-06-10T08:00:00Z');
  it('geçerli tarih → UTC gece yarısı', () => {
    expect(parseBirthDateInput('1995-03-15', now)?.toISOString()).toBe('1995-03-15T00:00:00.000Z');
  });
  it('geçersiz takvim günü, gelecek ve 120 yaş üstü reddedilir', () => {
    expect(parseBirthDateInput('1995-02-30', now)).toBeNull();
    expect(parseBirthDateInput('2026-06-11', now)).toBeNull();
    expect(parseBirthDateInput('1890-01-01', now)).toBeNull();
    expect(parseBirthDateInput('abc', now)).toBeNull();
  });
});
