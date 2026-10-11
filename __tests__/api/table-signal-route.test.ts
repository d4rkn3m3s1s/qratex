/**
 * Masa sinyali (p-kart-masa-offline) — POST /api/innovation/table-pulse + durum ucu.
 * Gerçek DB'ye gidilmez (prisma mock).
 *
 *  - Giriş: `qr` (önerilen) ve eski `dealerId`; QR yaşam döngüsü, özellik bayrağı, eksik bağlantı.
 *  - OK → yalnız TablePulse; vaka/bildirim YOK.
 *  - CONCERN → TablePulse + Incident(table_signal) + ekip bildirimi + takip anahtarı.
 *  - REQUEST → yalnız Incident(table_request) (TablePulse'a yazılmaz); vaka kuyruğu kapalıysa 409.
 *  - Aynı masa + tür 3 dk içinde: yeni vaka yok, mevcut takip döner.
 *  - Varsayılan anonim; `linkAccount` + müşteri oturumu → customerId.
 *  - Not: telefon/e-posta maskelenir.
 *  - IP × işletme sınırı → 429 RATE_LIMITED.
 *  - Durum ucu: geçersiz anahtar 404; çözülen vakada TablePulse.resolvedAt dolar.
 *  - Saf yardımcılar (kinds, status-key).
 */
import { NextRequest } from 'next/server';

process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-123456';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));

const rl = { venueOk: true };
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: async (key: string) =>
    key.startsWith('table-signal:ip-venue') && !rl.venueOk ? { ok: false, retryAfterMs: 30_000 } : { ok: true },
}));

const cfg = { tablePulse: true, incidents: true };
jest.mock('@/lib/innovation-config', () => ({
  getInnovationPlatformConfig: async () => ({ features: { tablePulse: cfg.tablePulse } }),
}));
jest.mock('@/lib/module-gate', () => ({
  getModuleControls: async () => ({ incidents: cfg.incidents }),
}));
const mockPush = jest.fn(async () => true);
jest.mock('@/lib/push', () => ({ sendPush: (...a: unknown[]) => mockPush(...(a as [])) }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: async () => ({ cached: false, key: '' }),
  storeIdempotency: async () => undefined,
}));

type Qr = {
  id: string;
  code: string;
  name: string;
  dealerId: string;
  isActive: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  location: { name: string } | null;
};
type Incident = {
  id: string;
  dealerId: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  metadata: Record<string, unknown>;
  severity: string;
};

const db = {
  qrs: [] as Qr[],
  dealers: [{ id: 'd1', name: 'Ali', businessName: 'Kahve Durağı', businessLogo: null }],
  pulses: [] as Array<Record<string, unknown>>,
  incidents: [] as Incident[],
  notifications: [] as Array<Record<string, unknown>>,
  staff: [{ userId: 's1' }],
};

function matchesMeta(meta: Record<string, unknown>, filter?: { path: string[]; equals: unknown }): boolean {
  if (!filter) return true;
  return meta[filter.path[0]] === filter.equals;
}

const prismaMock = {
  qRCode: {
    findUnique: jest.fn(async ({ where }: { where: { code: string } }) => db.qrs.find((q) => q.code === where.code) ?? null),
    findFirst: jest.fn(async ({ where }: { where: { id: string; dealerId: string } }) =>
      db.qrs.find((q) => q.id === where.id && q.dealerId === where.dealerId) ?? null
    ),
  },
  user: {
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) => db.dealers.find((d) => d.id === where.id) ?? null),
  },
  tablePulse: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `p${db.pulses.length + 1}`, resolvedAt: null, ...data };
      db.pulses.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.pulses.find((p) => p.id === where.id && p.resolvedAt === null);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
  },
  incident: {
    findFirst: jest.fn(
      async ({ where }: { where: { dealerId: string; type: string; createdAt: { gte: Date }; metadata?: { path: string[]; equals: unknown } } }) =>
        db.incidents
          .filter(
            (i) =>
              i.dealerId === where.dealerId &&
              i.type === where.type &&
              i.status !== 'resolved' &&
              i.createdAt >= where.createdAt.gte &&
              matchesMeta(i.metadata, where.metadata)
          )
          .at(-1) ?? null
    ),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => db.incidents.find((i) => i.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt'> }) => {
      const now = new Date();
      const row: Incident = { id: `i${db.incidents.length + 1}`, createdAt: now, updatedAt: now, resolvedAt: null, ...data };
      db.incidents.push(row);
      return row;
    }),
  },
  dealerStaff: { findMany: jest.fn(async () => db.staff) },
  notification: {
    createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      db.notifications.push(...data);
      return { count: data.length };
    }),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, isPrismaConnectivityError: () => false }));

function qr(over: Partial<Qr> = {}): Qr {
  return {
    id: 'qr1',
    code: 'AB12CD34',
    name: 'Masa 5',
    dealerId: 'd1',
    isActive: true,
    expiresAt: null,
    revokedAt: null,
    archivedAt: null,
    location: { name: 'Kadıköy' },
    ...over,
  };
}

async function post(body: unknown) {
  const mod = await import('@/app/api/innovation/table-pulse/route');
  const req = new NextRequest('http://localhost/api/innovation/table-pulse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
    body: JSON.stringify(body),
  });
  const res: Response = await mod.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, json: await res.json() };
}

async function status(ref: string, key: string) {
  const mod = await import('@/app/api/innovation/table-pulse/status/route');
  const req = new NextRequest(`http://localhost/api/innovation/table-pulse/status?ref=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`);
  const res: Response = await mod.GET(req, { params: Promise.resolve({}) });
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  db.qrs = [qr()];
  db.pulses = [];
  db.incidents = [];
  db.notifications = [];
  cfg.tablePulse = true;
  cfg.incidents = true;
  rl.venueOk = true;
  mockPush.mockClear();
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({ error: new Response('{}', { status: 401 }) });
});

describe('giriş çözümü', () => {
  it('bağlantısız istek 400 VALIDATION', async () => {
    const r = await post({ kind: 'OK' });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION');
  });

  it('bilinmeyen QR 404, iptal edilmiş/süresi dolmuş QR 409 QR_INACTIVE', async () => {
    expect((await post({ qr: 'ZZZZ9999', kind: 'OK' })).json.code).toBe('VENUE_NOT_FOUND');
    db.qrs = [qr({ revokedAt: new Date() })];
    const r = await post({ qr: 'AB12CD34', kind: 'OK' });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('QR_INACTIVE');
    db.qrs = [qr({ expiresAt: new Date(Date.now() - 1000) })];
    expect((await post({ qr: 'AB12CD34', kind: 'OK' })).json.code).toBe('QR_INACTIVE');
    expect(db.pulses).toHaveLength(0);
  });

  it('özellik kapalı → 403 FEATURE_DISABLED', async () => {
    cfg.tablePulse = false;
    const r = await post({ qr: 'AB12CD34', kind: 'OK' });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('FEATURE_DISABLED');
  });

  it('eski dealerId bağlantısı çalışır; bayi olmayan id 404', async () => {
    expect((await post({ dealerId: 'd1', mood: 'OK' })).status).toBe(201);
    expect((await post({ dealerId: 'nope', mood: 'OK' })).json.code).toBe('VENUE_NOT_FOUND');
    // Başka bayinin QR'ı eski bağlantıyla kullanılamaz.
    db.qrs = [qr({ id: 'qrX', dealerId: 'd2' })];
    expect((await post({ dealerId: 'd1', qrCodeId: 'qrX', mood: 'OK' })).json.code).toBe('VENUE_NOT_FOUND');
  });

  it('küçük harfle girilen QR kodu da çözülür', async () => {
    expect((await post({ qr: 'ab12cd34', kind: 'OK' })).status).toBe(201);
  });
});

describe('sinyal türleri', () => {
  it('OK → yalnız TablePulse; vaka ve bildirim yok', async () => {
    const r = await post({ qr: 'AB12CD34', kind: 'OK', tableCode: '  M7 ' });
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({ kind: 'OK', duplicate: false, tracking: null, teamNotified: false });
    expect(db.pulses).toEqual([expect.objectContaining({ mood: 'OK', tableCode: 'M7', dealerId: 'd1', qrCodeId: 'qr1', customerId: null })]);
    expect(db.incidents).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
  });

  it('CONCERN → TablePulse + vaka + bayi ve personele bildirim + takip anahtarı', async () => {
    const r = await post({
      qr: 'AB12CD34',
      kind: 'CONCERN',
      reasons: ['slow_service', 'wrong_order', 'slow_service'],
      tableCode: 'M7',
      note: 'Bana 0532 123 45 67 numarasından ulaşın, mail a@b.co',
    });
    expect(r.status).toBe(201);
    expect(r.json.data.stage).toBe('sent');
    expect(r.json.data.tracking).toEqual(expect.objectContaining({ ref: 'i1', key: expect.any(String) }));
    expect(db.pulses).toHaveLength(1);
    expect(db.pulses[0]).toMatchObject({ mood: 'CONCERN' });
    expect(String(db.pulses[0].note)).not.toMatch(/0532|a@b\.co/);
    const inc = db.incidents[0];
    expect(inc).toMatchObject({ type: 'table_signal', severity: 'medium', status: 'open' });
    expect(inc.title).toBe('Masa M7 · Sorun bildirildi: Servis yavaş, Sipariş yanlış');
    expect(inc.metadata).toMatchObject({ tablePulseId: 'p1', reasons: ['slow_service', 'wrong_order'], tableCode: 'M7' });
    expect(db.notifications.map((n) => n.userId).sort()).toEqual(['d1', 's1']);
    expect(db.notifications[0]).toMatchObject({ data: expect.objectContaining({ kind: 'table_signal', incidentId: 'i1' }) });
  });

  it('REQUEST (garson) → yalnız vaka; TablePulse yazılmaz (sağlık skoru bozulmaz)', async () => {
    const r = await post({ qr: 'AB12CD34', kind: 'REQUEST', requestType: 'waiter', tableCode: 'M3' });
    expect(r.status).toBe(201);
    expect(db.pulses).toHaveLength(0);
    expect(db.incidents[0]).toMatchObject({ type: 'table_request', severity: 'low', title: 'Masa M3 · Garson çağrısı' });
  });

  it('vaka kuyruğu kapalı: REQUEST 409, CONCERN kaydedilir + doğrudan bildirim, takip yok', async () => {
    cfg.incidents = false;
    const req = await post({ qr: 'AB12CD34', kind: 'REQUEST', requestType: 'bill' });
    expect(req.status).toBe(409);
    expect(req.json.code).toBe('REQUESTS_UNAVAILABLE');
    const c = await post({ qr: 'AB12CD34', kind: 'CONCERN', reasons: ['noise'] });
    expect(c.status).toBe(201);
    expect(c.json.data.tracking).toBeNull();
    expect(c.json.data.teamNotified).toBe(true);
    expect(db.incidents).toHaveLength(0);
    expect(db.pulses).toHaveLength(1);
  });

  it('aynı masa + tür kısa sürede: yeni vaka yok, mevcut takip döner', async () => {
    await post({ qr: 'AB12CD34', kind: 'REQUEST', requestType: 'waiter', tableCode: 'M7' });
    const again = await post({ qr: 'AB12CD34', kind: 'REQUEST', requestType: 'waiter', tableCode: 'm7' });
    expect(again.status).toBe(200);
    expect(again.json.data.duplicate).toBe(true);
    expect(again.json.data.tracking.ref).toBe('i1');
    expect(db.incidents).toHaveLength(1);
    // Farklı istek türü ayrı vakadır.
    await post({ qr: 'AB12CD34', kind: 'REQUEST', requestType: 'bill', tableCode: 'M7' });
    expect(db.incidents).toHaveLength(2);
  });
});

describe('gizlilik ve kötüye kullanım', () => {
  it('varsayılan anonim: oturum olsa bile linkAccount yoksa customerId yazılmaz', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'c1', role: 'CUSTOMER' } } });
    await post({ qr: 'AB12CD34', kind: 'OK' });
    expect(db.pulses[0].customerId).toBeNull();
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('linkAccount + müşteri oturumu → ilişkilendirilir', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'c1', role: 'CUSTOMER' } } });
    const r = await post({ qr: 'AB12CD34', kind: 'CONCERN', reasons: ['other'], linkAccount: true });
    expect(r.json.data.linked).toBe(true);
    expect(db.pulses[0].customerId).toBe('c1');
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('linkAccount ama oturum yok → anonim gider', async () => {
    const r = await post({ qr: 'AB12CD34', kind: 'OK', linkAccount: true });
    expect(r.status).toBe(201);
    expect(r.json.data.linked).toBe(false);
    expect(db.pulses[0].customerId).toBeNull();
  });

  it('IP × işletme sınırı aşılınca 429 RATE_LIMITED + Retry-After', async () => {
    rl.venueOk = false;
    const r = await post({ qr: 'AB12CD34', kind: 'OK' });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe('RATE_LIMITED');
    expect(db.pulses).toHaveLength(0);
  });
});

describe('misafir durum ucu', () => {
  it('geçersiz anahtar 404; geçerli anahtar aşamayı döner; çözülünce TablePulse kapanır', async () => {
    const r = await post({ qr: 'AB12CD34', kind: 'CONCERN', reasons: ['cleanliness'], tableCode: 'M1' });
    const { ref, key } = r.json.data.tracking as { ref: string; key: string };

    expect((await status(ref, 'ts1.1.bogus')).status).toBe(404);

    const s1 = await status(ref, key);
    expect(s1.status).toBe(200);
    expect(s1.json.data).toEqual({ stage: 'sent', updatedAt: expect.any(String) });
    expect(JSON.stringify(s1.json)).not.toMatch(/Masa|cleanliness|Kahve/);

    db.incidents[0].status = 'in_progress';
    expect((await status(ref, key)).json.data.stage).toBe('seen');

    db.incidents[0].status = 'resolved';
    db.incidents[0].resolvedAt = new Date('2026-10-10T10:00:00Z');
    expect((await status(ref, key)).json.data.stage).toBe('resolved');
    expect(db.pulses[0].resolvedAt).toEqual(new Date('2026-10-10T10:00:00Z'));
  });
});

describe('saf yardımcılar', () => {
  it('kinds: normalize, maske, aşama', async () => {
    const k = await import('@/lib/table-signal/kinds');
    expect(k.normalizeTableCode('   ')).toBeNull();
    expect(k.normalizeTableCode('a'.repeat(50))).toHaveLength(32);
    expect(k.normalizeReasons(['noise', 'x', 'noise', 'other'])).toEqual(['noise', 'other']);
    expect(k.sanitizeNote('Çorba soğuk, 2 kişiyiz')).toBe('Çorba soğuk, 2 kişiyiz');
    expect(k.sanitizeNote('ara +90 532 123 45 67')).toBe('ara [telefon gizlendi]');
    expect(k.stageOfIncidentStatus('open')).toBe('sent');
    expect(k.stageOfIncidentStatus('assigned')).toBe('seen');
    expect(k.stageOfIncidentStatus('resolved')).toBe('resolved');
  });

  it('status-key: imza, süre, kurcalama', async () => {
    const { signTrackingKey, verifyTrackingKey } = await import('@/lib/table-signal/status-key');
    const now = Date.now();
    const t = signTrackingKey('inc1', now)!;
    expect(verifyTrackingKey('inc1', t.key, now)).toBe(true);
    expect(verifyTrackingKey('inc2', t.key, now)).toBe(false);
    expect(verifyTrackingKey('inc1', t.key, now + 7 * 60 * 60_000)).toBe(false);
    expect(verifyTrackingKey('inc1', t.key.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), now)).toBe(false);
  });
});
