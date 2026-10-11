/**
 * Müşteri rozet yüzeyi (/customer/me/badges) sunucu uçları — gerçek DB'ye gidilmez.
 *
 *  1. GET /api/customer/badges: yalnız oturumdaki kullanıcı (userId parametresi yok sayılır),
 *     yalnız kazanılmış rozetler, gerçek kredi puanı (requirement.value DEĞİL), karakter
 *     kademesi puandan, kazanılmamış kategori adı sızmaz, "keşfedilecek" tek boolean.
 *  2. PATCH /api/customer/badges/[id]: sahiplik, vitrin sınırı (rozet + kozmetik = 4), kaldırma.
 *  3. POST /api/gamification/badges/[id]/unlock: 410 — puanla satın alma kapalı, puan düşülmez.
 *  4. GET /api/customer/character-leaderboard: diğer kullanıcıların userId/avatarı yok, ad
 *     maskeli, ilk 20 dışında da gerçek sıra; "en nadir" sahip olunmayanı maskeler.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/redis', () => ({
  cachedJson: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
}));
jest.mock('@/lib/activity-badges', () => ({
  ACTIVITY_BADGE_THRESHOLDS: { ustaYorumcu: 20, efsane: 50, tahtSahibi: 100 },
}));
const mockProgress = jest.fn();
jest.mock('@/lib/character-badges', () => ({
  CHARACTER_PROFILES: [
    { badgeId: 'badge-sheldon', name: 'Sheldon Cooper', trait: '' },
    { badgeId: 'badge-chandler', name: 'Chandler Bing', trait: '' },
    { badgeId: 'badge-walter-white', name: 'Walter White', trait: '' },
  ],
  getCategoryProgress: (...a: unknown[]) => mockProgress(...a),
}));
jest.mock('@/lib/character-categories', () => {
  const cats = [
    { key: 'komedi', name: 'Komedi', emoji: '😂', accent: '#eab308', characterIds: ['badge-sheldon', 'badge-chandler'] },
    { key: 'dram-suc', name: 'Dram / Suç', emoji: '🎭', accent: '#dc2626', characterIds: ['badge-walter-white'] },
  ];
  const byChar: Record<string, (typeof cats)[number]> = {};
  for (const c of cats) for (const id of c.characterIds) byChar[id] = c;
  return { CHARACTER_CATEGORIES: cats, CATEGORY_BY_CHARACTER: byChar };
});
const mockAdvance = jest.fn();
jest.mock('@/lib/achievements', () => ({ advanceAchievementProgress: (...a: unknown[]) => mockAdvance(...a) }));
const mockDebit = jest.fn();
jest.mock('@/lib/points-wallet', () => ({ debitPoints: (...a: unknown[]) => mockDebit(...a) }));

type UB = { id: string; userId: string; badgeId: string; isPinned: boolean; earnedAt: Date };
const db = {
  userBadges: [] as UB[],
  badges: new Map<string, Record<string, unknown>>(),
  cosmeticPins: 0,
  events: [] as Array<{ userId: string; data: unknown }>,
  users: new Map<string, { name: string | null; featuredCharacterBadgeId: string | null; role: string }>(),
};

const userBadge = {
  findMany: jest.fn(async ({ where }: { where: { userId?: string; badgeId?: { in: string[] } } }) =>
    db.userBadges
      .filter((u) => (!where.userId || u.userId === where.userId) && (!where.badgeId || where.badgeId.in.includes(u.badgeId)))
      .sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime())
      .map((u) => ({ ...u, badge: db.badges.get(u.badgeId) ?? null })),
  ),
  findUnique: jest.fn(async ({ where }: { where: { userId_badgeId: { userId: string; badgeId: string } } }) => {
    const k = where.userId_badgeId;
    return db.userBadges.find((u) => u.userId === k.userId && u.badgeId === k.badgeId) ?? null;
  }),
  count: jest.fn(async ({ where }: { where: { userId: string; isPinned?: boolean } }) =>
    db.userBadges.filter((u) => u.userId === where.userId && (where.isPinned === undefined || u.isPinned === where.isPinned)).length,
  ),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: { isPinned: boolean } }) => {
    const row = db.userBadges.find((u) => u.id === where.id)!;
    row.isPinned = data.isPinned;
    return row;
  }),
  groupBy: jest.fn(async ({ by, where }: { by: string[]; where?: { badgeId?: { in: string[] }; earnedAt?: { gte: Date } } }) => {
    const rows = db.userBadges.filter(
      (u) => (!where?.badgeId || where.badgeId.in.includes(u.badgeId)) && (!where?.earnedAt || u.earnedAt >= where.earnedAt.gte),
    );
    const key = by[0] as 'badgeId' | 'userId';
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1);
    return [...counts].map(([k, n]) => ({ [key]: k, _count: { _all: n } }));
  }),
};

const prismaMock = {
  userBadge,
  badge: {
    findFirst: jest.fn(async ({ where }: { where: { id: { notIn: string[] } } }) => {
      for (const [id, b] of db.badges) if (b.isActive && !where.id.notIn.includes(id)) return { id };
      return null;
    }),
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      [...db.badges].filter(([id, b]) => where.id.in.includes(id) && b.isActive).map(([id]) => ({ id })),
    ),
  },
  user: {
    count: jest.fn(async () => 1000),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null),
    findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id, name: db.users.get(id)?.name ?? null })),
    ),
  },
  analyticsEvent: {
    findMany: jest.fn(async ({ where }: { where: { userId: string } }) => db.events.filter((e) => e.userId === where.userId)),
  },
  userCosmetic: { count: jest.fn(async () => db.cosmeticPins) },
  // "Liderlikte görün" tercihi (lib/privacy/leaderboard-optout): bu senaryoda kimse kapatmadı.
  settings: { findMany: jest.fn(async () => []) },
  feedback: { count: jest.fn(async () => 3) },
  consumptionReview: { count: jest.fn(async () => 4) },
  $queryRaw: jest.fn(async () => []),
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, isPrismaConnectivityError: () => false }));

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function seed() {
  db.userBadges = [];
  db.badges = new Map();
  db.events = [];
  db.cosmeticPins = 0;
  db.users = new Map([
    ['u1', { name: 'Furkan Uluç', featuredCharacterBadgeId: 'badge-sheldon', role: 'CUSTOMER' }],
    ['u2', { name: 'Didar Yılmaz', featuredCharacterBadgeId: null, role: 'CUSTOMER' }],
    ['u3', { name: 'Ayşe Kaya', featuredCharacterBadgeId: null, role: 'CUSTOMER' }],
  ]);
  const badge = (id: string, extra: Record<string, unknown> = {}) =>
    db.badges.set(id, {
      name: id,
      description: `${id} açıklaması`,
      icon: `/images/badges/${id}.svg`,
      category: 'feedback',
      rarity: 'common',
      color: null,
      hiddenUntilEarned: false,
      isActive: true,
      requirement: { type: 'feedback_count', value: 1 },
      ...extra,
    });
  badge('badge-yeni-ses');
  badge('badge-yorum-makinesi', { rarity: 'rare', color: '#d946ef' });
  badge('badge-usta-yorumcu', { rarity: 'epic' });
  badge('badge-efsane', { rarity: 'legendary' });
  badge('badge-gizli-pasif', { isActive: false });
  badge('badge-sheldon', { category: 'dizi' });
  badge('badge-chandler', { category: 'dizi' });
  badge('badge-walter-white', { category: 'dizi' });

  let n = 0;
  const own = (userId: string, badgeId: string, earnedAt: string, isPinned = false) =>
    db.userBadges.push({ id: `ub${++n}`, userId, badgeId, isPinned, earnedAt: new Date(earnedAt) });
  own('u1', 'badge-yeni-ses', '2026-10-08T10:00:00Z', true);
  own('u1', 'badge-yorum-makinesi', '2026-09-01T10:00:00Z');
  own('u1', 'badge-sheldon', '2026-10-09T10:00:00Z');
  own('u2', 'badge-yeni-ses', '2026-10-06T10:00:00Z');
  own('u2', 'badge-walter-white', '2026-10-06T10:00:00Z');
  own('u2', 'badge-chandler', '2026-10-07T10:00:00Z');
  own('u3', 'badge-chandler', '2026-10-07T10:00:00Z');

  db.events.push(
    { userId: 'u1', data: { points: 200, badgeId: 'badge-yeni-ses' } },
    { userId: 'u1', data: { points: 4000, source: 'badge', sourceId: 'badge-yorum-makinesi', badgeId: 'badge-yorum-makinesi' } },
    { userId: 'u2', data: { points: 999, badgeId: 'badge-walter-white' } },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
  mockProgress.mockResolvedValue({ topCategoryKey: 'komedi', current: 4, threshold: 6, progress: 4 / 6, ready: false });
});

describe('GET /api/customer/badges', () => {
  async function get(url = '/api/customer/badges') {
    const { GET } = await import('@/app/api/customer/badges/route');
    const res = await GET(req(url), {});
    return { status: res.status, json: await res.json() };
  }

  it('oturum yoksa 401 ve veri yok', async () => {
    mockRequireAuth.mockResolvedValueOnce({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) });
    const r = await get();
    expect(r.status).toBe(401);
    expect(r.json.success).toBe(false);
    expect(userBadge.findMany).not.toHaveBeenCalled();
  });

  it('yalnız oturumdaki kullanıcının KAZANDIĞI rozetler; ?userId= yok sayılır', async () => {
    const r = await get('/api/customer/badges?userId=u2');
    expect(r.status).toBe(200);
    const ids = r.json.data.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(['badge-sheldon', 'badge-yeni-ses', 'badge-yorum-makinesi']);
    expect(ids).not.toContain('badge-walter-white');
    expect(JSON.stringify(r.json)).not.toContain('badge-usta-yorumcu');
  });

  it('puan GERÇEK krediden; toplam rozetlerden gelen puan; paydasız toplam', async () => {
    const r = await get();
    const byId = Object.fromEntries(r.json.data.items.map((i: { id: string }) => [i.id, i]));
    expect(byId['badge-yeni-ses'].creditedPoints).toBe(200);
    expect(byId['badge-yorum-makinesi'].creditedPoints).toBe(4000);
    expect(r.json.data.stats).toMatchObject({ total: 3, badges: 2, characters: 1, pointsFromBadges: 4200, pinnedBadges: 1, pinLimit: 4 });
    expect(r.json.data.stats).not.toHaveProperty('progressToNext');
  });

  it('karakter: tür, kategori kimliği, ana karakter; kazanılmamış kategori adı sızmaz', async () => {
    const r = await get();
    const sheldon = r.json.data.items.find((i: { id: string }) => i.id === 'badge-sheldon');
    expect(sheldon).toMatchObject({ kind: 'character', category: 'komedi', characterCategory: { key: 'komedi' } });
    expect(r.json.data.character.featuredBadgeId).toBe('badge-sheldon');
    expect(r.json.data.character.categoryStats).toEqual([
      expect.objectContaining({ key: 'komedi', collected: 1, complete: false }),
    ]);
    expect(JSON.stringify(r.json.data.character)).not.toContain('Dram');
    expect(r.json.data.character.bar).toMatchObject({ current: 4, threshold: 6, remaining: 2, ready: false });
  });

  it('admin rengi temizlenmiş hex; sahiplik oranı; "yeni" son 7 gün', async () => {
    const r = await get();
    const byId = Object.fromEntries(r.json.data.items.map((i: { id: string }) => [i.id, i]));
    expect(byId['badge-yorum-makinesi'].color).toBe('#d946ef');
    expect(byId['badge-yeni-ses'].holders).toBe(2);
    expect(byId['badge-yeni-ses'].holdersPct).toBe(0.2);
    expect(typeof byId['badge-yeni-ses'].isNew).toBe('boolean');
  });

  it('keşfedilecek rozet tek boolean; sonraki sürpriz yalnız aktif kilometre taşından', async () => {
    const r = await get();
    expect(r.json.data.moreToDiscover).toBe(true);
    // 3 geri bildirim + 4 tüketim yorumu = 7 → sıradaki aktif eşik 20 (usta-yorumcu).
    expect(r.json.data.nextSurprise).toEqual({ current: 7, target: 20, remaining: 13 });
    expect(JSON.stringify(r.json.data.nextSurprise)).not.toContain('badge-');
  });

  it('veritabanı hatası 500 zarfı (boş koleksiyon gibi görünmez)', async () => {
    userBadge.findMany.mockRejectedValueOnce(new Error('boom'));
    const r = await get();
    expect(r.status).toBe(500);
    expect(r.json).toMatchObject({ success: false, code: 'INTERNAL', retryable: true });
  });
});

describe('PATCH /api/customer/badges/[id]', () => {
  async function patch(id: string, body: unknown) {
    const { PATCH } = await import('@/app/api/customer/badges/[id]/route');
    const res = await PATCH(req(`/api/customer/badges/${id}`, { method: 'PATCH', body }), { params: Promise.resolve({ id }) });
    return { status: res.status, json: await res.json() };
  }

  it('sahip olunmayan rozet sabitlenemez (404)', async () => {
    const r = await patch('badge-walter-white', { isPinned: true });
    expect(r.status).toBe(404);
    expect(userBadge.update).not.toHaveBeenCalled();
  });

  it('sabitler ve vitrin başarımını toplam sayıyla ilerletir', async () => {
    const r = await patch('badge-yorum-makinesi', { isPinned: true });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ isPinned: true, pinnedBadges: 2, pinnedTotal: 2, pinLimit: 4 });
    expect(mockAdvance).toHaveBeenCalledWith('u1', 'quest-showcase-master', 2, 'set');
  });

  it('vitrin dolu (rozet + kozmetik = 4) → 409, yazım yok', async () => {
    db.cosmeticPins = 3;
    const r = await patch('badge-yorum-makinesi', { isPinned: true });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('PIN_LIMIT');
    expect(userBadge.update).not.toHaveBeenCalled();
  });

  it('kaldırma sınırdan etkilenmez', async () => {
    db.cosmeticPins = 3;
    const r = await patch('badge-yeni-ses', { isPinned: false });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ isPinned: false, pinnedBadges: 0 });
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it('şemasız gövde reddedilir', async () => {
    const r = await patch('badge-yeni-ses', { isPinned: 'evet' });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/gamification/badges/[id]/unlock', () => {
  it('410 — puanla açma kapalı, puan düşülmez', async () => {
    const { POST } = await import('@/app/api/gamification/badges/[id]/unlock/route');
    const res = await POST(req('/api/gamification/badges/badge-yeni-ses/unlock', { method: 'POST' }), {
      params: Promise.resolve({ id: 'badge-yeni-ses' }),
    });
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe('BADGE_SHOP_DISABLED');
    expect(mockDebit).not.toHaveBeenCalled();
  });
});

describe('GET /api/customer/character-leaderboard', () => {
  async function get(mode: string) {
    const { GET } = await import('@/app/api/customer/character-leaderboard/route');
    const res = await GET(req(`/api/customer/character-leaderboard?mode=${mode}`), {});
    return { status: res.status, json: await res.json() };
  }

  it('bu hafta: başkalarının userId/avatarı yok, ad maskeli, gerçek sıra', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-10T12:00:00Z'));
    try {
      const r = await get('top-weekly');
      expect(r.status).toBe(200);
      const body = JSON.stringify(r.json);
      expect(body).not.toContain('"userId"');
      expect(body).not.toContain('u2');
      expect(body).not.toContain('Yılmaz');
      expect(body).not.toContain('image');
      const names = r.json.data.leaderboard.map((x: { name: string }) => x.name);
      expect(names[0]).toBe('Didar Y.');
      expect([...names.slice(1)].sort()).toEqual(['Ayşe K.', 'Furkan U.']);
      expect(r.json.data.leaderboard.map((x: { rank: number }) => x.rank)).toEqual([1, 2, 2]);
      expect(r.json.data.currentUser).toEqual({ count: 1, rank: 2 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('en nadir: sahip olunmayan karakterin kimliği sızmaz', async () => {
    const r = await get('rarest');
    expect(r.status).toBe(200);
    const rows = r.json.data.leaderboard as Array<{ badgeId: string | null; name: string | null; isMine: boolean; rowKey: string }>;
    const mine = rows.filter((x) => x.isMine);
    expect(mine.map((x) => x.badgeId)).toEqual(['badge-sheldon']);
    for (const row of rows.filter((x) => !x.isMine)) {
      expect(row.badgeId).toBeNull();
      expect(row.name).toBeNull();
      expect(row.rowKey).toMatch(/^rare-\d+$/);
    }
    expect(JSON.stringify(r.json)).not.toContain('walter');
  });

  it('geçersiz mod 400', async () => {
    const r = await get('everyone');
    expect(r.status).toBe(400);
  });
});
