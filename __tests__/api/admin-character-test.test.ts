/**
 * P0-23 — karakter test aracı: üretimde kapalı + test hesabı allowlist'i + reset ters kaydı.
 *
 * Önceden: admin herhangi bir GERÇEK müşteride "Sıfırla → Barı doldur → reveal" döngüsüyle aynı
 * rozetin ödül puanını (2.500–10.000) sınırsız kez bastırabiliyordu; hiçbir ortam kapısı,
 * hedef kısıtı ya da denetim kaydı yoktu.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'admin1', role: 'ADMIN' } } })),
}));
jest.mock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({ ipAddress: null, userAgent: null }) }));
jest.mock('@/lib/ai-engine', () => ({ runChatCompletion: jest.fn() }));
jest.mock('@/lib/character-badges', () => ({
  CHARACTER_PROFILES: [{ badgeId: 'char-a' }, { badgeId: 'char-b' }],
  CATEGORY_BADGE_THRESHOLD: 6,
  classifyFeedbackCategory: jest.fn(),
}));
jest.mock('@/lib/character-categories', () => ({
  CHARACTER_CATEGORIES: [{ key: 'dram-suc', name: 'Dram' }],
  CATEGORY_BY_KEY: { 'dram-suc': { key: 'dram-suc', name: 'Dram' } },
  charactersInCategory: () => [],
}));
jest.mock('@/lib/badge-reward-points', () => ({
  badgeRewardPoints: (id: string) => (id === 'char-a' ? 5000 : 2500),
}));

const mockDebit = jest.fn(async () => ({ duplicate: false }));
jest.mock('@/lib/points-wallet', () => ({ debitPoints: (...a: unknown[]) => mockDebit(...(a as [])) }));

const tx = {
  userBadge: {
    findMany: jest.fn(async () => [{ badgeId: 'char-a' }, { badgeId: 'char-b' }]),
    deleteMany: jest.fn(async () => ({ count: 2 })),
  },
  user: { findUnique: jest.fn(async () => ({ points: 6000 })) },
};
const db = {
  user: { findFirst: jest.fn() },
  userBadge: { deleteMany: jest.fn() },
  consumptionReview: { updateMany: jest.fn(async () => ({ count: 3 })), count: jest.fn(async () => 0) },
  auditLog: { create: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

import {
  characterTestMutationsEnabled,
  gateCharacterTestMutation,
  isAllowedCharacterTestTarget,
} from '@/lib/character-test-guard';

const realCustomer = { id: 'real', email: 'gercek@musteri.com', role: 'CUSTOMER', isDemo: false, name: 'Gerçek' };
const demoCustomer = { id: 'demo', email: 'demo@qratex.test', role: 'CUSTOMER', isDemo: true, name: 'Demo' };

describe('guard', () => {
  it('üretimde bayraksız kapalı; bayrakla açık; geliştirmede açık', () => {
    expect(characterTestMutationsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(characterTestMutationsEnabled({ NODE_ENV: 'production', CHARACTER_TEST_ENABLED: 'true' })).toBe(true);
    expect(characterTestMutationsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(characterTestMutationsEnabled({ NODE_ENV: 'development', CHARACTER_TEST_ENABLED: 'false' })).toBe(false);
  });

  it('allowlist: demo müşteri ya da listedeki e-posta (büyük/küçük harf bağımsız); admin/bayi asla', () => {
    expect(isAllowedCharacterTestTarget(demoCustomer, {})).toBe(true);
    expect(isAllowedCharacterTestTarget(realCustomer, {})).toBe(false);
    expect(isAllowedCharacterTestTarget(realCustomer, { CHARACTER_TEST_ALLOWLIST: ' GERCEK@musteri.com ,x@y.z' })).toBe(true);
    expect(isAllowedCharacterTestTarget({ ...demoCustomer, role: 'ADMIN' }, {})).toBe(false);
  });

  it('kapı: önce ortam, sonra hedef', () => {
    expect(gateCharacterTestMutation(demoCustomer, { NODE_ENV: 'production' })).toMatchObject({ ok: false, code: 'CHARACTER_TEST_DISABLED' });
    expect(gateCharacterTestMutation(realCustomer, { NODE_ENV: 'development' })).toMatchObject({ ok: false, code: 'TARGET_NOT_ALLOWED' });
    expect(gateCharacterTestMutation(demoCustomer, { NODE_ENV: 'development' })).toEqual({ ok: true });
  });
});

describe('route', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.clearAllMocks();
  });

  async function post(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/admin/character-test/route');
    const res = await POST(
      new NextRequest('http://localhost/api/admin/character-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: await res.json() };
  }

  it('gerçek müşteride reset 403 TARGET_NOT_ALLOWED; hiçbir şey silinmez', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    db.user.findFirst.mockResolvedValueOnce(realCustomer);
    const r = await post({ action: 'reset', userId: 'gercek@musteri.com' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('TARGET_NOT_ALLOWED');
    expect(tx.userBadge.deleteMany).not.toHaveBeenCalled();
    expect(db.userBadge.deleteMany).not.toHaveBeenCalled();
  });

  it('üretimde veri değiştiren aksiyon kapalı (demo hesapta bile)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    delete process.env.CHARACTER_TEST_ENABLED;
    db.user.findFirst.mockResolvedValueOnce(demoCustomer);
    const r = await post({ action: 'clearCategories', userId: 'demo@qratex.test' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CHARACTER_TEST_DISABLED');
    expect(db.consumptionReview.updateMany).not.toHaveBeenCalled();
  });

  it('hedefsiz (me) veri değiştiren aksiyon 400; bulunamayan hedef 404', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    expect((await post({ action: 'reset' })).status).toBe(400);
    db.user.findFirst.mockResolvedValueOnce(null);
    expect((await post({ action: 'reset', userId: 'yok@x.com' })).status).toBe(404);
  });

  it('demo hesapta reset: rozet ödül puanları defterli ters kayıtla geri alınır + audit', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    db.user.findFirst.mockResolvedValueOnce(demoCustomer);
    const r = await post({ action: 'reset', userId: 'demo@qratex.test' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ deleted: 2, reversedPoints: 6000 }); // 5000 + 2500, bakiye 6000 ile sınırlı
    expect(mockDebit).toHaveBeenCalledTimes(1);
    expect((mockDebit.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]).toMatchObject({
      userId: 'demo',
      points: 6000,
      source: 'character_test_reset',
      actorId: 'admin1',
    });
    const audit = db.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(audit[0].data).toMatchObject({ action: 'CHARACTER_TEST_RESET', entityId: 'demo', userId: 'admin1' });
  });
});
