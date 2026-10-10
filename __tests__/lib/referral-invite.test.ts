/**
 * Davet yüzeyi (`/customer/me/invite`) sunucu mantığı — gerçek DB'ye GİDİLMEZ (prisma sahte).
 *
 * Denetim (docs/audit/2026-10-08/musteri/customer_referral.md) karşılıkları:
 *  - #18/Bulgu 3: "Kazanılan puan" son 20 kaydın toplamı değil, aggregate + alınan kademeler.
 *  - #8/Bulgu 8: GET yazmaz; kod üretimi idempotent, elle yazılabilir alfabe, P2002 güvenli.
 *  - #12/Bulgu 2: kod uygulama kayıttan sonraki 7 günle sınırlı.
 *  - #24/Bulgu 7: PENDING gerçek; satırda adım göstergesi + hatırlat/kontrol eylemi.
 *  - #32: limitler şeffaf (kullanılan/üst sınır, İstanbul ay başı).
 *  - Hatırlatma yalnız kendi davetine, 72 saatte bir.
 */
jest.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {}, AnyNull: 'AnyNull' },
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));
jest.mock('@/lib/module-gate', () => ({ getModuleControls: jest.fn(async () => ({ referrals: true })) }));
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: jest.fn(async () => ({
    referral: { maxInvitesPerReferrerLifetime: 100, maxRedemptionsPerReferralCodePerMonth: 30 },
  })),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getReferralRewards: () => ({ referredPoints: 500, referrerPoints: 1000 }),
}));

const mockCreatePending = jest.fn();
const mockQualify = jest.fn();
jest.mock('@/lib/referral', () => {
  const actual = jest.requireActual('@/lib/referral');
  return {
    ...actual,
    createPendingReferral: (...a: unknown[]) => mockCreatePending(...a),
    qualifyReferral: (...a: unknown[]) => mockQualify(...a),
  };
});

import {
  REFERRAL_CODE_ALPHABET,
  applyInviteCode,
  claimReferralMilestones,
  ensureReferralCode,
  generateReferralCode,
  getInviteOverview,
  listInviteRows,
  nudgeInvite,
} from '@/lib/referral-invite';
import { startOfMonthIstanbul } from '@/lib/referral';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const DAY = 86_400_000;

type Fn = jest.Mock;
function fn<T>(impl?: (...a: never[]) => T): Fn {
  return jest.fn(impl as never);
}

function baseDb(over: Record<string, unknown> = {}) {
  const db = {
    referralCode: { findUnique: fn(async () => null), create: fn() },
    user: { findUnique: fn(async () => null), updateMany: fn(async () => ({ count: 1 })) },
    referral: {
      findUnique: fn(async () => null),
      findFirst: fn(async () => null),
      findMany: fn(async () => []),
      count: fn(async () => 0),
      aggregate: fn(async () => ({ _sum: { pointsEarned: null } })),
      groupBy: fn(async () => []),
    },
    feedback: { findMany: fn(async () => []) },
    consumption: { findMany: fn(async () => []) },
    notification: { findMany: fn(async () => []), findFirst: fn(async () => null), create: fn(async () => ({})) },
    $executeRaw: fn(async () => 0),
    $transaction: fn(),
    ...over,
  };
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(db));
  return db;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMint.mockResolvedValue({ credited: 1, duplicate: false });
});

describe('kod üretimi', () => {
  it('elle yazılabilir alfabe: 8 karakter, 0/O/1/I/L/-/_ yok', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01OIL_-]/);
    }
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('mevcut kod varsa yazmaz', async () => {
    const db = baseDb();
    db.referralCode.findUnique.mockResolvedValue({ code: 'ABCD2345', isActive: true });
    await expect(ensureReferralCode('u1', db as never)).resolves.toEqual({ code: 'ABCD2345', isActive: true });
    expect(db.referralCode.create).not.toHaveBeenCalled();
  });

  it('eşzamanlı ilk açılış (userId P2002) → mevcut kayıt okunur, 500 yok', async () => {
    const db = baseDb();
    db.referralCode.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ code: 'RACE2345', isActive: true });
    db.referralCode.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(ensureReferralCode('u1', db as never)).resolves.toEqual({ code: 'RACE2345', isActive: true });
  });

  it('kod çakışması → yeni kodla yeniden dener', async () => {
    const db = baseDb();
    db.referralCode.create
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
      .mockResolvedValueOnce({ code: 'NEWC2345', isActive: true });
    await expect(ensureReferralCode('u1', db as never)).resolves.toEqual({ code: 'NEWC2345', isActive: true });
    expect(db.referralCode.create).toHaveBeenCalledTimes(2);
  });
});

describe('İstanbul ay başı (aylık limit)', () => {
  it('UTC 31 Ekim 22:00 = İstanbul 1 Kasım → Kasım başı', () => {
    expect(startOfMonthIstanbul(new Date('2026-10-31T22:00:00Z')).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(startOfMonthIstanbul(new Date('2026-10-31T20:59:00Z')).toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(startOfMonthIstanbul(NOW, 1).toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });
});

function overviewDb(opts: {
  completed?: number;
  pending?: number;
  total?: number;
  sum?: number;
  claimed?: unknown;
  createdAt?: Date;
  referredBy?: Record<string, unknown> | null;
  code?: Record<string, unknown> | null;
}) {
  const db = baseDb();
  db.referralCode.findUnique.mockResolvedValue(opts.code === undefined ? { code: 'ABCD2345', isActive: true, maxUsage: null } : opts.code);
  db.user.findUnique.mockResolvedValue({
    createdAt: opts.createdAt ?? new Date(NOW.getTime() - 30 * DAY),
    emailVerified: new Date('2026-01-01'),
    referralMilestonesClaimed: opts.claimed ?? null,
  });
  db.referral.findUnique.mockResolvedValue(opts.referredBy ?? null);
  db.referral.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.referralCode && where.createdAt) return 4; // bu ay kodla
    if (where.status === 'PENDING') return opts.pending ?? 0; // canlı bekleyen
    throw new Error(`beklenmeyen count: ${JSON.stringify(where)}`);
  });
  db.referral.groupBy.mockResolvedValue([
    { status: 'COMPLETED', _count: { _all: opts.completed ?? 0 } },
    { status: 'PENDING', _count: { _all: (opts.total ?? 0) - (opts.completed ?? 0) } },
  ]);
  db.referral.aggregate.mockResolvedValue({ _sum: { pointsEarned: opts.sum ?? 0 } });
  return db;
}

describe('getInviteOverview', () => {
  it('kazanç = TÜM tamamlanan davetlerin aggregate toplamı + alınan kademeler (son 20 değil)', async () => {
    const db = overviewDb({ completed: 25, total: 27, pending: 1, sum: 25_000, claimed: [3, 5, 10] });
    const o = await getInviteOverview('me', { now: NOW }, db as never);
    expect(db.referral.aggregate).toHaveBeenCalledWith({
      where: { referrerId: 'me', status: 'COMPLETED' },
      _sum: { pointsEarned: true },
    });
    expect(o.earnings).toEqual({ perInvite: 25_000, milestones: 200 + 400 + 1000, total: 26_600 });
    expect(o.counts).toEqual({ total: 27, completed: 25, pending: 1, expired: 1 });
    expect(o.milestones.stops.map((s) => s.state)).toEqual(['claimed', 'claimed', 'claimed', 'claimable']);
    expect(o.milestones.claimablePoints).toBe(3000);
    expect(o.milestones.next).toBeNull();
  });

  it('GET yazmaz: kod yoksa null döner, create çağrılmaz', async () => {
    const db = overviewDb({ code: null });
    const o = await getInviteOverview('me', { now: NOW }, db as never);
    expect(o.code).toBeNull();
    expect(db.referralCode.create).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('limitler şeffaf: aylık sayaç İstanbul ay başından, sıfırlanma anı, ömür boyu kullanım', async () => {
    const db = overviewDb({ completed: 2, pending: 1, total: 3 });
    const o = await getInviteOverview('me', { now: NOW }, db as never);
    expect(o.limits.monthly).toEqual({ used: 4, max: 30, resetsAt: '2026-10-31T21:00:00.000Z' });
    expect(o.limits.lifetime).toEqual({ used: 3, max: 100 });
    expect(o.limits.codeUsage).toBeNull();
    expect(db.referral.count).toHaveBeenCalledWith({
      where: { referralCode: 'ABCD2345', createdAt: { gte: new Date('2026-09-30T21:00:00.000Z') } },
    });
    expect(o.milestones.next).toEqual({ count: 3, points: 200, remaining: 1 });
  });

  it('kod uygulama penceresi: yeni hesapta açık, 7 günden eski hesapta kapalı, davet edilmişse kapalı', async () => {
    let o = await getInviteOverview('me', { now: NOW }, overviewDb({ createdAt: new Date(NOW.getTime() - 2 * DAY) }) as never);
    expect(o.apply).toEqual({ canApply: true, windowEndsAt: new Date(NOW.getTime() + 5 * DAY).toISOString(), blockedBy: null });
    o = await getInviteOverview('me', { now: NOW }, overviewDb({ createdAt: new Date(NOW.getTime() - 8 * DAY) }) as never);
    expect(o.apply).toEqual({ canApply: false, windowEndsAt: null, blockedBy: 'WINDOW_EXPIRED' });
    o = await getInviteOverview(
      'me',
      { now: NOW },
      overviewDb({
        createdAt: new Date(NOW.getTime() - 1 * DAY),
        referredBy: { status: 'PENDING', expiresAt: new Date(NOW.getTime() + 20 * DAY), bonusGiven: 0, referrer: { name: 'Ayşe Nur Kaya' } },
      }) as never
    );
    expect(o.apply.blockedBy).toBe('ALREADY_REFERRED');
    expect(o.referredBy).toMatchObject({ name: 'Ayşe K.', status: 'PENDING', bonusPoints: 500, steps: { verified: true, firstQr: false } });
  });
});

describe('listInviteRows', () => {
  const row = (id: string, over: Record<string, unknown>) => ({
    id,
    status: 'PENDING',
    pointsEarned: 0,
    createdAt: new Date(NOW.getTime() - DAY),
    completedAt: null,
    expiresAt: new Date(NOW.getTime() + 10 * DAY),
    referredId: `u-${id}`,
    referred: { name: 'Bora Can Yıldız', emailVerified: new Date('2026-10-01') },
    ...over,
  });

  it('ad maskeli, adımlar ve eylemler doğru; imleç sonraki sayfayı verir', async () => {
    const db = baseDb();
    db.referral.findMany.mockResolvedValue([
      row('a', { status: 'COMPLETED', pointsEarned: 1000, completedAt: NOW }),
      row('b', { referred: { name: 'Deniz', emailVerified: null } }),
      row('c', {}),
      row('d', {}),
      row('e', {}),
      row('f', { expiresAt: new Date(NOW.getTime() - 1000) }),
    ]);
    db.feedback.findMany.mockResolvedValue([{ userId: 'u-d' }]);
    db.notification.findMany.mockResolvedValue([{ userId: 'u-e', createdAt: new Date(NOW.getTime() - 3_600_000) }]);

    const page = await listInviteRows('me', { now: NOW, take: 5 }, db as never);
    expect(db.referral.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { referrerId: 'me' }, take: 6 }));
    expect(page.rows).toHaveLength(5);
    expect(page.nextCursor).toEqual(expect.any(String));

    const [a, b, c, d, e] = page.rows;
    expect(a).toMatchObject({ name: 'Bora Y.', initials: 'BY', status: 'COMPLETED', pointsEarned: 1000, action: null });
    expect(b).toMatchObject({ name: 'Deniz', status: 'PENDING', steps: { verified: false, firstQr: false }, action: null, nudgeBlockedBy: 'NOT_VERIFIED' });
    expect(c).toMatchObject({ steps: { verified: true, firstQr: false }, action: 'nudge' });
    expect(d).toMatchObject({ steps: { verified: true, firstQr: true }, action: 'check' });
    expect(e).toMatchObject({ action: null, nudgeBlockedBy: 'RECENTLY_NUDGED' });
    expect(e!.nudgeAvailableAt).toBe(new Date(NOW.getTime() - 3_600_000 + 72 * 3_600_000).toISOString());
    // Fotoğraf/e-posta sızmaz.
    expect(JSON.stringify(page)).not.toMatch(/image|email|Yıldız/);
  });

  it('süresi geçmiş PENDING → EXPIRED olarak gösterilir', async () => {
    const db = baseDb();
    db.referral.findMany.mockResolvedValue([row('x', { expiresAt: new Date(NOW.getTime() - 1000) })]);
    const page = await listInviteRows('me', { now: NOW }, db as never);
    expect(page.rows[0]).toMatchObject({ status: 'EXPIRED', expiresAt: null, action: null });
    expect(page.nextCursor).toBeNull();
  });
});

describe('applyInviteCode', () => {
  it('7 günden eski hesap → WINDOW_EXPIRED, davet yazılmaz', async () => {
    const db = baseDb();
    db.user.findUnique.mockResolvedValue({ createdAt: new Date(NOW.getTime() - 8 * DAY) });
    const r = await applyInviteCode('me', 'ABCD2345', { now: NOW }, db as never);
    expect(r).toMatchObject({ ok: false, code: 'WINDOW_EXPIRED' });
    expect(mockCreatePending).not.toHaveBeenCalled();
  });

  it('servis reddi aynen döner (ör. karşılıklı davet)', async () => {
    const db = baseDb();
    db.user.findUnique.mockResolvedValue({ createdAt: new Date(NOW.getTime() - DAY) });
    mockCreatePending.mockResolvedValue({ ok: false, code: 'RECIPROCAL', message: 'x' });
    expect(await applyInviteCode('me', 'ABCD2345', { now: NOW }, db as never)).toEqual({ ok: false, code: 'RECIPROCAL', message: 'x' });
    expect(mockQualify).not.toHaveBeenCalled();
  });

  it('PENDING kaydedilir; koşullar sağlıysa anında COMPLETED', async () => {
    const db = baseDb();
    db.user.findUnique.mockResolvedValue({ createdAt: new Date(NOW.getTime() - DAY) });
    const expiresAt = new Date(NOW.getTime() + 30 * DAY);
    mockCreatePending.mockResolvedValue({ ok: true, referralId: 'r1', referrerId: 'A', expiresAt });
    mockQualify.mockResolvedValueOnce({ qualified: false, reason: 'NO_QR_EVENT' });
    expect(await applyInviteCode('me', 'abcd2345', { now: NOW }, db as never)).toEqual({
      ok: true,
      status: 'PENDING',
      pointsEarned: 0,
      expiresAt: expiresAt.toISOString(),
    });
    mockQualify.mockResolvedValueOnce({ qualified: true, referredPoints: 500, referrerPoints: 1000 });
    expect(await applyInviteCode('me', 'abcd2345', { now: NOW }, db as never)).toMatchObject({ ok: true, status: 'COMPLETED', pointsEarned: 500 });
  });
});

describe('claimReferralMilestones', () => {
  it('ulaşılmış kademeleri JSON guard + tek-kez anahtarla öder', async () => {
    const db = baseDb();
    db.referral.count.mockResolvedValue(5);
    db.user.findUnique.mockResolvedValue({ referralMilestonesClaimed: null });
    const r = await claimReferralMilestones('me', { now: NOW }, db as never);
    expect(r).toEqual({ awarded: 2, points: 2, milestones: [3, 5] });
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { referralMilestonesClaimed: [3, 5] } })
    );
    expect(mockMint).toHaveBeenCalledWith(db, expect.objectContaining({ idempotencyKey: 'referral_milestone:me:3', points: 200 }));
    expect(mockMint).toHaveBeenCalledWith(db, expect.objectContaining({ idempotencyKey: 'referral_milestone:me:5', points: 400 }));
  });

  it('eşzamanlı talep guard tutmazsa (count=0) puan basılmaz', async () => {
    const db = baseDb();
    db.referral.count.mockResolvedValue(3);
    db.user.findUnique.mockResolvedValue({ referralMilestonesClaimed: null });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimReferralMilestones('me', { now: NOW }, db as never)).toEqual({ awarded: 0, points: 0, milestones: [] });
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('nudgeInvite', () => {
  const ref = {
    id: 'r1',
    status: 'PENDING',
    expiresAt: new Date(NOW.getTime() + 10 * DAY),
    referredId: 'B',
    referred: { emailVerified: new Date('2026-10-01') },
    referrer: { name: 'Ayşe Nur Kaya' },
  };

  it('yalnız kendi davetin (where referrerId) — başkasınınki NOT_FOUND', async () => {
    const db = baseDb();
    const r = await nudgeInvite('me', 'r1', { now: NOW }, db as never);
    expect(db.referral.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1', referrerId: 'me' } }));
    expect(r).toEqual({ kind: 'rejected', reason: 'NOT_FOUND' });
  });

  it('doğrulanmamış arkadaşa hatırlatma yok', async () => {
    const db = baseDb();
    db.referral.findFirst.mockResolvedValue({ ...ref, referred: { emailVerified: null } });
    expect(await nudgeInvite('me', 'r1', { now: NOW }, db as never)).toEqual({ kind: 'rejected', reason: 'NOT_VERIFIED' });
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('72 saat içinde ikinci hatırlatma reddedilir', async () => {
    const db = baseDb();
    db.referral.findFirst.mockResolvedValue(ref);
    db.notification.findFirst.mockResolvedValue({ createdAt: new Date(NOW.getTime() - 3_600_000) });
    const r = await nudgeInvite('me', 'r1', { now: NOW }, db as never);
    expect(r).toMatchObject({ kind: 'rejected', reason: 'RECENTLY_NUDGED' });
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('uygun davette tek bildirim yazılır (kilit altında)', async () => {
    const db = baseDb();
    db.referral.findFirst.mockResolvedValue(ref);
    const r = await nudgeInvite('me', 'r1', { now: NOW }, db as never);
    expect(r).toEqual({ kind: 'nudged', nextAt: new Date(NOW.getTime() + 72 * 3_600_000).toISOString() });
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'B', type: 'REFERRAL_NUDGE', message: expect.stringContaining('Ayşe') }),
    });
  });

  it('ilk QR olayı zaten varsa bildirim yerine nitelendirme yeniden denenir', async () => {
    const db = baseDb();
    db.referral.findFirst.mockResolvedValue(ref);
    db.consumption.findMany.mockResolvedValue([{ customerId: 'B' }]);
    mockQualify.mockResolvedValue({ qualified: true, referrerPoints: 1000, referredPoints: 500 });
    expect(await nudgeInvite('me', 'r1', { now: NOW }, db as never)).toEqual({ kind: 'qualified', points: 1000 });
    expect(mockQualify).toHaveBeenCalledWith('B', { now: NOW }, db);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
