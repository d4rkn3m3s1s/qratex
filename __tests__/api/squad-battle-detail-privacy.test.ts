/**
 * GET /api/customer/squads/battles/[id] — katkıcı gizliliği (müşteri API denetimi O5 kalıntısı).
 *
 * Kapanan açık: `battles/current` rakip klan üyelerinin adını maskelerken ("Ayşe K.") detay ucu
 * aynı savaşın ilk 10 katkıcısını iki klan için de TAM adla döndürüyordu; "liderlikte görün"
 * tercihini kapatan rakip üye de adı ve avatarıyla görünüyordu.
 * Kural: kendi klanı tam ad; rakip maskeli ad; tercihi kapalı rakip "Gizli oyuncu" + avatarsız;
 * ADMIN tam görür. Gerçek DB yok: Prisma taklit edilir.
 */
jest.mock('@/lib/http/define-route', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message?: string, init: { status?: number } = {}) {
      super(message ?? code);
      this.code = code;
      this.status = init.status ?? 500;
    }
  }
  return {
    ApiError,
    defineRoute: (_def: unknown, handler: (ctx: unknown) => unknown) => handler,
    ok: (data: unknown) => data,
  };
});
jest.mock('@/lib/squad-battle-service', () => ({
  OPEN_BATTLE_STATUSES: ['pending', 'active'],
  cancelSquadBattle: jest.fn(),
  settleSquadBattle: jest.fn(),
}));
jest.mock('@/lib/points-wallet', () => ({ debitPoints: jest.fn(), InsufficientPointsError: class extends Error {} }));

const mockHidden = jest.fn();
jest.mock('@/lib/privacy/leaderboard-optout', () => {
  const actual = jest.requireActual('@/lib/privacy/leaderboard-optout');
  return { ...actual, leaderboardHiddenUserIds: (...a: unknown[]) => mockHidden(...a) };
});

const db = {
  squadBattle: { findUnique: jest.fn() },
  squadMember: { findFirst: jest.fn() },
  squadBattleParticipant: { findMany: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: db }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET } = require('@/app/api/customer/squads/battles/[id]/route') as {
  GET: (ctx: unknown) => Promise<{ battle: { topParticipants: Array<{ name: string; image: string | null; squadId: string }> } }>;
};

const BATTLE = {
  id: 'b1',
  status: 'active',
  squad1: { id: 'sq-mine', name: 'Biz' },
  squad2: { id: 'sq-rival', name: 'Onlar' },
};

beforeEach(() => {
  jest.clearAllMocks();
  db.squadBattle.findUnique.mockResolvedValue(BATTLE);
  db.squadBattleParticipant.findMany.mockResolvedValue([
    { score: 9, squadId: 'sq-rival', userId: 'r1', user: { name: 'Ayşe Kaya', image: 'r1.png' } },
    { score: 7, squadId: 'sq-mine', userId: 'm1', user: { name: 'Mehmet Yılmaz', image: 'm1.png' } },
    { score: 5, squadId: 'sq-rival', userId: 'r2', user: { name: 'Zeynep Demir', image: 'r2.png' } },
  ]);
  mockHidden.mockImplementation(async (ids: string[]) => new Set(ids.filter((id) => id === 'r2')));
});

it('müşteri: kendi klanı tam ad, rakip maskeli, tercihi kapalı rakip anonim ve avatarsız', async () => {
  db.squadMember.findFirst.mockResolvedValue({ squadId: 'sq-mine' });
  const res = await GET({ user: { id: 'm1', role: 'CUSTOMER' }, params: { id: 'b1' } });
  const [rival, mine, hiddenRival] = res.battle.topParticipants;
  expect(mine).toMatchObject({ name: 'Mehmet Yılmaz', image: 'm1.png' });
  expect(rival.name).not.toContain('Kaya');
  expect(rival.name.startsWith('Ayşe')).toBe(true);
  expect(hiddenRival).toMatchObject({ name: 'Gizli oyuncu', image: null });
  // Tercih yalnız RAKİP üyeler için sorgulanır (kendi klanı klan odasında zaten görünür).
  expect(mockHidden).toHaveBeenCalledWith(['r1', 'r2']);
});

it('ADMIN: iki klan da tam ad (denetim görünümü), tercih sorgusu boş', async () => {
  db.squadMember.findFirst.mockResolvedValue(null);
  const res = await GET({ user: { id: 'admin', role: 'ADMIN' }, params: { id: 'b1' } });
  expect(res.battle.topParticipants.map((p) => p.name)).toEqual(['Ayşe Kaya', 'Mehmet Yılmaz', 'Zeynep Demir']);
  expect(mockHidden).toHaveBeenCalledWith([]);
});

it('iki klanın da üyesi olmayan müşteri 403 alır', async () => {
  db.squadMember.findFirst.mockResolvedValue(null);
  await expect(GET({ user: { id: 'x', role: 'CUSTOMER' }, params: { id: 'b1' } })).rejects.toMatchObject({
    code: 'NOT_SQUAD_MEMBER',
  });
});
