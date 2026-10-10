/**
 * lib/squads — klan üyeliği, haftalık hedef ve savaş (müşteri) servisleri.
 * Kaynak: docs/audit/2026-10-08/musteri/customer_squads.md (Bulgu 3, 5, 6, 7, 9, 12; envanter 20, 31).
 * Gerçek DB yok: Prisma ve ekonomi taklit edilir.
 */
class MockApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message?: string, init: { status?: number } = {}) {
    super(message ?? code);
    this.code = code;
    this.status = init.status ?? 500;
  }
}
jest.mock('@/lib/http/define-route', () => ({ ApiError: MockApiError }));

const mockLockUser = jest.fn(async () => ({ id: 'u', fraudStatus: null }));
const mockMint = jest.fn();
jest.mock('@/lib/economy/mint', () => ({
  lockUserForUpdate: (...a: unknown[]) => mockLockUser(...(a as [])),
  mintPoints: (...a: unknown[]) => mockMint(...a),
}));

const mockCancel = jest.fn();
const mockSettle = jest.fn();
jest.mock('@/lib/squad-battle-service', () => ({
  OPEN_BATTLE_STATUSES: ['pending', 'active'],
  cancelSquadBattle: (...a: unknown[]) => mockCancel(...a),
  settleSquadBattle: (...a: unknown[]) => mockSettle(...a),
}));

class MockInsufficient extends Error {}
const mockDebit = jest.fn();
jest.mock('@/lib/points-wallet', () => ({
  debitPoints: (...a: unknown[]) => mockDebit(...a),
  InsufficientPointsError: MockInsufficient,
}));

type Fn = jest.Mock;
const db = {
  $queryRaw: jest.fn() as Fn,
  squad: {
    findUnique: jest.fn() as Fn,
    findFirst: jest.fn() as Fn,
    findMany: jest.fn() as Fn,
    create: jest.fn() as Fn,
    update: jest.fn() as Fn,
  },
  squadMember: {
    findFirst: jest.fn() as Fn,
    findMany: jest.fn() as Fn,
    count: jest.fn() as Fn,
    create: jest.fn() as Fn,
    delete: jest.fn() as Fn,
  },
  squadBattle: {
    findFirst: jest.fn() as Fn,
    findUnique: jest.fn() as Fn,
    findMany: jest.fn() as Fn,
    create: jest.fn() as Fn,
    updateMany: jest.fn() as Fn,
  },
  squadBattleParticipant: { createMany: jest.fn() as Fn },
  user: { findUnique: jest.fn() as Fn },
  notification: { create: jest.fn() as Fn, createMany: jest.fn() as Fn },
  auditLog: { create: jest.fn() as Fn },
  feedback: { groupBy: jest.fn() as Fn, count: jest.fn() as Fn },
  pointsLedger: { findUnique: jest.fn() as Fn },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(db)) as Fn,
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

import {
  containsBlockedWord,
  istanbulWeekKey,
  istanbulWeekStart,
  resolveGoalTier,
  squadNameSchema,
  weeklyGoalTarget,
} from '@/lib/squads/rules';
import { createSquad, joinSquad, kickMember, transferOwnership } from '@/lib/squads/membership';
import { claimWeeklyGoal, computeWeeklyGoal } from '@/lib/squads/goal';
import { createChallenge, respondChallenge, withdrawChallenge } from '@/lib/squads/battles';

function resetAll(obj: Record<string, unknown>) {
  for (const v of Object.values(obj)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as Fn).mockReset();
    else if (v && typeof v === 'object') resetAll(v as Record<string, unknown>);
  }
}

beforeEach(() => {
  resetAll(db as unknown as Record<string, unknown>);
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([{ id: 's1' }]);
  db.user.findUnique.mockResolvedValue({ name: 'Ayşe' });
  db.notification.create.mockResolvedValue({});
  db.notification.createMany.mockResolvedValue({ count: 1 });
  db.auditLog.create.mockResolvedValue({});
  mockLockUser.mockClear();
  mockMint.mockReset();
  mockCancel.mockReset();
  mockSettle.mockReset();
  mockDebit.mockReset();
});

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? 'THROWN';
  }
  return 'OK';
}

// ───────────────────────────── Kurallar ─────────────────────────────

describe('kurallar', () => {
  it('klan adı kırpılır, kaba dil ve geçersiz karakter reddedilir', () => {
    expect(squadNameSchema.parse('  Kadıköy   Kahvecileri ')).toBe('Kadıköy Kahvecileri');
    expect(squadNameSchema.safeParse('ab').success).toBe(false);
    expect(squadNameSchema.safeParse('<script>').success).toBe(false);
    expect(containsBlockedWord('Orospu Çocukları')).toBe(true);
    expect(containsBlockedWord('Müsikişinaslar')).toBe(false);
  });

  it('hedef üye sayısıyla ölçeklenir; eski varsayılan 5 "dengeli" sayılır', () => {
    expect(resolveGoalTier(5)).toBe(2);
    expect(resolveGoalTier(3)).toBe(3);
    expect(weeklyGoalTarget(2, 1)).toBe(3);
    expect(weeklyGoalTarget(2, 10)).toBe(20);
    expect(weeklyGoalTarget(3, 4)).toBe(12);
  });

  it('hafta İstanbul Pazartesi 00:00 ile başlar', () => {
    // Pazar 23:30 İstanbul (20:30Z) → önceki Pazartesi; Pazartesi 00:30 İstanbul (Pazar 21:30Z) → o gün.
    expect(istanbulWeekStart(new Date('2026-10-11T20:30:00Z')).toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(istanbulWeekStart(new Date('2026-10-11T21:30:00Z')).toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(istanbulWeekKey(new Date('2026-10-11T21:30:00Z'))).toBe('2026-10-12');
  });
});

// ───────────────────────────── Katılım ─────────────────────────────

describe('joinSquad', () => {
  const squad = { id: 's1', name: 'Kurtlar', ownerId: 'o1', isFrozen: false };

  it('kod yoksa INVITE_INVALID', async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect(await codeOf(joinSquad('u1', 'ZZZZZZ'))).toBe('INVITE_INVALID');
  });

  it('önce kullanıcı satırını kilitler; zaten başka klandaysa ALREADY_IN_SQUAD', async () => {
    db.squad.findUnique.mockResolvedValue(squad);
    db.squadMember.findFirst.mockResolvedValue({ id: 'm', squadId: 's9', joinedAt: new Date() });
    expect(await codeOf(joinSquad('u1', 'ABCDEF'))).toBe('ALREADY_IN_SQUAD');
    expect(mockLockUser).toHaveBeenCalledWith(db, 'u1');
    expect(db.squadMember.create).not.toHaveBeenCalled();
  });

  it('dondurulmuş klana katılım SQUAD_FROZEN (tek kaynak Squad.isFrozen)', async () => {
    db.squad.findUnique.mockResolvedValue({ ...squad, isFrozen: true });
    db.squadMember.findFirst.mockResolvedValue(null);
    db.squad.findFirst.mockResolvedValue(null);
    expect(await codeOf(joinSquad('u1', 'ABCDEF'))).toBe('SQUAD_FROZEN');
  });

  it('kapasite dolu ise SQUAD_FULL', async () => {
    db.squad.findUnique.mockResolvedValue(squad);
    db.squadMember.findFirst.mockResolvedValue(null);
    db.squad.findFirst.mockResolvedValue(null);
    db.squadMember.count.mockResolvedValue(10);
    expect(await codeOf(joinSquad('u1', 'ABCDEF'))).toBe('SQUAD_FULL');
  });

  it('başarılı katılım: üye + lidere bildirim + audit', async () => {
    db.squad.findUnique.mockResolvedValue(squad);
    db.squadMember.findFirst.mockResolvedValue(null);
    db.squad.findFirst.mockResolvedValue(null);
    db.squadMember.count.mockResolvedValue(3);
    db.squadMember.create.mockResolvedValue({});
    expect(await joinSquad('u1', 'ABCDEF')).toEqual({ squadId: 's1', name: 'Kurtlar' });
    expect(db.squadMember.create).toHaveBeenCalledWith({ data: { userId: 'u1', squadId: 's1' } });
    expect(db.notification.create.mock.calls[0][0].data.userId).toBe('o1');
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SQUAD_MEMBER_JOIN');
  });
});

describe('createSquad', () => {
  it('aynı ad (harf duyarsız) SQUAD_NAME_TAKEN — 500 değil', async () => {
    db.squadMember.findFirst.mockResolvedValue(null);
    db.squad.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'x' });
    expect(await codeOf(createSquad('u1', { name: 'Kurtlar' }))).toBe('SQUAD_NAME_TAKEN');
  });

  it('yarışta P2002(name) da SQUAD_NAME_TAKEN; inviteCode çakışması yeniden dener', async () => {
    db.squadMember.findFirst.mockResolvedValue(null);
    db.squad.findFirst.mockResolvedValue(null);
    db.squad.create
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['inviteCode'] } }))
      .mockResolvedValueOnce({ id: 's2', name: 'Kurtlar', inviteCode: 'ABCDEF' });
    expect(await createSquad('u1', { name: 'Kurtlar' })).toEqual({ id: 's2', name: 'Kurtlar', inviteCode: 'ABCDEF' });
    expect(db.squad.create).toHaveBeenCalledTimes(2);

    db.squad.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002', meta: { target: ['name'] } }));
    expect(await codeOf(createSquad('u1', { name: 'Kurtlar' }))).toBe('SQUAD_NAME_TAKEN');
  });
});

// ───────────────────────────── Lider işlemleri ─────────────────────────────

describe('lider işlemleri', () => {
  const owned = { id: 's1', name: 'Kurtlar', ownerId: 'o1', isFrozen: false, description: null, weeklyTeamTarget: 2 };

  it('lider olmayan üye çıkaramaz', async () => {
    db.squad.findUnique.mockResolvedValue(owned);
    expect(await codeOf(kickMember('u2', 's1', 'u3'))).toBe('NOT_SQUAD_OWNER');
  });

  it('aktif savaş sürerken üye çıkarılamaz (BATTLE_LOCKED)', async () => {
    db.squad.findUnique.mockResolvedValue(owned);
    db.squadMember.findFirst.mockResolvedValue({ id: 'm3' });
    db.squadBattle.findFirst.mockResolvedValue({ id: 'b1' });
    expect(await codeOf(kickMember('o1', 's1', 'u3'))).toBe('BATTLE_LOCKED');
    expect(db.squadMember.delete).not.toHaveBeenCalled();
  });

  it('çıkarma: üye silinir, bildirim + audit', async () => {
    db.squad.findUnique.mockResolvedValue(owned);
    db.squadMember.findFirst.mockResolvedValue({ id: 'm3' });
    db.squadBattle.findFirst.mockResolvedValue(null);
    db.squadMember.delete.mockResolvedValue({});
    await kickMember('o1', 's1', 'u3');
    expect(db.squadMember.delete).toHaveBeenCalledWith({ where: { id: 'm3' } });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SQUAD_MEMBER_KICK');
  });

  it('başka klanın liderine devredilemez', async () => {
    db.squad.findUnique.mockResolvedValue(owned);
    db.squadMember.findFirst.mockResolvedValue({ id: 'm2' });
    db.squad.findFirst.mockResolvedValue({ id: 's7' });
    expect(await codeOf(transferOwnership('o1', 's1', 'u2'))).toBe('TARGET_OWNS_SQUAD');
    expect(db.squad.update).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Haftalık hedef ─────────────────────────────

describe('haftalık hedef', () => {
  const now = new Date('2026-10-08T12:00:00Z'); // Çarşamba
  const weekStart = new Date('2026-10-04T21:00:00Z');

  it('katkı yalnız katılım anından sonrası; hedef üye sayısıyla', async () => {
    db.feedback.groupBy.mockResolvedValue([{ userId: 'a', _count: { _all: 4 } }]);
    db.feedback.count.mockResolvedValue(1);
    const g = await computeWeeklyGoal(
      db as never,
      { weeklyTeamTarget: 2 },
      [
        { userId: 'a', joinedAt: new Date('2026-09-01T00:00:00Z') },
        { userId: 'late', joinedAt: new Date('2026-10-07T00:00:00Z') },
      ],
      now
    );
    expect(g.weekStart.toISOString()).toBe(weekStart.toISOString());
    expect(db.feedback.count.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(g.progress).toBe(5);
    expect(g.target).toBe(4);
    expect(g.contributions.get('late')).toBe(1);
  });

  function setupSquad(contribA: number) {
    db.squadMember.findFirst.mockResolvedValue({ id: 'm', squadId: 's1', joinedAt: new Date('2026-09-01T00:00:00Z') });
    db.squad.findUnique.mockResolvedValue({
      id: 's1',
      name: 'Kurtlar',
      isFrozen: false,
      weeklyTeamTarget: 1,
      members: [
        { userId: 'a', joinedAt: new Date('2026-09-01T00:00:00Z') },
        { userId: 'b', joinedAt: new Date('2026-09-01T00:00:00Z') },
      ],
    });
    db.feedback.groupBy.mockResolvedValue([
      { userId: 'a', _count: { _all: contribA } },
      { userId: 'b', _count: { _all: 3 } },
    ]);
  }

  it('tamamlanmadıysa GOAL_NOT_COMPLETE', async () => {
    db.squadMember.findFirst.mockResolvedValue({ id: 'm', squadId: 's1', joinedAt: new Date() });
    db.squad.findUnique.mockResolvedValue({
      id: 's1',
      name: 'K',
      isFrozen: false,
      weeklyTeamTarget: 3,
      members: [{ userId: 'a', joinedAt: new Date('2026-09-01T00:00:00Z') }],
    });
    db.feedback.groupBy.mockResolvedValue([{ userId: 'a', _count: { _all: 1 } }]);
    expect(await codeOf(claimWeeklyGoal('a', now))).toBe('GOAL_NOT_COMPLETE');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('katkısı olmayan üye ödül alamaz (GOAL_NOT_ELIGIBLE)', async () => {
    setupSquad(0);
    expect(await codeOf(claimWeeklyGoal('a', now))).toBe('GOAL_NOT_ELIGIBLE');
  });

  it('ödül defterli tek-kez anahtarla basılır; ikinci talep GOAL_ALREADY_CLAIMED', async () => {
    setupSquad(1);
    mockMint.mockResolvedValueOnce({ duplicate: false, credited: 20, status: 'posted' });
    const r = await claimWeeklyGoal('a', now);
    expect(r).toEqual({ reward: 20, credited: 20, weekKey: '2026-10-05' });
    expect(mockMint.mock.calls[0][1]).toMatchObject({
      userId: 'a',
      points: 20,
      source: 'squad',
      idempotencyKey: 'squad-weekly-goal:2026-10-05:a',
    });
    mockMint.mockResolvedValueOnce({ duplicate: true, credited: 20, status: 'posted' });
    expect(await codeOf(claimWeeklyGoal('a', now))).toBe('GOAL_ALREADY_CLAIMED');
  });

  it('askıdaki klan ödül alamaz', async () => {
    setupSquad(2);
    db.squad.findUnique.mockResolvedValue({ ...(await db.squad.findUnique()), isFrozen: true });
    expect(await codeOf(claimWeeklyGoal('a', now))).toBe('SQUAD_FROZEN');
  });
});

// ───────────────────────────── Savaş ─────────────────────────────

describe('savaş', () => {
  it('meydan okuyan klan dondurulmuşsa SQUAD_FROZEN (önceden yalnız hedef kontrol ediliyordu)', async () => {
    db.squad.findFirst.mockResolvedValue({ id: 's1', name: 'A', isFrozen: true });
    db.squad.findUnique.mockResolvedValue({ id: 's2', name: 'B', ownerId: 'o2', isFrozen: false });
    expect(await codeOf(createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 0 }))).toBe('SQUAD_FROZEN');
  });

  it('kendi klanına ya da aynı kişinin klanına meydan okunamaz', async () => {
    db.squad.findFirst.mockResolvedValue({ id: 's1', name: 'A', isFrozen: false });
    expect(await codeOf(createChallenge('o1', { targetSquadId: 's1', durationHours: 24, rewardPool: 0 }))).toBe('BATTLE_SELF');
    db.squad.findUnique.mockResolvedValue({ id: 's2', name: 'B', ownerId: 'o1', isFrozen: false });
    expect(await codeOf(createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 0 }))).toBe('BATTLE_SELF');
  });

  it('süresi dolan eski savaş önce kapatılır, sonra çakışma süresi geçmemiş savaşa bakar', async () => {
    db.squad.findFirst.mockResolvedValue({ id: 's1', name: 'A', isFrozen: false });
    db.squad.findUnique.mockResolvedValue({ id: 's2', name: 'B', ownerId: 'o2', isFrozen: false });
    db.squadBattle.findMany.mockResolvedValue([{ id: 'old', status: 'active' }]);
    mockSettle.mockResolvedValue({});
    db.squadBattle.findFirst.mockResolvedValue(null);
    db.squadBattle.create.mockResolvedValue({ id: 'b9' });
    db.$queryRaw.mockResolvedValue([]);
    const r = await createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 300 });
    expect(r).toEqual({ battleId: 'b9' });
    expect(mockSettle).toHaveBeenCalledWith('old');
    expect(db.squadBattle.findFirst.mock.calls[0][0].where.endTime).toBeDefined();
    expect(mockDebit.mock.calls[0][1]).toMatchObject({ userId: 'o1', points: 300, idempotencyKey: 'squad-escrow:b9' });
  });

  it('bakiye yetmezse INSUFFICIENT_POINTS', async () => {
    db.squad.findFirst.mockResolvedValue({ id: 's1', name: 'A', isFrozen: false });
    db.squad.findUnique.mockResolvedValue({ id: 's2', name: 'B', ownerId: 'o2', isFrozen: false });
    db.squadBattle.findMany.mockResolvedValue([]);
    db.squadBattle.findFirst.mockResolvedValue(null);
    db.squadBattle.create.mockResolvedValue({ id: 'b9' });
    db.$queryRaw.mockResolvedValue([]);
    mockDebit.mockRejectedValue(new MockInsufficient('yetersiz'));
    expect(await codeOf(createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 5000 }))).toBe(
      'INSUFFICIENT_POINTS'
    );
  });

  it('geri çekme yalnız gönderen lider; iadeli iptal servisine gider', async () => {
    db.squadBattle.findUnique.mockResolvedValue({ id: 'b1', status: 'pending', challengedById: 'o1', squad1Id: 's1' });
    db.squad.findUnique.mockResolvedValue({ ownerId: 'o1' });
    expect(await codeOf(withdrawChallenge('u2', 'b1'))).toBe('NOT_SQUAD_OWNER');
    mockCancel.mockResolvedValue({ status: 'cancelled', previousStatus: 'pending', refunded: 500 });
    expect(await withdrawChallenge('o1', 'b1')).toEqual({ refunded: 500 });
    expect(mockCancel.mock.calls[0][2]).toMatchObject({ actorId: 'o1', fromStatuses: ['pending'] });
  });

  it('kabul: dondurulmuş tarafta SQUAD_FROZEN; süresi dolmuşsa BATTLE_NOT_PENDING', async () => {
    const future = new Date(Date.now() + 3600_000);
    const base = {
      id: 'b1',
      status: 'pending',
      startTime: new Date(),
      endTime: future,
      challengedById: 'o1',
      squad1: { id: 's1', name: 'A', ownerId: 'o1', isFrozen: true },
      squad2: { id: 's2', name: 'B', ownerId: 'o2', isFrozen: false },
    };
    db.squadBattle.findUnique.mockResolvedValue(base);
    expect(await codeOf(respondChallenge('o2', 'b1', 'accept'))).toBe('SQUAD_FROZEN');

    db.squadBattle.findUnique.mockResolvedValue({ ...base, endTime: new Date(Date.now() - 1000), squad1: { ...base.squad1, isFrozen: false } });
    db.squadBattle.findMany.mockResolvedValue([]);
    expect(await codeOf(respondChallenge('o2', 'b1', 'accept'))).toBe('BATTLE_NOT_PENDING');
  });

  it('kabul: kadro transaction içinde okunur, iki klanın tüm kadrosuna bildirim', async () => {
    db.squadBattle.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'pending',
      startTime: new Date(),
      endTime: new Date(Date.now() + 24 * 3600_000),
      challengedById: 'o1',
      squad1: { id: 's1', name: 'A', ownerId: 'o1', isFrozen: false },
      squad2: { id: 's2', name: 'B', ownerId: 'o2', isFrozen: false },
    });
    db.squad.findMany.mockResolvedValue([
      { id: 's1', ownerId: 'o1', isFrozen: false },
      { id: 's2', ownerId: 'o2', isFrozen: false },
    ]);
    db.squadBattle.updateMany.mockResolvedValue({ count: 1 });
    db.squadMember.findMany.mockResolvedValue([
      { userId: 'o1', squadId: 's1' },
      { userId: 'o2', squadId: 's2' },
      { userId: 'x', squadId: 's2' },
    ]);
    db.squadBattleParticipant.createMany.mockResolvedValue({ count: 3 });
    const r = await respondChallenge('o2', 'b1', 'accept');
    expect(r.status).toBe('active');
    expect(db.squadBattleParticipant.createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(db.notification.createMany.mock.calls[0][0].data.map((d: { userId: string }) => d.userId).sort()).toEqual(['o1', 'o2', 'x']);
  });
});
