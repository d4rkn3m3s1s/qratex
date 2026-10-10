/**
 * POST /api/customer/scan/resolve — Tara yüzeyinin BFF'i (gerçek DB'ye gidilmez).
 *
 *  - Yalnız CUSTOMER; zod gövde doğrulaması.
 *  - Tanınmayan QR: DB'ye sorgu yok (B-6).
 *  - Durumlar makine-okur (`expired`, `revoked`, `archived`, `inactive`, `not_found`) (B-3).
 *  - `qr_scanned` YAZILMAZ; yalnız `in_app_scan_resolved` (userId + kaynak) (B-7).
 *  - Kart: sahibin kimliği asla dönmez; unused/mine/taken/blocked/not_found.
 *  - Sunucu özeti yardımcıları: son mekân tekilleştirme, kalan tavan.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));

type QrRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  dealerId: string;
  location: { name: string } | null;
  dealer: { name: string | null; businessName: string | null; businessLogo: string | null } | null;
};
type CardRow = { token: string; status: string; customerId: string | null; archivedAt: Date | null };

const db = {
  qrs: [] as QrRow[],
  cards: [] as CardRow[],
  lastFeedbackAt: null as Date | null,
  events: [] as Array<Record<string, unknown>>,
};

const qrFindUnique = jest.fn(async ({ where }: { where: { code: string } }) => db.qrs.find((q) => q.code === where.code) ?? null);
const cardFindUnique = jest.fn(async ({ where }: { where: { token: string } }) => {
  const c = db.cards.find((x) => x.token === where.token);
  return c ? { status: c.status, customerId: c.customerId, archivedAt: c.archivedAt } : null;
});
const cardFindFirst = jest.fn(async ({ where }: { where: { customerId: string } }) => {
  const c = db.cards.find((x) => x.customerId === where.customerId && x.status === 'ACTIVATED' && !x.archivedAt);
  return c ? { id: 'card-x' } : null;
});

jest.mock('@/lib/prisma', () => ({
  prisma: {
    qRCode: { findUnique: (...a: unknown[]) => qrFindUnique(...(a as [never])) },
    physicalCard: {
      findUnique: (...a: unknown[]) => cardFindUnique(...(a as [never])),
      findFirst: (...a: unknown[]) => cardFindFirst(...(a as [never])),
    },
    feedback: {
      findFirst: jest.fn(async () => (db.lastFeedbackAt ? { createdAt: db.lastFeedbackAt } : null)),
    },
    analyticsEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.events.push(data);
        return data;
      }),
    },
  },
  isPrismaConnectivityError: () => false,
}));

function qr(over: Partial<QrRow> = {}): QrRow {
  return {
    id: 'qr1',
    code: 'AB12CD34',
    name: 'Masa 5',
    isActive: true,
    expiresAt: null,
    revokedAt: null,
    archivedAt: null,
    dealerId: 'd1',
    location: null,
    dealer: { name: 'Ali Veli', businessName: 'Kahve Durağı', businessLogo: 'https://cdn.example/logo.png' },
    ...over,
  };
}

async function call(body: unknown) {
  const mod = await import('@/app/api/customer/scan/resolve/route');
  const req = new NextRequest('http://localhost/api/customer/scan/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res: Response = await mod.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  db.qrs = [];
  db.cards = [];
  db.lastFeedbackAt = null;
  db.events = [];
  qrFindUnique.mockClear();
  cardFindUnique.mockClear();
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'u1', role: 'CUSTOMER' } } });
});

describe('yetki ve doğrulama', () => {
  it('müşteri olmayan rol 403', async () => {
    mockRequireAuth.mockResolvedValue({
      error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    });
    const r = await call({ text: 'AB12CD34', source: 'manual' });
    expect(r.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('kaynaksız gövde 400 VALIDATION', async () => {
    const r = await call({ text: 'AB12CD34' });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION');
  });
});

describe('mekân QR çözümü', () => {
  it('geçerli QR → mekân kimliği, son ziyaret; qr_scanned yazılmaz', async () => {
    db.qrs = [qr({ location: { name: 'Kadıköy' } })];
    db.lastFeedbackAt = new Date('2026-10-01T10:00:00Z');
    const r = await call({ text: 'https://qratex.com/feedback/AB12CD34', source: 'camera' });
    expect(r.status).toBe(200);
    expect(r.json.data.result).toEqual({
      kind: 'venue',
      status: 'ok',
      code: 'AB12CD34',
      venue: {
        name: 'Kahve Durağı',
        logoUrl: 'https://cdn.example/logo.png',
        placeLabel: 'Kadıköy',
        lastVisitAt: '2026-10-01T10:00:00.000Z',
      },
    });
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({
      userId: 'u1',
      event: 'in_app_scan_resolved',
      category: 'qr',
      data: { source: 'camera', outcome: 'venue:ok' },
    });
    expect(db.events.some((e) => e.event === 'qr_scanned')).toBe(false);
  });

  it('şube yoksa QR adı yer etiketi olur; ilk ziyaret null', async () => {
    db.qrs = [qr()];
    const r = await call({ text: 'AB12CD34', source: 'manual' });
    expect(r.json.data.result.venue).toMatchObject({ placeLabel: 'Masa 5', lastVisitAt: null });
  });

  it.each([
    [{ archivedAt: new Date('2026-01-01') }, 'archived'],
    [{ isActive: false }, 'inactive'],
    [{ expiresAt: new Date('2020-01-01') }, 'expired'],
    [{ revokedAt: new Date('2026-01-01') }, 'revoked'],
  ] as const)('%o → %s (mekân bilgisi dönmez)', async (over, status) => {
    db.qrs = [qr(over as Partial<QrRow>)];
    const r = await call({ text: 'AB12CD34', source: 'manual' });
    expect(r.json.data.result).toEqual({ kind: 'venue', status, code: 'AB12CD34' });
  });

  it('küçük harfle elle giriş büyük harf adayıyla bulunur', async () => {
    db.qrs = [qr()];
    const r = await call({ text: 'ab12cd34', source: 'manual' });
    expect(r.json.data.result).toMatchObject({ kind: 'venue', status: 'ok', code: 'AB12CD34' });
  });

  it('bulunamayan kod → not_found', async () => {
    const r = await call({ text: 'ZZ99ZZ99', source: 'manual' });
    expect(r.json.data.result).toEqual({ kind: 'venue', status: 'not_found', code: 'ZZ99ZZ99' });
  });

  it('tanınmayan QR (Wi-Fi) → unknown, DB sorgusu yok', async () => {
    const r = await call({ text: 'WIFI:S:Kafe;T:WPA;P:12345678;;', source: 'camera' });
    expect(r.json.data.result).toEqual({ kind: 'unknown' });
    expect(qrFindUnique).not.toHaveBeenCalled();
    expect(cardFindUnique).not.toHaveBeenCalled();
    expect(db.events[0]).toMatchObject({ data: { outcome: 'unknown' } });
  });
});

describe('kart çözümü', () => {
  const TOKEN = 'Ab3dEf9hJk2mNp4qRs6tU';

  it('kullanılmamış kart (bağlantı) → unused, başka kartı var bilgisi', async () => {
    db.cards = [
      { token: TOKEN, status: 'UNUSED', customerId: null, archivedAt: null },
      { token: 'OTHERTOKEN1234567890ab', status: 'ACTIVATED', customerId: 'u1', archivedAt: null },
    ];
    const r = await call({ text: `https://qratex.com/c/${TOKEN}`, source: 'camera' });
    expect(r.json.data.result).toEqual({ kind: 'card', state: 'unused', token: TOKEN, hasOtherCard: true });
  });

  it('düz token: QR değilse karta düşer', async () => {
    db.cards = [{ token: TOKEN, status: 'UNUSED', customerId: null, archivedAt: null }];
    const r = await call({ text: TOKEN, source: 'manual' });
    expect(r.json.data.result).toMatchObject({ kind: 'card', state: 'unused', hasOtherCard: false });
  });

  it.each([
    [{ status: 'ACTIVATED', customerId: 'u1', archivedAt: null }, 'mine'],
    [{ status: 'ACTIVATED', customerId: 'u2', archivedAt: null }, 'taken'],
    [{ status: 'ACTIVATED', customerId: null, archivedAt: null }, 'taken'],
    [{ status: 'BLOCKED', customerId: 'u1', archivedAt: null }, 'blocked'],
    [{ status: 'UNUSED', customerId: null, archivedAt: new Date('2026-01-01') }, 'not_found'],
  ] as const)('%o → %s; sahibin kimliği dönmez', async (row, state) => {
    db.cards = [{ token: TOKEN, ...row }];
    const r = await call({ text: `https://qratex.com/c/${TOKEN}`, source: 'camera' });
    expect(r.json.data.result).toEqual({ kind: 'card', state, token: TOKEN, hasOtherCard: false });
    expect(JSON.stringify(r.json)).not.toContain('u2');
  });

  it('olmayan kart bağlantısı → not_found', async () => {
    const r = await call({ text: `https://qratex.com/c/${TOKEN}`, source: 'gallery' });
    expect(r.json.data.result).toEqual({ kind: 'card', state: 'not_found', token: TOKEN, hasOtherCard: false });
  });
});

describe('sunucu özeti yardımcıları', () => {
  it('son mekânlar işletme başına tekilleşir, en yeni önce, sınırlı', async () => {
    const { pickRecentVenues } = await import('@/app/customer/scan/_server/scan-summary');
    const row = (dealerId: string, iso: string, businessName: string | null = `İşletme ${dealerId}`) => ({
      createdAt: new Date(iso),
      qrCode: {
        name: 'Masa',
        dealerId,
        location: null,
        dealer: { name: `Sahip ${dealerId}`, businessName, businessLogo: null },
      },
    });
    const out = pickRecentVenues(
      [
        row('a', '2026-10-09T10:00:00Z'),
        row('a', '2026-10-01T10:00:00Z'),
        row('b', '2026-10-08T10:00:00Z', null),
        { createdAt: new Date('2026-10-07T10:00:00Z'), qrCode: null },
        row('c', '2026-10-06T10:00:00Z'),
        row('d', '2026-10-05T10:00:00Z'),
      ],
      3
    );
    expect(out.map((v) => v.dealerId)).toEqual(['a', 'b', 'c']);
    expect(out[0].lastVisitAt).toBe('2026-10-09T10:00:00.000Z');
    expect(out[1].name).toBe('Sahip b');
  });

  it('kalan geri bildirim puanı günlük ve haftalık tavanın küçüğü, negatif olmaz', async () => {
    const { remainingFeedbackPoints } = await import('@/app/customer/scan/_server/scan-summary');
    expect(remainingFeedbackPoints({ today: 0, week: 0 })).toBe(500);
    expect(remainingFeedbackPoints({ today: 450, week: 450 })).toBe(50);
    expect(remainingFeedbackPoints({ today: 100, week: 1950 })).toBe(50);
    expect(remainingFeedbackPoints({ today: 600, week: 600 })).toBe(0);
  });
});
