/**
 * addToActiveBattleScore testleri: kullanıcı puan kazandığında aktif savaş skoru
 * (katılımcı + ilgili klan toplamı) artmalı; klan üyesi değilse veya aktif savaş
 * yoksa hiçbir şey yapılmamalı.
 *
 * Kadro kilidi (customer_squads.md Bulgu 6):
 *  - katılımcı satırı başka klan için açılmışsa (savaş ortasında klan değiştirdi) skor yazılmaz;
 *  - satır yoksa yalnız kabulden ÖNCE katılmış üye için açılır (son dakika katılımı sayılmaz).
 */
const mockSquadMemberFindFirst = jest.fn();
const mockBattleFindFirst = jest.fn();
const mockParticipantFindUnique = jest.fn();
const mockParticipantUpdate = jest.fn();
const mockParticipantCreate = jest.fn();
const mockBattleUpdate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    squadMember: { findFirst: (...a: unknown[]) => mockSquadMemberFindFirst(...a) },
    squadBattle: {
      findFirst: (...a: unknown[]) => mockBattleFindFirst(...a),
      update: (...a: unknown[]) => mockBattleUpdate(...a),
    },
    squadBattleParticipant: {
      findUnique: (...a: unknown[]) => mockParticipantFindUnique(...a),
      update: (...a: unknown[]) => mockParticipantUpdate(...a),
      create: (...a: unknown[]) => mockParticipantCreate(...a),
    },
  },
}));

// confetti effecti jsdom dışı; modülün import zinciri için stub.
jest.mock('@/lib/effects/confetti', () => ({ triggerConfetti: jest.fn() }));
jest.mock('@/lib/points-wallet', () => ({ creditPointsAndXp: jest.fn() }));
jest.mock('@/lib/squad-battle-service', () => ({ settleSquadBattle: jest.fn() }));

import { addToActiveBattleScore } from '@/lib/gamification-engine';
import { prisma } from '@/lib/prisma';

const ACCEPTED = new Date('2026-10-01T10:00:00Z');
const BEFORE = new Date('2026-09-20T10:00:00Z');
const AFTER = new Date('2026-10-02T10:00:00Z');

beforeEach(() => {
  mockSquadMemberFindFirst.mockReset();
  mockBattleFindFirst.mockReset();
  mockParticipantFindUnique.mockReset().mockResolvedValue(null);
  mockParticipantUpdate.mockReset().mockResolvedValue({});
  mockParticipantCreate.mockReset().mockResolvedValue({});
  mockBattleUpdate.mockReset().mockResolvedValue({});
});

const battle = { id: 'b1', squad1Id: 's1', squad2Id: 's2', acceptedAt: ACCEPTED, startTime: ACCEPTED };

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
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's1', joinedAt: BEFORE });
    mockBattleFindFirst.mockResolvedValue(null);
    const r = await addToActiveBattleScore('u1', 50, prisma);
    expect(r).toBe(0);
    expect(mockParticipantUpdate).not.toHaveBeenCalled();
    expect(mockParticipantCreate).not.toHaveBeenCalled();
  });

  it('kadrodaki squad1 üyesi: katılımcı + squad1Score artar', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's1', joinedAt: BEFORE });
    mockBattleFindFirst.mockResolvedValue(battle);
    mockParticipantFindUnique.mockResolvedValue({ squadId: 's1' });
    const r = await addToActiveBattleScore('u1', 40, prisma);
    expect(r).toBe(40);
    expect(mockParticipantUpdate).toHaveBeenCalledWith({
      where: { battleId_userId: { battleId: 'b1', userId: 'u1' } },
      data: { score: { increment: 40 } },
    });
    expect(mockBattleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1' }, data: { squad1Score: { increment: 40 } } })
    );
  });

  it('squad2 üyesi (kabulden önce katılmış, satırı yok): satır açılır, squad2Score artar', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's2', joinedAt: BEFORE });
    mockBattleFindFirst.mockResolvedValue(battle);
    const r = await addToActiveBattleScore('u2', 25, prisma);
    expect(r).toBe(25);
    expect(mockParticipantCreate).toHaveBeenCalledWith({
      data: { battleId: 'b1', squadId: 's2', userId: 'u2', score: 25 },
    });
    expect(mockBattleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { squad2Score: { increment: 25 } } }));
  });

  it('kabulden SONRA katılan üye skor yazamaz (son dakika katılımı)', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's1', joinedAt: AFTER });
    mockBattleFindFirst.mockResolvedValue(battle);
    const r = await addToActiveBattleScore('late', 30, prisma);
    expect(r).toBe(0);
    expect(mockParticipantCreate).not.toHaveBeenCalled();
    expect(mockBattleUpdate).not.toHaveBeenCalled();
  });

  it('savaş ortasında rakip klana geçen (satırı eski klan için) skor yazamaz', async () => {
    mockSquadMemberFindFirst.mockResolvedValue({ squadId: 's2', joinedAt: BEFORE });
    mockBattleFindFirst.mockResolvedValue(battle);
    mockParticipantFindUnique.mockResolvedValue({ squadId: 's1' });
    const r = await addToActiveBattleScore('switcher', 30, prisma);
    expect(r).toBe(0);
    expect(mockParticipantUpdate).not.toHaveBeenCalled();
    expect(mockBattleUpdate).not.toHaveBeenCalled();
  });
});
