/**
 * Admin → Klan Merkezi (Dalga 2) sunucu mantığı — prisma mock'lu.
 *  - Sözleşme: bozuk sayfa/boyut düzeltilir, aynı klan reddedilir, görünür durum (süresi dolan).
 *  - Dondurma: açık savaşlar iadeli iptal edilir, denetime gerekçeyle yazılır; tekrar dondurma no-op.
 *  - Üye çıkarma: lider çıkarılamaz; savaş payı düşer.
 *  - Savaş oluşturma: dondurulmuş klan ve açık savaş çakışması reddedilir; hemen başlatta kadro donar.
 *  - Geçişler: iptal edilemeyen savaş 409; uzatma gerekçeyle denetlenir.
 */
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
const mockCancel = jest.fn();
const mockSettle = jest.fn();
jest.mock('@/lib/squad-battle-service', () => ({
  OPEN_BATTLE_STATUSES: ['pending', 'active'],
  cancelSquadBattle: (...a: unknown[]) => mockCancel(...a),
  settleSquadBattle: (...a: unknown[]) => mockSettle(...a),
}));
const mockForfeit = jest.fn(async () => 1);
jest.mock('@/lib/squads/membership', () => ({ forfeitActiveBattleShare: (...a: unknown[]) => mockForfeit(...(a as [])) }));

type Row = Record<string, unknown>;
const squads = new Map<string, Row>();
const audits: Row[] = [];
const notifications: Row[] = [];
const battles: Row[] = [];
const participants: Row[] = [];
const members: Row[] = [];

const tx = {
  $queryRaw: jest.fn(async () => []),
  squad: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (squads.has(where.id) ? { ...squads.get(where.id)! } : null)),
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((i) => squads.has(i)).map((i) => ({ ...squads.get(i)! }))),
    findFirst: jest.fn(async () => null),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      Object.assign(squads.get(where.id)!, data);
      return squads.get(where.id);
    }),
  },
  squadBattle: {
    findMany: jest.fn(async () => battles.filter((b) => b.status === 'pending' || b.status === 'active').map((b) => ({ id: b.id }))),
    findFirst: jest.fn(async () => battles.find((b) => b.status === 'pending' || b.status === 'active') ?? null),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => battles.find((b) => b.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const b = { id: `b${battles.length + 1}`, ...data };
      battles.push(b);
      return { id: b.id };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const b = battles.find((x) => x.id === where.id && ['pending', 'active'].includes(String(x.status)));
      if (!b) return { count: 0 };
      Object.assign(b, data);
      return { count: 1 };
    }),
  },
  squadMember: {
    findFirst: jest.fn(async ({ where }: { where: { squadId: string; userId: string } }) =>
      members.find((m) => m.squadId === where.squadId && m.userId === where.userId) ?? null
    ),
    findMany: jest.fn(async () => members.map((m) => ({ userId: m.userId, squadId: m.squadId }))),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const i = members.findIndex((m) => m.id === where.id);
      members.splice(i, 1);
    }),
  },
  squadBattleParticipant: {
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      participants.push(...data);
      return { count: data.length };
    }),
  },
  auditLog: { create: jest.fn(async ({ data }: { data: Row }) => audits.push(data)) },
  notification: { createMany: jest.fn(async ({ data }: { data: Row[] }) => notifications.push(...data)) },
};

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  },
}));

import { applyBattleAction, applySquadAction, createAdminBattle } from '@/lib/admin-squads/actions.server';
import { battleCreateSchema, battleListQuerySchema, battleView, squadActionSchema, squadListQuerySchema } from '@/lib/admin-squads/contract';

const actor = { userId: 'admin1', ipAddress: null, userAgent: null };

beforeEach(() => {
  squads.clear();
  audits.length = 0;
  notifications.length = 0;
  battles.length = 0;
  participants.length = 0;
  members.length = 0;
  jest.clearAllMocks();
  squads.set('s1', { id: 's1', name: 'Kartallar', description: 'Uç', ownerId: 'u1', isFrozen: false, inviteCode: 'ABC123' });
  squads.set('s2', { id: 's2', name: 'Şahinler', description: null, ownerId: 'u2', isFrozen: false, inviteCode: 'XYZ789' });
  members.push({ id: 'm1', squadId: 's1', userId: 'u1' }, { id: 'm2', squadId: 's1', userId: 'u3' }, { id: 'm3', squadId: 's2', userId: 'u2' });
});

describe('sözleşme', () => {
  it('bozuk sayfa ve sınırsız boyut güvenli değerlere düşer', () => {
    const q = squadListQuerySchema.parse({ page: 'abc', size: '100000', sort: 'DROP', status: 'x' });
    expect(q).toMatchObject({ page: 1, size: 20, sort: undefined, status: undefined });
    expect(battleListQuerySchema.parse({ status: 'live', page: '2' })).toMatchObject({ status: 'live', page: 2, size: 20 });
  });

  it('aynı klanla savaş ve sınır dışı süre reddedilir', () => {
    expect(battleCreateSchema.safeParse({ squad1Id: 'a', squad2Id: 'a', durationHours: 24, mode: 'invite' }).success).toBe(false);
    expect(battleCreateSchema.safeParse({ squad1Id: 'a', squad2Id: 'b', durationHours: 500, mode: 'invite' }).success).toBe(false);
    expect(battleCreateSchema.safeParse({ squad1Id: 'a', squad2Id: 'b', durationHours: 24, mode: 'start_now' }).success).toBe(true);
  });

  it('dondurma gerekçesiz kabul edilmez', () => {
    expect(squadActionSchema.safeParse({ action: 'freeze', reason: 'x' }).success).toBe(false);
    expect(squadActionSchema.safeParse({ action: 'freeze', reason: 'puan çiftliği' }).success).toBe(true);
  });

  it('süresi dolmuş açık savaş "overdue" görünür', () => {
    const now = new Date('2026-10-11T10:00:00Z');
    expect(battleView('active', '2026-10-11T09:00:00Z', now)).toBe('overdue');
    expect(battleView('pending', '2026-10-11T11:00:00Z', now)).toBe('pending');
    expect(battleView('active', '2026-10-11T11:00:00Z', now)).toBe('live');
    expect(battleView('cancelled', '2026-10-11T11:00:00Z', now)).toBe('cancelled');
  });
});

describe('klan moderasyonu', () => {
  it('dondurma açık savaşları iadeli iptal eder ve gerekçeyi denetime yazar', async () => {
    battles.push({ id: 'b1', status: 'active' });
    mockCancel.mockResolvedValue({ status: 'cancelled', previousStatus: 'active', refunded: 500 });
    const r = await applySquadAction('s1', { action: 'freeze', reason: 'puan çiftliği şüphesi' }, actor);
    expect(r).toMatchObject({ changed: true, cancelledBattles: 1, refunded: 500 });
    expect(squads.get('s1')!.isFrozen).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith(tx, 'b1', expect.objectContaining({ actorId: 'admin1', actorRole: 'admin' }));
    expect(audits[0]).toMatchObject({ action: 'SQUAD_FREEZE', entity: 'Squad', entityId: 's1', userId: 'admin1' });
    expect((audits[0].newData as Row).reason).toBe('puan çiftliği şüphesi');
    expect(notifications.some((n) => n.userId === 'u1')).toBe(true);
  });

  it('zaten dondurulmuş klan tekrar dondurulmaz (no-op, denetim yok)', async () => {
    squads.get('s1')!.isFrozen = true;
    const r = await applySquadAction('s1', { action: 'freeze', reason: 'tekrar deneme' }, actor);
    expect(r.changed).toBe(false);
    expect(audits).toHaveLength(0);
  });

  it('lider klandan çıkarılamaz; üye çıkarılınca savaş payı düşer', async () => {
    await expect(applySquadAction('s1', { action: 'remove_member', userId: 'u1', reason: 'kural ihlali' }, actor)).rejects.toThrow(/Lider/);
    const r = await applySquadAction('s1', { action: 'remove_member', userId: 'u3', reason: 'kural ihlali' }, actor);
    expect(r.changed).toBe(true);
    expect(mockForfeit).toHaveBeenCalledWith(tx, 's1', 'u3');
    expect(members.find((m) => m.userId === 'u3')).toBeUndefined();
    expect(audits[0]).toMatchObject({ action: 'SQUAD_MEMBER_REMOVE' });
  });

  it('bulunmayan klan 404', async () => {
    await expect(applySquadAction('yok', { action: 'unfreeze', reason: 'neden' }, actor)).rejects.toMatchObject({ status: 404 });
  });
});

describe('savaş oluşturma', () => {
  it('dondurulmuş klan savaşa sokulamaz', async () => {
    squads.get('s2')!.isFrozen = true;
    await expect(createAdminBattle({ squad1Id: 's1', squad2Id: 's2', durationHours: 24, mode: 'invite' }, actor)).rejects.toMatchObject({ status: 409 });
    expect(battles).toHaveLength(0);
  });

  it('açık savaşı olan klanla çakışma 409', async () => {
    battles.push({ id: 'b9', status: 'pending', squad1Id: 's1', squad2Id: 'sX' });
    await expect(createAdminBattle({ squad1Id: 's1', squad2Id: 's2', durationHours: 24, mode: 'invite' }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('davet modu ödülsüz bekleyen savaş açar; rakip lider bilgilendirilir', async () => {
    const now = new Date('2026-10-11T10:00:00Z');
    const r = await createAdminBattle({ squad1Id: 's1', squad2Id: 's2', durationHours: 24, mode: 'invite' }, actor, now);
    expect(r.status).toBe('pending');
    expect(battles[0]).toMatchObject({ status: 'pending', rewardPool: 0, rewardFunded: false, challengedById: null });
    expect((battles[0].endTime as Date).toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(notifications.some((n) => n.userId === 'u2' && n.title === 'Klan savaşı daveti')).toBe(true);
    expect(audits[0]).toMatchObject({ action: 'SQUAD_BATTLE_CREATE' });
  });

  it('hemen başlat kadroyu şimdi dondurur', async () => {
    const r = await createAdminBattle({ squad1Id: 's1', squad2Id: 's2', durationHours: 6, mode: 'start_now' }, actor);
    expect(r.status).toBe('active');
    expect(battles[0].acceptedAt).toBeInstanceOf(Date);
    expect(participants).toHaveLength(3);
  });
});

describe('savaş geçişleri', () => {
  it('kapanmış savaşın iptali 409', async () => {
    mockCancel.mockResolvedValue({ status: 'noop', currentStatus: 'completed' });
    await expect(applyBattleAction('b1', { action: 'cancel', reason: 'deneme' }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('aktif olmayan savaş sonuçlandırılamaz', async () => {
    mockSettle.mockResolvedValue(null);
    await expect(applyBattleAction('b1', { action: 'finish' }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('uzatma gerekçeyle denetlenir; geçmişe uzatma reddedilir', async () => {
    const now = new Date('2026-10-11T10:00:00Z');
    battles.push({ id: 'b1', status: 'active', endTime: new Date('2026-10-11T12:00:00Z') });
    await expect(applyBattleAction('b1', { action: 'extend', endTime: '2026-10-11T09:00:00Z', reason: 'neden' }, actor, now)).rejects.toMatchObject({ status: 400 });
    const r = await applyBattleAction('b1', { action: 'extend', endTime: '2026-10-11T18:00:00Z', reason: 'bayram trafiği' }, actor, now);
    expect(r).toMatchObject({ action: 'extend', endTime: '2026-10-11T18:00:00.000Z' });
    expect(audits[0]).toMatchObject({ action: 'SQUAD_BATTLE_EXTEND' });
    expect((audits[0].newData as Row).reason).toBe('bayram trafiği');
  });
});
