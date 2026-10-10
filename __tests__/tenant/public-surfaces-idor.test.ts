/**
 * P0-09 — kimliksiz/kapsamsız IDOR'lar: saldırı senaryolarını yeniden üretir.
 *  - Oturumsuz `?userId=<başkası>` ile rozet/görev profili okunamaz.
 *  - Müşteri yorum listesi bayi iç notu, gizli karakter kategorisi ve churn sinyali taşımaz.
 *  - Kart QR'ını açan yabancı, kart sahibinin adını/fotoğrafını/id'sini göremez.
 *  - Liderlik: oturum zorunlu, ham userId yok, `needsReview` yalnız ADMIN'e, görünürlük tercihi uygulanır.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => require('../helpers/prisma-proxy'));
jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/redis', () => ({
  redisGetJson: jest.fn(async () => null),
  redisSetJson: jest.fn(async () => undefined),
  redisIncrWithTtl: jest.fn(async () => null),
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 10 })),
  getClientIdentifier: () => '203.0.113.7',
}));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null) }));
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: jest.fn(),
}));
jest.mock('@/lib/points-velocity', () => ({
  getSuspiciousUserIds: jest.fn(async (ids: string[]) => new Set(ids.filter((id) => id === 'u2'))),
}));
jest.mock('@/lib/league-rules', () => ({
  getLeagueRules: jest.fn(async () => ({})),
  getLeagueMetaFromRules: jest.fn(() => ({ name: 'Bronz', key: 'bronze' })),
  getNextLeagueMetaFromRules: jest.fn(() => null),
  getLeagueProgressFromRules: jest.fn(() => 0),
}));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getQuestReward: jest.fn(() => ({ points: 0, xp: 0 })),
}));

import { db, resetDb } from '../helpers/prisma-proxy';
import { as, setSession } from '../helpers/session-mock';
import { resolveSubjectUserId } from '@/lib/auth/subject-user';

const ADMIN = as('admin-1', 'ADMIN');
const CUSTOMER = as('cust-1', 'CUSTOMER');
const OTHER = as('cust-2', 'CUSTOMER');

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

beforeEach(() => {
  resetDb();
  setSession(null);
});

describe('resolveSubjectUserId — ?userId= sözleşmesi', () => {
  it.each([
    ['parametre yok', null, null, { ok: true, userId: null }],
    ['me + oturum', CUSTOMER, 'me', { ok: true, userId: 'cust-1', isSelf: true }],
    ['me + oturumsuz', null, 'me', { ok: false, status: 401 }],
    ['başkası + oturumsuz', null, 'cust-2', { ok: false, status: 401 }],
    ['başkası + müşteri', CUSTOMER, 'cust-2', { ok: false, status: 403 }],
    ['kendi id’si', CUSTOMER, 'cust-1', { ok: true, userId: 'cust-1', isSelf: true }],
    ['başkası + ADMIN', ADMIN, 'cust-2', { ok: true, userId: 'cust-2', isSelf: false }],
    ['bozuk id', ADMIN, "x' OR 1=1", { ok: false, status: 400 }],
  ])('%s', (_l, session, param, expected) => {
    expect(resolveSubjectUserId(session, param)).toMatchObject(expected);
  });
});

describe('GET /api/gamification/badges + quests — başkasının profili', () => {
  async function badges(session: unknown, query: string) {
    setSession(session);
    db.badge.findMany.mockResolvedValue([]);
    db.userBadge.findMany.mockResolvedValue([]);
    db.user.findUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/gamification/badges/route');
    return GET(req(`/api/gamification/badges${query}`));
  }
  async function quests(session: unknown, query: string) {
    setSession(session);
    db.quest.findMany.mockResolvedValue([]);
    db.auditLog.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/gamification/quests/route');
    return GET(req(`/api/gamification/quests${query}`));
  }

  it('oturumsuz ?userId=<başkası> → 401, kullanıcı verisi okunmaz', async () => {
    expect((await badges(null, '?userId=cust-2')).status).toBe(401);
    expect((await quests(null, '?userId=cust-2')).status).toBe(401);
    expect(db.userBadge.findMany).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('müşteri başka müşterinin profilini isteyemez → 403', async () => {
    expect((await badges(OTHER, '?userId=cust-1')).status).toBe(403);
    expect((await quests(OTHER, '?userId=cust-1')).status).toBe(403);
    expect(db.userBadge.findMany).not.toHaveBeenCalled();
  });

  it('me ve ADMIN çalışır; sorgu doğru kullanıcıya bağlanır', async () => {
    expect((await badges(CUSTOMER, '?userId=me')).status).toBe(200);
    expect(db.userBadge.findMany.mock.calls[0][0].where).toEqual({ userId: 'cust-1' });
    expect((await badges(ADMIN, '?userId=cust-2')).status).toBe(200);
    expect(db.userBadge.findMany.mock.calls[1][0].where).toEqual({ userId: 'cust-2' });
    expect((await quests(CUSTOMER, '?userId=me')).status).toBe(200);
  });
});

describe('GET /api/customer/reviews — açık müşteri DTO', () => {
  it('bayi iç notu, karakter kategorisi, churn/sentiment ve kart kimliği SEÇİLMEZ', async () => {
    setSession(CUSTOMER);
    db.consumptionReview.findMany.mockResolvedValue([]);
    db.consumptionReview.count.mockResolvedValue(0);
    const { GET } = await import('@/app/api/customer/reviews/route');
    const res = await GET(req('/api/customer/reviews'));
    expect(res.status).toBe(200);
    const args = db.consumptionReview.findMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.where).toEqual({ customerId: 'cust-1', deletedAt: null });
    const sel = args.select;
    for (const hidden of ['characterCategory', 'churnRisk', 'sentiment', 'analyzedAt', 'customerId', 'deletedAt']) {
      expect(sel[hidden]).toBeUndefined();
    }
    const cons = sel.consumption.select;
    for (const hidden of ['note', 'cardId', 'customerId', 'clientOpId']) expect(cons[hidden]).toBeUndefined();
  });

  it('müşteri olmayan → 403', async () => {
    setSession(ADMIN);
    const { GET } = await import('@/app/api/customer/reviews/route');
    expect((await GET(req('/api/customer/reviews'))).status).toBe(403);
  });
});

describe('GET /api/cards/[token] — kart sahibinin kimliği', () => {
  const CARD = {
    id: 'card-1',
    token: 'ABCDEFGHJKLMNPQRSTUVW',
    status: 'ACTIVATED',
    activatedAt: new Date('2026-09-01'),
    customerId: 'cust-1',
    archivedAt: null,
    customer: { id: 'cust-1', name: 'Ayşe Yılmaz', image: 'https://cdn/x.png' },
  };
  async function call(session: unknown, card: unknown = CARD) {
    setSession(session);
    db.physicalCard.findUnique.mockResolvedValue(card);
    const { GET } = await import('@/app/api/cards/[token]/route');
    return GET(req('/api/cards/ABCDEFGHJKLMNPQRSTUVW'), { params: Promise.resolve({ token: 'ABCDEFGHJKLMNPQRSTUVW' }) });
  }

  it('oturumsuz yabancı: ad, foto ve id DÖNMEZ', async () => {
    const data = await (await call(null)).json();
    const text = JSON.stringify(data);
    expect(text).not.toContain('Ayşe');
    expect(text).not.toContain('cust-1');
    expect(text).not.toContain('cdn/x.png');
    expect(data.card.isOwnCard).toBe(false);
    expect(data.card.ownerHidden).toBe(true);
  });

  it('başka bir müşteri de göremez; sahibi görür', async () => {
    expect(JSON.stringify(await (await call(OTHER)).json())).not.toContain('Ayşe');
    const own = await (await call(CUSTOMER)).json();
    expect(own.card.isOwnCard).toBe(true);
    expect(own.card.customer).toMatchObject({ id: 'cust-1', name: 'Ayşe Yılmaz' });
  });

  it('bloklu kartın iç blok gerekçesi dışarı verilmez; arşivli kart 404', async () => {
    const blocked = await call(null, { ...CARD, status: 'BLOCKED', blockReason: 'Dolandırıcılık şüphesi' });
    expect(blocked.status).toBe(403);
    expect(JSON.stringify(await blocked.json())).not.toContain('Dolandırıcılık');
    expect((await call(null, { ...CARD, archivedAt: new Date() })).status).toBe(404);
  });
});

describe('GET /api/leaderboard — gizlilik', () => {
  const users = [
    { id: 'u1', name: 'Gizli Kişi', image: null, points: 900, level: 5, xp: 1, _count: { feedbacks: 1, badges: 1, referralsMade: 0 } },
    { id: 'u2', name: 'Mehmet Can Demir', image: null, points: 800, level: 4, xp: 1, _count: { feedbacks: 1, badges: 1, referralsMade: 0 } },
    { id: 'cust-1', name: 'Ayşe Yılmaz', image: null, points: 700, level: 3, xp: 1, _count: { feedbacks: 1, badges: 1, referralsMade: 0 } },
  ];
  async function call(session: unknown) {
    setSession(session);
    db.user.findMany.mockResolvedValue(users);
    db.user.count.mockResolvedValue(3);
    db.settings.findMany.mockResolvedValue([{ key: 'user_settings_u1' }]);
    const { GET } = await import('@/app/api/leaderboard/route');
    return GET(req('/api/leaderboard?period=alltime&limit=10'));
  }

  it('oturumsuz → 401', async () => {
    expect((await call(null)).status).toBe(401);
  });

  it('ham userId yok, görünürlüğü kapalı kullanıcı listede yok, adlar maskeli, needsReview yok', async () => {
    const data = await (await call(CUSTOMER)).json();
    const board = data.data.leaderboard as Array<Record<string, unknown>>;
    const text = JSON.stringify(board);
    expect(text).not.toContain('"u1"');
    expect(text).not.toContain('Gizli Kişi');
    expect(text).not.toContain('"u2"');
    expect(text).not.toContain('cust-1');
    for (const e of board) {
      expect(String(e.id)).toMatch(/^lb_[0-9a-f]{20}$/);
      expect(e).not.toHaveProperty('needsReview');
    }
    const mehmet = board.find((e) => e.rank === 1);
    expect(mehmet?.name).toBe('Mehmet D.');
    const me = board.find((e) => e.isCurrentUser);
    expect(me?.name).toBe('Ayşe Yılmaz');
  });

  it('ADMIN needsReview görür', async () => {
    const data = await (await call(ADMIN)).json();
    const board = data.data.leaderboard as Array<Record<string, unknown>>;
    expect(board.some((e) => e.needsReview === true)).toBe(true);
  });
});
