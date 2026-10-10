/**
 * P0-23 — karakter test aracı: üretimde kapalı + test hesabı allowlist'i + reset ödül kilidi.
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

// Defter simülasyonu: anahtar → satır. mintPoints aynı anahtarla ikinci çağrıda duplicate döner.
const ledger = new Map<string, number>();
const mockMint = jest.fn(async (_tx: unknown, input: { idempotencyKey: string; points: number }) => {
  if (ledger.has(input.idempotencyKey)) return { duplicate: true, credited: ledger.get(input.idempotencyKey) };
  ledger.set(input.idempotencyKey, input.points);
  return { duplicate: false, credited: input.points };
});
const mockDebit = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...(a as [unknown, { idempotencyKey: string; points: number }])),
  debitPoints: (...a: unknown[]) => mockDebit(...a),
}));

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

  it('demo hesapta reset: puan geri alınmaz, ödül anahtarı defterde kilitlenir + audit', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    ledger.clear();
    // char-a ödülü defterle ödenmiş (anahtar var); char-b defter öncesi (eski) kazanım.
    ledger.set('badge:demo:char-a', 5000);
    db.user.findFirst.mockResolvedValueOnce(demoCustomer);
    const r = await post({ action: 'reset', userId: 'demo@qratex.test' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ deleted: 2, rewardLocked: 1 });
    expect(mockDebit).not.toHaveBeenCalled();
    expect(mockMint).toHaveBeenCalledTimes(2);
    for (const call of mockMint.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>) {
      expect(call[1]).toMatchObject({ userId: 'demo', points: 0, source: 'badge', actorId: 'admin1' });
    }
    expect(ledger.get('badge:demo:char-b')).toBe(0);
    const audit = db.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(audit[0].data).toMatchObject({ action: 'CHARACTER_TEST_RESET', entityId: 'demo', userId: 'admin1' });
  });

  it('saldırı: reset → yeniden kazanım döngüsü ödülü ikinci kez basamaz', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    ledger.clear();
    db.user.findFirst.mockResolvedValueOnce(demoCustomer);
    await post({ action: 'reset', userId: 'demo@qratex.test' });
    // awardBadge'in ödül çağrısını taklit et: aynı anahtarla 5000 puan.
    const reAward = await mockMint(null, { idempotencyKey: 'badge:demo:char-a', points: 5000 });
    expect(reAward).toMatchObject({ duplicate: true, credited: 0 });
    // İkinci reset de yeni satır yazmaz (idempotent), bakiye düşürmez.
    db.user.findFirst.mockResolvedValueOnce(demoCustomer);
    const again = await post({ action: 'reset', userId: 'demo@qratex.test' });
    expect(again.body).toMatchObject({ rewardLocked: 0 });
    expect(mockDebit).not.toHaveBeenCalled();
  });
});
