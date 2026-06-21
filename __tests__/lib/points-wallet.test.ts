/**
 * points-wallet testleri: puan/XP kredisi ve borçlandırma para primitifleridir;
 * atomiklik ve seviye (level) yarış-güvenliği kritik. creditPointsAndXp artımı
 * atomik yapar, level'ı increment SONRASI gerçek XP'den hesaplar ve updateMany
 * level-guard ile koşullu bump eder (iki eşzamanlı kredide yalnızca biri level
 * yukarı taşır). debitPoints, points>=tutar guard'lı updateMany ile çift-harcamayı
 * ve eksi bakiyeyi engeller.
 */
const mockUserUpdate = jest.fn();
const mockUserUpdateMany = jest.fn();
const mockUserFindUnique = jest.fn();

const db = {
  user: {
    update: (...a: unknown[]) => mockUserUpdate(...a),
    updateMany: (...a: unknown[]) => mockUserUpdateMany(...a),
    findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  creditPointsAndXp,
  debitPoints,
  InsufficientPointsError,
} from '@/lib/points-wallet';
import { calculateLevel } from '@/lib/utils';

beforeEach(() => {
  mockUserUpdate.mockReset();
  mockUserUpdateMany.mockReset();
  mockUserFindUnique.mockReset();
});

describe('creditPointsAndXp', () => {
  it('negatif/ondalık puan ve XP taban sıfıra/floor edilir; 0 ise increment yazılmaz', async () => {
    mockUserUpdate.mockResolvedValue({ id: 'u1', points: 0, xp: 0, level: 1 });
    await creditPointsAndXp(db as never, { userId: 'u1', points: -5, xp: 3.9 });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        // points<=0 → yazılmaz; xp floor(3.9)=3 → increment 3
        data: { xp: { increment: 3 } },
      })
    );
  });

  it('puan ve XP pozitifse ikisi de atomik increment edilir', async () => {
    mockUserUpdate.mockResolvedValue({ id: 'u1', points: 150, xp: 75, level: 1 });
    // calculateLevel(75) seviye atlamayacak kadar düşükse updateMany çağrılmaz.
    const res = await creditPointsAndXp(db as never, { userId: 'u1', points: 150, xp: 75 });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points: { increment: 150 }, xp: { increment: 75 } } })
    );
    expect(res.points).toBe(150);
  });

  it('level gerçekten yükseldiyse updateMany level-guard ile koşullu bump; count>0 → isLevelUp true', async () => {
    // increment sonrası yüksek XP seç ki calculateLevel eski level'dan büyük olsun.
    const bigXp = 100000;
    const newLevel = calculateLevel(bigXp);
    expect(newLevel).toBeGreaterThan(1);
    mockUserUpdate.mockResolvedValue({ id: 'u1', points: 0, xp: bigXp, level: 1 });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    const res = await creditPointsAndXp(db as never, { userId: 'u1', xp: bigXp });

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1', level: { lt: newLevel } },
        data: { level: newLevel },
      })
    );
    expect(res.level).toBe(newLevel);
    expect(res.isLevelUp).toBe(true);
  });

  it('eşzamanlı ikinci kredi level-guard yarışını kaybederse (count=0) isLevelUp false', async () => {
    const bigXp = 100000;
    const newLevel = calculateLevel(bigXp);
    mockUserUpdate.mockResolvedValue({ id: 'u1', points: 0, xp: bigXp, level: 1 });
    mockUserUpdateMany.mockResolvedValue({ count: 0 }); // başka çağrı zaten yükseltmiş

    const res = await creditPointsAndXp(db as never, { userId: 'u1', xp: bigXp });

    expect(res.level).toBe(newLevel);
    expect(res.isLevelUp).toBe(false); // bump'ı bu çağrı yapmadı
  });

  it('level değişmediyse updateMany hiç çağrılmaz', async () => {
    mockUserUpdate.mockResolvedValue({ id: 'u1', points: 10, xp: 5, level: 1 });
    await creditPointsAndXp(db as never, { userId: 'u1', points: 10, xp: 5 });
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
  });
});

describe('debitPoints', () => {
  it('tutar 0 ise borçlandırma yapılmaz, kullanıcı cüzdanı döner', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', points: 100, xp: 0, level: 1 });
    const res = await debitPoints(db as never, { userId: 'u1', points: 0 });
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(res.points).toBe(100);
  });

  it('tutar 0 ve kullanıcı yoksa InsufficientPointsError', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(debitPoints(db as never, { userId: 'u1', points: 0 })).rejects.toBeInstanceOf(
      InsufficientPointsError
    );
  });

  it('yeterli bakiye: guard-lı updateMany decrement (count=1) → güncel cüzdan döner', async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockUserFindUnique.mockResolvedValue({ id: 'u1', points: 50, xp: 0, level: 1 });

    const res = await debitPoints(db as never, { userId: 'u1', points: 50 });

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1', points: { gte: 50 } },
        data: { points: { decrement: 50 } },
      })
    );
    expect(res.points).toBe(50);
  });

  it('yetersiz bakiye: guard count=0 → InsufficientPointsError (current/required ile)', async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 0 });
    mockUserFindUnique.mockResolvedValue({ points: 30 }); // guard sonrası okunan bakiye

    await expect(
      debitPoints(db as never, { userId: 'u1', points: 100 })
    ).rejects.toMatchObject({ currentPoints: 30, requiredPoints: 100 });
    expect(mockUserUpdateMany).toHaveBeenCalled();
  });

  it('negatif tutar floor(0) ile 0 muamelesi görür (eksi bakiye basılmaz)', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', points: 10, xp: 0, level: 1 });
    const res = await debitPoints(db as never, { userId: 'u1', points: -20 });
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(res.points).toBe(10);
  });
});
