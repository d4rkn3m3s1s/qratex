/**
 * P0-20 — klan escrow'u artık yok olamaz (net-sıfır).
 *
 * Yeniden üretilen senaryolar (önceden):
 *   - Admin "İptal" → `squadBattle.delete`: meydan okuyandan tahsil edilen 500 puan kayboluyordu.
 *   - Kurucu ayrılınca `squad.delete` → açık savaş cascade, escrow kayboluyordu; klan diğer
 *     üyelerin elinden gidiyordu.
 *   - Tamamlanmış savaş yeniden `active` yapılıp `finish` → havuz ikinci kez ödeniyordu.
 * Gerçek DB yok: bellek içi sahte transaction + mintPoints taklidi (defter anahtarlarını tutar).
 */
type Battle = {
  id: string;
  squad1Id: string;
  squad2Id: string;
  status: string;
  squad1Score: number;
  squad2Score: number;
  winnerId: string | null;
  rewardPool: number;
  rewardFunded: boolean;
  rewardRefunded: boolean;
  challengedById: string | null;
  paidOutAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
};
type Squad = { id: string; name: string; ownerId: string; totalPoints: number };
type Member = { id: string; userId: string; squadId: string; joinedAt: Date };
type Participant = { battleId: string; squadId: string; userId: string };

let battles: Map<string, Battle>;
let squads: Map<string, Squad>;
let members: Member[];
let participants: Participant[];
let ledger: Map<string, { userId: string; amount: number; status: string }>;
let balances: Map<string, number>;
let shadowBanned: Set<string>;
let audits: Array<{ action: string; entityId: string }>;

function matches(b: Battle, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cur = (b as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !(v instanceof Date) && 'in' in (v as object)) {
      if (!(v as { in: unknown[] }).in.includes(cur)) return false;
    } else if (cur !== v) return false;
  }
  return true;
}

function withRelations(b: Battle) {
  return {
    ...b,
    squad1: { ...squads.get(b.squad1Id)!, members: [] },
    squad2: { ...squads.get(b.squad2Id)!, members: [] },
    participants: participants.filter((p) => p.battleId === b.id),
  };
}

const tx = {
  $queryRaw: jest.fn(async () => []),
  squadBattle: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const b = battles.get(where.id);
      return b ? withRelations(b) : null;
    }),
    findMany: jest.fn(async ({ where }: { where: { status: { in: string[] }; OR: Array<Record<string, string>> } }) =>
      [...battles.values()]
        .filter((b) => where.status.in.includes(b.status))
        .filter((b) => where.OR.some((o) => Object.entries(o).every(([k, v]) => (b as Record<string, unknown>)[k] === v)))
        .map((b) => ({ id: b.id }))
    ),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Battle> }) => {
      const b = battles.get(where.id as string);
      if (!b || !matches(b, where)) return { count: 0 };
      Object.assign(b, data);
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Battle> }) => {
      const b = battles.get(where.id)!;
      Object.assign(b, data);
      return { ...b };
    }),
  },
  squad: {
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const s = squads.get(where.id)!;
      if (typeof data.ownerId === 'string') s.ownerId = data.ownerId;
      const tp = data.totalPoints as { increment?: number } | undefined;
      if (tp?.increment) s.totalPoints += tp.increment;
      return s;
    }),
    findMany: jest.fn(async ({ where }: { where: { ownerId: { in: string[] } } }) =>
      [...squads.values()].filter((s) => where.ownerId.in.includes(s.ownerId)).map((s) => ({ ownerId: s.ownerId }))
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      squads.delete(where.id);
      // cascade (şema): klanın bütün savaşları silinir — iade ÖNCE yapılmış olmalı.
      for (const [id, b] of battles) if (b.squad1Id === where.id || b.squad2Id === where.id) battles.delete(id);
      members = members.filter((m) => m.squadId !== where.id);
      return {};
    }),
  },
  squadMember: {
    findFirst: jest.fn(async ({ where }: { where: { userId: string; squadId: string } }) => {
      const m = members.find((x) => x.userId === where.userId && x.squadId === where.squadId);
      return m ? { id: m.id, squad: squads.get(m.squadId)! } : null;
    }),
    findMany: jest.fn(async ({ where }: { where: { squadId: string; userId: { not: string } } }) =>
      members
        .filter((m) => m.squadId === where.squadId && m.userId !== where.userId.not)
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
        .map((m) => ({ userId: m.userId }))
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      members = members.filter((m) => m.id !== where.id);
      return {};
    }),
  },
  squadBattleParticipant: {
    // Ayrılan üye aktif savaş kadrosundan düşer (customer_squads Bulgu 6).
    deleteMany: jest.fn(
      async ({ where }: { where: { userId: string; squadId: string; battle: { status: string } } }) => {
        const before = participants.length;
        participants = participants.filter(
          (p) =>
            !(
              p.userId === where.userId &&
              p.squadId === where.squadId &&
              battles.get(p.battleId)?.status === where.battle.status
            )
        );
        return { count: before - participants.length };
      }
    ),
  },
  notification: { create: jest.fn(async () => ({})), createMany: jest.fn(async () => ({ count: 1 })) },
  auditLog: {
    create: jest.fn(async ({ data }: { data: { action: string; entityId: string } }) => {
      audits.push({ action: data.action, entityId: data.entityId });
      return {};
    }),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: async (cb: (t: unknown) => unknown) => cb(tx) },
}));

const mockMint = jest.fn(async (_db: unknown, input: { userId: string; points: number; idempotencyKey: string; fraudGate?: boolean }) => {
  const prev = ledger.get(input.idempotencyKey);
  if (prev) return { duplicate: true, credited: prev.amount, status: prev.status };
  const status = input.fraudGate !== false && shadowBanned.has(input.userId) ? 'void' : 'posted';
  ledger.set(input.idempotencyKey, { userId: input.userId, amount: input.points, status });
  if (status === 'posted') balances.set(input.userId, (balances.get(input.userId) ?? 0) + input.points);
  return { duplicate: false, credited: input.points, status };
});
jest.mock('@/lib/economy/mint', () => ({ mintPoints: (...a: unknown[]) => mockMint(...(a as [unknown, never])) }));

import { cancelSquadBattle, leaveSquad, settleSquadBattle } from '@/lib/squad-battle-service';
import { prisma } from '@/lib/prisma';

const ADMIN = { actorId: 'admin1', actorRole: 'admin' as const };

function battle(over: Partial<Battle> = {}): Battle {
  return {
    id: 'b1',
    squad1Id: 's1',
    squad2Id: 's2',
    status: 'pending',
    squad1Score: 0,
    squad2Score: 0,
    winnerId: null,
    rewardPool: 500,
    rewardFunded: true,
    rewardRefunded: false,
    challengedById: 'owner1',
    paidOutAt: null,
    cancelledAt: null,
    cancelReason: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  squads = new Map([
    ['s1', { id: 's1', name: 'Kartallar', ownerId: 'owner1', totalPoints: 0 }],
    ['s2', { id: 's2', name: 'Aslanlar', ownerId: 'owner2', totalPoints: 0 }],
  ]);
  battles = new Map();
  members = [
    { id: 'm1', userId: 'owner1', squadId: 's1', joinedAt: new Date('2026-01-01') },
    { id: 'm2', userId: 'u2', squadId: 's1', joinedAt: new Date('2026-02-01') },
    { id: 'm3', userId: 'u3', squadId: 's1', joinedAt: new Date('2026-03-01') },
    { id: 'm4', userId: 'owner2', squadId: 's2', joinedAt: new Date('2026-01-01') },
  ];
  participants = [];
  ledger = new Map();
  balances = new Map();
  shadowBanned = new Set();
  audits = [];
});

const totalCredited = () => [...ledger.values()].filter((l) => l.status === 'posted').reduce((s, l) => s + l.amount, 0);

describe('cancelSquadBattle', () => {
  it('admin iptali SİLMEZ: soft-cancel + escrow tam iade, tek sefer', async () => {
    battles.set('b1', battle());
    const r1 = await cancelSquadBattle(prisma, 'b1', { ...ADMIN, reason: 'Kural ihlali' });
    expect(r1).toEqual({ status: 'cancelled', previousStatus: 'pending', refunded: 500 });
    expect(battles.get('b1')).toMatchObject({ status: 'cancelled', cancelReason: 'Kural ihlali', rewardRefunded: true });
    expect(battles.get('b1')!.cancelledAt).toBeInstanceOf(Date);
    expect(balances.get('owner1')).toBe(500);
    expect(audits.map((a) => a.action)).toContain('SQUAD_BATTLE_CANCEL');

    const r2 = await cancelSquadBattle(prisma, 'b1', { ...ADMIN, reason: 'Tekrar' });
    expect(r2.status).toBe('noop');
    expect(balances.get('owner1')).toBe(500); // ikinci iade yok
  });

  it('aktif savaş iptali de iade eder; tamamlanmış savaş iptal edilemez', async () => {
    battles.set('b1', battle({ status: 'active' }));
    expect((await cancelSquadBattle(prisma, 'b1', { ...ADMIN, reason: 'Hata' })).status).toBe('cancelled');
    expect(balances.get('owner1')).toBe(500);

    battles.set('b2', battle({ id: 'b2', status: 'completed', paidOutAt: new Date(), rewardRefunded: true }));
    expect(await cancelSquadBattle(prisma, 'b2', { ...ADMIN, reason: 'Hata' })).toEqual({ status: 'noop', currentStatus: 'completed' });
  });

  it('fromStatuses: ret yalnız bekleyen savaşı iptal eder (aktif savaş korunur)', async () => {
    battles.set('b1', battle({ status: 'active' }));
    const r = await cancelSquadBattle(prisma, 'b1', { actorId: 'owner2', actorRole: 'owner', reason: 'Ret', fromStatuses: ['pending'] });
    expect(r.status).toBe('noop');
    expect(battles.get('b1')!.status).toBe('active');
    expect(ledger.size).toBe(0);
  });
});

describe('settleSquadBattle', () => {
  beforeEach(() => {
    participants = [
      { battleId: 'b1', squadId: 's1', userId: 'owner1' },
      { battleId: 'b1', squadId: 's1', userId: 'u2' },
      { battleId: 'b1', squadId: 's2', userId: 'owner2' },
    ];
  });

  it('kazanana öder, bölme artığını iade eder; ikinci sonlandırma hiçbir şey basmaz (net-sıfır)', async () => {
    battles.set('b1', battle({ status: 'active', rewardPool: 501, squad1Score: 10, squad2Score: 3 }));
    const r = await settleSquadBattle('b1', ADMIN);
    expect(r).toMatchObject({ winnerId: 's1', perPerson: 250, paidOut: 500, refunded: 1 });
    expect(battles.get('b1')).toMatchObject({ status: 'completed', winnerId: 's1', rewardRefunded: true });
    expect(battles.get('b1')!.paidOutAt).toBeInstanceOf(Date);
    expect(totalCredited()).toBe(501);

    // "Yeniden aktif yap + bitir" saldırısı: durum aktif olsa bile paidOutAt guard'ı ödemeyi engeller.
    battles.get('b1')!.status = 'active';
    expect(await settleSquadBattle('b1', ADMIN)).toBeNull();
    expect(totalCredited()).toBe(501);
  });

  it('beraberlikte havuzun tamamı meydan okuyana iade', async () => {
    battles.set('b1', battle({ status: 'active', squad1Score: 5, squad2Score: 5 }));
    const r = await settleSquadBattle('b1');
    expect(r).toMatchObject({ winnerId: null, paidOut: 0, refunded: 500 });
    expect(balances.get('owner1')).toBe(500);
  });

  it('gölge banlı kazananın payı (void) iade edilir: tahsil edilen = ödenen + iade', async () => {
    shadowBanned.add('u2');
    battles.set('b1', battle({ status: 'active', rewardPool: 500, squad1Score: 9, squad2Score: 1 }));
    const r = await settleSquadBattle('b1');
    expect(r).toMatchObject({ paidOut: 250, refunded: 250 });
    expect(totalCredited()).toBe(500);
  });

  it('fonlanmamış (admin/onur) savaş puan basmaz', async () => {
    battles.set('b1', battle({ status: 'active', rewardFunded: false, challengedById: null, squad1Score: 2 }));
    const r = await settleSquadBattle('b1');
    expect(r).toMatchObject({ paidOut: 0, refunded: 0 });
    expect(mockMint).not.toHaveBeenCalled();
  });
});

describe('leaveSquad', () => {
  it('üye ayrılınca yalnız üyelik silinir', async () => {
    expect(await leaveSquad({ squadId: 's1', userId: 'u3' })).toEqual({ kind: 'left' });
    expect(squads.has('s1')).toBe(true);
    expect(members.some((m) => m.userId === 'u3')).toBe(false);
  });

  it('kurucu ayrılınca klan SİLİNMEZ: sahiplik en eski üyeye devredilir, açık savaş ve escrow yerinde', async () => {
    battles.set('b1', battle());
    const r = await leaveSquad({ squadId: 's1', userId: 'owner1' });
    expect(r).toEqual({ kind: 'ownership_transferred', newOwnerId: 'u2' });
    expect(squads.get('s1')!.ownerId).toBe('u2');
    expect(battles.get('b1')!.status).toBe('pending');
    expect(ledger.size).toBe(0);
    expect(audits.map((a) => a.action)).toContain('SQUAD_OWNERSHIP_TRANSFER');
  });

  it('başka klanın sahibi olan üyeye devredilmez, sıradaki uygun üyeye geçer', async () => {
    squads.set('s3', { id: 's3', name: 'Kurtlar', ownerId: 'u2', totalPoints: 0 });
    const r = await leaveSquad({ squadId: 's1', userId: 'owner1' });
    expect(r).toEqual({ kind: 'ownership_transferred', newOwnerId: 'u3' });
  });

  it('son üye ayrılınca açık savaşlar iadeli iptal edilir, SONRA klan kapanır (escrow kaybolmaz)', async () => {
    members = members.filter((m) => m.squadId !== 's1' || m.userId === 'owner1');
    battles.set('b1', battle()); // s1 meydan okudu, 500 escrow
    const r = await leaveSquad({ squadId: 's1', userId: 'owner1' });
    expect(r).toEqual({ kind: 'dissolved', cancelledBattles: 1, refunded: 500 });
    expect(balances.get('owner1')).toBe(500);
    expect(squads.has('s1')).toBe(false);
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['SQUAD_BATTLE_CANCEL', 'SQUAD_DISSOLVE']));
  });

  it('üye değilse not_member', async () => {
    expect(await leaveSquad({ squadId: 's2', userId: 'u2' })).toEqual({ kind: 'not_member' });
  });

  it('aktif savaşta ayrılan üye kadrodan düşer: kazanırsa eski klanından pay ALAMAZ', async () => {
    battles.set('b1', battle({ status: 'active', squad1Score: 100, squad2Score: 10 }));
    participants = [
      { battleId: 'b1', squadId: 's1', userId: 'owner1' },
      { battleId: 'b1', squadId: 's1', userId: 'u3' },
      { battleId: 'b1', squadId: 's2', userId: 'x1' },
    ];
    expect(await leaveSquad({ squadId: 's1', userId: 'u3' })).toEqual({ kind: 'left' });
    expect(participants.some((p) => p.userId === 'u3')).toBe(false);
    expect(audits.map((a) => a.action)).toContain('SQUAD_MEMBER_LEAVE');
    const r = await settleSquadBattle('b1');
    expect(r?.winnerId).toBe('s1');
    expect(balances.get('u3')).toBeUndefined();
    expect(balances.get('owner1')).toBe(500);
  });
});
