/**
 * finishSquadBattle testleri: klan savaşı sonlandırma para akışının çekirdeği.
 * (P0-20 sonrası `finishSquadBattle` → `lib/squad-battle-service#settleSquadBattle`.)
 * Kritik garantiler:
 *  - ATOMİK CLAIM: updateMany(status active→completed, paidOutAt null→now) count=0 ise hiçbir
 *    ödeme yapmaz (üç sonlandırıcı eşzamanlı çalışsa / savaş yeniden aktifleştirilse bile tek kez).
 *  - NO-MINT: yalnızca escrow ile FONLANMIŞ (rewardFunded) havuz dağıtılır;
 *    fonlanmamış savaş puan BASMAZ.
 *  - DEFTERLİ: ödeme ve iade `mintPoints` ile (points_credited aynı tx'te, tek-kez anahtarlı).
 *  - REFUND: kazanan yok / kalan artık → meydan okuyana iade (idempotent).
 */
const mockTx = {
  squadBattle: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  squad: { update: jest.fn() },
  notification: { create: jest.fn() },
  auditLog: { create: jest.fn() },
};

const mockMint = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    // $transaction callback'i tx ile çağırır (gerçek davranışı taklit eder).
    $transaction: (cb: (tx: unknown) => unknown) => cb(mockTx),
  },
}));
jest.mock('@/lib/effects/confetti', () => ({ triggerConfetti: jest.fn() }));
jest.mock('@/lib/economy/mint', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
}));

import { finishSquadBattle } from '@/lib/gamification-engine';

beforeEach(() => {
  mockTx.squadBattle.updateMany.mockReset();
  mockTx.squadBattle.findUnique.mockReset();
  mockTx.squadBattle.update.mockReset().mockResolvedValue({ id: 'b1' });
  mockTx.squad.update.mockReset().mockResolvedValue({});
  mockTx.notification.create.mockReset().mockResolvedValue({});
  mockTx.auditLog.create.mockReset().mockResolvedValue({});
  mockMint
    .mockReset()
    .mockImplementation(async (_tx: unknown, input: { points: number }) => ({
      credited: input.points,
      status: 'posted',
      duplicate: false,
    }));
});

function battle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    squad1Id: 's1',
    squad2Id: 's2',
    squad1Score: 10,
    squad2Score: 0,
    rewardPool: 1000,
    rewardFunded: true,
    rewardRefunded: false,
    challengedById: 'challenger',
    participants: [
      { userId: 'a', squadId: 's1' },
      { userId: 'b', squadId: 's1' },
    ],
    squad1: { id: 's1', name: 'Kırmızı' },
    squad2: { id: 's2', name: 'Mavi' },
    ...overrides,
  };
}

const mintFor = (userId: string) =>
  mockMint.mock.calls.filter((c) => (c[1] as { userId: string }).userId === userId).map((c) => c[1]);

describe('finishSquadBattle — atomik claim', () => {
  it('claim count=0 (zaten tamamlanmış / ödenmiş) → null döner, HİÇBİR ödeme/okuma yapılmaz', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 0 });

    const res = await finishSquadBattle('b1');

    expect(res).toBeNull();
    expect(mockTx.squadBattle.findUnique).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('claim count=1 → paidOutAt guard’ıyla claim edilir, savaş okunur ve sonuçlandırılır', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(battle());

    const res = await finishSquadBattle('b1');

    expect(mockTx.squadBattle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1', status: 'active', paidOutAt: null },
        data: expect.objectContaining({ status: 'completed', paidOutAt: expect.any(Date) }),
      })
    );
    expect(mockTx.squadBattle.findUnique).toHaveBeenCalled();
    expect(res).toEqual({ id: 'b1' });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'SQUAD_BATTLE_SETTLE' }) })
    );
  });
});

describe('finishSquadBattle — no-mint & escrow', () => {
  it('FONLANMIŞ havuz: kazanan klanın üyelerine eşit dağıtılır, defterli ve tek-kez anahtarlı', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(battle()); // pool 1000, 2 kazanan → 500/kişi

    await finishSquadBattle('b1');

    expect(mintFor('a')).toEqual([
      expect.objectContaining({
        points: 500,
        xp: 250,
        source: 'squad_battle',
        idempotencyKey: 'squad-payout:b1:a',
        capCategory: null,
      }),
    ]);
    expect(mintFor('b')).toHaveLength(1);
    // Hiç iade kalmadı (1000 = 2×500) → challenger'a iade yok
    expect(mintFor('challenger')).toHaveLength(0);
  });

  it('FONLANMAMIŞ havuz: puan BASILMAZ (mint yok), kazanana ödeme yapılmaz', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(battle({ rewardFunded: false }));

    await finishSquadBattle('b1');

    expect(mockMint).not.toHaveBeenCalled();
    expect(mockTx.squad.update).not.toHaveBeenCalled();
  });

  it("BERABERLİK (kazanan yok): fonlanmış havuzun tamamı challenger'a iade edilir", async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(
      battle({ squad1Score: 5, squad2Score: 5 }) // beraberlik
    );

    await finishSquadBattle('b1');

    expect(mockMint).toHaveBeenCalledTimes(1);
    expect(mintFor('challenger')).toEqual([
      expect.objectContaining({
        points: 1000,
        source: 'squad_escrow_refund',
        idempotencyKey: 'squad-escrow-refund:b1',
        fraudGate: false,
      }),
    ]);
  });

  it("bölme artığı (3 kazanan, 1000 pool → 333×3=999) kalan 1 puan challenger'a iade edilir", async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(
      battle({
        participants: [
          { userId: 'a', squadId: 's1' },
          { userId: 'b', squadId: 's1' },
          { userId: 'c', squadId: 's1' },
        ],
      })
    );

    await finishSquadBattle('b1');

    expect(mintFor('challenger')).toEqual([expect.objectContaining({ points: 1 })]);
  });
});
