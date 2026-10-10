/**
 * Anonim deneyim kartı — herkese açık okuma, sayım ve paylaşımı durdurma
 * (denetim: docs/audit/2026-10-08/musteri/experience_token.md).
 *  - B1: şablona uymayan (eski serbest metin) not GÖSTERİLMEZ.
 *  - B4: okuma sonucu ayrışır (ok / expired / not_found / disabled / unavailable), ham hata sızmaz.
 *  - B5: okuma yan etkisiz; sayım ayrı, tekil, paylaşanın kendi açışı sayılmaz.
 *  - B10: işletme adı yoksa bayinin kişisel adı dönmez; paylaşanın kimliği hiçbir DTO'da yok.
 *  - Paylaşımı durdurma yalnız sahibine; kayıt silinmez, süresi kapanır.
 * Gerçek DB'ye gidilmez.
 */
import { NextRequest } from 'next/server';

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: (...a: unknown[]) => mockGetServerSession(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
const mockRate = jest.fn(async (_bucket: string, _max?: number, _windowMs?: number) => ({ ok: true }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (bucket: string, max: number, windowMs: number) => mockRate(bucket, max, windowMs),
}));
jest.mock('@/lib/redis', () => ({ cachedJson: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn() }));
const modules: { value: Record<string, boolean> } = { value: {} };
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: async (key: string) => (modules.value[key] === false ? new Response('{}', { status: 403 }) : null),
  getModuleControls: async () => modules.value,
}));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));

const NOW = new Date('2026-10-10T09:00:00Z');
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';

type Row = Record<string, unknown> & { expiresAt: Date; dealer: Record<string, unknown> };
const db: { row: Row | null; throwOnFind: boolean; agg: { count: number; avg: number | null }; updates: unknown[] } = {
  row: null,
  throwOnFind: false,
  agg: { count: 0, avg: null },
  updates: [],
};

function baseRow(over: Partial<Row> = {}): Row {
  return {
    id: 'est_1',
    token: TOKEN,
    creatorId: 'cust_owner',
    caption: 'Gönül rahatlığıyla tavsiye ederim. · 5/5',
    mood: 'great',
    viewCount: 7,
    createdAt: new Date('2026-10-08T09:00:00Z'),
    expiresAt: new Date('2026-10-15T09:00:00Z'),
    dealer: {
      id: 'dealer_1',
      role: 'DEALER',
      businessName: 'Kahve Durağı',
      name: 'Ahmet Yılmaz',
      businessLogo: null,
      businessCategory: 'cafe',
      address: 'Moda Cad. 1, Kadıköy',
      latitude: 40.98,
      longitude: 29.02,
      businessHours: null,
      holidayMode: false,
      suspendedAt: null,
      anonymizedAt: null,
    },
    ...over,
  };
}

const mockUpdateMany = jest.fn(async (args: unknown) => {
  db.updates.push(args);
  return { count: db.row ? 1 : 0 };
});

jest.mock('@/lib/prisma', () => ({
  prisma: {
    experienceShareToken: {
      findUnique: jest.fn(async ({ select }: { select: Record<string, unknown> }) => {
        if (db.throwOnFind) throw new Error('boom');
        if (!db.row) return null;
        // Sayım yolu yalnız id/creatorId/expiresAt seçer.
        if (!('dealer' in select)) return { id: db.row.id, creatorId: db.row.creatorId, expiresAt: db.row.expiresAt };
        return db.row;
      }),
      updateMany: (args: unknown) => mockUpdateMany(args),
    },
    feedback: {
      aggregate: jest.fn(async () => ({ _count: { _all: db.agg.count }, _avg: { rating: db.agg.avg } })),
    },
    analyticsEvent: { create: jest.fn(async () => ({})) },
  },
  isPrismaConnectivityError: () => false,
}));

import {
  getPublicExperience,
  parseShareCaption,
  recordExperienceView,
  directionsUrl,
  revokeExperienceShare,
} from '@/lib/experience-share/public';
import { GET as readGET } from '@/app/api/public/experience-share/[token]/route';
import { POST as viewPOST } from '@/app/api/public/experience-share/[token]/view/route';
import { DELETE as revokeDELETE } from '@/app/api/customer/experience-share/[token]/route';

const ctx = { params: Promise.resolve({ token: TOKEN }) };

beforeEach(() => {
  jest.clearAllMocks();
  db.row = baseRow();
  db.throwOnFind = false;
  db.agg = { count: 0, avg: null };
  db.updates = [];
  modules.value = {};
  mockRate.mockImplementation(async () => ({ ok: true }));
  mockGetServerSession.mockResolvedValue(null);
});

describe('parseShareCaption — yalnız sunucu şablonu', () => {
  it('şablon + puan çözülür', () => {
    expect(parseShareCaption('Yolun düşerse mutlaka uğra. · 4/5')).toEqual({ key: 'try_it', rating: 4 });
  });
  it('SALDIRI (eski serbest metin): "%90 indirim, IBAN" → null (gösterilmez)', () => {
    expect(parseShareCaption('Bu hafta %90 indirim! IBAN: TR00 · 5/5')).toBeNull();
    expect(parseShareCaption('Bu hafta buradaydık — gelirsen şunu dene.')).toBeNull();
    expect(parseShareCaption(null)).toBeNull();
  });
});

describe('directionsUrl', () => {
  it('koordinat varsa onunla, yoksa adresle; (0,0) geçersiz', () => {
    expect(directionsUrl({ latitude: 41, longitude: 29, address: null, name: null })).toContain('destination=41,29');
    expect(directionsUrl({ latitude: 0, longitude: 0, address: 'Moda', name: 'Kafe' })).toContain(encodeURIComponent('Kafe, Moda'));
    expect(directionsUrl({ latitude: null, longitude: null, address: '  ', name: 'Kafe' })).toBeNull();
  });
});

describe('getPublicExperience — okuma (yan etkisiz)', () => {
  it('kart: şablon not, puan, kategori, yol tarifi; kişisel veri yok; sayaç ARTMAZ', async () => {
    const r = await getPublicExperience(TOKEN, { now: NOW });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.card.caption).toEqual({ key: 'recommend', rating: 5 });
    expect(r.card.venue.name).toBe('Kahve Durağı');
    expect(r.card.venue.category).toBe('kahve');
    expect(r.card.venue.directionsUrl).toContain('destination=40.98,29.02');
    expect(r.card.daysLeft).toBe(5);
    expect(r.isOwner).toBe(false);
    expect(JSON.stringify(r)).not.toContain('cust_owner');
    expect(JSON.stringify(r)).not.toContain('Ahmet');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('B10: işletme adı boşsa bayinin kişisel adı DÖNMEZ (null → arayüz genel etiket)', async () => {
    db.row = baseRow({ dealer: { ...baseRow().dealer, businessName: '  ' } });
    const r = await getPublicExperience(TOKEN, { now: NOW });
    expect(r.status === 'ok' && r.card.venue.name).toBeNull();
  });

  it('paylaşan kendi kartını açınca isOwner', async () => {
    const r = await getPublicExperience(TOKEN, { now: NOW, viewerId: 'cust_owner' });
    expect(r.status === 'ok' && r.isOwner).toBe(true);
  });

  it('süresi dolmuş → expired + mekân (kurtarma ekranı için)', async () => {
    db.row = baseRow({ expiresAt: new Date('2026-10-09T09:00:00Z') });
    const r = await getPublicExperience(TOKEN, { now: NOW });
    expect(r).toEqual({ status: 'expired', venue: { id: 'dealer_1', name: 'Kahve Durağı', logo: null, category: 'kahve' } });
  });

  it('askıdaki bayi → not_found; olmayan/biçimsiz token → not_found (DB\'ye gitmeden)', async () => {
    db.row = baseRow({ dealer: { ...baseRow().dealer, suspendedAt: new Date() } });
    expect((await getPublicExperience(TOKEN, { now: NOW })).status).toBe('not_found');
    expect((await getPublicExperience('../etc', { now: NOW })).status).toBe('not_found');
  });

  it('modül kapalı → disabled', async () => {
    modules.value = { experiences: false };
    expect((await getPublicExperience(TOKEN, { now: NOW })).status).toBe('disabled');
  });

  it('B4: DB hatası → unavailable (ham hata sızmaz)', async () => {
    db.throwOnFind = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await getPublicExperience(TOKEN, { now: NOW })).status).toBe('unavailable');
    spy.mockRestore();
  });

  it('sosyal kanıt yalnız yeterli örneklemde (≥5)', async () => {
    db.agg = { count: 4, avg: 4.8 };
    let r = await getPublicExperience(TOKEN, { now: NOW });
    expect(r.status === 'ok' && r.card.stats).toBeNull();
    db.agg = { count: 12, avg: 4.567 };
    r = await getPublicExperience(TOKEN, { now: NOW });
    expect(r.status === 'ok' && r.card.stats).toEqual({ feedbackCount: 12, avgRating: 4.6, windowDays: 30 });
  });
});

describe('recordExperienceView — tekil sayım', () => {
  const input = { viewerId: null, ip: '1.2.3.4', userAgent: 'UA', now: NOW };

  it('ilk görüntüleme sayılır (cihaz özeti, ham IP kovada yok)', async () => {
    expect(await recordExperienceView(TOKEN, input)).toEqual({ counted: true });
    const bucket = mockRate.mock.calls[0][0] as string;
    expect(bucket).toMatch(/^exp-view:est_1:d:[0-9a-f]{24}$/);
    expect(bucket).not.toContain('1.2.3.4');
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'est_1', expiresAt: { gt: NOW } },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('aynı cihaz 24 saat içinde tekrar → sayılmaz', async () => {
    mockRate.mockImplementationOnce(async () => ({ ok: false }));
    expect(await recordExperienceView(TOKEN, input)).toEqual({ counted: false, reason: 'duplicate' });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('paylaşanın kendi açışı sayılmaz', async () => {
    expect(await recordExperienceView(TOKEN, { ...input, viewerId: 'cust_owner' })).toEqual({ counted: false, reason: 'owner' });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('süresi dolmuş kart sayılmaz', async () => {
    db.row = baseRow({ expiresAt: new Date('2026-10-01T00:00:00Z') });
    expect(await recordExperienceView(TOKEN, input)).toEqual({ counted: false, reason: 'expired' });
  });
});

describe('revokeExperienceShare — yalnız sahip; silme yok', () => {
  it('süreyi şimdiye çeker, sahiplik where içinde', async () => {
    expect(await revokeExperienceShare(TOKEN, 'cust_owner', NOW)).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { token: TOKEN, creatorId: 'cust_owner', expiresAt: { gt: NOW } },
      data: { expiresAt: NOW },
    });
  });
});

describe('uçlar', () => {
  it('GET okuma: zarf v2, viewCount ve creatorId YOK, sayaç artmaz', async () => {
    const res = await readGET(new NextRequest(`http://localhost/api/public/experience-share/${TOKEN}`), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('ok');
    expect(body.data.card).not.toHaveProperty('viewCount');
    expect(JSON.stringify(body)).not.toContain('cust_owner');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('GET: süresi dolmuş → 410 SHARE_EXPIRED; yok → 404', async () => {
    db.row = baseRow({ expiresAt: new Date('2020-01-01T00:00:00Z') });
    let res = await readGET(new NextRequest(`http://localhost/api/public/experience-share/${TOKEN}`), ctx);
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe('SHARE_EXPIRED');
    db.row = null;
    res = await readGET(new NextRequest(`http://localhost/api/public/experience-share/${TOKEN}`), ctx);
    expect(res.status).toBe(404);
  });

  it('POST view: oturumdaki paylaşan sayılmaz; modül kapalıyken 403', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'cust_owner' } });
    let res = await viewPOST(new NextRequest(`http://localhost/api/public/experience-share/${TOKEN}/view`, { method: 'POST' }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ counted: false });

    modules.value = { experiences: false };
    res = await viewPOST(new NextRequest(`http://localhost/api/public/experience-share/${TOKEN}/view`, { method: 'POST' }), ctx);
    expect(res.status).toBe(403);
  });

  it('DELETE revoke: yalnız CUSTOMER; başkasının kartı → 404', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'cust_other', role: 'CUSTOMER' } } });
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    let res = await revokeDELETE(new NextRequest(`http://localhost/api/customer/experience-share/${TOKEN}`, { method: 'DELETE' }), ctx);
    expect(res.status).toBe(404);
    expect(mockUpdateMany.mock.calls[0][0]).toMatchObject({ where: { creatorId: 'cust_other' } });

    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'cust_owner', role: 'CUSTOMER' } } });
    res = await revokeDELETE(new NextRequest(`http://localhost/api/customer/experience-share/${TOKEN}`, { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ revoked: true });
  });
});
