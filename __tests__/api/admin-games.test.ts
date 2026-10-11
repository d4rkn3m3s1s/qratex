/**
 * /api/admin/games — Oyun Kontrol Odası (docs/audit/2026-10-08/admin/admin_games.md):
 *  B4: 1.000.000 puan / 0 sn / 0 eşik reddedilir (ekonomi sınırları).
 *  B11: kısmi PATCH eşik ≤ maks. skor kontrolünü MEVCUT override üzerinden yapar.
 *  B2: iyimser eşzamanlılık → 409; yalnız gönderilen alanlar yazılır.
 *  B9: audit'te oldData. B3: önbellek `expire: 0` ile anında düşer. B7: DELETE sıfırlama
 *      kapalı oyunun kill-switch'ini açmaz. B6: pacman listede.
 *  Dalga 2: defineRoute zarfı, KPI/huni/sinyal, toplu aç/kapat (gerekçeli), oyun detayı.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));

const mockRevalidate = jest.fn();
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (...a: unknown[]) => mockRevalidate(...a),
}));

jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

type Cfg = Record<string, unknown> & { gameType: string; enabled: boolean; updatedAt: Date };
const state = {
  configs: [] as Cfg[],
  audits: [] as Array<Record<string, unknown>>,
  groupBy: [] as unknown[][],
  raw: [] as unknown[][],
  history: [] as unknown[],
};

const cfgModel = {
  findMany: jest.fn(async (args?: { where?: { gameType?: { in: string[] } } }) =>
    args?.where?.gameType?.in ? state.configs.filter((c) => args.where!.gameType!.in.includes(c.gameType)) : state.configs
  ),
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
    get miniGameConfig() {
      return cfgModel;
    },
    miniGameSession: {
      groupBy: jest.fn(async () => state.groupBy.shift() ?? []),
      aggregate: jest.fn(async () => ({ _sum: { rewardPoints: 0 } })),
      findMany: jest.fn(async () => []),
    },
    tournamentRewardClaim: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) },
    auditLog: { findMany: jest.fn(async () => state.history) },
    $queryRaw: jest.fn(async () => state.raw.shift() ?? []),
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
  isPrismaConnectivityError: () => false,
}));

const ADMIN = { session: { user: { id: 'admin1', role: 'ADMIN' } } };

function req(method: string, body?: unknown, qs = '', path = '/api/admin/games') {
  return new NextRequest(`http://localhost${path}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.configs = [];
  state.audits = [];
  state.groupBy = [];
  state.raw = [];
  state.history = [];
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
      const res = await PATCH(req('PATCH', body), {});
      expect(res.status).toBe(400);
      const j = await res.json();
      expect(j.error).toMatch(/olmalı|olabilir/);
    }
    expect(cfgModel.upsert).not.toHaveBeenCalled();
  });

  it("B11: yalnız maxScore gönderilince mevcut eşik override'ı dikkate alınır", async () => {
    state.configs.push(blank('bot-hunter', { rewardThreshold: 9 }));
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'bot-hunter', maxScore: 8 }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/eşiği \(9\)/);
  });

  it('B2+B9+B3: yalnız gönderilen alan yazılır, audit oldData içerir, önbellek anında düşer', async () => {
    state.configs.push(blank('bot-hunter', { enabled: false, rewardPoints: 120 }));
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'bot-hunter', rewardPoints: 200, expectedUpdatedAt: '2026-10-08T00:00:00.000Z' }), {});
    expect(res.status).toBe(200);
    expect(state.configs[0].enabled).toBe(false); // kapalı oyun sessizce açılmadı
    expect(state.audits[0]).toMatchObject({ oldData: { rewardPoints: 120 }, newData: { rewardPoints: 200 } });
    expect(mockRevalidate).toHaveBeenCalledWith('minigame-config', { expire: 0 });
  });

  it('B2: eski sürümle kaydetme → 409', async () => {
    state.configs.push(blank('bot-hunter', { updatedAt: new Date('2026-10-08T05:00:00Z') }));
    const { PATCH } = await import('@/app/api/admin/games/route');
    const res = await PATCH(req('PATCH', { gameType: 'bot-hunter', rewardPoints: 200, expectedUpdatedAt: '2026-10-08T00:00:00.000Z' }), {});
    expect(res.status).toBe(409);
    expect(state.audits).toHaveLength(0);
  });

  it('pacman yönetilebilir (B6); boş gövde 400', async () => {
    const { PATCH } = await import('@/app/api/admin/games/route');
    expect((await PATCH(req('PATCH', { gameType: 'pacman', enabled: false }), {})).status).toBe(200);
    expect((await PATCH(req('PATCH', { gameType: 'pacman' }), {})).status).toBe(400);
  });
});

describe('DELETE /api/admin/games (varsayılana sıfırla)', () => {
  it('kapalı oyunda override alanları temizlenir ama kapalı kalır', async () => {
    state.configs.push(blank('bot-hunter', { enabled: false, rewardPoints: 300 }));
    const { DELETE } = await import('@/app/api/admin/games/route');
    const res = await DELETE(req('DELETE', undefined, '?gameType=bot-hunter'), {});
    expect(res.status).toBe(200);
    expect(state.configs[0]).toMatchObject({ enabled: false, rewardPoints: null });
    expect(state.audits[0]).toMatchObject({ action: 'minigame_config_reset' });
  });

  it('açık oyunda satır silinir', async () => {
    state.configs.push(blank('bot-hunter', { rewardPoints: 300 }));
    const { DELETE } = await import('@/app/api/admin/games/route');
    await DELETE(req('DELETE', undefined, '?gameType=bot-hunter'), {});
    expect(state.configs).toHaveLength(0);
  });
});

describe('GET /api/admin/games', () => {
  it('pacman ve gizli oyunlar listede; özelleştirilmiş alanlar etkin farka göre', async () => {
    state.configs.push(blank('bot-hunter', { enabled: false })); // tüm alanlar null → özelleştirme yok
    state.configs.push(blank('mind-thief', { rewardPoints: 200, title: 'Yeni' }));
    const { GET } = await import('@/app/api/admin/games/route');
    const j = await (await GET(req('GET'), {})).json();
    const byType = Object.fromEntries(j.games.map((g: { gameType: string }) => [g.gameType, g]));
    expect(byType.pacman).toBeDefined();
    expect(byType['lucky-wheel']).toMatchObject({ hidden: true, portfolio: { status: 'retired' } });
    expect(byType['bot-hunter'].portfolio).toMatchObject({ status: 'merged' });
    expect(byType['bot-hunter'].customizedFields).toEqual([]);
    expect(byType['mind-thief'].customizedFields.sort()).toEqual(['rewardPoints', 'title']);
  });

  it("kazanma oranı biten denemeden, sinyal analytics'ten; yetkisiz 403", async () => {
    // groupBy sırası: bugün, 30g, ödüllenen
    state.groupBy = [
      [{ gameType: 'mind-thief', status: 'active', _count: { _all: 2 } }],
      [
        { gameType: 'mind-thief', status: 'completed', _count: { _all: 3 } },
        { gameType: 'mind-thief', status: 'failed', _count: { _all: 1 } },
      ],
      [{ gameType: 'mind-thief', _count: { _all: 3 }, _sum: { rewardPoints: 300 } }],
    ];
    state.raw = [[{ gameType: 'mind-thief', n: BigInt(2) }]];
    const { GET } = await import('@/app/api/admin/games/route');
    const j = await (await GET(req('GET'), {})).json();
    const mt = j.data.games.find((g: { gameType: string }) => g.gameType === 'mind-thief');
    expect(mt.stats.winRate30d).toBe(75);
    expect(mt.stats.flagged30d).toBe(2);
    expect(j.data.kpi).toMatchObject({ startedToday: 2, points30d: 300, flagged30d: 2, finished30d: 4 });
    expect(j.data.caps.daily).toBeGreaterThan(0);

    mockRequireAuth.mockResolvedValueOnce({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    expect((await GET(req('GET'), {})).status).toBe(403);
  });
});

describe('POST /api/admin/games/bulk', () => {
  it("yalnız durumu değişen oyunlar yazılır, gerekçe audit'te", async () => {
    state.configs.push(blank('mind-thief', { enabled: false }));
    const { POST } = await import('@/app/api/admin/games/bulk/route');
    const res = await POST(
      req('POST', { action: 'disable', gameTypes: ['mind-thief', 'pacman'], reason: 'istismar şüphesi' }, '', '/api/admin/games/bulk'),
      {}
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data).toEqual({ changed: ['pacman'], skipped: 1 });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: 'minigame_config_bulk',
      entityId: 'pacman',
      newData: { enabled: false, reason: 'istismar şüphesi' },
    });
    expect(mockRevalidate).toHaveBeenCalledWith('minigame-config', { expire: 0 });
  });

  it('gerekçesiz ya da bilinmeyen oyun reddedilir', async () => {
    const { POST } = await import('@/app/api/admin/games/bulk/route');
    expect((await POST(req('POST', { action: 'disable', gameTypes: ['pacman'], reason: '' }, '', '/api/admin/games/bulk'), {})).status).toBe(400);
    expect((await POST(req('POST', { action: 'disable', gameTypes: ['yok'], reason: 'test gerekçe' }, '', '/api/admin/games/bulk'), {})).status).toBe(404);
    expect(state.audits).toHaveLength(0);
  });
});

describe('GET /api/admin/games/:gameType', () => {
  it('14 günlük eğilim boşlukları doldurur; skor dağılımı; bütünlük; geçmiş', async () => {
    // $queryRaw sırası: trend, skor, bayrak, bayrak toplamı, son bayraklar, istemci>sunucu
    state.raw = [
      [],
      [
        { score: 5, n: BigInt(4) },
        { score: 0, n: BigInt(1) },
      ],
      [{ flag: 'implausible', n: BigInt(1) }],
      [{ n: BigInt(1) }],
      [{ createdAt: new Date('2026-10-10T10:00:00Z'), data: { flags: ['implausible'], clientScore: 30, verifiedScore: 9 }, name: 'Ayşe Kaya' }],
      [{ n: BigInt(3) }],
    ];
    state.history = [
      {
        id: 'a1',
        createdAt: new Date('2026-10-09T10:00:00Z'),
        action: 'minigame_config_update',
        oldData: { rewardPoints: 100 },
        newData: { rewardPoints: 200 },
        actorSnapshot: null,
        user: { name: 'Admin', email: 'a@x' },
      },
    ];
    const { GET } = await import('@/app/api/admin/games/[gameType]/route');
    const res = await GET(req('GET', undefined, '', '/api/admin/games/mind-thief'), { params: Promise.resolve({ gameType: 'mind-thief' }) });
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.trend).toHaveLength(14);
    expect(d.histogram.total).toBe(5);
    expect(d.integrity).toMatchObject({ total: 1, clientAboveServer30d: 3 });
    expect(d.integrity.recent[0].user).toBe('Ayşe K.');
    expect(d.history[0]).toMatchObject({ actor: 'Admin', oldData: { rewardPoints: 100 } });
  });

  it('bilinmeyen oyun 404', async () => {
    const { GET } = await import('@/app/api/admin/games/[gameType]/route');
    const res = await GET(req('GET', undefined, '', '/api/admin/games/yok'), { params: Promise.resolve({ gameType: 'yok' }) });
    expect(res.status).toBe(404);
  });
});

describe('buildHistogram', () => {
  it('skorları kovalara dağıtır, tavanı kırpar', async () => {
    const { buildHistogram } = await import('@/lib/admin-games/server');
    const h = buildHistogram(
      [
        { score: 0, n: 1 },
        { score: 99, n: 2 },
        { score: 10, n: 1 },
      ],
      10,
      5
    );
    expect(h.total).toBe(4);
    expect(h.buckets[h.buckets.length - 1].count).toBe(3);
    expect(h.buckets[0].count).toBe(1);
  });
});
