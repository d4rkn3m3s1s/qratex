/**
 * addToActiveBattleScore testleri: kullanıcı puan kazandığında aktif savaş skoru
 * (katılımcı + ilgili klan toplamı) artmalı; klan üyesi değilse veya aktif savaş
 * yoksa hiçbir şey yapılmamalı.
 */
const mockSquadMemberFindFirst = jest.fn();
const mockBattleFindFirst = jest.fn();
const mockParticipantUpsert = jest.fn();
const mockBattleUpdate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    squadMember: { findFirst: (...a: unknown[]) => mockSquadMemberFindFirst(...a) },
    squadBattle: {
      findFirst: (...a: unknown[]) => mockBattleFindFirst(...a),
      update: (...a: unknown[]) => mockBattleUpdate(...a),
    },
    squadBattleParticipant: { upsert: (...a: unknown[]) => mockParticipantUpsert(...a) },
  },
}));

// confetti effecti jsdom dışı; modülün import zinciri için stub.
jest.mock('@/lib/effects/confetti', () => ({ triggerConfetti: jest.fn() }));
jest.mock('@/lib/points-wallet', () => ({ creditPointsAndXp: jest.fn() }));

import { addToActiveBattleScore } from '@/lib/gamification-engine';
import { prisma } from '@/lib/prisma';

beforeEach(() => {
  mockSquadMemberFindFirst.mockReset();
  mockBattleFindFirst.mockReset();
  mockParticipantUpsert.mockReset().mockResolvedValue({});
  mockBattleUpdate.mockReset().mockResolvedValue({});
});

describe('addToActiveBattleScore', () => {
  it('puan 0 veya negatifse hiçbir şey yapmaz', async () => {
    const r = await addToActiveBattleScore('u1', 0, prisma);
    expect(r).toBe(0);
    expect(mockSquadMemberFindFirst).not.toHaveBeenCalled();
  });

  it('kullanıcı bir klanda değilse 0 döner', async () => {
    mockSquadMemberFindFirst.mockResolvedValue(null);
    const r = await addToActiveBattleScore('u1', 50, prisma);
    expect(r).toBe(0);
    expect(mockBattleFindFirst).not.toHaveBeenCalled();
  });

  it('aktif savaş yoksa 0 döner', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's1' });
    mockBattleFindFirst.mockResolvedValue(null);
    const r = await addToActiveBattleScore('u1', 50, prisma);
    expect(r).toBe(0);
    expect(mockParticipantUpsert).not.toHaveBeenCalled();
  });

  it('squad1 üyesi: katılımcı + squad1Score artar', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's1' });
    mockBattleFindFirst.mockResolvedValue({ id: 'b1', squad1Id: 's1', squad2Id: 's2' });
    const r = await addToActiveBattleScore('u1', 40, prisma);
    expect(r).toBe(40);
    expect(mockParticipantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { battleId_userId: { battleId: 'b1', userId: 'u1' } },
        update: { score: { increment: 40 } },
      })
    );
    expect(mockBattleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        data: { squad1Score: { increment: 40 } },
      })
    );
  });

  it('squad2 üyesi: squad2Score artar', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's2' });
    mockBattleFindFirst.mockResolvedValue({ id: 'b1', squad1Id: 's1', squad2Id: 's2' });
    const r = await addToActiveBattleScore('u2', 25, prisma);
    expect(r).toBe(25);
    expect(mockBattleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { squad2Score: { increment: 25 } } })
    );
  });
});
