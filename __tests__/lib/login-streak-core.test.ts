/**
 * login-streak saf mantığı: gün-anahtarı (çift check-in guard'ının temeli) ve
 * milestone eşleşmesi. Bir gün içindeki iki giriş AYNI dayKey üretmeli (idempotent
 * kredinin dayandığı değişmez); milestone yalnız TAM eşleşmede (3/7/14/30) ödül verir,
 * kaçırılan milestone geri ödenmez.
 */
const mockAny = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => mockAny }) }),
  isPrismaConnectivityError: () => false,
}));
jest.mock('@/lib/points-wallet', () => ({ creditPointsAndXp: (...a: unknown[]) => mockAny(...a) }));

import { loginDayKey, LOGIN_STREAK_MILESTONES } from '@/lib/login-streak';

describe('loginDayKey — UTC gün sınırı', () => {
  it('aynı UTC gününün farklı saatleri AYNI anahtarı verir', () => {
    const morning = new Date('2026-08-08T06:00:00.000Z');
    const night = new Date('2026-08-08T23:59:59.000Z');
    expect(loginDayKey(morning)).toBe('2026-08-08');
    expect(loginDayKey(morning)).toBe(loginDayKey(night));
  });

  it('ardışık günler FARKLI anahtar verir', () => {
    const d1 = new Date('2026-08-08T12:00:00.000Z');
    const d2 = new Date('2026-08-09T00:00:00.000Z');
    expect(loginDayKey(d1)).not.toBe(loginDayKey(d2));
    expect(loginDayKey(d2)).toBe('2026-08-09');
  });

  it('UTC gün sınırını (00:00Z) doğru ayırır', () => {
    const lastMomentDay1 = new Date('2026-08-08T23:59:59.999Z');
    const firstMomentDay2 = new Date('2026-08-09T00:00:00.000Z');
    expect(loginDayKey(lastMomentDay1)).toBe('2026-08-08');
    expect(loginDayKey(firstMomentDay2)).toBe('2026-08-09');
  });
});

describe('LOGIN_STREAK_MILESTONES — veri bütünlüğü', () => {
  it('günler artan sırada ve benzersiz', () => {
    const days = LOGIN_STREAK_MILESTONES.map((m) => m.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it('her milestone pozitif puan verir', () => {
    for (const m of LOGIN_STREAK_MILESTONES) {
      expect(m.points).toBeGreaterThan(0);
    }
  });

  it('milestone yalnız TAM eşleşmede bulunur (kaçırılan geri ödenmez)', () => {
    const find = (d: number) => LOGIN_STREAK_MILESTONES.find((m) => m.days === d);
    expect(find(3)).toBeDefined();
    expect(find(7)).toBeDefined();
    // Aradaki günler milestone DEĞİL → ödül yok.
    expect(find(4)).toBeUndefined();
    expect(find(5)).toBeUndefined();
    expect(find(8)).toBeUndefined();
  });
});
