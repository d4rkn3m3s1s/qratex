/**
 * lib/squads/battles — savaş yetki regresyonları (güvenlik incelemesi "authorization" bulgusu).
 *
 * Kapanan açıklar:
 *  1. Geri çekme: `challengedById` tek başına yetiyordu → klandan ayrılan / çıkarılan eski lider,
 *     artık üyesi olmadığı klanın meydan okumasını iptal edebiliyordu.
 *  2. Yetki kararları kilitsiz okumaya dayanıyordu → liderlik devri / ayrılışla yarışta eski lider
 *     klan adına meydan okuyabiliyor, kabul ya da ret edebiliyordu. Artık Squad satırı kilitlenip
 *     sahiplik + donmuşluk transaction içinde DB'den yeniden okunuyor.
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
const tx = {
  $queryRaw: jest.fn() as Fn,
  squad: { findUnique: jest.fn() as Fn, findFirst: jest.fn() as Fn, findMany: jest.fn() as Fn },
  squadMember: { findFirst: jest.fn() as Fn, findMany: jest.fn() as Fn },
  squadBattle: { findFirst: jest.fn() as Fn, create: jest.fn() as Fn, updateMany: jest.fn() as Fn },
  squadBattleParticipant: { createMany: jest.fn() as Fn },
  notification: { create: jest.fn() as Fn },
};
// Kök istemci: kilitsiz ön okumalar buradan; transaction gövdesi `tx` alır (ayrı nesne →
// testte "kilit altında okunan" ile "ön okuma" birbirinden ayrılabilir).
const db = {
  squad: { findUnique: jest.fn() as Fn, findFirst: jest.fn() as Fn },
  squadBattle: { findUnique: jest.fn() as Fn, findMany: jest.fn() as Fn },
  notification: { createMany: jest.fn() as Fn },
  $transaction: jest.fn() as Fn,
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

import { createChallenge, respondChallenge, withdrawChallenge } from '@/lib/squads/battles';

function resetAll(obj: Record<string, unknown>) {
  for (const v of Object.values(obj)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as Fn).mockReset();
    else if (v && typeof v === 'object') resetAll(v as Record<string, unknown>);
  }
}

beforeEach(() => {
  resetAll(db as unknown as Record<string, unknown>);
  resetAll(tx as unknown as Record<string, unknown>);
  mockCancel.mockReset();
  mockSettle.mockReset();
  mockDebit.mockReset();
  db.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
  db.squadBattle.findMany.mockResolvedValue([]);
  db.notification.createMany.mockResolvedValue({ count: 0 });
  tx.$queryRaw.mockResolvedValue([{ id: 'x' }]);
  tx.notification.create.mockResolvedValue({});
});

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? 'THROWN';
  }
  return 'OK';
}

/** `$queryRaw` etiketli şablonla çağrılır: kilitlenen klan kimlikleri ikinci argümandadır. */
function lockedIds(): string[] {
  return tx.$queryRaw.mock.calls.map((c: unknown[]) => String(c[1]));
}

// ───────────────────────────── Geri çekme ─────────────────────────────

describe('withdrawChallenge yetkisi', () => {
  const pending = { id: 'b1', status: 'pending', challengedById: 'payer', squad1Id: 's1' };

  it('klandan ayrılmış eski lider (havuzu ödeyen) artık geri çekemez', async () => {
    db.squadBattle.findUnique.mockResolvedValue(pending);
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'newLeader' });
    tx.squadMember.findFirst.mockResolvedValue(null); // artık üye değil
    expect(await codeOf(withdrawChallenge('payer', 'b1'))).toBe('NOT_SQUAD_OWNER');
    expect(mockCancel).not.toHaveBeenCalled();
    expect(tx.squadMember.findFirst.mock.calls[0][0].where).toEqual({ userId: 'payer', squadId: 's1' });
    expect(lockedIds()).toEqual(['s1']);
  });

  it('havuzu ödeyen hâlâ üyeyse geri çekebilir; iade servise (ödeyene) gider', async () => {
    db.squadBattle.findUnique.mockResolvedValue(pending);
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'newLeader' });
    tx.squadMember.findFirst.mockResolvedValue({ id: 'm1' });
    mockCancel.mockResolvedValue({ status: 'cancelled', previousStatus: 'pending', refunded: 250 });
    expect(await withdrawChallenge('payer', 'b1')).toEqual({ refunded: 250 });
    // Aynı transaction'da (kilit altında) iptal edilir.
    expect(mockCancel.mock.calls[0][0]).toBe(tx);
    expect(mockCancel.mock.calls[0][2]).toMatchObject({ actorId: 'payer', fromStatuses: ['pending'] });
  });

  it('gönderen klanın ŞU ANKİ lideri geri çekebilir (ödeyen olmasa da)', async () => {
    db.squadBattle.findUnique.mockResolvedValue(pending);
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'newLeader' });
    mockCancel.mockResolvedValue({ status: 'cancelled', previousStatus: 'pending', refunded: 250 });
    expect(await withdrawChallenge('newLeader', 'b1')).toEqual({ refunded: 250 });
    expect(tx.squadMember.findFirst).not.toHaveBeenCalled();
  });

  it('rakip klanın lideri / sıradan üye geri çekemez; durum bilgisi sızmaz', async () => {
    db.squadBattle.findUnique.mockResolvedValue({ ...pending, status: 'active' });
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'leader1' });
    expect(await codeOf(withdrawChallenge('leader2', 'b1'))).toBe('NOT_SQUAD_OWNER');
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('yarışta iki geri çekme: ikincisi BATTLE_NOT_PENDING (iade tek sefer servis claim\'inde)', async () => {
    db.squadBattle.findUnique.mockResolvedValue(pending);
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'payer' });
    mockCancel.mockResolvedValue({ status: 'noop', currentStatus: 'cancelled' });
    expect(await codeOf(withdrawChallenge('payer', 'b1'))).toBe('BATTLE_NOT_PENDING');
  });
});

// ───────────────────────────── Yanıt (kabul / ret) ─────────────────────────────

describe('respondChallenge yetkisi', () => {
  const battle = {
    id: 'b1',
    status: 'pending',
    startTime: new Date(),
    endTime: new Date(Date.now() + 24 * 3600_000),
    challengedById: 'o1',
    squad1: { id: 's1', name: 'A', ownerId: 'o1', isFrozen: false },
    squad2: { id: 's2', name: 'B', ownerId: 'o2', isFrozen: false },
  };

  it('rakip klanın lideri olmayan (ör. kendi klanının üyesi) yanıt veremez', async () => {
    db.squadBattle.findUnique.mockResolvedValue(battle);
    expect(await codeOf(respondChallenge('member', 'b1', 'accept'))).toBe('NOT_SQUAD_OWNER');
    expect(await codeOf(respondChallenge('o1', 'b1', 'accept'))).toBe('NOT_SQUAD_OWNER'); // meydan okuyan kendi davetini kabul edemez
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('ret: liderlik kilit altında devredilmişse NOT_SQUAD_OWNER, iptal yapılmaz', async () => {
    db.squadBattle.findUnique.mockResolvedValue(battle); // ön okuma: hâlâ o2
    tx.squad.findFirst.mockResolvedValue(null); // kilit altında: artık lider değil
    expect(await codeOf(respondChallenge('o2', 'b1', 'reject'))).toBe('NOT_SQUAD_OWNER');
    expect(mockCancel).not.toHaveBeenCalled();
    expect(tx.squad.findFirst.mock.calls[0][0].where).toEqual({ id: 's2', ownerId: 'o2' });
    expect(lockedIds()).toEqual(['s2']);
  });

  it('ret: yetkiliyse aynı transaction içinde iadeli iptal', async () => {
    db.squadBattle.findUnique.mockResolvedValue(battle);
    tx.squad.findFirst.mockResolvedValue({ id: 's2' });
    mockCancel.mockResolvedValue({ status: 'cancelled', previousStatus: 'pending', refunded: 100 });
    expect(await respondChallenge('o2', 'b1', 'reject')).toEqual({ status: 'cancelled', refunded: 100 });
    expect(mockCancel.mock.calls[0][0]).toBe(tx);
  });

  it('kabul: liderlik kilit altında devredilmişse savaş başlamaz', async () => {
    db.squadBattle.findUnique.mockResolvedValue(battle);
    tx.squad.findMany.mockResolvedValue([
      { id: 's1', ownerId: 'o1', isFrozen: false },
      { id: 's2', ownerId: 'newLeader', isFrozen: false },
    ]);
    expect(await codeOf(respondChallenge('o2', 'b1', 'accept'))).toBe('NOT_SQUAD_OWNER');
    expect(tx.squadBattle.updateMany).not.toHaveBeenCalled();
    expect(lockedIds()).toEqual(['s1', 's2']);
  });

  it('kabul: taraflardan biri kilit altında askıya alınmışsa SQUAD_FROZEN', async () => {
    db.squadBattle.findUnique.mockResolvedValue(battle);
    tx.squad.findMany.mockResolvedValue([
      { id: 's1', ownerId: 'o1', isFrozen: true },
      { id: 's2', ownerId: 'o2', isFrozen: false },
    ]);
    expect(await codeOf(respondChallenge('o2', 'b1', 'accept'))).toBe('SQUAD_FROZEN');
    expect(tx.squadBattle.updateMany).not.toHaveBeenCalled();
  });

  it('kabul: çift kabul yarışında ikincisi BATTLE_NOT_PENDING; claim süresi dolmamışı şart koşar', async () => {
    db.squadBattle.findUnique.mockResolvedValue(battle);
    tx.squad.findMany.mockResolvedValue([
      { id: 's1', ownerId: 'o1', isFrozen: false },
      { id: 's2', ownerId: 'o2', isFrozen: false },
    ]);
    tx.squadBattle.updateMany.mockResolvedValue({ count: 0 });
    expect(await codeOf(respondChallenge('o2', 'b1', 'accept'))).toBe('BATTLE_NOT_PENDING');
    const where = tx.squadBattle.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'b1', status: 'pending' });
    expect(where.endTime.gt).toBeInstanceOf(Date);
    expect(tx.squadBattleParticipant.createMany).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Meydan okuma ─────────────────────────────

describe('createChallenge yetkisi', () => {
  function setup() {
    db.squad.findFirst.mockResolvedValue({ id: 's1', name: 'A', isFrozen: false });
    db.squad.findUnique.mockResolvedValue({ id: 's2', name: 'B', ownerId: 'o2', isFrozen: false });
    tx.squadBattle.findFirst.mockResolvedValue(null);
    tx.squadBattle.create.mockResolvedValue({ id: 'b9' });
  }

  it('lider olmayan meydan okuyamaz', async () => {
    db.squad.findFirst.mockResolvedValue(null);
    expect(await codeOf(createChallenge('u1', { targetSquadId: 's2', durationHours: 24, rewardPool: 100 }))).toBe(
      'NOT_SQUAD_OWNER'
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('liderlik kilit altında devredilmişse savaş açılmaz ve puan düşülmez', async () => {
    setup();
    tx.squad.findFirst.mockResolvedValue(null);
    expect(await codeOf(createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 100 }))).toBe(
      'NOT_SQUAD_OWNER'
    );
    expect(tx.squad.findFirst.mock.calls[0][0].where).toEqual({ id: 's1', ownerId: 'o1' });
    expect(tx.squadBattle.create).not.toHaveBeenCalled();
    expect(mockDebit).not.toHaveBeenCalled();
    expect(lockedIds()).toEqual(['s1', 's2']);
  });

  it('rakip kilit altında askıya alınmışsa SQUAD_FROZEN, puan düşülmez', async () => {
    setup();
    tx.squad.findFirst.mockResolvedValue({ isFrozen: false });
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'o2', isFrozen: true });
    expect(await codeOf(createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 100 }))).toBe(
      'SQUAD_FROZEN'
    );
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('escrow yalnız meydan okuyanın kendi bakiyesinden; davet rakibin GÜNCEL liderine gider', async () => {
    setup();
    tx.squad.findFirst.mockResolvedValue({ isFrozen: false });
    tx.squad.findUnique.mockResolvedValue({ ownerId: 'o2-new', isFrozen: false });
    expect(await createChallenge('o1', { targetSquadId: 's2', durationHours: 24, rewardPool: 100 })).toEqual({
      battleId: 'b9',
    });
    expect(mockDebit.mock.calls[0][0]).toBe(tx);
    expect(mockDebit.mock.calls[0][1]).toMatchObject({ userId: 'o1', points: 100, idempotencyKey: 'squad-escrow:b9' });
    expect(tx.notification.create.mock.calls[0][0].data.userId).toBe('o2-new');
  });
});
