/**
 * Çarpan politikası (P0-13, P0-21): mutlu saat şeması + İstanbul saati canlılığı, sezonsal
 * kampanya hedeflemesi (BIRTHDAY/ANNIVERSARY/minLevel) ve okuma anı kırpmaları, puan matrisi
 * alan bazlı üst sınır şeması. Gerçek DB'ye GİDİLMEZ.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  MULTIPLIER_CASCADE_MAX,
  clampHappyHourMultiplier,
  clampSeasonalBonus,
  combineMultipliers,
} from '@/lib/points-multipliers';
import {
  getLiveHappyHourMultiplier,
  getZonedClock,
  happyHourCreateSchema,
  isHappyHourLive,
} from '@/lib/happy-hour-live';
import {
  applySeasonalCampaignMultiplier,
  getActiveSeasonalCampaign,
  isCampaignEligible,
} from '@/lib/seasonal-campaign-live';
import { pointsMatrixSchema, POINTS_MATRIX_LIMITS } from '@/lib/points-matrix-schema';
import { getDefaultPointsMatrix, normalizePointsMatrix } from '@/lib/points-rules';
import { adminPointsMatrixPutSchema } from '@/lib/validations-admin';

// Perşembe 2026-10-08 09:30 UTC = 12:30 İstanbul
const THU_0930Z = new Date('2026-10-08T09:30:00.000Z');

const hh = (o: Record<string, unknown> = {}) => ({
  id: 'h',
  startTime: '12:00',
  endTime: '14:00',
  daysOfWeek: [4],
  isActive: true,
  validFrom: null,
  validUntil: null,
  multiplier: 2,
  ...o,
});

describe('points-multipliers', () => {
  it('mutlu saat çarpanı [1,3] aralığına kırpılır; bozuk değer etkisiz (1)', () => {
    expect(clampHappyHourMultiplier(1_000_000)).toBe(3);
    expect(clampHappyHourMultiplier(0.2)).toBe(1);
    expect(clampHappyHourMultiplier(NaN)).toBe(1);
    expect(clampHappyHourMultiplier(-5)).toBe(1);
    expect(clampHappyHourMultiplier(2.5)).toBe(2.5);
  });
  it('sezon bonusu ≤ 250', () => {
    expect(clampSeasonalBonus(100_000)).toBe(250);
    expect(clampSeasonalBonus(-1)).toBe(0);
  });
  it('şelale toplamı ≤ 4 ve ≥ 1', () => {
    expect(combineMultipliers(3, 3, 2)).toBe(MULTIPLIER_CASCADE_MAX);
    expect(combineMultipliers(0.5)).toBe(1);
    expect(combineMultipliers(undefined, null, 2)).toBe(2);
  });
});

describe('happy hour şeması (POST /api/happy-hour)', () => {
  const valid = { name: 'Akşam', startTime: '17:00', endTime: '19:00', daysOfWeek: [1, 1, 5] };
  it('saldırı: multiplier 1.000.000 reddedilir', () => {
    const r = happyHourCreateSchema.safeParse({ ...valid, multiplier: 1_000_000 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toBe('Çarpan en fazla 3 olabilir');
  });
  it('geçerli gövde; gün listesi tekilleşir', () => {
    const r = happyHourCreateSchema.safeParse({ ...valid, multiplier: 3 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.daysOfWeek).toEqual([1, 5]);
  });
  it('SS:dd, gün 0–6, aynı başlangıç/bitiş ve ters geçerlilik aralığı reddedilir', () => {
    expect(happyHourCreateSchema.safeParse({ ...valid, startTime: '25:00' }).success).toBe(false);
    expect(happyHourCreateSchema.safeParse({ ...valid, daysOfWeek: [7] }).success).toBe(false);
    expect(happyHourCreateSchema.safeParse({ ...valid, daysOfWeek: [] }).success).toBe(false);
    expect(happyHourCreateSchema.safeParse({ ...valid, endTime: '17:00' }).success).toBe(false);
    expect(
      happyHourCreateSchema.safeParse({
        ...valid,
        validFrom: '2026-10-10T00:00:00.000Z',
        validUntil: '2026-10-09T00:00:00.000Z',
      }).success
    ).toBe(false);
  });
});

describe('happy hour canlılığı — İstanbul duvar saati', () => {
  it('saat dilimi dönüşümü', () => {
    expect(getZonedClock(THU_0930Z)).toEqual({ day: 4, minutes: 12 * 60 + 30, hhmm: '12:30' });
  });
  it('12:00–14:00 penceresi 12:30 İstanbul’da canlı (UTC ile 3 saat kayık değil)', () => {
    expect(isHappyHourLive(hh(), THU_0930Z)).toBe(true);
    // UTC 12:30 = İstanbul 15:30 → pencere dışında.
    expect(isHappyHourLive(hh(), new Date('2026-10-08T12:30:00.000Z'))).toBe(false);
  });
  it('gece taşması: Cuma 22:00–02:00, Cumartesi 01:00 canlı (Cumartesi seçili olmasa da)', () => {
    const friNight = hh({ startTime: '22:00', endTime: '02:00', daysOfWeek: [5] });
    // Cumartesi 01:00 İstanbul = Cuma 22:00 UTC
    expect(isHappyHourLive(friNight, new Date('2026-10-09T22:00:00.000Z'))).toBe(true);
    // Cuma 01:00 İstanbul (Perşembe gecesi) → Perşembe seçili değil
    expect(isHappyHourLive(friNight, new Date('2026-10-08T22:00:00.000Z'))).toBe(false);
  });
  it('canlı en yüksek çarpan kırpılır', () => {
    const r = getLiveHappyHourMultiplier([hh({ id: 'a', multiplier: 1_000_000 }), hh({ id: 'b', multiplier: 2 })], THU_0930Z);
    expect(r).toEqual({ multiplier: 3, happyHourId: 'a' });
    expect(getLiveHappyHourMultiplier([hh({ isActive: false })], THU_0930Z).multiplier).toBe(1);
  });
});

describe('sezonsal kampanya hedeflemesi', () => {
  const user = (o: Record<string, unknown> = {}) => ({
    userId: 'u1',
    level: 5,
    createdAt: new Date('2024-10-08T10:00:00Z'),
    birthDate: new Date('1995-10-08T00:00:00Z'),
    ...o,
  });

  it('BIRTHDAY: kullanıcı kimliği yoksa UYGULANMAZ (eskiden herkese uygulanıyordu)', () => {
    expect(isCampaignEligible({ type: 'BIRTHDAY', conditions: null }, null, THU_0930Z)).toBe(false);
  });
  it('BIRTHDAY: yalnız doğum günü bugün olana', () => {
    expect(isCampaignEligible({ type: 'BIRTHDAY', conditions: null }, user(), THU_0930Z)).toBe(true);
    expect(
      isCampaignEligible({ type: 'BIRTHDAY', conditions: null }, user({ birthDate: new Date('1995-01-02T00:00:00Z') }), THU_0930Z)
    ).toBe(false);
    expect(isCampaignEligible({ type: 'BIRTHDAY', conditions: null }, user({ birthDate: null }), THU_0930Z)).toBe(false);
  });
  it('29 Şubat doğumlu artık olmayan yılda 28 Şubat’ta uygun', () => {
    expect(
      isCampaignEligible(
        { type: 'BIRTHDAY', conditions: null },
        user({ birthDate: new Date('2000-02-29T00:00:00Z') }),
        new Date('2027-02-28T10:00:00Z')
      )
    ).toBe(true);
  });
  it('ANNIVERSARY: yıl dönümü bugün ve en az bir yıl', () => {
    expect(isCampaignEligible({ type: 'ANNIVERSARY', conditions: null }, user(), THU_0930Z)).toBe(true);
    expect(
      isCampaignEligible({ type: 'ANNIVERSARY', conditions: null }, user({ createdAt: new Date('2026-10-08T01:00:00Z') }), THU_0930Z)
    ).toBe(false);
  });
  it('koşullar: minLevel uygulanır; tanınmayan koşul = uygun değil', () => {
    expect(isCampaignEligible({ type: 'SEASONAL', conditions: { minLevel: 3 } }, user(), THU_0930Z)).toBe(true);
    expect(isCampaignEligible({ type: 'SEASONAL', conditions: { minLevel: 9 } }, user(), THU_0930Z)).toBe(false);
    expect(isCampaignEligible({ type: 'SEASONAL', conditions: { minLevel: 3 } }, null, THU_0930Z)).toBe(false);
    expect(isCampaignEligible({ type: 'SEASONAL', conditions: { region: 'x' } }, user(), THU_0930Z)).toBe(false);
    expect(isCampaignEligible({ type: 'SEASONAL', conditions: null }, null, THU_0930Z)).toBe(true);
  });

  function dbWith(campaigns: Array<Record<string, unknown>>, birthDate: Date | null = null) {
    return {
      seasonalCampaign: { findMany: jest.fn(async () => campaigns) },
      user: {
        findUnique: jest.fn(async () => ({
          id: 'u1',
          level: 1,
          createdAt: new Date('2020-01-01T00:00:00Z'),
          birthday: birthDate ? { birthDate } : null,
        })),
      },
    } as never;
  }

  it('canlıdaki 10× / 100.000 bonuslu kampanya okumada 3× / 250’ye kırpılır', async () => {
    const db = dbWith([{ id: 'c', type: 'SEASONAL', multiplier: 10, bonusPoints: 100_000, conditions: null }]);
    expect(await getActiveSeasonalCampaign(THU_0930Z, db)).toEqual({
      campaignId: 'c',
      type: 'SEASONAL',
      multiplier: 3,
      bonusPoints: 250,
    });
    const r = await applySeasonalCampaignMultiplier(100, THU_0930Z, db);
    expect(r.points).toBe(300 + 250);
  });

  it('userId’siz çağrı (feedback yolu bugün) BIRTHDAY’i atlar, genel kampanyayı seçer', async () => {
    const db = dbWith([
      { id: 'bday', type: 'BIRTHDAY', multiplier: 3, bonusPoints: 0, conditions: null },
      { id: 'gen', type: 'SEASONAL', multiplier: 1.5, bonusPoints: 0, conditions: null },
    ]);
    expect((await getActiveSeasonalCampaign(THU_0930Z, db))?.campaignId).toBe('gen');
  });

  it('userId ile doğum günü olan kullanıcıda BIRTHDAY seçilir', async () => {
    const db = dbWith(
      [
        { id: 'bday', type: 'BIRTHDAY', multiplier: 3, bonusPoints: 0, conditions: null },
        { id: 'gen', type: 'SEASONAL', multiplier: 1.5, bonusPoints: 0, conditions: null },
      ],
      new Date('1999-10-08T00:00:00Z')
    );
    expect((await getActiveSeasonalCampaign(THU_0930Z, db, 'u1'))?.campaignId).toBe('bday');
  });

  it('DB hatası → null (puan vermemek güvenli taraf)', async () => {
    const db = { seasonalCampaign: { findMany: jest.fn(async () => { throw new Error('down'); }) } } as never;
    expect(await getActiveSeasonalCampaign(THU_0930Z, db)).toBeNull();
  });
});

describe('puan matrisi şeması (alan bazlı üst sınır)', () => {
  it('varsayılan matris şemadan geçer', () => {
    expect(pointsMatrixSchema.safeParse(getDefaultPointsMatrix()).success).toBe(true);
  });
  it('saldırı/yanlış tuş: referral 100.000.000 reddedilir', () => {
    const m = structuredClone(getDefaultPointsMatrix());
    m.referral.referrerPoints = 100_000_000;
    const r = adminPointsMatrixPutSchema.safeParse({ matrix: m, baseVersion: 'v1' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toContain('en fazla 20.000');
  });
  it('yinelenen çark ödül kimliği ve seri günü reddedilir', () => {
    const m = structuredClone(getDefaultPointsMatrix());
    m.spin.prizes[1].id = m.spin.prizes[0].id;
    expect(pointsMatrixSchema.safeParse(m).success).toBe(false);
    const m2 = structuredClone(getDefaultPointsMatrix());
    m2.streak.milestones.push({ days: 7, points: 1 });
    expect(pointsMatrixSchema.safeParse(m2).success).toBe(false);
  });
  it('eksik bölüm varsayılanla doldurulmaz, reddedilir', () => {
    const { spin: _spin, ...partial } = getDefaultPointsMatrix();
    void _spin;
    const r = pointsMatrixSchema.safeParse(partial);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toBe('Çark bölümü gerekli');
  });
  it('PUT şeması baseVersion gibi ek alanları korur', () => {
    const r = adminPointsMatrixPutSchema.safeParse({ matrix: getDefaultPointsMatrix(), baseVersion: 'v1' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).baseVersion).toBe('v1');
  });
  it('okuma tarafı: canlıdaki aşırı değerler kırpılır (Int taşması / milyonluk ödül yok)', () => {
    const m = normalizePointsMatrix({
      ...getDefaultPointsMatrix(),
      referral: { referredPoints: 1e12, referrerPoints: Infinity },
      birthday: { points: 99_999_999 },
      spin: { enabled: true, dailyLimit: 500, prizes: [{ id: 'x', label: 'X', type: 'points', value: 1e9, weight: 1e9 }] },
    });
    expect(m.referral.referredPoints).toBe(POINTS_MATRIX_LIMITS.referral.max);
    expect(m.referral.referrerPoints).toBe(getDefaultPointsMatrix().referral.referrerPoints);
    expect(m.birthday.points).toBe(POINTS_MATRIX_LIMITS.birthday.max);
    expect(m.spin.dailyLimit).toBe(POINTS_MATRIX_LIMITS.spinDailyLimit.max);
    expect(m.spin.prizes[0].value).toBe(POINTS_MATRIX_LIMITS.spinPrizeValue.max);
    expect(m.spin.prizes[0].weight).toBe(POINTS_MATRIX_LIMITS.spinPrizeWeight.max);
  });
});
