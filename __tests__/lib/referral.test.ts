/**
 * P0-16 — davet puanı yalnız doğrulanmış e-posta + ilk QR olayından sonra, tek seferlik.
 *
 * Saldırı senaryosu (eski): sahte e-postalarla kayıt + davet kodu → kayıt anında COMPLETED
 * davet ve iki tarafa 1000/500 puan; modül kapısı, ömür/aylık limit ve A↔B reddi bu yolda yoktu
 * (tek IP'den günde teorik ~7,2M puan). Artık kayıt yalnız PENDING yazar; kredi
 * `qualifyReferral` ile verilir. Gerçek DB'ye GİDİLMEZ.
 */
import { NextRequest } from 'next/server';

class FakePrismaKnownError extends Error {
  code: string;
  constructor(message: string, opts: { code: string }) {
    super(message);
    this.code = opts.code;
  }
}
jest.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: FakePrismaKnownError },
}));

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

const mockModuleControls = jest.fn();
jest.mock('@/lib/module-gate', () => ({ getModuleControls: () => mockModuleControls() }));
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: jest.fn(async () => ({
    referral: { maxInvitesPerReferrerLifetime: 3, maxRedemptionsPerReferralCodePerMonth: 2 },
  })),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getReferralRewards: () => ({ referredPoints: 500, referrerPoints: 1000 }),
}));

type Row = Record<string, unknown>;

interface DbState {
  codeRow?: Row | null;
  users?: Record<string, Row>;
  referralByReferred?: Row | null;
  reverse?: Row | null;
  counts?: { lifetime?: number; monthly?: number; byCode?: number; completed?: number };
  feedback?: Row | null;
  consumption?: Row | null;
  claimCount?: number;
}

function makeDb(s: DbState) {
  const counts = { lifetime: 0, monthly: 0, byCode: 0, completed: 0, ...(s.counts ?? {}) };
  const tx = {
    $executeRaw: jest.fn(async () => 0),
    referral: {
      findUnique: jest.fn(async () => s.referralByReferred ?? null),
      findFirst: jest.fn(async () => s.reverse ?? null),
      count: jest.fn(async ({ where }: { where: Row }) => {
        if (where.status === 'COMPLETED') return counts.completed;
        if (where.createdAt) return counts.monthly;
        if (where.referralCode) return counts.byCode;
        return counts.lifetime;
      }),
      create: jest.fn(async () => ({ id: 'ref1' })),
      updateMany: jest.fn(async () => ({ count: s.claimCount ?? 1 })),
    },
    referralCode: { updateMany: jest.fn(async () => ({ count: 1 })) },
    notification: { createMany: jest.fn(async () => ({ count: 2 })) },
  };
  const db = {
    ...tx,
    referralCode: {
      ...tx.referralCode,
      findUnique: jest.fn(async () =>
        s.codeRow === undefined ? { id: 'c1', userId: 'A', code: 'ABCD1234', isActive: true, maxUsage: null } : s.codeRow
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => s.users?.[where.id] ?? null),
    },
    feedback: { findFirst: jest.fn(async () => (s.feedback === undefined ? { id: 'f1' } : s.feedback)) },
    consumption: { findFirst: jest.fn(async () => s.consumption ?? null) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { db, tx };
}

const CUSTOMER_B = { id: 'B', role: 'CUSTOMER', emailVerified: new Date('2026-10-01') };

beforeEach(() => {
  mockMint.mockReset().mockResolvedValue({ credited: 1, duplicate: false });
  mockModuleControls.mockReset().mockResolvedValue({ referrals: true });
});

import { createPendingReferral, qualifyReferral } from '@/lib/referral';

describe('createPendingReferral', () => {
  it('geçerli kod → PENDING davet, PUAN YOK', async () => {
    const { db, tx } = makeDb({ users: { B: CUSTOMER_B } });
    const r = await createPendingReferral({ referredUserId: 'B', code: ' abcd1234 ' }, db as never);
    expect(r).toMatchObject({ ok: true, referralId: 'ref1', referrerId: 'A' });
    expect(tx.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', pointsEarned: 0, bonusGiven: 0 }) })
    );
    expect(tx.$executeRaw).toHaveBeenCalled(); // referrer kilidi
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('modül kapalı → reddedilir', async () => {
    mockModuleControls.mockResolvedValue({ referrals: false });
    const { db, tx } = makeDb({ users: { B: CUSTOMER_B } });
    const r = await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never);
    expect(r).toMatchObject({ ok: false, code: 'MODULE_DISABLED' });
    expect(tx.referral.create).not.toHaveBeenCalled();
  });

  it('kendi kodu → SELF_REFERRAL', async () => {
    const { db } = makeDb({ users: { A: { id: 'A', role: 'CUSTOMER' } } });
    const r = await createPendingReferral({ referredUserId: 'A', code: 'ABCD1234' }, db as never);
    expect(r).toMatchObject({ ok: false, code: 'SELF_REFERRAL' });
  });

  it('karşılıklı davet (A↔B) reddedilir', async () => {
    const { db, tx } = makeDb({ users: { B: CUSTOMER_B }, reverse: { id: 'refBA' } });
    const r = await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never);
    expect(r).toMatchObject({ ok: false, code: 'RECIPROCAL' });
    expect(tx.referral.create).not.toHaveBeenCalled();
  });

  it('ömür boyu ve aylık limit kayıt yolunda da uygulanır', async () => {
    let { db } = makeDb({ users: { B: CUSTOMER_B }, counts: { lifetime: 3 } });
    expect(await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never)).toMatchObject({
      ok: false,
      code: 'LIFETIME_LIMIT',
    });
    ({ db } = makeDb({ users: { B: CUSTOMER_B }, counts: { monthly: 2 } }));
    expect(await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never)).toMatchObject({
      ok: false,
      code: 'MONTHLY_LIMIT',
    });
  });

  it('zaten davet edilmiş kullanıcı ve eşzamanlı P2002 → ALREADY_REFERRED', async () => {
    let { db } = makeDb({ users: { B: CUSTOMER_B }, referralByReferred: { id: 'old' } });
    expect(await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never)).toMatchObject({
      ok: false,
      code: 'ALREADY_REFERRED',
    });
    ({ db } = makeDb({ users: { B: CUSTOMER_B } }));
    db.$transaction.mockRejectedValueOnce(new FakePrismaKnownError('dup', { code: 'P2002' }));
    expect(await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never)).toMatchObject({
      ok: false,
      code: 'ALREADY_REFERRED',
    });
  });

  it('işletme hesabı davet bonusu alamaz; geçersiz kod biçimi reddedilir', async () => {
    const { db } = makeDb({ users: { B: { id: 'B', role: 'DEALER' } } });
    expect(await createPendingReferral({ referredUserId: 'B', code: 'ABCD1234' }, db as never)).toMatchObject({
      ok: false,
      code: 'NOT_ELIGIBLE',
    });
    expect(await createPendingReferral({ referredUserId: 'B', code: "x'; --" }, db as never)).toMatchObject({
      ok: false,
      code: 'INVALID_CODE',
    });
  });
});

describe('qualifyReferral', () => {
  const PENDING = {
    id: 'ref1',
    referrerId: 'A',
    referredId: 'B',
    referralCode: 'ABCD1234',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it('doğrulanmamış e-posta → puan yok, davet bekler', async () => {
    const { db, tx } = makeDb({ referralByReferred: PENDING, users: { B: { ...CUSTOMER_B, emailVerified: null } } });
    const r = await qualifyReferral('B', {}, db as never);
    expect(r).toEqual({ qualified: false, reason: 'NOT_VERIFIED' });
    expect(tx.referral.updateMany).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('QR olayı yok → puan yok', async () => {
    const { db } = makeDb({ referralByReferred: PENDING, users: { B: CUSTOMER_B }, feedback: null, consumption: null });
    expect(await qualifyReferral('B', {}, db as never)).toEqual({ qualified: false, reason: 'NO_QR_EVENT' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('koşullar sağlanınca PENDING→COMPLETED + iki tarafa tek-kez anahtarlı kredi', async () => {
    const { db, tx } = makeDb({ referralByReferred: PENDING, users: { B: CUSTOMER_B } });
    const r = await qualifyReferral('B', {}, db as never);
    expect(r).toMatchObject({ qualified: true, referredPoints: 500, referrerPoints: 1000 });
    expect(tx.referral.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ref1', status: 'PENDING' }, data: expect.objectContaining({ status: 'COMPLETED' }) })
    );
    expect(mockMint).toHaveBeenCalledTimes(2);
    expect(mockMint).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'B', points: 500, idempotencyKey: 'referral:ref1:referred' }));
    expect(mockMint).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'A', points: 1000, idempotencyKey: 'referral:ref1:referrer' }));
  });

  it('eşzamanlı ikinci nitelendirme (count=0) → kredi yok', async () => {
    const { db } = makeDb({ referralByReferred: PENDING, users: { B: CUSTOMER_B }, claimCount: 0 });
    expect(await qualifyReferral('B', {}, db as never)).toEqual({ qualified: false, reason: 'ALREADY_QUALIFIED' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('diğer yön tamamlanmışsa (A↔B) → EXPIRED, kredi yok', async () => {
    const { db } = makeDb({ referralByReferred: PENDING, users: { B: CUSTOMER_B }, reverse: { id: 'refBA' } });
    expect(await qualifyReferral('B', {}, db as never)).toEqual({ qualified: false, reason: 'RECIPROCAL' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('süresi dolan bekleyen davet EXPIRED olur', async () => {
    const { db } = makeDb({ referralByReferred: { ...PENDING, expiresAt: new Date(Date.now() - 1000) }, users: { B: CUSTOMER_B } });
    expect(await qualifyReferral('B', {}, db as never)).toEqual({ qualified: false, reason: 'EXPIRED' });
    expect(db.referral.updateMany).toHaveBeenCalledWith({ where: { id: 'ref1', status: 'PENDING' }, data: { status: 'EXPIRED' } });
  });

  it('modül kapalıyken puan basılmaz (davet bekler)', async () => {
    mockModuleControls.mockResolvedValue({ referrals: false });
    const { db } = makeDb({ referralByReferred: PENDING, users: { B: CUSTOMER_B } });
    expect(await qualifyReferral('B', {}, db as never)).toEqual({ qualified: false, reason: 'MODULE_DISABLED' });
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('zaten tamamlanmış davet tekrar ödenmez', async () => {
    const { db } = makeDb({ referralByReferred: { ...PENDING, status: 'COMPLETED' } });
    expect(await qualifyReferral('B', {}, db as never)).toEqual({ qualified: false, reason: 'NO_PENDING' });
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/register — kayıtta puan basılmaz', () => {
  it('davet koduyla kayıt yalnız bekleyen davet yazar; yanıt bonus iddia etmez', async () => {
    jest.resetModules();
    const credit = jest.fn();
    const mint = jest.fn();
    const createPending = jest.fn(async () => ({ ok: true, referralId: 'ref1', referrerId: 'A', expiresAt: new Date() }));
    jest.doMock('@/lib/points-wallet', () => ({ creditPointsAndXp: credit }));
    jest.doMock('@/lib/economy', () => ({ mintPoints: mint }));
    jest.doMock('@/lib/referral', () => ({
      createPendingReferral: createPending,
      normalizeReferralCode: (c: unknown) => (typeof c === 'string' ? c.trim().toUpperCase() : null),
    }));
    jest.doMock('@/lib/rate-limit', () => ({
      checkRateLimitDb: jest.fn(async () => ({ ok: true })),
      getClientIdentifier: () => 'ip',
    }));
    jest.doMock('@/lib/password', () => ({ hashPassword: jest.fn(async () => 'hash') }));
    jest.doMock('@/lib/email', () => ({ sendVerificationEmail: jest.fn(async () => ({ ok: true })) }));
    jest.doMock('@/lib/api-http', () => ({ PRIVATE_NO_STORE_HEADERS: {} }));
    jest.doMock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
    const userCreate = jest.fn(async () => ({ id: 'B', name: 'Bora', email: 'b@x.com', role: 'CUSTOMER', createdAt: new Date() }));
    jest.doMock('@/lib/prisma', () => ({
      prisma: {
        user: { findFirst: jest.fn(async () => null), create: userCreate },
        verificationToken: { create: jest.fn(async () => ({})) },
        notification: { create: jest.fn(async () => ({})) },
        analyticsEvent: { create: jest.fn(async () => ({})) },
        $transaction: jest.fn(),
      },
    }));

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bora',
        email: 'B@X.com',
        password: 'Abcdef12',
        confirmPassword: 'Abcdef12',
        referralCode: 'abcd1234',
      }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(createPending).toHaveBeenCalledWith({ referredUserId: 'B', code: 'ABCD1234' });
    expect(credit).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
    expect(body.referralApplied).toBeUndefined();
    expect(body.referralPending).toBe(true);
    // E-posta kanonik biçimde yazılır.
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'b@x.com' }) }));
  });
});
