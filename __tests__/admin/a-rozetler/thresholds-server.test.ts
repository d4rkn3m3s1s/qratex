/**
 * Rozetler merkezi — Eşikler: aralık/varsayılan temizliği, etki önizlemesi hesabı (hazır olan,
 * gerileyen, ek rozet, dağılım) ve sürüm çakışmasının 409'a çevrilmesi. Prisma mock.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@prisma/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    join: (v: unknown[]) => v,
  },
}));
jest.mock('@/lib/character-categories', () => {
  const cats = [
    { key: 'komedi', name: 'Komedi', emoji: '😂', accent: '#f59e0b', description: '', characterIds: ['c1', 'c2'] },
    { key: 'gizemli', name: 'Gizemli', emoji: '🌿', accent: '#10b981', description: '', characterIds: ['c3'], threshold: 20 },
  ];
  return {
    CHARACTER_CATEGORIES: cats,
    CATEGORY_BY_KEY: Object.fromEntries(cats.map((c) => [c.key, c])),
    categoryThreshold: (c: { key: string; threshold?: number }, o?: Record<string, { threshold?: number }>) => o?.[c.key]?.threshold ?? c.threshold ?? 6,
    categoryMinReviewLength: (c: { key: string }, o?: Record<string, { minReviewLength?: number }>) => o?.[c.key]?.minReviewLength ?? 0,
  };
});
jest.mock('@/lib/character-badges', () => ({
  CHARACTER_PROFILES: [{ badgeId: 'c1' }, { badgeId: 'c2' }, { badgeId: 'c3' }],
  inactiveCharacterIds: jest.fn(async () => new Set<string>()),
}));
jest.mock('@/lib/badge-reward-points', () => ({ badgeRewardPoints: () => 2500 }));

const mockRead = jest.fn(async () => ({ overrides: {}, updatedAt: null }));
jest.mock('@/lib/character-thresholds', () => ({
  CATEGORY_THRESHOLDS_SETTING_KEY: 'character_category_thresholds',
  CATEGORY_THRESHOLDS_SETTING_CATEGORY: 'gamification',
  clearCategoryThresholdsCache: jest.fn(),
  normalizeCategoryThresholds: (v: unknown) => (v && typeof v === 'object' ? v : {}),
  readCategoryThresholdsStrict: () => mockRead(),
}));

const db = {
  $queryRaw: jest.fn(),
  userBadge: { findMany: jest.fn(async () => []) },
  auditLog: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(db)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

const mockWrite = jest.fn();
jest.mock('@/lib/settings-version', () => {
  class VersionConflictError extends Error {}
  return {
    VersionConflictError,
    isVersionConflictError: (e: unknown) => e instanceof VersionConflictError,
    versionFromDate: (d: Date | null) => (d ? d.toISOString() : 'none'),
    writeVersionedSetting: (...a: unknown[]) => mockWrite(...a),
  };
});

import { bucketOf, cleanOverrides, previewThresholdImpact, revealableCount, saveThresholds } from '@/lib/admin-badges/thresholds.server';
import { thresholdsPutSchema } from '@/lib/admin-badges/contract';

beforeEach(() => jest.clearAllMocks());

describe('doğrulama', () => {
  it('aralık dışı eşik sessizce atılmaz: zod alan hatası', () => {
    const r = thresholdsPutSchema.safeParse({ overrides: { komedi: { threshold: 1 } }, baseVersion: 'none' });
    expect(r.success).toBe(false);
    expect(thresholdsPutSchema.safeParse({ overrides: { komedi: { minReviewLength: 5000 } }, baseVersion: 'none' }).success).toBe(false);
  });

  it('bilinmeyen kategori 400; varsayılana eşit değer override sayılmaz', () => {
    expect(() => cleanOverrides({ yok: { threshold: 5 } })).toThrow();
    expect(cleanOverrides({ komedi: { threshold: 6, minReviewLength: 0 }, gizemli: { threshold: 25 } })).toEqual({ gizemli: { threshold: 25 } });
  });
});

describe('etki hesabı', () => {
  it('revealableCount karakter sınırıyla, bucketOf dağılımı', () => {
    expect(revealableCount(12, 6, 0, 2)).toBe(2);
    expect(revealableCount(12, 3, 0, 2)).toBe(2); // karakter sınırı
    expect(revealableCount(5, 6, 0, 2)).toBe(0);
    expect(revealableCount(30, 6, 0, 0)).toBe(0); // tükenmiş kategori
    expect(bucketOf(3, 6, 0, false)).toBe(2);
    expect(bucketOf(6, 6, 0, true)).toBe(4);
  });

  it('eşik düşürülünce yeni hazır olanlar ve tahmini puan; yükseltilince gerileyenler', async () => {
    db.$queryRaw.mockResolvedValue([
      { uid: 'u1', cat: 'komedi', cur: 4, nxt: 4 }, // 6'da değil, 3'te hazır
      { uid: 'u2', cat: 'komedi', cur: 6, nxt: 6 }, // her iki durumda hazır
    ]);
    const down = await previewThresholdImpact({ komedi: { threshold: 3 } });
    const k = down.rows.find((r) => r.key === 'komedi')!;
    expect(k).toMatchObject({ readyNow: 1, readyAfter: 2, newlyReady: 1, regressed: 0, users: 2 });
    expect(k.extraReveals).toBe(2); // u1: 0→1, u2: 1→2
    expect(k.extraPointsEstimate).toBe(5000);

    const up = await previewThresholdImpact({ komedi: { threshold: 10 } });
    expect(up.rows.find((r) => r.key === 'komedi')).toMatchObject({ readyNow: 1, readyAfter: 0, regressed: 1 });
  });
});

describe('kayıt', () => {
  it('sürüm çakışması 409 VERSION_CONFLICT; denetim aynı tx', async () => {
    const { VersionConflictError } = jest.requireMock('@/lib/settings-version') as { VersionConflictError: new () => Error };
    mockWrite.mockRejectedValueOnce(new VersionConflictError());
    await expect(saveThresholds({ overrides: { komedi: { threshold: 8 } }, baseVersion: 'old' }, { id: 'a' })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      status: 409,
    });
    mockWrite.mockResolvedValueOnce({ id: 's1', previous: {} });
    await saveThresholds({ overrides: { komedi: { threshold: 8 } }, baseVersion: 'none' }, { id: 'a' });
    expect(mockWrite.mock.calls[1][1]).toMatchObject({ value: { komedi: { threshold: 8 } }, baseVersion: 'none' });
    expect(db.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: 'UPDATE_CATEGORY_THRESHOLDS' } });
  });
});
