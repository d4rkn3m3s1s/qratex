/**
 * login-streak: gün anahtarı (Europe/Istanbul), seri kararı ve kilometre taşı ödülü.
 * Bir gün içindeki iki giriş AYNI anahtarı üretir (çift check-in guard'ının temeli);
 * kilometre taşı yalnız TAM eşleşmede ve yalnız `mintPoints` ile (ömür boyu tek-kez anahtarı)
 * ödenir; kaçırılan kilometre taşı geri ödenmez.
 */
const mockFindUnique = jest.fn();
const mockUpdateMany = jest.fn();
const mockUpdate = jest.fn();
const mockNotify = jest.fn();
const tx = {
  user: { updateMany: (...a: unknown[]) => mockUpdateMany(...a), update: (...a: unknown[]) => mockUpdate(...a) },
  notification: { create: (...a: unknown[]) => mockNotify(...a) },
};
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
  isPrismaConnectivityError: () => false,
}));
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

import {
  loginDayKey,
  loginStreakMilestoneKey,
  nextStreakValue,
  touchLoginStreak,
  LOGIN_STREAK_MILESTONES,
} from '@/lib/login-streak';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockMint.mockResolvedValue({ credited: 50, xpCredited: 0, duplicate: false });
});

describe('loginDayKey — İstanbul gün sınırı', () => {
  it('aynı İstanbul gününün farklı saatleri AYNI anahtarı verir', () => {
    const morning = new Date('2026-08-08T06:00:00.000Z'); // 09:00 İstanbul
    const lateNight = new Date('2026-08-08T20:59:59.000Z'); // 23:59 İstanbul
    expect(loginDayKey(morning)).toBe('2026-08-08');
    expect(loginDayKey(morning)).toBe(loginDayKey(lateNight));
  });

  it('İstanbul gece yarısı (UTC 21:00) yeni gün başlatır — eski UTC hatası', () => {
    expect(loginDayKey(new Date('2026-08-08T20:59:59.999Z'))).toBe('2026-08-08');
    expect(loginDayKey(new Date('2026-08-08T21:00:00.000Z'))).toBe('2026-08-09');
    // UTC'de aynı gün, İstanbul'da farklı gün:
    expect(loginDayKey(new Date('2026-08-08T22:30:00.000Z'))).not.toBe(loginDayKey(new Date('2026-08-08T10:00:00.000Z')));
  });
});

describe('nextStreakValue', () => {
  const now = new Date('2026-08-08T10:00:00.000Z');
  it('ilk dokunuş 1', () => expect(nextStreakValue(null, 0, now)).toMatchObject({ next: 1, alreadyCounted: false }));
  it('dün → +1', () => expect(nextStreakValue(new Date('2026-08-07T10:00:00Z'), 4, now)).toMatchObject({ next: 5 }));
  it('bugün → değişmez', () => expect(nextStreakValue(new Date('2026-08-08T01:00:00Z'), 4, now)).toMatchObject({ next: 4, alreadyCounted: true }));
  it('daha eski → 1 (seri kırıldı)', () => expect(nextStreakValue(new Date('2026-08-05T10:00:00Z'), 9, now)).toMatchObject({ next: 1 }));
});

describe('touchLoginStreak', () => {
  const now = new Date('2026-08-08T10:00:00.000Z');

  it('3. gün: mintPoints ile kilometre taşı, ömür boyu tek-kez anahtarı ve bayrak aynı tx', async () => {
    mockFindUnique.mockResolvedValue({
      loginStreakCount: 2,
      loginStreakLongest: 2,
      loginStreakLastDay: new Date('2026-08-07T09:00:00Z'),
      loginStreakClaimedMilestones: [],
    });
    const r = await touchLoginStreak('u1', now);
    expect(r).toMatchObject({ streak: 3, isNewDay: true, milestoneReward: { days: 3, points: 50 }, claimedMilestones: [3] });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1', OR: [{ loginStreakLastDay: null }, { loginStreakLastDay: { lt: new Date('2026-08-07T21:00:00.000Z') } }] },
      })
    );
    expect(mockMint).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'u1', points: 50, source: 'streak', idempotencyKey: loginStreakMilestoneKey('u1', 3) })
    );
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { loginStreakClaimedMilestones: [3] } });
  });

  it('bugün zaten sayıldıysa yazma ve kredi yok', async () => {
    mockFindUnique.mockResolvedValue({
      loginStreakCount: 3,
      loginStreakLongest: 3,
      loginStreakLastDay: new Date('2026-08-08T05:00:00Z'),
      loginStreakClaimedMilestones: [3],
    });
    const r = await touchLoginStreak('u1', now);
    expect(r.isNewDay).toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('eşzamanlı yarışı kaybeden çağrı kredi yapmaz', async () => {
    mockFindUnique.mockResolvedValue({
      loginStreakCount: 2,
      loginStreakLongest: 2,
      loginStreakLastDay: new Date('2026-08-07T09:00:00Z'),
      loginStreakClaimedMilestones: [],
    });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const r = await touchLoginStreak('u1', now);
    expect(r.isNewDay).toBe(false);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('defterde zaten ödenmişse (duplicate) bildirim ve yeni ödül yok', async () => {
    mockFindUnique.mockResolvedValue({
      loginStreakCount: 2,
      loginStreakLongest: 5,
      loginStreakLastDay: new Date('2026-08-07T09:00:00Z'),
      loginStreakClaimedMilestones: [],
    });
    mockMint.mockResolvedValue({ credited: 50, xpCredited: 0, duplicate: true });
    const r = await touchLoginStreak('u1', now);
    expect(r.milestoneReward).toBeUndefined();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('LOGIN_STREAK_MILESTONES — veri bütünlüğü', () => {
  it('günler artan sırada ve benzersiz', () => {
    const days = LOGIN_STREAK_MILESTONES.map((m) => m.days);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it('her milestone pozitif puan verir', () => {
    for (const m of LOGIN_STREAK_MILESTONES) expect(m.points).toBeGreaterThan(0);
  });

  it('milestone yalnız TAM eşleşmede bulunur (kaçırılan geri ödenmez)', () => {
    const find = (d: number) => LOGIN_STREAK_MILESTONES.find((m) => m.days === d);
    expect(find(3)).toBeDefined();
    expect(find(7)).toBeDefined();
    expect(find(4)).toBeUndefined();
    expect(find(8)).toBeUndefined();
  });
});
