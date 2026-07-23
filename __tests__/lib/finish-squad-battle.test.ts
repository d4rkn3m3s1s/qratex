/**
 * finishSquadBattle testleri: klan savaşı sonlandırma para akışının çekirdeği.
 * Kritik garantiler:
 *  - ATOMİK CLAIM: updateMany(status active→completed) count=0 ise hiçbir ödeme
 *    yapmaz (üç sonlandırıcı eşzamanlı çalışsa bile tek kez ödenir).
 *  - NO-MINT: yalnızca escrow ile FONLANMIŞ (rewardFunded) havuz dağıtılır;
 *    fonlanmamış savaş puan BASMAZ.
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
  analyticsEvent: { create: jest.fn() },
};

const mockCredit = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    // $transaction callback'i tx ile çağırır (gerçek davranışı taklit eder).
    $transaction: (cb: (tx: unknown) => unknown) => cb(mockTx),
  },
}));
jest.mock('@/lib/effects/confetti', () => ({ triggerConfetti: jest.fn() }));
jest.mock('@/lib/points-wallet', () => ({
  creditPointsAndXp: (...a: unknown[]) => mockCredit(...a),
}));

import { finishSquadBattle } from '@/lib/gamification-engine';

beforeEach(() => {
  mockTx.squadBattle.updateMany.mockReset();
  mockTx.squadBattle.findUnique.mockReset();
  mockTx.squadBattle.update.mockReset().mockResolvedValue({});
  mockTx.squad.update.mockReset().mockResolvedValue({});
  mockTx.notification.create.mockReset().mockResolvedValue({});
  mockTx.analyticsEvent.create.mockReset().mockResolvedValue({});
  mockCredit.mockReset().mockResolvedValue({ points: 0, xp: 0, level: 1, isLevelUp: false });
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

describe('finishSquadBattle — atomik claim', () => {
  it('claim count=0 (zaten tamamlanmış) → null döner, HİÇBİR ödeme/okuma yapılmaz', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 0 });

    const res = await finishSquadBattle('b1');

    expect(res).toBeNull();
    expect(mockTx.squadBattle.findUnique).not.toHaveBeenCalled();
    expect(mockCredit).not.toHaveBeenCalled();
  });

  it('claim count=1 → savaş okunur ve sonuçlandırılır', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(battle());

    await finishSquadBattle('b1');

    expect(mockTx.squadBattle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1', status: 'active' }, data: { status: 'completed' } })
    );
    expect(mockTx.squadBattle.findUnique).toHaveBeenCalled();
  });
});

describe('finishSquadBattle — no-mint & escrow', () => {
  it('FONLANMIŞ havuz: kazanan klanın üyelerine eşit dağıtılır + points_credited yazılır', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(battle()); // pool 1000, 2 kazanan → 500/kişi

    await finishSquadBattle('b1');

    // İki kazanan katılımcıya kredi
    expect(mockCredit).toHaveBeenCalledTimes(2);
    expect(mockCredit).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ userId: 'a', points: 500, xp: 250 })
    );
    // points_credited görünürlük olayı yazılmalı
    expect(mockTx.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'points_credited', category: 'squad_battle' }),
      })
    );
    // Hiç iade kalmadı (1000 = 2×500) → challenger'a iade yok
    expect(mockCredit).not.toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ userId: 'challenger' })
    );
  });

  it('FONLANMAMIŞ havuz: puan BASILMAZ (mint yok), kazanana ödeme yapılmaz', async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(battle({ rewardFunded: false }));

    await finishSquadBattle('b1');

    expect(mockCredit).not.toHaveBeenCalled();
    expect(mockTx.squad.update).not.toHaveBeenCalled();
  });

  it("BERABERLİK (kazanan yok): fonlanmış havuzun tamamı challenger'a iade edilir", async () => {
    mockTx.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    mockTx.squadBattle.findUnique.mockResolvedValue(
      battle({ squad1Score: 5, squad2Score: 5 }) // beraberlik
    );

    await finishSquadBattle('b1');

    // Kazanan yok → kimseye ödül yok, tüm pool challenger'a iade
    expect(mockCredit).toHaveBeenCalledTimes(1);
    expect(mockCredit).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ userId: 'challenger', points: 1000 })
    );
    expect(mockTx.analyticsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: 'squad_battle_refund' }),
      })
    );
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

    // 3 kazanan × 333 = 999 dağıtıldı, kalan 1 challenger'a iade
    expect(mockCredit).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ userId: 'challenger', points: 1 })
    );
  });
});
