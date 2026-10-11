/**
 * Kart sayfası (p-kart-masa-offline) — sahiplenme, görünüm durumu, kayıp kart bildirimi.
 * Gerçek DB'ye gidilmez (prisma mock).
 *
 *  - deriveCardViewState: claimable / mine / frozen_mine / blocked_mine / blocked / taken / not_found;
 *    yetim kart (bağsız ya da sahibi anonim) sahiplenilebilir.
 *  - POST /api/cards/[token]/activate: yalnız CUSTOMER; koşullu yazma; yetim kart serbest bırakma
 *    denetim kaydıyla; geriye uyumlu hata kodları; yarışta ALREADY_* ayrımı.
 *  - POST /api/cards/[token]/found: sahibe bildirim; 6 saatte bir; sahipsiz kartta nötr yanıt;
 *    yanıt kart durumunu sızdırmaz; bağlantılar nottan çıkarılır.
 *  - loadCardPage: sahip kimliği yalnız sahibine; kullanım sayısı yalnız sahibin tüketimleri.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
const mockPush = jest.fn(async () => true);
jest.mock('@/lib/push', () => ({ sendPush: (...a: unknown[]) => mockPush(...(a as [])) }));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: async () => ({
    consumptionReview: { base: { points: 20, xp: 5 }, detailed: { points: 40, xp: 10 }, longTextThreshold: 80 },
  }),
}));

type Card = {
  id: string;
  token: string;
  status: 'UNUSED' | 'ACTIVATED' | 'BLOCKED';
  customerId: string | null;
  archivedAt: Date | null;
  activatedAt: Date | null;
  blockReason: string | null;
  blockedAt?: Date | null;
  customer: { anonymizedAt: Date | null; name: string | null } | null;
};

const TOKEN = 'ABCDEFGHJKLMNPQRSTUVW';
const db = {
  cards: [] as Card[],
  audits: [] as Array<Record<string, unknown>>,
  notifications: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  consumptions: [] as Array<{ cardId: string; customerId: string; createdAt: Date }>,
  /** Yarış simülasyonu: koşullu yazma bir kez 0 döndürür ve kartı başkasına geçirir. */
  raceTo: null as string | null,
};

function card(over: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    token: TOKEN,
    status: 'UNUSED',
    customerId: null,
    archivedAt: null,
    activatedAt: null,
    blockReason: null,
    customer: null,
    ...over,
  };
}

const prismaMock = {
  physicalCard: {
    findUnique: jest.fn(async ({ where }: { where: { token?: string; id?: string } }) =>
      db.cards.find((c) => (where.token ? c.token === where.token : c.id === where.id)) ?? null
    ),
    findFirst: jest.fn(async ({ where }: { where: { customerId: string; NOT?: { id: string } } }) =>
      db.cards.find((c) => c.customerId === where.customerId && c.status === 'ACTIVATED' && c.id !== where.NOT?.id) ?? null
    ),
    updateMany: jest.fn(
      async ({ where, data }: { where: { id: string; status: string; customerId: string | null }; data: Partial<Card> }) => {
        const c = db.cards.find((x) => x.id === where.id);
        if (db.raceTo && c) {
          c.customerId = db.raceTo;
          c.status = 'ACTIVATED';
          db.raceTo = null;
          return { count: 0 };
        }
        if (!c || c.status !== where.status || c.customerId !== where.customerId || c.archivedAt) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      }
    ),
  },
  cardAuditLog: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.audits.push(data);
      return data;
    }),
    findFirst: jest.fn(async ({ where }: { where: { cardId: string; action: string; createdAt: { gte: Date } } }) =>
      db.audits.find((a) => a.cardId === where.cardId && a.action === where.action && (a.createdAt as Date) >= where.createdAt.gte) ?? null
    ),
  },
  notification: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.notifications.push(data);
      return data;
    }),
  },
  analyticsEvent: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.events.push(data);
      return data;
    }),
  },
  consumption: {
    count: jest.fn(async ({ where }: { where: { cardId: string; customerId?: string } }) =>
      db.consumptions.filter((c) => c.cardId === where.cardId && (!where.customerId || c.customerId === where.customerId)).length
    ),
    findFirst: jest.fn(async ({ where }: { where: { cardId: string; customerId?: string } }) => {
      const rows = db.consumptions.filter((c) => c.cardId === where.cardId && (!where.customerId || c.customerId === where.customerId));
      return rows.length ? { createdAt: rows[rows.length - 1].createdAt } : null;
    }),
  },
  $transaction: jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, isPrismaConnectivityError: () => false }));

const FREEZE = 'Müşteri tarafından donduruldu';

async function activate(token = TOKEN) {
  const mod = await import('@/app/api/cards/[token]/activate/route');
  const req = new NextRequest(`http://localhost/api/cards/${token}/activate`, {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'jest' },
  });
  const res: Response = await mod.POST(req, { params: Promise.resolve({ token }) });
  return { status: res.status, json: await res.json() };
}

async function found(body: unknown, token = TOKEN) {
  const mod = await import('@/app/api/cards/[token]/found/route');
  const req = new NextRequest(`http://localhost/api/cards/${token}/found`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  });
  const res: Response = await mod.POST(req, { params: Promise.resolve({ token }) });
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  db.cards = [card()];
  db.audits = [];
  db.notifications = [];
  db.events = [];
  db.consumptions = [];
  db.raceTo = null;
  mockPush.mockClear();
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
});

describe('deriveCardViewState', () => {
  it('tüm durumlar', async () => {
    const { deriveCardViewState } = await import('@/lib/cards/claim');
    const s = (c: Partial<Card> | null, viewer: string | null) => deriveCardViewState(c ? card(c) : null, viewer, FREEZE);
    expect(s(null, 'u1')).toBe('not_found');
    expect(s({ archivedAt: new Date() }, 'u1')).toBe('not_found');
    expect(s({}, null)).toBe('claimable');
    expect(s({ status: 'ACTIVATED', customerId: 'u1' }, 'u1')).toBe('mine');
    expect(s({ status: 'ACTIVATED', customerId: 'u2' }, 'u1')).toBe('taken');
    expect(s({ status: 'ACTIVATED', customerId: 'u2' }, null)).toBe('taken');
    // Yetim kartlar: bağsız ACTIVATED ya da sahibi anonimleştirilmiş.
    expect(s({ status: 'ACTIVATED', customerId: null }, 'u1')).toBe('claimable');
    expect(s({ status: 'ACTIVATED', customerId: 'gone', customer: { anonymizedAt: new Date(), name: null } }, 'u1')).toBe('claimable');
    // Bloklar: sahibine dondurma/yönetim ayrımı, başkasına nötr.
    expect(s({ status: 'BLOCKED', customerId: 'u1', blockReason: FREEZE }, 'u1')).toBe('frozen_mine');
    expect(s({ status: 'BLOCKED', customerId: 'u1', blockReason: 'Dolandırıcılık' }, 'u1')).toBe('blocked_mine');
    expect(s({ status: 'BLOCKED', customerId: 'u1', blockReason: FREEZE }, 'u2')).toBe('blocked');
    expect(s({ status: 'BLOCKED', customerId: null }, null)).toBe('blocked');
  });
});

describe('POST /api/cards/[token]/activate', () => {
  it('müşteri olmayan 403; oturumsuz 401', async () => {
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    expect((await activate()).status).toBe(403);
    mockRequireAuth.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) });
    expect((await activate()).status).toBe(401);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('kullanılmamış kart bağlanır; denetim kaydı ilk IP ile; geriye uyumlu gövde', async () => {
    const r = await activate();
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.card).toMatchObject({ id: 'card-1', status: 'ACTIVATED' });
    expect(r.json.data.card.id).toBe('card-1');
    expect(db.cards[0]).toMatchObject({ status: 'ACTIVATED', customerId: 'u1' });
    expect(db.audits).toEqual([
      expect.objectContaining({ action: 'ACTIVATED', userId: 'u1', ipAddress: '203.0.113.9', userAgent: 'jest' }),
    ]);
    expect(db.events[0]).toMatchObject({ event: 'card_activated' });
  });

  it('yetim kart (bağsız ACTIVATED) serbest bırakılıp bağlanır; RELEASED_ORPHAN kaydı', async () => {
    db.cards = [card({ status: 'ACTIVATED', customerId: null })];
    const r = await activate();
    expect(r.status).toBe(200);
    expect(db.cards[0].customerId).toBe('u1');
    expect(db.audits.map((a) => a.action)).toEqual(['RELEASED_ORPHAN', 'ACTIVATED']);
    expect(db.audits[0]).toMatchObject({ metadata: { previousOwner: 'none', previousStatus: 'ACTIVATED' } });
  });

  it('sahibi anonimleştirilmiş kart da sahiplenilebilir', async () => {
    db.cards = [card({ status: 'ACTIVATED', customerId: 'gone', customer: { anonymizedAt: new Date(), name: null } })];
    const r = await activate();
    expect(r.status).toBe(200);
    expect(db.audits[0]).toMatchObject({ action: 'RELEASED_ORPHAN', metadata: { previousOwner: 'anonymized' } });
  });

  it('hata kodları: başkasının 409, kendi 400, bloklu 403, arşivli/yok 404, bozuk token 404', async () => {
    db.cards = [card({ status: 'ACTIVATED', customerId: 'u2' })];
    let r = await activate();
    expect([r.status, r.json.code]).toEqual([409, 'ALREADY_ACTIVATED']);
    db.cards = [card({ status: 'ACTIVATED', customerId: 'u1' })];
    r = await activate();
    expect([r.status, r.json.code]).toEqual([400, 'ALREADY_YOURS']);
    db.cards = [card({ status: 'BLOCKED', customerId: null })];
    r = await activate();
    expect([r.status, r.json.code]).toEqual([403, 'CARD_BLOCKED']);
    db.cards = [card({ archivedAt: new Date() })];
    r = await activate();
    expect([r.status, r.json.code]).toEqual([404, 'CARD_NOT_FOUND']);
    r = await activate('bad token!');
    expect(r.status).toBe(404);
    expect(db.audits).toHaveLength(0);
  });

  it('yarış: koşullu yazma kaybedilirse ALREADY_ACTIVATED; denetim kaydı yazılmaz', async () => {
    db.raceTo = 'u9';
    const r = await activate();
    expect([r.status, r.json.code]).toEqual([409, 'ALREADY_ACTIVATED']);
    expect(db.audits).toHaveLength(0);
  });
});

describe('POST /api/cards/[token]/found', () => {
  it('sahibe bildirim + denetim kaydı; yanıt kart durumunu sızdırmaz; bağlantı nottan çıkar', async () => {
    db.cards = [card({ status: 'ACTIVATED', customerId: 'owner', customer: { anonymizedAt: null, name: 'Ayşe Yılmaz' } })];
    const r = await found({ note: 'Kasaya bıraktım https://kotu.site/x' });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ delivered: true });
    expect(JSON.stringify(r.json)).not.toMatch(/Ayşe|owner|ACTIVATED/);
    expect(db.notifications).toEqual([
      expect.objectContaining({ userId: 'owner', type: 'warning', data: expect.objectContaining({ kind: 'card_found' }) }),
    ]);
    expect(String(db.notifications[0].message)).toContain('Kasaya bıraktım');
    expect(String(db.notifications[0].message)).not.toContain('kotu.site');
    expect(db.audits[0]).toMatchObject({ action: 'FOUND_REPORTED', userId: null });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('6 saat içinde ikinci bildirim gönderilmez (sahip spamlenmez)', async () => {
    db.cards = [card({ status: 'ACTIVATED', customerId: 'owner', customer: { anonymizedAt: null, name: 'X' } })];
    db.audits = [{ cardId: 'card-1', action: 'FOUND_REPORTED', createdAt: new Date() }];
    const r = await found({});
    expect(r.json.data).toEqual({ delivered: true });
    expect(db.notifications).toHaveLength(0);
  });

  it('sahipsiz / kullanılmamış / bilinmeyen kart: aynı nötr yanıt, bildirim yok', async () => {
    expect((await found({})).json.data).toEqual({ delivered: true });
    db.cards = [];
    expect((await found({})).json.data).toEqual({ delivered: true });
    expect(db.notifications).toHaveLength(0);
  });
});

describe('loadCardPage (sunucu görünüm modeli)', () => {
  it('sahibine ad + yalnız kendi kullanımları; başkasına ad yok', async () => {
    const { loadCardPage } = await import('@/app/c/[token]/_server/card-page');
    db.cards = [card({ status: 'ACTIVATED', customerId: 'u1', activatedAt: new Date('2026-09-01'), customer: { anonymizedAt: null, name: 'Ayşe' } })];
    db.consumptions = [
      { cardId: 'card-1', customerId: 'old-owner', createdAt: new Date('2026-08-01') },
      { cardId: 'card-1', customerId: 'u1', createdAt: new Date('2026-09-05') },
    ];
    const own = await loadCardPage(TOKEN, { kind: 'customer', id: 'u1', name: 'Ayşe' });
    expect(own.state).toBe('mine');
    expect(own.owner).toMatchObject({ holderName: 'Ayşe', usesCount: 1, lastUsedAt: '2026-09-05T00:00:00.000Z' });
    expect(own.reward).toEqual({ base: 20, detailed: 40, threshold: 80 });

    const other = await loadCardPage(TOKEN, { kind: 'anon', id: null, name: null });
    expect(other.state).toBe('taken');
    expect(other.owner).toBeNull();
    expect(JSON.stringify(other)).not.toContain('Ayşe');
    expect(other.maskedToken).toBe('•••• PQRS TUVW');
  });

  it('sahiplenilebilir kart: ödül matrisi + başka aktif kart notu; yetim bayrağı', async () => {
    const { loadCardPage } = await import('@/app/c/[token]/_server/card-page');
    db.cards = [card({ status: 'ACTIVATED', customerId: null }), card({ id: 'card-2', token: 'OTHERTOKEN1234', status: 'ACTIVATED', customerId: 'u1' })];
    const m = await loadCardPage(TOKEN, { kind: 'customer', id: 'u1', name: 'Ayşe' });
    expect(m.state).toBe('claimable');
    expect(m.orphan).toBe(true);
    expect(m.hasOtherCard).toBe(true);
    expect(m.reward).toEqual({ base: 20, detailed: 40, threshold: 80 });
  });

  it('geçersiz token biçimi DB sorgusu olmadan not_found', async () => {
    const { loadCardPage } = await import('@/app/c/[token]/_server/card-page');
    prismaMock.physicalCard.findUnique.mockClear();
    const m = await loadCardPage('../etc', { kind: 'anon', id: null, name: null });
    expect(m.state).toBe('not_found');
    expect(prismaMock.physicalCard.findUnique).not.toHaveBeenCalled();
  });
});
