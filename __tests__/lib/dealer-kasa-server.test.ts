/**
 * Kasa sunucu mantığı (lib/dealer/kasa/server.ts) — prisma mock; gerçek DB'ye GİDİLMEZ.
 *  - Kart sorgusu: maskeli DTO (e-posta yok), kendi kartı reddi, SCANNED 60 sn tekilleştirme.
 *  - Geri alma: pencere/yorum kilidi, puan `debitPoints` ile ters kayıt + klan + denetim + silme
 *    tek tx'te; harcanmış puan 409; personel yalnız kendi kaydını.
 */
const mockDebit = jest.fn();
class MockInsufficient extends Error {}
jest.mock('@/lib/economy', () => ({
  debitPoints: (...a: unknown[]) => mockDebit(...a),
  InsufficientPointsError: MockInsufficient,
}));
jest.mock('@/lib/avatar-options', () => ({ resolveAvatarImage: (s: string) => s }));

const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { KasaError, lookupCard, voidConsumption } from '@/lib/dealer/kasa/server';

const NOW = new Date('2026-10-11T10:00:00Z');

function reset(extra: Record<string, unknown>) {
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, extra);
}

describe('lookupCard', () => {
  const card = {
    id: 'card_1',
    token: 'tok_ABCD1234',
    status: 'ACTIVATED',
    archivedAt: null,
    customerId: 'cust_1',
    customer: { name: 'Ayşe Kaya', image: 'http://insecure/x.png', level: 3 },
  };
  function setup(opts: { card?: unknown; recentScan?: boolean } = {}) {
    const create = jest.fn();
    reset({
      physicalCard: { findUnique: jest.fn(async () => (opts.card === undefined ? card : opts.card)) },
      consumption: {
        findMany: jest.fn(async () => [
          { id: 'c1', amount: 40, createdAt: new Date('2026-10-10T10:00:00Z'), product: { name: 'Latte' }, review: { rating: 5, deletedAt: null } },
        ]),
        aggregate: jest.fn(async () => ({ _count: { _all: 3 }, _sum: { amount: 120.456 } })),
        count: jest.fn(async () => 1),
      },
      cardAuditLog: { findFirst: jest.fn(async () => (opts.recentScan ? { id: 'a' } : null)), create },
    });
    return create;
  }
  const base = { dealerId: 'dealer_1', actorId: 'dealer_1', token: 'tok_ABCD1234', ipAddress: '1.1.1.1', userAgent: 'ua', now: NOW };

  it('maskeli DTO döner; e-posta ve müşteri kimliği yok; güvensiz avatar düşer', async () => {
    const create = setup();
    const dto = await lookupCard(base);
    expect(dto.customer).toEqual({ displayName: 'Ayşe K.', initials: 'AK', avatar: null, level: 3 });
    expect(JSON.stringify(dto)).not.toMatch(/cust_1|@/);
    expect(dto.visits).toMatchObject({ countHere: 3, totalSpentHere: 120.46, reviewedHere: 1 });
    expect(dto.last4).toBe('1234');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('60 sn içinde ikinci tarama denetim kaydı yazmaz', async () => {
    const create = setup({ recentScan: true });
    await lookupCard(base);
    expect(create).not.toHaveBeenCalled();
  });
  it('kendi kartı (personel) reddedilir', async () => {
    setup();
    await expect(lookupCard({ ...base, actorId: 'cust_1' })).rejects.toMatchObject({ code: 'SELF_DEALING', status: 403 });
  });
  it.each([
    [null, 'CARD_NOT_FOUND'],
    [{ ...card, status: 'BLOCKED' }, 'CARD_BLOCKED'],
    [{ ...card, archivedAt: new Date() }, 'CARD_ARCHIVED'],
    [{ ...card, status: 'UNUSED', customerId: null, customer: null }, 'CARD_NOT_ACTIVATED'],
  ])('kart durumu → %#', async (c, code) => {
    setup({ card: c });
    await expect(lookupCard(base)).rejects.toMatchObject({ code });
  });
});

describe('voidConsumption', () => {
  const row = {
    id: 'cons_1',
    cardId: 'card_1',
    customerId: 'cust_1',
    productId: 'p1',
    amount: 100,
    note: null,
    clientOpId: 'kasa:1',
    createdAt: new Date(NOW.getTime() - 60_000),
    review: null,
    product: { name: 'Latte' },
  };
  function setup(opts: { row?: unknown; ledger?: unknown; deleted?: number; addedBy?: string } = {}) {
    const tx = {
      pointsLedger: {
        findUnique: jest.fn(async () => (opts.ledger === undefined ? { id: 'led_1', delta: 5, status: 'posted' } : opts.ledger)),
        update: jest.fn(),
      },
      squadMember: { findFirst: jest.fn(async () => ({ squadId: 'sq_1' })) },
      squad: { updateMany: jest.fn() },
      cardAuditLog: { create: jest.fn() },
      notification: { create: jest.fn() },
      consumption: { deleteMany: jest.fn(async () => ({ count: opts.deleted ?? 1 })) },
    };
    reset({
      consumption: { findFirst: jest.fn(async () => (opts.row === undefined ? row : opts.row)) },
      cardAuditLog: { findFirst: jest.fn(async () => (opts.addedBy ? { userId: opts.addedBy } : null)) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    });
    return tx;
  }
  const base = {
    dealerId: 'dealer_1',
    actorId: 'dealer_1',
    actorRole: 'DEALER',
    consumptionId: 'cons_1',
    reason: 'yanlış müşteri',
    ipAddress: null,
    userAgent: null,
    now: NOW,
  };

  it('puan ters kayıtla düşer, klan azalır, denetim + bildirim + silme aynı tx', async () => {
    const tx = setup();
    const res = await voidConsumption(base);
    expect(res).toEqual({ consumptionId: 'cons_1', reversedPoints: 5 });
    expect(mockDebit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'cust_1', points: 5, source: 'reversal', idempotencyKey: 'consumption_void:cons_1' })
    );
    expect(tx.pointsLedger.update).toHaveBeenCalledWith({ where: { id: 'led_1' }, data: { status: 'reversed' } });
    expect(tx.squad.updateMany).toHaveBeenCalledWith({
      where: { id: 'sq_1', totalPoints: { gte: 5 } },
      data: { totalPoints: { decrement: 5 } },
    });
    expect(tx.cardAuditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'CONSUMPTION_VOIDED', userId: 'dealer_1' });
    expect(tx.consumption.deleteMany).toHaveBeenCalledWith({ where: { id: 'cons_1', dealerId: 'dealer_1', review: { is: null } } });
  });
  it('gölge ban (void) defter satırında puan düşülmez', async () => {
    setup({ ledger: { id: 'led_1', delta: 5, status: 'void' } });
    mockDebit.mockClear();
    const res = await voidConsumption(base);
    expect(res.reversedPoints).toBe(0);
    expect(mockDebit).not.toHaveBeenCalled();
  });
  it('15 dk sonrası ve değerlendirilmiş kayıt 409', async () => {
    setup({ row: { ...row, createdAt: new Date(NOW.getTime() - 16 * 60_000) } });
    await expect(voidConsumption(base)).rejects.toMatchObject({ code: 'VOID_WINDOW_CLOSED', status: 409 });
    setup({ row: { ...row, review: { id: 'r' } } });
    await expect(voidConsumption(base)).rejects.toMatchObject({ code: 'VOID_REVIEWED' });
  });
  it('yarışta yorum geldiyse silme koşulu tutmaz → hata (tx geri alınır)', async () => {
    setup({ deleted: 0 });
    await expect(voidConsumption(base)).rejects.toBeInstanceOf(KasaError);
  });
  it('harcanmış puan → 409 VOID_POINTS_SPENT', async () => {
    setup();
    mockDebit.mockRejectedValueOnce(new MockInsufficient('yetersiz'));
    await expect(voidConsumption(base)).rejects.toMatchObject({ code: 'VOID_POINTS_SPENT', status: 409 });
  });
  it('başka bayinin kaydı bulunamaz; personel yalnız kendi girdiğini', async () => {
    setup({ row: null });
    await expect(voidConsumption(base)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    setup({ addedBy: 'staff_other' });
    await expect(voidConsumption({ ...base, actorId: 'staff_1', actorRole: 'STAFF' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    setup({ addedBy: 'staff_1' });
    await expect(voidConsumption({ ...base, actorId: 'staff_1', actorRole: 'STAFF' })).resolves.toMatchObject({ consumptionId: 'cons_1' });
  });
});
