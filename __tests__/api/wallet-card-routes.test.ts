/**
 * Cüzdan → Kartım sunucu uçları (my-card + lounge raporları).
 *  - BFF: açık DTO (bayi iç notu/tutar/blok gerekçesi yok), sentetik kart sorgu düzeyinde elenir,
 *    defter düşerse kart ekranı düşmez.
 *  - Kart işlemi: başkasının kartı 404; dondur → BLOCKED + CardAuditLog; yeni kod → token değişir,
 *    denetim izi eski kodun yalnız kuyruğunu tutar.
 *  - Doğum günü: rol kapısı, "bugüne ayarla + anında al" kapalı (TOO_RECENT), bonus yalnız
 *    `mintPoints` ile ve yıllık tek-kez anahtarıyla; hata kodları makine okunur.
 *  - /api/vip artık yan etkisiz (upsert/bildirim yok).
 *  - Google Wallet yapılandırılmamışsa 503 (eski "200 + fallback" sahte başarı değil).
 *  - Apple pass görselleri geçerli PNG (PassKit icon.png zorunlu).
 */
import { NextRequest } from 'next/server';
import zlib from 'zlib';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/request-metadata', () => ({
  getClientIp: () => '1.1.1.1',
  getAuditRequestMeta: () => ({ ipAddress: '1.1.1.1', userAgent: 'jest' }),
}));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/points-rules', () => ({
  getPointsMatrix: jest.fn(async () => ({})),
  getBirthdayBonusPoints: () => 500,
}));
jest.mock('@/lib/league-rules', () => {
  const core = jest.requireActual('@/lib/league-rules-core');
  return { getLeagueRules: jest.fn(async () => core.DEFAULT_LEAGUE_RULES) };
});
const mockMint = jest.fn();
jest.mock('@/lib/economy', () => ({ mintPoints: (...a: unknown[]) => mockMint(...a) }));

const tx = {
  physicalCard: { updateMany: jest.fn(), findUnique: jest.fn() },
  cardAuditLog: { create: jest.fn(async () => ({})) },
  userBirthday: { updateMany: jest.fn() },
  notification: { deleteMany: jest.fn(async () => ({})), create: jest.fn(async () => ({})) },
};
const db = {
  user: { findUnique: jest.fn() },
  physicalCard: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  consumption: { count: jest.fn(), findMany: jest.fn() },
  // Defter puanı tek ham sorgu (son işlemler alt sorguda) — diğer sorgularla paralel.
  $queryRaw: jest.fn(),
  userBirthday: { findUnique: jest.fn(), create: jest.fn() },
  userVIPStatus: { findUnique: jest.fn(), upsert: jest.fn() },
  notification: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
};
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

const asCustomer = (id = 'u1') => mockRequireAuth.mockResolvedValue({ session: { user: { id, role: 'CUSTOMER' } } });

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  asCustomer();
});

describe('GET /api/customer/wallet/card', () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ name: 'Ayşe Yılmaz', points: 1500, level: 3, vipStatus: null, birthday: null });
    db.physicalCard.findMany.mockResolvedValue([
      {
        id: 'c1',
        token: 'TOKENabc123456789xyzQ',
        status: 'ACTIVATED',
        activatedAt: new Date('2026-09-01Z'),
        blockReason: null,
        archivedAt: null,
        _count: { consumptions: 2 },
        consumptions: [{ createdAt: new Date('2026-10-01Z') }],
      },
    ]);
    db.consumption.count.mockResolvedValue(1);
    db.consumption.findMany.mockImplementation(async (args: { where: { review?: null } }) =>
      'review' in args.where
        ? [{ id: 'k2', createdAt: new Date('2026-10-02Z'), dealer: { businessName: 'Kafe' } }]
        : [
            { id: 'k1', createdAt: new Date('2026-10-01Z'), dealer: { businessName: 'Kafe' }, product: { name: 'Latte' }, review: { id: 'r' } },
            { id: 'k2', createdAt: new Date('2026-10-02Z'), dealer: { businessName: 'Kafe' }, product: null, review: null },
          ]
    );
    db.$queryRaw.mockResolvedValue([{ sourceId: 'k1', delta: 20 }]);
  });

  it('açık DTO + statü + bekleyen + defter puanı; sentetik kart sorguda elenir', async () => {
    const { GET } = await import('@/app/api/customer/wallet/card/route');
    const res = await GET(req('/api/customer/wallet/card'), {});
    const body = await res.json();
    expect(res.status).toBe(200);
    const d = body.data;
    expect(d.cards).toHaveLength(1);
    expect(Object.keys(d.cards[0]).sort()).toEqual(
      ['activatedAt', 'consumptionsCount', 'frozenByCustomer', 'id', 'lastUsedAt', 'status', 'token'].sort()
    );
    expect(d.status).toMatchObject({ points: 1500, league: { key: 'BASLANGIC' }, toNextLeague: 1500, vip: null });
    expect(d.pending).toEqual({ count: 1, items: [{ id: 'k2', createdAt: '2026-10-02T00:00:00.000Z', dealerName: 'Kafe' }] });
    expect(d.recent.map((r: { pointsEarned: number | null }) => r.pointsEarned)).toEqual([20, null]);
    expect(d.birthday).toMatchObject({ state: 'unset', bonusAmount: 500 });
    const where = db.physicalCard.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ customerId: 'u1', archivedAt: null });
    expect(JSON.stringify(where)).toContain('[KARAKTER-TEST]');
  });

  it('defter sorgusu düşerse puan gizlenir, yanıt yine 200', async () => {
    db.$queryRaw.mockRejectedValueOnce(new Error('relation does not exist'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { GET } = await import('@/app/api/customer/wallet/card/route');
    const res = await GET(req('/api/customer/wallet/card'), {});
    expect(res.status).toBe(200);
    expect((await res.json()).data.recent.every((r: { pointsEarned: unknown }) => r.pointsEarned === null)).toBe(true);
    warn.mockRestore();
  });

  it('müşteri olmayan → requireAuth reddi geçer (403)', async () => {
    mockRequireAuth.mockResolvedValueOnce({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) });
    const { GET } = await import('@/app/api/customer/wallet/card/route');
    const res = await GET(req('/api/customer/wallet/card'), {});
    expect(res.status).toBe(403);
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });
});

describe('POST /api/customer/wallet/card/:id', () => {
  const call = async (action: string, cardId = 'c1') => {
    const { POST } = await import('@/app/api/customer/wallet/card/[cardId]/route');
    const res = await POST(req(`/api/customer/wallet/card/${cardId}`, { method: 'POST', body: { action } }), {
      params: Promise.resolve({ cardId }),
    });
    return { status: res.status, body: await res.json() };
  };
  const card = { id: 'c1', token: 'OLDtoken1234567890abc', customerId: 'u1', status: 'ACTIVATED', blockReason: null, archivedAt: null };

  it('başkasının kartı → 404, yazım yok', async () => {
    db.physicalCard.findUnique.mockResolvedValue({ ...card, customerId: 'u2' });
    const r = await call('freeze');
    expect(r.status).toBe(404);
    expect(tx.physicalCard.updateMany).not.toHaveBeenCalled();
  });

  it('dondur → BLOCKED + müşteri gerekçesi + CardAuditLog', async () => {
    db.physicalCard.findUnique.mockResolvedValue(card);
    tx.physicalCard.updateMany.mockResolvedValue({ count: 1 });
    tx.physicalCard.findUnique.mockResolvedValue({ id: 'c1', status: 'BLOCKED' });
    const r = await call('freeze');
    expect(r.status).toBe(200);
    expect(tx.physicalCard.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'c1', customerId: 'u1', status: 'ACTIVATED', token: card.token },
      data: { status: 'BLOCKED', blockReason: 'Müşteri tarafından donduruldu' },
    });
    expect(tx.cardAuditLog.create.mock.calls[0][0].data).toMatchObject({ cardId: 'c1', userId: 'u1', action: 'BLOCKED' });
  });

  it('yeni kod → token değişir; denetimde yalnız eski kodun kuyruğu', async () => {
    db.physicalCard.findUnique.mockResolvedValue(card);
    tx.physicalCard.updateMany.mockResolvedValue({ count: 1 });
    tx.physicalCard.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVATED' });
    const r = await call('rotate');
    expect(r.status).toBe(200);
    const data = tx.physicalCard.updateMany.mock.calls[0][0].data;
    expect(typeof data.token).toBe('string');
    expect(data.token).not.toBe(card.token);
    const meta = tx.cardAuditLog.create.mock.calls[0][0].data;
    expect(meta.action).toBe('TOKEN_ROTATED');
    expect(meta.metadata.previousTokenTail).toBe(card.token.slice(-8));
    expect(JSON.stringify(meta)).not.toContain(card.token);
    expect(JSON.stringify(r.body)).not.toContain(data.token); // yeni kod yanıtta değil; sayfa BFF'ten okur
  });

  it('yarış: kart bu sırada değiştiyse 409', async () => {
    db.physicalCard.findUnique.mockResolvedValue(card);
    tx.physicalCard.updateMany.mockResolvedValue({ count: 0 });
    const r = await call('freeze');
    expect(r.status).toBe(409);
    expect(tx.cardAuditLog.create).not.toHaveBeenCalled();
  });

  it('geçersiz işlem → 400', async () => {
    const r = await call('delete');
    expect(r.status).toBe(400);
  });
});

describe('/api/birthday', () => {
  const post = async (body: unknown) => {
    const { POST } = await import('@/app/api/birthday/route');
    const res = await POST(req('/api/birthday', { method: 'POST', body }), {});
    return { status: res.status, body: await res.json() };
  };

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-06-10T08:00:00Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('rol kapısı CUSTOMER', async () => {
    db.userBirthday.findUnique.mockResolvedValue(null);
    await post({ action: 'claim' });
    expect(mockRequireAuth).toHaveBeenCalledWith(['CUSTOMER']);
  });

  it('tarih bugün kaydedildiyse → 400 TOO_RECENT, kredi yok', async () => {
    db.userBirthday.findUnique.mockResolvedValue({
      id: 'b1',
      birthDate: new Date(Date.UTC(1990, 5, 10)),
      createdAt: new Date('2026-06-10T07:00:00Z'),
      lastBonusAt: null,
    });
    const r = await post({ action: 'claim' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('TOO_RECENT');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('uygun → atomik guard + mintPoints (yıllık tek-kez anahtarı), points_credited elle yazılmaz', async () => {
    db.userBirthday.findUnique.mockResolvedValue({
      id: 'b1',
      birthDate: new Date(Date.UTC(1990, 5, 10)),
      createdAt: new Date('2025-01-01T00:00:00Z'),
      lastBonusAt: null,
    });
    tx.userBirthday.updateMany.mockResolvedValue({ count: 1 });
    mockMint.mockResolvedValue({ credited: 500, points: 2000, duplicate: false });
    const r = await post({ action: 'claim' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, pointsEarned: 500 });
    expect(mockMint.mock.calls[0][1]).toMatchObject({
      userId: 'u1',
      points: 500,
      source: 'birthday',
      idempotencyKey: 'birthday:u1:2026',
    });
    const guard = tx.userBirthday.updateMany.mock.calls[0][0].where;
    expect(guard.createdAt.lte).toBeInstanceOf(Date);
  });

  it('eşzamanlı ikinci istek (guard 0) → 409 ALREADY_CLAIMED', async () => {
    db.userBirthday.findUnique.mockResolvedValue({
      id: 'b1',
      birthDate: new Date(Date.UTC(1990, 5, 10)),
      createdAt: new Date('2025-01-01T00:00:00Z'),
      lastBonusAt: null,
    });
    tx.userBirthday.updateMany.mockResolvedValue({ count: 0 });
    const r = await post({ action: 'claim' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('ALREADY_CLAIMED');
    expect(mockMint).not.toHaveBeenCalled();
  });

  it('kayıtlı tarih değiştirilemez → 409 BIRTHDAY_LOCKED; gelecekteki tarih → 400', async () => {
    db.userBirthday.findUnique.mockResolvedValue({ id: 'b1' });
    expect((await post({ action: 'set', birthDate: '1990-01-01' })).body.code).toBe('BIRTHDAY_LOCKED');
    expect((await post({ action: 'set', birthDate: '2030-01-01' })).body.code).toBe('INVALID_DATE');
  });

  it('GET geriye uyumlu alanlar + kilit bilgisi', async () => {
    db.userBirthday.findUnique.mockResolvedValue({
      birthDate: new Date(Date.UTC(1990, 6, 1)),
      bonusGiven: false,
      lastBonusAt: null,
      createdAt: new Date('2025-01-01Z'),
    });
    const { GET } = await import('@/app/api/birthday/route');
    const body = await (await GET(req('/api/birthday'), {})).json();
    expect(body).toMatchObject({ success: true, isBirthdayToday: false, canClaimBonus: false, bonusAmount: 500, locked: true });
    expect(body.birthday.birthDate).toBe('1990-07-01T00:00:00.000Z');
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/vip — yan etkisiz', () => {
  it('upsert/bildirim yok; atanmamış → vip null', async () => {
    db.userVIPStatus.findUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/vip/route');
    const body = await (await GET(req('/api/vip'), {})).json();
    expect(body.data.vip).toBeNull();
    expect(db.userVIPStatus.upsert).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

describe('cüzdan entegrasyonu', () => {
  it('Google yapılandırılmamış → 503 (sahte başarı yok)', async () => {
    const { GET } = await import('@/app/api/wallet/google/route');
    const res = await GET(req('/api/wallet/google'), {});
    expect(res.status).toBe(503);
  });

  it('Apple: Team ID eksikse yapılandırılmış sayılmaz; pass görselleri geçerli PNG', async () => {
    const { isAppleWalletConfigured, passImageFiles, generateSerialNumber } = await import('@/lib/wallet');
    const base = {
      APPLE_PASS_CERT_P12_BASE64: 'x',
      APPLE_PASS_CERT_PASSWORD: 'x',
      APPLE_PASS_TYPE_IDENTIFIER: 'x',
      APPLE_WWDR_CERT_BASE64: 'x',
    } as unknown as NodeJS.ProcessEnv;
    expect(isAppleWalletConfigured(base)).toBe(false);
    expect(isAppleWalletConfigured({ ...base, APPLE_TEAM_IDENTIFIER: 'ABCDE12345' })).toBe(true);
    expect(generateSerialNumber('u', 'c')).toBe(generateSerialNumber('u', 'c'));

    const files = new Map(passImageFiles());
    const icon = files.get('icon.png')!;
    expect(icon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(icon.readUInt32BE(16)).toBe(29); // IHDR genişlik
    // IDAT çözülebilir ve satır uzunluğu doğru (29 piksel × 3 bayt + filtre baytı).
    const idatLen = icon.readUInt32BE(33);
    expect(icon.subarray(37, 41).toString('ascii')).toBe('IDAT');
    const raw = zlib.inflateSync(icon.subarray(41, 41 + idatLen));
    expect(raw.length).toBe(29 * (29 * 3 + 1));
    expect(files.has('icon@2x.png') && files.has('logo.png')).toBe(true);
  });
});
