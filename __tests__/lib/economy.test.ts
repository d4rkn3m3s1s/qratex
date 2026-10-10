process.env.ECONOMY_APPROVAL_SECRET = 'test-approval-secret-0123456789';
/**
 * lib/economy testleri — puan basan her yolun ortak çekirdeği.
 *
 * Kapsam: mintPoints (idempotency, kategori tavanı, kilit sırası, gölge ban, points_credited
 * yazımı, girdi doğrulama, kök istemcide kendi tx'i + P2002 kurtarma), ledger'lı debitPoints
 * (negatif bakiye reddi, defter + points_spent, tek-kez), adjustPointsByAdmin (gerekçe, tavan,
 * 4-göz, yetki, audit) ve oyun / bayi pasif kategori tavanları (applyCategoryCap).
 *
 * Eşzamanlılık davranışı ayrı dosyada: __tests__/lib/economy-concurrency.test.ts
 * Gerçek DB'ye GİDİLMEZ: prisma mock'tur.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { issueAdjustApproval } from '@/lib/economy/admin-approval';
import { mintPoints } from '@/lib/economy/mint';
import { adjustPointsByAdmin } from '@/lib/economy/admin-adjust';
import { applyCategoryCap, ECONOMY_CAPS, getCapRule, MAX_SINGLE_MINT } from '@/lib/economy/caps';
import { EconomyError } from '@/lib/economy/errors';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import * as economy from '@/lib/economy';

const NOW = new Date('2026-10-08T12:00:00.000Z'); // Perşembe

type Row = Record<string, unknown>;

function makeTx(opts: {
  user?: { id: string; points: number; xp: number; level: number; fraudStatus?: string } | null;
  existingLedger?: Row | null;
  events?: Array<{ data: unknown; createdAt: Date }>;
  actors?: Array<{ id: string; role: string; email: string; name: string | null }>;
  adminTodaySum?: number | null;
  debitCount?: number;
} = {}) {
  const user = opts.user === undefined ? { id: 'u1', points: 1000, xp: 0, level: 1, fraudStatus: 'clean' } : opts.user;
  let balance = user?.points ?? 0;
  const tx = {
    $queryRaw: jest.fn(async () => (user ? [{ id: user.id, fraudStatus: user.fraudStatus ?? 'clean' }] : [])),
    user: {
      findUnique: jest.fn(async () => (user ? { id: user.id, points: balance, xp: user.xp, level: user.level } : null)),
      findMany: jest.fn(async () => opts.actors ?? []),
      update: jest.fn(async ({ data }: { data: { points?: { increment: number }; xp?: { increment: number } } }) => {
        balance += data.points?.increment ?? 0;
        return { id: user!.id, points: balance, xp: user!.xp + (data.xp?.increment ?? 0), level: user!.level };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { points?: { gte: number } }; data: { points?: { decrement: number } } }) => {
        if (opts.debitCount !== undefined) return { count: opts.debitCount };
        if (where.points && balance < where.points.gte) return { count: 0 };
        if (data.points) balance -= data.points.decrement;
        return { count: 1 };
      }),
    },
    pointsLedger: {
      findUnique: jest.fn(async () => opts.existingLedger ?? null),
      create: jest.fn(async () => ({ id: 'led1' })),
      aggregate: jest.fn(async () => ({ _sum: { delta: opts.adminTodaySum ?? null } })),
    },
    analyticsEvent: {
      findMany: jest.fn(async () => opts.events ?? []),
      create: jest.fn(async () => ({ id: 'ev1' })),
    },
    auditLog: { create: jest.fn(async () => ({ id: 'a1' })) },
  };
  return tx;
}

function ev(points: number, at: Date = NOW, extra: Row = {}) {
  return { data: { points, ...extra }, createdAt: at };
}

async function expectEconomyError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(EconomyError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('caps tablosu', () => {
  it('feedback tavanı lib/points-caps tarihsel değerleriyle aynı (500 / 2000)', () => {
    expect(ECONOMY_CAPS.feedback.daily).toBe(500);
    expect(ECONOMY_CAPS.feedback.weekly).toBe(2000);
  });

  it('game, dealer_passive ve consumption kategorileri tanımlı; consumption aynı kovayı paylaşır', () => {
    expect(getCapRule('game')?.daily).toBeGreaterThan(0);
    expect(getCapRule('dealer_passive')?.requiresActor).toBe(true);
    expect(getCapRule('consumption')).toBe(getCapRule('dealer_passive'));
  });

  it('tanımsız kategori (rozet, görev …) tavansızdır; prototip anahtarları kural sayılmaz', () => {
    expect(getCapRule('badge')).toBeNull();
    expect(getCapRule('toString')).toBeNull();
    expect(getCapRule(null)).toBeNull();
  });

  it('applyCategoryCap: tek sorgu, haftalık pencere; dünden kalan olay günlük toplama girmez', async () => {
    const tx = makeTx({
      events: [ev(300, new Date('2026-10-07T10:00:00Z')), ev(450, NOW)],
    });
    const d = await applyCategoryCap(tx as never, { userId: 'u1', category: 'feedback', points: 100, now: NOW });
    expect(tx.analyticsEvent.findMany).toHaveBeenCalledTimes(1);
    const where = (tx.analyticsEvent.findMany.mock.calls[0] as unknown as [{ where: Row }])[0].where;
    expect(where).toMatchObject({ userId: 'u1', event: 'points_credited', category: { in: ['feedback'] } });
    // Haftanın başı Pazartesi 2026-10-05 00:00 UTC.
    expect((where.createdAt as { gte: Date }).gte.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(d).toMatchObject({ granted: 50, capped: true, earnedToday: 450, earnedThisWeek: 750 });
  });

  it('applyCategoryCap: bozuk/negatif points alanları sayılmaz', async () => {
    const tx = makeTx({ events: [{ data: null, createdAt: NOW }, ev(-50), { data: { points: 'x' }, createdAt: NOW }, ev(100)] });
    const d = await applyCategoryCap(tx as never, { userId: 'u1', category: 'game', points: 1000, now: NOW });
    expect(d.earnedToday).toBe(100);
    expect(d.granted).toBe(ECONOMY_CAPS.game.daily - 100);
  });
});

describe('mintPoints', () => {
  it('kilit → tavan → kredi → defter → points_credited sırası, aynı tx istemcisiyle', async () => {
    const tx = makeTx();
    const r = await mintPoints(tx as never, {
      userId: 'u1',
      points: 100,
      xp: 40,
      source: 'feedback',
      sourceId: 'fb1',
      idempotencyKey: 'feedback:fb1',
      meta: { qrCodeId: 'q1' },
      now: NOW,
    });

    expect(r).toMatchObject({
      credited: 100,
      xpCredited: 40,
      requestedPoints: 100,
      points: 1100,
      capped: false,
      duplicate: false,
      status: 'posted',
      ledgerId: 'led1',
    });

    const order = [
      tx.$queryRaw.mock.invocationCallOrder[0],
      tx.pointsLedger.findUnique.mock.invocationCallOrder[0],
      tx.analyticsEvent.findMany.mock.invocationCallOrder[0],
      tx.user.update.mock.invocationCallOrder[0],
      tx.pointsLedger.create.mock.invocationCallOrder[0],
      tx.analyticsEvent.create.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // FOR UPDATE kilidi gerçekten isteniyor.
    const sqlParts = (tx.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]])[0].join('?');
    expect(sqlParts).toMatch(/FOR UPDATE/);
    expect((tx.$queryRaw.mock.calls[0] as unknown[])[1]).toBe('u1');

    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          delta: 100,
          xpDelta: 40,
          balanceAfter: 1100,
          source: 'feedback',
          sourceId: 'fb1',
          idempotencyKey: 'feedback:fb1',
          status: 'posted',
        }),
      })
    );
    expect(tx.analyticsEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        event: 'points_credited',
        category: 'feedback',
        data: expect.objectContaining({ points: 100, xp: 40, source: 'feedback', ledgerId: 'led1', qrCodeId: 'q1' }),
      }),
    });
  });

  it('idempotency: anahtar defterde varsa kredi YOK, ilk sonucun miktarı döner', async () => {
    const tx = makeTx({
      existingLedger: { id: 'old', userId: 'u1', delta: 80, xpDelta: 10, status: 'posted', meta: { requestedPoints: 100, capped: true } },
    });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 100, source: 'game', idempotencyKey: 'game:s1', now: NOW });
    expect(r).toMatchObject({ duplicate: true, credited: 80, xpCredited: 10, requestedPoints: 100, capped: true, ledgerId: 'old', points: 1000 });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.pointsLedger.create).not.toHaveBeenCalled();
    expect(tx.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('idempotency: anahtar başka kullanıcıya aitse IDEMPOTENCY_CONFLICT', async () => {
    const tx = makeTx({ existingLedger: { id: 'old', userId: 'u2', delta: 80, xpDelta: 0, status: 'posted', meta: null } });
    await expectEconomyError(
      mintPoints(tx as never, { userId: 'u1', points: 100, source: 'game', idempotencyKey: 'game:s1' }),
      'IDEMPOTENCY_CONFLICT'
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('tavan: source kendi tavanını otomatik alır; XP aynı oranla kısalır; capped olayda işaretlenir', async () => {
    const tx = makeTx({ events: [ev(450)] });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 100, xp: 50, source: 'feedback', now: NOW });
    expect(r).toMatchObject({ credited: 50, xpCredited: 25, capped: true, requestedPoints: 100 });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points: { increment: 50 }, xp: { increment: 25 } } })
    );
    const data = (tx.analyticsEvent.create.mock.calls[0] as unknown as [{ data: { data: Row } }])[0].data.data;
    expect(data).toMatchObject({ points: 50, capped: true, requestedPoints: 100 });
  });

  it('capCategory ile farklı kaynak aynı kovaya sayılır (review → feedback)', async () => {
    const tx = makeTx({ events: [ev(500)] });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 100, source: 'review', capCategory: 'feedback', now: NOW });
    expect(r.credited).toBe(0);
    expect(r.capped).toBe(true);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('tavan doluysa ve anahtar varsa 0 tutarlı defter satırı yazılır (yarın tekrar denenince kredi verilmez); olay yazılmaz', async () => {
    const tx = makeTx({ events: [ev(600)] });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 150, source: 'game', idempotencyKey: 'game:s9', now: NOW });
    expect(r).toMatchObject({ credited: 0, capped: true, duplicate: false, ledgerId: 'led1', points: 1000 });
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: 0, idempotencyKey: 'game:s9' }) })
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('tavan doluysa ve anahtar yoksa hiçbir şey yazılmaz', async () => {
    const tx = makeTx({ events: [ev(600)] });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 150, source: 'game', now: NOW });
    expect(r).toMatchObject({ credited: 0, capped: true, ledgerId: null });
    expect(tx.pointsLedger.create).not.toHaveBeenCalled();
  });

  it('capCategory: null → bilerek tavansız (escrow iadesi), tavan sorgusu yapılmaz', async () => {
    const tx = makeTx({ events: [ev(10_000)] });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 5000, source: 'game', capCategory: null });
    expect(r.credited).toBe(5000);
    expect(tx.analyticsEvent.findMany).not.toHaveBeenCalled();
  });

  it('tavansız kaynak (badge) için tavan sorgusu yapılmaz ama points_credited yazılır', async () => {
    const tx = makeTx();
    await mintPoints(tx as never, { userId: 'u1', points: 2500, source: 'badge', sourceId: 'b1' });
    expect(tx.analyticsEvent.findMany).not.toHaveBeenCalled();
    expect(tx.analyticsEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ category: 'badge', data: expect.objectContaining({ points: 2500 }) }),
    });
  });

  it('dealer_passive aktörsüz reddedilir (müşteri × bayi tavanı fail-closed)', async () => {
    const tx = makeTx();
    await expectEconomyError(
      mintPoints(tx as never, { userId: 'u1', points: 10, source: 'dealer_passive' }),
      'INVALID_INPUT'
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('dealer_passive: yalnız aynı bayinin bugünkü kredisi bayi tavanına sayılır', async () => {
    const tx = makeTx({
      events: [ev(280, NOW, { actorId: 'd1' }), ev(200, NOW, { actorId: 'd2' })],
    });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 50, source: 'dealer_passive', actorId: 'd1', now: NOW });
    expect(r.credited).toBe(20); // 300 − 280
    const r2 = await mintPoints(makeTx({ events: [ev(280, NOW, { actorId: 'd1' }), ev(200, NOW, { actorId: 'd2' })] }) as never, {
      userId: 'u1',
      points: 50,
      source: 'dealer_passive',
      actorId: 'd3',
      now: NOW,
    });
    expect(r2.credited).toBe(50); // d3 için bayi kovası boş; günlük toplam 480 → kalan 120
  });

  it('gölge ban: defter satırı void, bakiye artmaz, points_credited yazılmaz; çağıran başarı görür', async () => {
    const tx = makeTx({ user: { id: 'u1', points: 300, xp: 0, level: 1, fraudStatus: 'shadow_ban' } });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 100, source: 'badge' });
    expect(r).toMatchObject({ credited: 100, status: 'void', points: 300 });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.analyticsEvent.create).not.toHaveBeenCalled();
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'void', delta: 100 }) })
    );
  });

  it('gölge ban kapısı fraudGate:false ile atlanır (kullanıcının kendi escrow iadesi)', async () => {
    const tx = makeTx({ user: { id: 'u1', points: 300, xp: 0, level: 1, fraudStatus: 'shadow_ban' } });
    const r = await mintPoints(tx as never, { userId: 'u1', points: 100, source: 'squad_battle_refund', fraudGate: false });
    expect(r.status).toBe('posted');
    expect(tx.user.update).toHaveBeenCalled();
  });

  it('meta, points_credited içindeki çekirdek alanları taklit edemez', async () => {
    const tx = makeTx();
    await mintPoints(tx as never, { userId: 'u1', points: 10, source: 'quest', meta: { points: 99999, actorId: 'evil' } });
    const data = (tx.analyticsEvent.create.mock.calls[0] as unknown as [{ data: { data: Row } }])[0].data.data;
    expect(data.points).toBe(10);
    expect(data.actorId).toBeNull();
  });

  it('kullanıcı yoksa USER_NOT_FOUND ve hiçbir yazım yapılmaz', async () => {
    const tx = makeTx({ user: null });
    await expectEconomyError(mintPoints(tx as never, { userId: 'nope', points: 10, source: 'quest' }), 'USER_NOT_FOUND');
    expect(tx.pointsLedger.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ points: Number.NaN }, 'INVALID_AMOUNT'],
    [{ points: Infinity }, 'INVALID_AMOUNT'],
    [{ points: MAX_SINGLE_MINT + 1 }, 'INVALID_AMOUNT'],
    [{ points: 10, source: 'Bad Source' }, 'INVALID_INPUT'],
    [{ points: 10, userId: '' }, 'INVALID_INPUT'],
    [{ points: 10, idempotencyKey: 'x'.repeat(201) }, 'INVALID_INPUT'],
  ])('girdi doğrulama %j → %s', async (patch, code) => {
    const tx = makeTx();
    await expectEconomyError(
      mintPoints(tx as never, { userId: 'u1', source: 'quest', ...(patch as Row) } as never),
      code
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('negatif ve ondalık puan 0/aşağı yuvarlanır; puansız XP-only mint olay yazmaz ama deftere girer', async () => {
    const tx = makeTx();
    const r = await mintPoints(tx as never, { userId: 'u1', points: -5, xp: 7.9, source: 'spin' });
    expect(r).toMatchObject({ credited: 0, xpCredited: 7 });
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: 0, xpDelta: 7 }) })
    );
    expect(tx.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('kök istemci: kendi $transaction’ını açar', async () => {
    const tx = makeTx();
    const root = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    const r = await mintPoints(root as never, { userId: 'u1', points: 10, source: 'quest' });
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(r.credited).toBe(10);
  });

  it('kök istemci: eşzamanlı aynı anahtar P2002 ile düşerse ilk kaydın sonucu duplicate olarak döner', async () => {
    const failing = makeTx();
    failing.pointsLedger.create.mockRejectedValueOnce(Object.assign(new Error('Unique'), { code: 'P2002' }));
    const recovery = makeTx({
      existingLedger: { id: 'first', userId: 'u1', delta: 10, xpDelta: 0, status: 'posted', meta: null },
    });
    const txs = [failing, recovery];
    const root = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(txs.shift())) };
    const r = await mintPoints(root as never, { userId: 'u1', points: 10, source: 'quest', idempotencyKey: 'quest:q1:u1' });
    expect(root.$transaction).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ duplicate: true, ledgerId: 'first', credited: 10 });
  });

  it('çağıranın tx’inde P2002 yutulmaz (tx geri alınsın, fail-closed)', async () => {
    const tx = makeTx();
    tx.pointsLedger.create.mockRejectedValueOnce(Object.assign(new Error('Unique'), { code: 'P2002' }));
    await expect(
      mintPoints(tx as never, { userId: 'u1', points: 10, source: 'quest', idempotencyKey: 'k' })
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('debitPoints (defterli)', () => {
  it('borç + defter satırı (delta<0, balanceAfter) + points_spent aynı tx’te', async () => {
    const tx = makeTx();
    const r = await debitPoints(tx as never, { userId: 'u1', points: 250, source: 'shop', sourceId: 'item1' });
    expect(r).toMatchObject({ points: 750, ledgerId: 'led1', duplicate: false });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', points: { gte: 250 } },
      data: { points: { decrement: 250 } },
    });
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delta: -250, balanceAfter: 750, source: 'shop', sourceId: 'item1' }),
      })
    );
    expect(tx.analyticsEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: 'points_spent', category: 'shop', data: expect.objectContaining({ points: 250 }) }),
    });
  });

  it('kaynak verilmezse "spend" yazılır (eski çağıranlar geriye uyumlu)', async () => {
    const tx = makeTx();
    await debitPoints(tx as never, { userId: 'u1', points: 1 });
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'spend', delta: -1 }) })
    );
  });

  it('yetersiz bakiye: InsufficientPointsError korunur, defter/olay yazılmaz (negatif bakiye imkânsız)', async () => {
    const tx = makeTx({ user: { id: 'u1', points: 30, xp: 0, level: 1 } });
    const p = debitPoints(tx as never, { userId: 'u1', points: 100, source: 'shop' });
    await expect(p).rejects.toBeInstanceOf(InsufficientPointsError);
    await expect(p).rejects.toMatchObject({ currentPoints: 30, requiredPoints: 100 });
    expect(tx.pointsLedger.create).not.toHaveBeenCalled();
    expect(tx.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('tek-kez: aynı anahtarla ikinci borç yapılmaz', async () => {
    const tx = makeTx({ existingLedger: { id: 'd1', userId: 'u1', delta: -250 } });
    const r = await debitPoints(tx as never, { userId: 'u1', points: 250, source: 'shop', idempotencyKey: 'shop:o1' });
    expect(r).toMatchObject({ duplicate: true, ledgerId: 'd1', points: 1000 });
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('tek-kez: anahtar bir krediye ya da başka kullanıcıya aitse IDEMPOTENCY_CONFLICT', async () => {
    const tx = makeTx({ existingLedger: { id: 'c1', userId: 'u1', delta: 100 } });
    await expectEconomyError(
      debitPoints(tx as never, { userId: 'u1', points: 50, idempotencyKey: 'k' }),
      'IDEMPOTENCY_CONFLICT'
    );
  });

  it('geçersiz kaynak adı reddedilir', async () => {
    const tx = makeTx();
    await expectEconomyError(debitPoints(tx as never, { userId: 'u1', points: 5, source: 'DROP TABLE' }), 'INVALID_INPUT');
  });

  it('kök istemciyle çağrılırsa borç ve defter tek $transaction içinde', async () => {
    const tx = makeTx();
    const root = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)), user: tx.user };
    await debitPoints(root as never, { userId: 'u1', points: 5 });
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.pointsLedger.create).toHaveBeenCalled();
  });
});

describe('adjustPointsByAdmin', () => {
  const ADMIN = { id: 'admin1', role: 'ADMIN', email: 'a@x.com', name: 'Admin' };
  const ADMIN2 = { id: 'admin2', role: 'ADMIN', email: 'b@x.com', name: 'Admin 2' };

  it('pozitif düzeltme: mint (admin_adjust, aktör, gerekçe) + audit snapshot', async () => {
    const tx = makeTx({ actors: [ADMIN] });
    const r = await adjustPointsByAdmin(tx as never, {
      adminId: 'admin1',
      userId: 'u1',
      delta: 500,
      reason: 'Kampanya telafisi',
      now: NOW,
    });
    expect(r).toMatchObject({ delta: 500, pointsBefore: 1000, points: 1500, ledgerId: 'led1', duplicate: false });
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'admin_adjust', actorId: 'admin1', reason: 'Kampanya telafisi', delta: 500 }),
      })
    );
    expect(tx.analyticsEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event: 'points_credited', category: 'admin_adjust' }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin1',
        action: 'ADMIN_POINTS_ADJUST',
        entityId: 'u1',
        actorSnapshot: { email: 'a@x.com', role: 'ADMIN', name: 'Admin' },
        oldData: expect.objectContaining({ points: 1000 }),
        newData: expect.objectContaining({ delta: 500, points: 1500, reason: 'Kampanya telafisi' }),
      }),
    });
  });

  it('negatif düzeltme: debit (bakiye eksiye düşmez)', async () => {
    const tx = makeTx({ actors: [ADMIN] });
    const r = await adjustPointsByAdmin(tx as never, { adminId: 'admin1', userId: 'u1', delta: -400, reason: 'Hatalı kredi geri alındı' });
    expect(r.points).toBe(600);
    expect(tx.pointsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: -400, source: 'admin_adjust' }) })
    );
  });

  it('negatif düzeltme bakiyeden büyükse InsufficientPointsError, audit yazılmaz', async () => {
    const tx = makeTx({ actors: [ADMIN], user: { id: 'u1', points: 100, xp: 0, level: 1 } });
    await expect(
      adjustPointsByAdmin(tx as never, { adminId: 'admin1', userId: 'u1', delta: -400, reason: 'Hatalı kredi geri alındı' })
    ).rejects.toBeInstanceOf(InsufficientPointsError);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ reason: '' }, 'REASON_REQUIRED'],
    [{ reason: '   abc ' }, 'REASON_REQUIRED'],
    [{ delta: 1.5 }, 'INVALID_AMOUNT'],
    [{ delta: 0 }, 'INVALID_AMOUNT'],
    [{ delta: 100_001 }, 'CAP_EXCEEDED'],
    [{ delta: -100_001 }, 'CAP_EXCEEDED'],
    [{ userId: 'admin1' }, 'SELF_ADJUST_FORBIDDEN'],
    [{ delta: 20_000 }, 'SECOND_APPROVAL_REQUIRED'],
    [{ delta: 20_000, secondApproverId: 'admin2' }, 'SECOND_APPROVAL_REQUIRED'],
    [{ delta: 20_000, approvalToken: 'v1.sahte.imza' }, 'SECOND_APPROVAL_REQUIRED'],
  ])('doğrulama %j → %s (hiçbir yazım yok)', async (patch, code) => {
    const tx = makeTx({ actors: [ADMIN] });
    await expectEconomyError(
      adjustPointsByAdmin(tx as never, { adminId: 'admin1', userId: 'u1', delta: 100, reason: 'Geçerli gerekçe', ...(patch as Row) } as never),
      code
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('aktör DB’de ADMIN değilse FORBIDDEN (bayat JWT’ye güvenilmez)', async () => {
    const tx = makeTx({ actors: [{ ...ADMIN, role: 'DEALER' }] });
    await expectEconomyError(
      adjustPointsByAdmin(tx as never, { adminId: 'admin1', userId: 'u1', delta: 100, reason: 'Geçerli gerekçe' }),
      'FORBIDDEN'
    );
  });

  it('eşik üstü: imzalı onay belirteci gerekir; onaylayan DB’de gerçek ADMIN olmalı', async () => {
    const { token } = issueAdjustApproval({ approverId: 'admin2', userId: 'u1', delta: 20_000, now: NOW });
    const ok = makeTx({ actors: [ADMIN, ADMIN2] });
    const r = await adjustPointsByAdmin(ok as never, {
      adminId: 'admin1',
      userId: 'u1',
      delta: 20_000,
      reason: 'Büyük etkinlik ödülü',
      approvalToken: token,
      now: NOW,
    });
    expect(r.points).toBe(21_000);
    expect(ok.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ newData: expect.objectContaining({ secondApproverId: 'admin2' }) }),
    });

    const bad = makeTx({ actors: [ADMIN, { ...ADMIN2, role: 'CUSTOMER' }] });
    await expectEconomyError(
      adjustPointsByAdmin(bad as never, {
        adminId: 'admin1',
        userId: 'u1',
        delta: 20_000,
        reason: 'Büyük etkinlik ödülü',
        approvalToken: token,
        now: NOW,
      }),
      'SECOND_APPROVAL_REQUIRED'
    );
  });

  it('onay belirteci sahtelenemez: başka miktar/kullanıcı, kendi onayı, süresi dolmuş ya da kurcalanmış → red', async () => {
    const base = { adminId: 'admin1', userId: 'u1', delta: 20_000, reason: 'Büyük etkinlik ödülü', now: NOW };
    const t = (o: Partial<{ approverId: string; userId: string; delta: number }>) =>
      issueAdjustApproval({ approverId: 'admin2', userId: 'u1', delta: 20_000, now: NOW, ...o }).token;
    const cases = [
      t({ delta: 30_000 }), // başka miktar için verilmiş
      t({ userId: 'u2' }), // başka kullanıcı için
      t({ approverId: 'admin1' }), // talep eden kendi kendini onaylıyor
      t({}).replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A')), // imza kurcalanmış
    ];
    for (const approvalToken of cases) {
      const tx = makeTx({ actors: [ADMIN, ADMIN2] });
      await expectEconomyError(adjustPointsByAdmin(tx as never, { ...base, approvalToken }), 'SECOND_APPROVAL_REQUIRED');
      expect(tx.user.update).not.toHaveBeenCalled();
    }
    const expired = issueAdjustApproval({ approverId: 'admin2', userId: 'u1', delta: 20_000, now: new Date(NOW.getTime() - 16 * 60_000) }).token;
    await expectEconomyError(
      adjustPointsByAdmin(makeTx({ actors: [ADMIN, ADMIN2] }) as never, { ...base, approvalToken: expired }),
      'SECOND_APPROVAL_REQUIRED'
    );
  });

  it('aynı onay belirteci tek kullanımlık: defter anahtarı belirteç nonce’una bağlanır', async () => {
    const { token } = issueAdjustApproval({ approverId: 'admin2', userId: 'u1', delta: 20_000, now: NOW });
    const tx = makeTx({ actors: [ADMIN, ADMIN2] });
    await adjustPointsByAdmin(tx as never, {
      adminId: 'admin1', userId: 'u1', delta: 20_000, reason: 'Büyük etkinlik ödülü', approvalToken: token,
      idempotencyKey: 'istemci-anahtari', now: NOW,
    });
    expect(tx.pointsLedger.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idempotencyKey: expect.stringMatching(/^admin-approval:/) } })
    );
  });

  it('günlük kullanıcı başı admin tavanı (200.000) aşılırsa CAP_EXCEEDED', async () => {
    const tx = makeTx({ actors: [ADMIN], adminTodaySum: 199_950 });
    await expectEconomyError(
      adjustPointsByAdmin(tx as never, { adminId: 'admin1', userId: 'u1', delta: 100, reason: 'Geçerli gerekçe', now: NOW }),
      'CAP_EXCEEDED'
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('aynı idempotencyKey ile tekrar gönderim ikinci kez düzeltmez', async () => {
    const tx = makeTx({
      actors: [ADMIN],
      existingLedger: { id: 'adj1', userId: 'u1', delta: 500, xpDelta: 0, source: 'admin_adjust' },
    });
    const r = await adjustPointsByAdmin(tx as never, {
      adminId: 'admin1',
      userId: 'u1',
      delta: 500,
      reason: 'Kampanya telafisi',
      idempotencyKey: 'adm:req-1',
    });
    expect(r).toMatchObject({ duplicate: true, ledgerId: 'adj1' });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('kök istemciyle çağrılırsa tek $transaction', async () => {
    const tx = makeTx({ actors: [ADMIN] });
    const root = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    await adjustPointsByAdmin(root as never, { adminId: 'admin1', userId: 'u1', delta: 10, reason: 'Geçerli gerekçe' });
    expect(root.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('kategori tavanları (oyun / bayi pasif)', () => {
  it('oyun tavanı: günün kalanı kadar verilir', async () => {
    const tx = makeTx({ events: [ev(ECONOMY_CAPS.game.daily - 40)] });
    const d = await applyCategoryCap(tx as never, { userId: 'u1', category: 'game', points: 150, now: NOW });
    expect(d.granted).toBe(40);
    expect(d.capped).toBe(true);
  });

  it('bayi pasif: müşteri × bayi günlük tavanı uygulanır', async () => {
    const tx = makeTx({ events: [ev(290, NOW, { actorId: 'd1' })] });
    const d = await applyCategoryCap(tx as never, {
      userId: 'u1',
      category: 'dealer_passive',
      points: 50,
      actorId: 'd1',
      now: NOW,
    });
    expect(d.granted).toBe(10);
  });
});

describe('barrel (lib/economy)', () => {
  it('ana API dışa aktarılır', () => {
    expect(typeof economy.mintPoints).toBe('function');
    expect(typeof economy.debitPoints).toBe('function');
    expect(typeof economy.adjustPointsByAdmin).toBe('function');
    expect(economy.InsufficientPointsError).toBe(InsufficientPointsError);
  });
});
