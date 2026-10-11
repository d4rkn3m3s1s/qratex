/**
 * Rozet test laboratuvarı (eski /admin/character-test; P0-23 korumaları taşındı):
 * üretimde kapalı + yalnız test hesabı, reset ödülü geri almaz ama defter anahtarını kilitler
 * (reveal tekrarı puan çoğaltamaz), "barı doldur" etkin eşik × (alınan+1) hedefini ve min.
 * uzunluğu üretimle aynı hesaplar, gerçek yorumlara dokunmaz.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/ai-engine', () => ({ runChatCompletion: jest.fn() }));

const mockDetailed = jest.fn();
jest.mock('@/lib/character-badges', () => ({
  CHARACTER_PROFILES: [{ badgeId: 'char-a', name: 'A' }, { badgeId: 'char-b', name: 'B' }],
  classifyFeedbackCategory: jest.fn(),
  getCategoryProgressDetailed: (...a: unknown[]) => mockDetailed(...a),
  inactiveCharacterIds: jest.fn(async () => new Set()),
  selectCharacterForSamples: jest.fn(),
}));
jest.mock('@/lib/character-categories', () => ({
  CHARACTER_CATEGORIES: [{ key: 'gizemli', name: 'Gizemli', emoji: '🌿', accent: '#10b981', characterIds: ['char-a', 'char-b'] }],
  CATEGORY_BY_KEY: { gizemli: { key: 'gizemli', name: 'Gizemli' } },
  CATEGORY_BY_CHARACTER: {},
  unassignedCharacterIds: () => [],
}));
jest.mock('@/lib/badge-reward-points', () => ({ badgeRewardPoints: (id: string) => (id === 'char-a' ? 5000 : 2500) }));

const ledger = new Map<string, number>();
const mockMint = jest.fn(async (_tx: unknown, input: { idempotencyKey: string; points: number }) => {
  if (ledger.has(input.idempotencyKey)) return { duplicate: true, credited: 0 };
  ledger.set(input.idempotencyKey, input.points);
  return { duplicate: false, credited: input.points };
});
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...(a as [unknown, { idempotencyKey: string; points: number }])) }));

const db = {
  user: { findFirst: jest.fn() },
  userBadge: {
    findMany: jest.fn(async () => [
      { badgeId: 'char-a', earnedAt: new Date() },
      { badgeId: 'char-b', earnedAt: new Date() },
    ]),
    deleteMany: jest.fn(async () => ({ count: 2 })),
  },
  consumption: { create: jest.fn(async () => ({ id: 'c' })), count: jest.fn(async () => 0), deleteMany: jest.fn(async () => ({ count: 0 })) },
  consumptionReview: { create: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 3 })) },
  physicalCard: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'card' })), count: jest.fn(async () => 0), deleteMany: jest.fn(async () => ({ count: 0 })) },
  auditLog: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(db)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { characterTestMutationsEnabled, gateCharacterTestMutation, isAllowedCharacterTestTarget } from '@/lib/character-test-guard';
import { fillNeed, runLabSandbox, syntheticReviewText, TEST_NOTE } from '@/lib/admin-badges/lab.server';

const realCustomer = { id: 'real', email: 'gercek@musteri.com', role: 'CUSTOMER', isDemo: false, name: 'Gerçek' };
const demoCustomer = { id: 'demo', email: 'demo@qratex.test', role: 'CUSTOMER', isDemo: true, name: 'Demo' };
const actor = { id: 'admin1', type: 'user' as const };
const progress = (p: Partial<{ counted: number; taken: number; threshold: number; minReviewLength: number; available: number }>) => [
  { key: 'gizemli', name: 'Gizemli', emoji: '🌿', threshold: 20, minReviewLength: 0, counted: 0, taken: 0, available: 2, current: 0, ready: false, targetForNext: 20, ...p },
];

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  mockDetailed.mockResolvedValue(progress({}));
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
const setEnv = (k: string, v?: string) => {
  if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
  else (process.env as Record<string, string>)[k] = v;
};

describe('koruma', () => {
  it('üretimde bayraksız kapalı; allowlist demo ya da listedeki e-posta; admin asla', () => {
    expect(characterTestMutationsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(characterTestMutationsEnabled({ NODE_ENV: 'production', CHARACTER_TEST_ENABLED: 'true' })).toBe(true);
    expect(isAllowedCharacterTestTarget(demoCustomer, {})).toBe(true);
    expect(isAllowedCharacterTestTarget(realCustomer, { CHARACTER_TEST_ALLOWLIST: ' GERCEK@musteri.com ' })).toBe(true);
    expect(isAllowedCharacterTestTarget({ ...demoCustomer, role: 'ADMIN' }, {})).toBe(false);
    expect(gateCharacterTestMutation(realCustomer, { NODE_ENV: 'development' })).toMatchObject({ ok: false, code: 'TARGET_NOT_ALLOWED' });
  });

  it('gerçek müşteride reset 403; hiçbir şey silinmez', async () => {
    setEnv('NODE_ENV', 'development');
    db.user.findFirst.mockResolvedValueOnce(realCustomer);
    await expect(runLabSandbox({ action: 'reset', user: 'gercek@musteri.com' }, actor)).rejects.toMatchObject({ code: 'TARGET_NOT_ALLOWED', status: 403 });
    expect(db.userBadge.deleteMany).not.toHaveBeenCalled();
  });

  it('üretimde demo hesapta bile kapalı; bulunamayan hedef 404', async () => {
    setEnv('NODE_ENV', 'production');
    setEnv('CHARACTER_TEST_ENABLED');
    db.user.findFirst.mockResolvedValueOnce(demoCustomer);
    await expect(runLabSandbox({ action: 'clearCategories', user: 'demo@qratex.test' }, actor)).rejects.toMatchObject({ code: 'CHARACTER_TEST_DISABLED' });
    expect(db.consumptionReview.updateMany).not.toHaveBeenCalled();
    db.user.findFirst.mockResolvedValueOnce(null);
    await expect(runLabSandbox({ action: 'reset', user: 'yok@x.com' }, actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('reset ödül kilidi', () => {
  it('puan geri alınmaz; anahtar kilitlenir; tekrar kazanım ikinci kez basamaz; denetim yazılır', async () => {
    setEnv('NODE_ENV', 'development');
    ledger.clear();
    ledger.set('badge:demo:char-a', 5000);
    db.user.findFirst.mockResolvedValue(demoCustomer);
    const r = await runLabSandbox({ action: 'reset', user: 'demo@qratex.test' }, actor);
    expect(r.counts).toMatchObject({ deleted: 2, rewardLocked: 1 });
    expect(ledger.get('badge:demo:char-b')).toBe(0);
    expect(await mockMint(null, { idempotencyKey: 'badge:demo:char-a', points: 5000 })).toMatchObject({ duplicate: true });
    expect(db.auditLog.create.mock.calls[0][0]).toMatchObject({ data: { action: 'CHARACTER_TEST_RESET', entityId: 'demo' } });
  });
});

describe('barı doldur', () => {
  it('hedef = etkin eşik × (alınan + 1); Gizemli 20 ve ikinci karakter doğru', () => {
    expect(fillNeed({ counted: 0, taken: 0, threshold: 20 })).toBe(20);
    expect(fillNeed({ counted: 6, taken: 1, threshold: 6 })).toBe(6);
    expect(fillNeed({ counted: 30, taken: 0, threshold: 20 })).toBe(0);
  });

  it('sentetik metin min. uzunluğu karşılar ve işaretlidir', () => {
    const t = syntheticReviewText('Gizemli', 400);
    expect(t.length).toBeGreaterThanOrEqual(400);
    expect(t.startsWith(TEST_NOTE)).toBe(true);
  });

  it('yalnız sentetik kayıt üretir (gerçek yorum güncellenmez), tek tx, kart BLOCKED', async () => {
    setEnv('NODE_ENV', 'development');
    db.user.findFirst.mockResolvedValue(demoCustomer);
    mockDetailed.mockResolvedValueOnce(progress({ counted: 5, taken: 0 })).mockResolvedValue(progress({ counted: 20, ready: true } as never));
    const r = await runLabSandbox({ action: 'fill', user: 'demo@qratex.test', category: 'gizemli' }, actor);
    expect(r.counts.created).toBe(15);
    expect(db.consumptionReview.create).toHaveBeenCalledTimes(15);
    expect(db.consumptionReview.updateMany).not.toHaveBeenCalled();
    expect(db.physicalCard.create.mock.calls[0][0]).toMatchObject({ data: { status: 'BLOCKED' } });
  });

  it('tükenmiş kategori 409', async () => {
    setEnv('NODE_ENV', 'development');
    db.user.findFirst.mockResolvedValue(demoCustomer);
    mockDetailed.mockResolvedValueOnce(progress({ available: 0 }));
    await expect(runLabSandbox({ action: 'fill', user: 'demo@qratex.test', category: 'gizemli' }, actor)).rejects.toMatchObject({ code: 'CATEGORY_EXHAUSTED' });
  });
});
