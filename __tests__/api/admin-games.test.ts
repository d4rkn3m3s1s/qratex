/**
 * /api/admin/games — admin denetimi (docs/audit/2026-10-08/admin/admin_games.md):
 *  B4: 1.000.000 puan / 0 sn / 0 eşik reddedilir (ekonomi sınırları).
 *  B11: kısmi PATCH eşik ≤ maks. skor kontrolünü MEVCUT override üzerinden yapar.
 *  B2: iyimser eşzamanlılık → 409; yalnız gönderilen alanlar yazılır.
 *  B9: audit'te oldData. B3: önbellek `expire: 0` ile anında düşer. B7: DELETE sıfırlama
 *      kapalı oyunun kill-switch'ini açmaz. B6: pacman listede.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));

const mockRevalidate = jest.fn();
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (...a: unknown[]) => mockRevalidate(...a),
}));

jest.mock('@/lib/rate-limit', () => ({ checkAdminRateLimit: () => ({ ok: true }) }));

type Cfg = Record<string, unknown> & { gameType: string; enabled: boolean; updatedAt: Date };
const state = { configs: [] as Cfg[], audits: [] as Array<Record<string, unknown>> };

const cfgModel = {
  findMany: jest.fn(async () => state.configs),
  findUnique: jest.fn(async ({ where }: { where: { gameType: string } }) => state.configs.find((c) => c.gameType === where.gameType) ?? null),
  upsert: jest.fn(async ({ where, update, create }: { where: { gameType: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
    const ex = state.configs.find((c) => c.gameType === where.gameType);
    if (ex) {
      Object.assign(ex, update, { updatedAt: new Date(ex.updatedAt.getTime() + 1000) });
      return ex;
    }
    const row = { enabled: true, updatedAt: new Date('2026-10-08T00:00:00Z'), ...create } as Cfg;
    state.configs.push(row);
    return row;
  }),
  update: jest.fn(async ({ where, data }: { where: { gameType: string }; data: Record<string, unknown> }) => {
    const ex = state.configs.find((c) => c.gameType === where.gameType)!;
    Object.assign(ex, data);
    return ex;
  }),
  delete: jest.fn(async ({ where }: { where: { gameType: string } }) => {
    state.configs = state.configs.filter((c) => c.gameType !== where.gameType);
  }),
};
const tx = {
  miniGameConfig: cfgModel,
  auditLog: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => state.audits.push(data)) },
};
jest.mock('@/lib/prisma', () => ({
  prisma: {
    get miniGameConfig() { return cfgModel; },
    miniGameSession: { groupBy: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

const ADMIN = { session: { user: { id: 'admin1', role: 'ADMIN' } } };

function req(method: string, body?: unknown, qs = '') {
  return new NextRequest(`http://localhost/api/admin/games${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.configs = [];
  state.audits = [];
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue(ADMIN);
  mockRevalidate.mockReset();
});

const blank = (gameType: string, over: Record<string, unknown> = {}): Cfg => ({
  gameType,
  enabled: true,
  rewardPoints: null,
  rewardXp: null,
  rewardThreshold: null,
  minDurationSec: null,
  maxScore: null,
  title: null,
  description: null,
  emoji: null,
  accent: null,
  updatedAt: new Date('2026-10-08T00:00:00Z'),
  ...over,
});

describe('PATCH /api/admin/games', () => {
  it('B4: 1.000.000 puan, 0 sn min. süre, 0 eşik reddedilir (Türkçe, alan adlı)', async () => {
    const { PATCH } = await import('@/app/api/admin/games/route');
    for (const body of [
      { gameType: 'bot-hunter', rewardPoints: 1_000_000 },
      { gameType: 'bot-hunter', minDurationSec: 0 },
      { gameType: 'bot-hunter', rewardThreshold: 0 },
      { gameType: 'bot-hunter', accent: '#fff' },
    ]) {
      const res = await PATCH(req('PATCH', body));
      expect(res.status).toBe(400);
      const j = await res.json();
      expect(j.error).toMatch(/olmalı|olabilir/);
    }
    expect(cfgModel.upsert).not.toHaveBeenCalled();
  });

  it('B11: yalnız maxScore gönderilince mevcut eşik override\'ı dikkate alınır', async () => {
    state.configs.push(blank('bot-hunter', { rewardThreshold: 9 }));
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'bot-hunter', maxScore: 8 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/eşiği \(9\)/);
  });

  it('B2+B9+B3: yalnız gönderilen alan yazılır, audit oldData içerir, önbellek anında düşer', async () => {
    state.configs.push(blank('bot-hunter', { enabled: false, rewardPoints: 120 }));
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'bot-hunter', rewardPoints: 200, expectedUpdatedAt: '2026-10-08T00:00:00.000Z' }));
    expect(res.status).toBe(200);
    expect(state.configs[0].enabled).toBe(false); // kapalı oyun sessizce açılmadı
    expect(state.audits[0]).toMatchObject({ oldData: { rewardPoints: 120 }, newData: { rewardPoints: 200 } });
    expect(mockRevalidate).toHaveBeenCalledWith('minigame-config', { expire: 0 });
  });

  it('B2: eski sürümle kaydetme → 409', async () => {
    state.configs.push(blank('bot-hunter', { updatedAt: new Date('2026-10-08T05:00:00Z') }));
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'bot-hunter', rewardPoints: 200, expectedUpdatedAt: '2026-10-08T00:00:00.000Z' }));
    expect(res.status).toBe(409);
  });

  it('pacman yönetilebilir (B6)', async () => {
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'pacman', enabled: false }));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/admin/games (varsayılana sıfırla)', () => {
  it('kapalı oyunda override alanları temizlenir ama kapalı kalır', async () => {
    state.configs.push(blank('bot-hunter', { enabled: false, rewardPoints: 300 }));
    const { DELETE } = await import('@/app/api/admin/games/route');
    const res = await DELETE(req('DELETE', undefined, '?gameType=bot-hunter'));
    expect(res.status).toBe(200);
    expect(state.configs[0]).toMatchObject({ enabled: false, rewardPoints: null });
    expect(state.audits[0]).toMatchObject({ action: 'minigame_config_reset' });
  });

  it('açık oyunda satır silinir', async () => {
    state.configs.push(blank('bot-hunter', { rewardPoints: 300 }));
    const { DELETE } = await import('@/app/api/admin/games/route');
    await DELETE(req('DELETE', undefined, '?gameType=bot-hunter'));
    expect(state.configs).toHaveLength(0);
  });
});

describe('GET /api/admin/games', () => {
  it('pacman ve gizli oyunlar listede; özelleştirilmiş alanlar etkin farka göre', async () => {
    state.configs.push(blank('bot-hunter', { enabled: false })); // tüm alanlar null → özelleştirme yok
    state.configs.push(blank('mind-thief', { rewardPoints: 200, title: 'Yeni' }));
    const { GET } = await import('@/app/api/admin/games/route');
    const j = await (await GET()).json();
    const byType = Object.fromEntries(j.games.map((g: { gameType: string }) => [g.gameType, g]));
    expect(byType.pacman).toMatchObject({ legacy: true });
    expect(byType['lucky-wheel']).toMatchObject({ hidden: true });
    expect(byType['bot-hunter'].customizedFields).toEqual([]);
    expect(byType['mind-thief'].customizedFields.sort()).toEqual(['rewardPoints', 'title']);
  });
});
