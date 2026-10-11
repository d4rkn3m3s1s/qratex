/**
 * Moderasyon geri alımı (lib/economy/clawback) — oyunlaştırma-ekonomi Y4.
 *
 * Senaryo: müşteri yorumdan puan alır → yönetici yorumu çöpe atar → puan defterli düşülür →
 * yorum geri yüklenince iade edilir. Sil/geri yükle/sil döngüsü, tekrar istek, bakiye yetmezliği
 * ve tüketim yorumunda önceden yapılmış "ayrıntı farkı" geri alımı. Gerçek DB yok: bellek içi defter.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  clawBackModeratedCredits,
  netCreditAfterShrink,
  restoreModeratedCredits,
  type ModerationItem,
} from '@/lib/economy/clawback';

type LedgerRow = {
  id: string;
  userId: string | null;
  delta: number;
  xpDelta: number;
  status: string;
  source: string;
  sourceId: string | null;
  idempotencyKey: string | null;
  meta?: unknown;
};

function makeTx(initial: { balance: number; ledger: LedgerRow[] }) {
  let balance = initial.balance;
  const ledger: LedgerRow[] = [...initial.ledger];
  let seq = 0;
  const byKey = (k: string) => ledger.find((r) => r.idempotencyKey === k) ?? null;
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: 'u1', fraudStatus: 'clean' }]),
    user: {
      findUnique: jest.fn(async () => ({ id: 'u1', points: balance, xp: 0, level: 1 })),
      update: jest.fn(async ({ data }: { data: { points?: { increment: number } } }) => {
        balance += data.points?.increment ?? 0;
        return { id: 'u1', points: balance, xp: 0, level: 1 };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { points?: { gte: number } }; data: { points?: { decrement: number } } }) => {
        if (where.points && balance < where.points.gte) return { count: 0 };
        if (data.points) balance -= data.points.decrement;
        return { count: 1 };
      }),
    },
    pointsLedger: {
      findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => byKey(where.idempotencyKey)),
      findMany: jest.fn(async ({ where }: { where: { sourceId: string; OR: Array<{ idempotencyKey: { startsWith: string } }> } }) =>
        ledger.filter(
          (r) => r.sourceId === where.sourceId && where.OR.some((o) => (r.idempotencyKey ?? '').startsWith(o.idempotencyKey.startsWith))
        )
      ),
      create: jest.fn(async ({ data }: { data: Omit<LedgerRow, 'id'> }) => {
        if (data.idempotencyKey && byKey(data.idempotencyKey)) throw Object.assign(new Error('Unique'), { code: 'P2002' });
        const row = { id: `led-${++seq}`, xpDelta: 0, ...data } as LedgerRow;
        ledger.push(row);
        return { id: row.id };
      }),
    },
    analyticsEvent: { create: jest.fn(async () => ({ id: 'ev' })), findMany: jest.fn(async () => []) },
  };
  return { tx, ledger, balance: () => balance };
}

const credit = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 'credit-1',
  userId: 'u1',
  delta: 100,
  xpDelta: 50,
  status: 'posted',
  source: 'feedback',
  sourceId: 'fb-1',
  idempotencyKey: 'feedback:fb-1',
  ...over,
});

const FB: ModerationItem[] = [{ kind: 'feedback', feedbackId: 'fb-1' }];
const ADMIN = { actorId: 'admin-1' };

describe('moderasyon geri alımı', () => {
  it('silinen yorumun puanı defterli düşülür; tekrar silme isteği ikinci kez düşmez', async () => {
    const { tx, ledger, balance } = makeTx({ balance: 400, ledger: [credit()] });
    const r1 = await clawBackModeratedCredits(tx as never, FB, ADMIN);
    expect(r1).toEqual({ affected: 1, points: 100 });
    expect(balance()).toBe(300);
    const row = ledger.find((l) => l.idempotencyKey === 'moderation_clawback:credit-1:0');
    expect(row).toMatchObject({ delta: -100, source: 'reversal', sourceId: 'credit-1' });

    const r2 = await clawBackModeratedCredits(tx as never, FB, ADMIN);
    expect(r2).toEqual({ affected: 0, points: 0 });
    expect(balance()).toBe(300);
  });

  it('bakiye yetmezse bakiye kadar düşülür (eksi bakiye yok); geri yüklemede yalnız düşülen iade edilir', async () => {
    const { tx, balance } = makeTx({ balance: 30, ledger: [credit()] });
    await clawBackModeratedCredits(tx as never, FB, ADMIN);
    expect(balance()).toBe(0);
    const r = await restoreModeratedCredits(tx as never, FB, ADMIN);
    expect(r).toEqual({ affected: 1, points: 30 });
    expect(balance()).toBe(30);
  });

  it('sil → geri yükle → sil döngüsü her adımda doğru net bakiyeyi verir', async () => {
    const { tx, balance } = makeTx({ balance: 500, ledger: [credit()] });
    await clawBackModeratedCredits(tx as never, FB, ADMIN);
    expect(balance()).toBe(400);
    await restoreModeratedCredits(tx as never, FB, ADMIN);
    expect(balance()).toBe(500);
    // Aynı geri yükleme tekrarlanırsa ikinci iade yok.
    expect(await restoreModeratedCredits(tx as never, FB, ADMIN)).toEqual({ affected: 0, points: 0 });
    expect(balance()).toBe(500);
    await clawBackModeratedCredits(tx as never, FB, ADMIN);
    expect(balance()).toBe(400);
  });

  it('kredisi olmayan (puansız / void / defter öncesi) yorum atlanır', async () => {
    const { tx, balance } = makeTx({ balance: 500, ledger: [credit({ status: 'void' })] });
    expect(await clawBackModeratedCredits(tx as never, FB, ADMIN)).toEqual({ affected: 0, points: 0 });
    expect(await clawBackModeratedCredits(tx as never, [{ kind: 'feedback', feedbackId: 'yok' }], ADMIN)).toEqual({ affected: 0, points: 0 });
    expect(balance()).toBe(500);
  });

  it('tüketim yorumu: önceki "ayrıntı farkı" geri alımı düşülen tutardan çıkarılır', async () => {
    const { tx, balance } = makeTx({
      balance: 500,
      ledger: [
        credit({ id: 'credit-r', idempotencyKey: 'consumption_review:cons-1', source: 'review', sourceId: 'cons-1' }),
        { id: 'shrink', userId: 'u1', delta: -50, xpDelta: 0, status: 'posted', source: 'reversal', sourceId: 'rev-1', idempotencyKey: 'consumption_review_shrink:cons-1' },
      ],
    });
    const r = await clawBackModeratedCredits(tx as never, [{ kind: 'consumption_review', consumptionId: 'cons-1' }], ADMIN);
    expect(r).toEqual({ affected: 1, points: 50 });
    expect(balance()).toBe(450);
  });

  it('netCreditAfterShrink saf hesap', () => {
    expect(netCreditAfterShrink(100, null)).toBe(100);
    expect(netCreditAfterShrink(100, -50)).toBe(50);
    expect(netCreditAfterShrink(100, -150)).toBe(0);
  });
});
