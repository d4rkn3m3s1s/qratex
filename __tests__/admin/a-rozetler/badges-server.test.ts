/**
 * Rozetler merkezi — katalog sunucu mantığı: filtre/sıralama/sağlık sayıları (saf), arşiv
 * onay akışı (kazanım korunur, karakter engelli), düzenlemede koşul birleştirme, elle verme
 * puan basmaz, toplu işlem atlamaları. Prisma mock — canlı DB'ye bağlanılmaz.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/character-badges', () => ({
  CHARACTER_PROFILES: [{ badgeId: 'char-a', name: 'A', trait: '' }],
  inactiveCharacterIds: jest.fn(async () => new Set()),
}));
jest.mock('@/lib/character-categories', () => ({
  CATEGORY_BY_CHARACTER: { 'char-a': { key: 'komedi', name: 'Komedi' } },
  CHARACTER_CATEGORIES: [{ key: 'komedi', name: 'Komedi', emoji: '😂', characterIds: ['char-a'] }],
}));
jest.mock('@/lib/character-reveal-texts', () => ({ getCharacterRevealText: () => null }));
jest.mock('@/lib/badge-reward-points', () => ({ badgeRewardPoints: (id: string) => (id === 'char-a' ? 5000 : 0) }));

const mockAward = jest.fn();
jest.mock('@/lib/badges/award', () => ({
  awardBadgeInTx: (...a: unknown[]) => mockAward(...a),
  AWARD_BADGE_REJECT_MESSAGES: { BADGE_NOT_FOUND: 'yok', BADGE_INACTIVE: 'pasif', BADGE_HIDDEN: 'gizli', ALREADY_OWNED: 'var' },
}));

const db = {
  badge: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  user: { findFirst: jest.fn() },
  auditLog: { create: jest.fn(async () => ({})), createMany: jest.fn(async () => ({ count: 0 })) },
  userBadge: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(db)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { computeStats, filterCatalog, runBadgeAction, runBulk, sortCatalog, updateBadge } from '@/lib/admin-badges/server';
import { badgeListQuerySchema, type BadgeListItem } from '@/lib/admin-badges/contract';

const actor = { id: 'admin1', type: 'user' as const };

function item(p: Partial<BadgeListItem>): BadgeListItem {
  return {
    id: 'b',
    name: 'Rozet',
    description: '',
    icon: '/x.svg',
    category: 'general',
    rarity: 'common',
    requirementType: 'feedback_count',
    targetValue: 10,
    trackability: 'exact',
    rewardPoints: 0,
    status: 'active',
    isCharacter: false,
    seriesKey: null,
    seriesName: null,
    color: null,
    bgColor: null,
    earnedCount: 0,
    earned30d: 0,
    lastEarnedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}

const catalog = [
  item({ id: 'n1', name: 'Çaylak', rarity: 'common', earnedCount: 5 }),
  item({ id: 'n2', name: 'Efsane', rarity: 'legendary', earnedCount: 0, trackability: 'untrackable', requirementType: 'mystery' }),
  item({ id: 'n3', name: 'Arşivli', rarity: 'rare', status: 'archived' }),
  item({ id: 'n4', name: 'Bekleyen', rarity: 'epic', status: 'inactive', earnedCount: 1 }),
  item({ id: 'char-a', name: 'Karakter', rarity: 'legendary', isCharacter: true, seriesKey: 'komedi', trackability: 'character', requirementType: 'character' }),
];

beforeEach(() => jest.clearAllMocks());

describe('filterCatalog / sortCatalog', () => {
  const q = (o: Record<string, string>) => badgeListQuerySchema.parse(o);

  it('normal sekmesi karakterleri ve arşivi gizler; arşiv yalnız health=archived ile görünür', () => {
    expect(filterCatalog(catalog, q({})).map((b) => b.id)).toEqual(['n1', 'n2', 'n4']);
    expect(filterCatalog(catalog, q({ health: 'archived' })).map((b) => b.id)).toEqual(['n3']);
    expect(filterCatalog(catalog, q({ tab: 'series' })).map((b) => b.id)).toEqual(['char-a']);
  });

  it('sağlık çipleri: izlenemez ve hiç kazanılmamış', () => {
    expect(filterCatalog(catalog, q({ health: 'untrackable' })).map((b) => b.id)).toEqual(['n2']);
    expect(filterCatalog(catalog, q({ health: 'never' })).map((b) => b.id)).toEqual(['n2']);
  });

  it('arama Türkçe büyük/küçük harf duyarsız ve koşul etiketini de tarar', () => {
    expect(filterCatalog(catalog, q({ q: 'ÇAYLAK' })).map((b) => b.id)).toEqual(['n1']);
    expect(filterCatalog(catalog, q({ q: 'toplam yorum' })).map((b) => b.id)).toEqual(['n1', 'n4']);
  });

  it('nadirlik sırası anlamlı (sözlük sırası değil)', () => {
    const sorted = sortCatalog(filterCatalog(catalog, q({})), 'rarity.desc').map((b) => b.rarity);
    expect(sorted).toEqual(['legendary', 'epic', 'common']);
  });

  it('sağlık sayıları sekme bazında; arşiv toplamdan ayrı', () => {
    const s = computeStats(catalog);
    expect(s.normal).toMatchObject({ total: 3, active: 2, inactive: 1, archived: 1, never: 1, untrackable: 1 });
    expect(s.series.total).toBe(1);
    expect(s.charactersWithoutRecord).toBe(0);
  });
});

describe('arşiv', () => {
  it('kazananı olan rozet onaysız arşivlenmez (409 CONFIRM_REQUIRED), dryRun etkiyi döner', async () => {
    db.badge.findUnique.mockResolvedValue({ name: 'X', archivedAt: null, isActive: true, _count: { users: 7 } });
    const dry = await runBadgeAction('n1', { action: 'archive', dryRun: true }, actor);
    expect(dry).toMatchObject({ dryRun: true, impact: { earnedBy: 7, requiresConfirm: true } });
    await expect(runBadgeAction('n1', { action: 'archive' }, actor)).rejects.toMatchObject({ code: 'CONFIRM_REQUIRED', status: 409 });
    expect(db.badge.update).not.toHaveBeenCalled();
  });

  it('onaylı arşiv: archivedAt + pasif, aynı tx denetim; kazanımlar silinmez', async () => {
    db.badge.findUnique.mockResolvedValue({ name: 'X', archivedAt: null, isActive: true, _count: { users: 7 } });
    await runBadgeAction('n1', { action: 'archive', confirm: true }, actor);
    expect(db.badge.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'n1' }, data: expect.objectContaining({ isActive: false }) }));
    expect(db.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: 'ARCHIVE_BADGE', entityId: 'n1' } });
  });

  it('karakter rozeti arşivlenemez', async () => {
    db.badge.findUnique.mockResolvedValue({ name: 'K', archivedAt: null, isActive: true, _count: { users: 0 } });
    await expect(runBadgeAction('char-a', { action: 'archive', confirm: true }, actor)).rejects.toMatchObject({ code: 'ARCHIVE_BLOCKED' });
  });
});

describe('düzenleme', () => {
  it('koşul birleştirilir: eski period/metadata korunur; geçersiz nadirlik reddedilir', async () => {
    db.badge.findUnique
      .mockResolvedValueOnce({ id: 'n1', archivedAt: null, requirement: { type: 'feedback_count', value: 5, period: 'week', metadata: { a: 1 } }, name: 'a', description: '', icon: '/x', category: 'general', rarity: 'common', isActive: true, color: null, bgColor: null })
      .mockResolvedValueOnce(null);
    db.badge.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data }));
    await expect(
      updateBadge('n1', { name: 'Yeni ad', icon: '/x.svg', category: 'general', rarity: 'rare', requirementType: 'points', targetValue: 100 }, actor)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' }); // detay yeniden okunurken mock null → kayıt yazıldıktan sonra
    const data = db.badge.update.mock.calls[0][0].data;
    expect(data.requirement).toEqual({ type: 'points', value: 100, period: 'week', metadata: { a: 1 } });
    db.badge.findUnique.mockResolvedValueOnce({ id: 'n1', archivedAt: null, requirement: {} });
    await expect(updateBadge('n1', { name: 'x', icon: '/x', category: 'general', rarity: 'foo', requirementType: 'points', targetValue: 1 }, actor)).rejects.toBeTruthy();
  });

  it('arşivdeki rozet düzenlenemez (409)', async () => {
    db.badge.findUnique.mockResolvedValueOnce({ id: 'n3', archivedAt: new Date() });
    await expect(updateBadge('n3', {}, actor)).rejects.toMatchObject({ code: 'ARCHIVED', status: 409 });
  });
});

describe('elle verme', () => {
  it('puan basmadan verir (reward: none) ve gerekçeyi denetler', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', email: 'a@b.c' });
    mockAward.mockResolvedValue({ awarded: true, points: 0, badge: {}, userBadgeId: 'ub' });
    const r = await runBadgeAction('n1', { action: 'grant', email: 'a@b.c', reason: 'Etkinlik ödülü' }, actor);
    expect(r).toMatchObject({ awarded: true });
    expect(mockAward.mock.calls[0][1]).toMatchObject({ reward: 'none', source: 'admin', badgeId: 'n1', userId: 'u1' });
    expect(db.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: 'GRANT_BADGE' } });
  });

  it('müşteri olmayan hesaba ve karakter rozetine verilmez', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'd1', role: 'DEALER', email: 'd@b.c' });
    await expect(runBadgeAction('n1', { action: 'grant', email: 'd@b.c', reason: 'deneme gerekçe' }, actor)).rejects.toMatchObject({ code: 'NOT_CUSTOMER' });
    await expect(runBadgeAction('char-a', { action: 'grant', email: 'a@b.c', reason: 'deneme gerekçe' }, actor)).rejects.toMatchObject({ code: 'CHARACTER_LOCKED' });
    expect(mockAward).not.toHaveBeenCalled();
  });
});

describe('toplu işlem', () => {
  it('karakter arşivi ve arşivdekiler atlanır; kazanımlı arşiv onay ister', async () => {
    db.badge.findMany.mockResolvedValue([
      { id: 'n1', name: 'a', isActive: true, archivedAt: null, _count: { users: 3 } },
      { id: 'n3', name: 'b', isActive: false, archivedAt: new Date(), _count: { users: 0 } },
      { id: 'char-a', name: 'c', isActive: true, archivedAt: null, _count: { users: 0 } },
    ]);
    await expect(runBulk({ action: 'archive', ids: ['n1', 'n3', 'char-a'] }, actor)).rejects.toMatchObject({ code: 'CONFIRM_REQUIRED' });
    db.badge.updateMany.mockResolvedValue({ count: 1 });
    const r = await runBulk({ action: 'archive', ids: ['n1', 'n3', 'char-a'], confirm: true }, actor);
    expect(r.changed).toBe(1);
    expect(r.skipped.map((s) => s.id).sort()).toEqual(['char-a', 'n3']);
    expect(db.badge.updateMany.mock.calls[0][0].where.id.in).toEqual(['n1']);
  });
});
