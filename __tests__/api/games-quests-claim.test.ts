/**
 * POST /api/customer/games/quests — günlük oyun görevi XP talebi.
 *  - ilerleme SUNUCUDA bugünkü denemelerden yeniden hesaplanır (tamamlanmadıysa 409);
 *  - ödül yalnız XP, mintPoints ile tek-kez anahtarı `game_quest:<u>:<gün>:<görev>`;
 *  - ikinci talep (duplicate) 409; geçersiz görev 400; müşteri dışı rol reddedilir.
 * Gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));

const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({
  mintPoints: (...a: unknown[]) => mockMint(...a),
  isEconomyError: () => false,
}));

const rows: Array<{ gameType: string; status: string; userId: string; dayKey: string }> = [];
const findMany = jest.fn(async ({ where }: { where: { userId: string; dayKey: string } }) =>
  rows.filter((r) => r.userId === where.userId && r.dayKey === where.dayKey)
);
jest.mock('@/lib/prisma', () => ({
  prisma: { miniGameSession: { findMany: (...a: unknown[]) => findMany(...(a as [never])) } },
  isPrismaConnectivityError: () => false,
}));

import { gameDayKey } from '@/lib/game-session';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/customer/games/quests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const { POST } = await import('@/app/api/customer/games/quests/route');
  const res: Response = await POST(post(body), { params: Promise.resolve({}) });
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  rows.length = 0;
  findMany.mockClear();
  mockMint.mockReset();
  mockMint.mockImplementation(async (_db: unknown, i: { xp?: number }) => ({
    credited: 0,
    xpCredited: i.xp ?? 0,
    duplicate: false,
    status: 'posted',
  }));
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
});

describe('POST /api/customer/games/quests', () => {
  it('tamamlanmamış görev 409 NOT_COMPLETED; mint çağrılmaz', async () => {
    const r = await call({ questId: 'win-1' });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('NOT_COMPLETED');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('tamamlanan görev: yalnız XP, tavansız, tek-kez anahtarıyla basılır', async () => {
    const day = gameDayKey(new Date());
    rows.push({ userId: 'u1', dayKey: day, gameType: 'mind-thief', status: 'completed' });
    const r = await call({ questId: 'win-1' });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ questId: 'win-1', xp: 30 });
    expect(mockMint).toHaveBeenCalledTimes(1);
    const input = mockMint.mock.calls[0][1];
    expect(input).toMatchObject({
      userId: 'u1',
      points: 0,
      xp: 30,
      source: 'game_quest',
      capCategory: null,
      idempotencyKey: `game_quest:u1:${day}:win-1`,
    });
  });

  it('başka kullanıcının denemeleri sayılmaz', async () => {
    const day = gameDayKey(new Date());
    rows.push({ userId: 'u2', dayKey: day, gameType: 'a', status: 'completed' });
    const r = await call({ questId: 'play-1' });
    expect(r.status).toBe(409);
  });

  it('ikinci talep (defterde var) 409 ALREADY_CLAIMED', async () => {
    const day = gameDayKey(new Date());
    rows.push({ userId: 'u1', dayKey: day, gameType: 'a', status: 'failed' });
    mockMint.mockResolvedValueOnce({ credited: 0, xpCredited: 20, duplicate: true, status: 'posted' });
    const r = await call({ questId: 'play-1' });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('ALREADY_CLAIMED');
  });

  it('çeşitlilik görevi 3 farklı oyunda deneme ister', async () => {
    const day = gameDayKey(new Date());
    rows.push(
      { userId: 'u1', dayKey: day, gameType: 'a', status: 'failed' },
      { userId: 'u1', dayKey: day, gameType: 'b', status: 'completed' }
    );
    expect((await call({ questId: 'variety-3' })).status).toBe(409);
    rows.push({ userId: 'u1', dayKey: day, gameType: 'c', status: 'active' });
    expect((await call({ questId: 'variety-3' })).status).toBe(200);
  });

  it('geçersiz görev kimliği 400', async () => {
    const r = await call({ questId: 'bedava-xp' });
    expect(r.status).toBe(400);
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('müşteri olmayan rol reddedilir', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Yetkisiz' }, { status: 403 }) });
    const r = await call({ questId: 'play-1' });
    expect(r.status).toBe(403);
    expect(mockMint).not.toHaveBeenCalled();
  });
});
