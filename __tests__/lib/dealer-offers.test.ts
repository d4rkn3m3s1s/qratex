/**
 * Teklifler (/dealer/offers) — kurallar, yazma servisleri ve BFF uçları.
 * Denetim: bayi/dealer_innovation.md (flash değer/süre/konum, durdurma, kişiye özel teklif B5).
 * Gerçek DB yok: prisma, oturum ve komşu servisler mock'lanır.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 9 })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/idempotency', () => ({
  checkIdempotency: jest.fn(async () => ({ cached: false, key: '' })),
  storeIdempotency: jest.fn(),
}));
const mockModuleBlocked = jest.fn(async () => null as unknown);
jest.mock('@/lib/module-gate', () => ({
  assertModuleEnabled: (...a: unknown[]) => mockModuleBlocked(...(a as [])),
  getModuleControls: jest.fn(async () => ({})),
}));
const mockCfg = jest.fn(async () => ({ features: { flashOffers: true } }));
jest.mock('@/lib/innovation-config', () => ({ getInnovationPlatformConfig: () => mockCfg() }));
jest.mock('@/lib/churn-intervention-core', () => ({ EXCLUDE_LEGACY_CHURN_FLASH: { NOT: { title: 'Seni özledik 🎁' } } }));
const mockStats = jest.fn();
jest.mock('@/lib/dealer-customer-stats', () => ({ getDealerCustomerStats: (...a: unknown[]) => mockStats(...a) }));
const mockAudience = jest.fn();
jest.mock('@/lib/marketing-delivery', () => ({ resolveMarketingAudience: (...a: unknown[]) => mockAudience(...a) }));
const mockCreateRemedy = jest.fn();
jest.mock('@/lib/remedy-offer-service', () => {
  class RemedyOfferError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 409) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    REMEDY_OPEN_STATUSES: ['pending', 'awaiting_dealer_approval'],
    RemedyOfferError,
    isRemedyOfferError: (e: unknown) => e instanceof RemedyOfferError,
    createRemedyOffer: (...a: unknown[]) => mockCreateRemedy(...a),
  };
});

const tx = {
  $executeRaw: jest.fn(async () => 1),
  dealerFlashOffer: { count: jest.fn(), create: jest.fn() },
  happyHour: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn(async () => ({})) },
};
const prismaMock = {
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  dealerFlashOffer: { findFirst: jest.fn(), findMany: jest.fn(async () => []), updateMany: jest.fn(), count: jest.fn(async () => 0) },
  customerFavoriteDealer: { count: jest.fn(async () => 0) },
  happyHour: { findMany: jest.fn(async () => []) },
  remedyTemplate: { findMany: jest.fn(async () => []) },
  remedyOffer: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []), count: jest.fn(async () => 0) },
  auditLog: { create: jest.fn(async () => ({})) },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock, isPrismaConnectivityError: () => false }));

import {
  dealerHappyHourSchema,
  flashCreateSchema,
  flashStatus,
  foldTr,
  istanbulWallToUtc,
  resolveFlashWindow,
  utcToIstanbulWall,
} from '@/lib/dealer/offers/rules';
import { createFlashOffer, personalRef, sendPersonalOffer, stopFlashOffer } from '@/lib/dealer/offers/mutations.server';

const AUDIT = { ipAddress: null, userAgent: null };
const base = { title: 'Kahve molası', body: 'Tüm filtre kahvelerde geçerli.', durationMinutes: 30, startMode: 'now' as const, startAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: 'dealer-1', role: 'DEALER' } } });
  mockCfg.mockResolvedValue({ features: { flashOffers: true } });
  mockModuleBlocked.mockResolvedValue(null);
});

describe('flash teklif şeması (değer sınırları — eski "0 || 10" ve %500 hatası)', () => {
  it.each([
    [{ offerType: 'PERCENT', value: 0 }, false],
    [{ offerType: 'PERCENT', value: -20 }, false],
    [{ offerType: 'PERCENT', value: 500 }, false],
    [{ offerType: 'PERCENT', value: 12.5 }, false],
    [{ offerType: 'PERCENT', value: null }, false],
    [{ offerType: 'PERCENT', value: 15 }, true],
    [{ offerType: 'FIXED_TRY', value: 5001 }, false],
    [{ offerType: 'FIXED_TRY', value: 50 }, true],
    [{ offerType: 'COMPLIMENTARY', value: 10 }, false],
    [{ offerType: 'COMPLIMENTARY', value: null }, true],
  ])('%j → geçerli=%s', (patch, ok) => {
    expect(flashCreateSchema.safeParse({ ...base, ...patch }).success).toBe(ok);
  });

  it('süre listeden olmalı; planlıda başlangıç zorunlu', () => {
    expect(flashCreateSchema.safeParse({ ...base, offerType: 'PERCENT', value: 10, durationMinutes: 45 }).success).toBe(false);
    expect(flashCreateSchema.safeParse({ ...base, offerType: 'PERCENT', value: 10, startMode: 'at' }).success).toBe(false);
    expect(
      flashCreateSchema.safeParse({ ...base, offerType: 'PERCENT', value: 10, startMode: 'at', startAt: '2026-10-11T18:00' }).success
    ).toBe(true);
  });
});

describe('İstanbul duvar saati ve pencere (sunucu otoriter)', () => {
  it('18:00 İstanbul = 15:00 UTC; gidiş-dönüş tutarlı', () => {
    expect(istanbulWallToUtc('2026-10-10T18:00')?.toISOString()).toBe('2026-10-10T15:00:00.000Z');
    expect(utcToIstanbulWall(new Date('2026-10-10T15:00:00Z'))).toBe('2026-10-10T18:00');
    expect(istanbulWallToUtc('2026-02-30T10:00')).toBeNull();
  });

  const now = new Date('2026-10-10T12:00:00Z'); // 15:00 İstanbul
  it('hemen: pencere = süre', () => {
    const r = resolveFlashWindow({ startMode: 'now', startAt: null, durationMinutes: 60 }, now);
    expect(r.ok && r.validTo.getTime() - r.validFrom.getTime()).toBe(3_600_000);
  });
  it('geçmiş ya da 7 günden ileri reddedilir', () => {
    expect(resolveFlashWindow({ startMode: 'at', startAt: '2026-10-10T14:00', durationMinutes: 30 }, now).ok).toBe(false);
    expect(resolveFlashWindow({ startMode: 'at', startAt: '2026-10-18T15:00', durationMinutes: 30 }, now).ok).toBe(false);
    const ok = resolveFlashWindow({ startMode: 'at', startAt: '2026-10-11T09:00', durationMinutes: 30 }, now);
    expect(ok.ok && ok.validFrom.toISOString()).toBe('2026-10-11T06:00:00.000Z');
  });
});

describe('flashStatus ("aktif" listede süresi dolan görünmez)', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('durum türetilir', () => {
    expect(flashStatus({ isActive: true, validFrom: '2026-10-10T11:00:00Z', validTo: '2026-10-10T13:00:00Z' }, now)).toBe('live');
    expect(flashStatus({ isActive: true, validFrom: '2026-10-10T13:00:00Z', validTo: '2026-10-10T14:00:00Z' }, now)).toBe('scheduled');
    expect(flashStatus({ isActive: true, validFrom: '2026-10-10T09:00:00Z', validTo: '2026-10-10T10:00:00Z' }, now)).toBe('ended');
    expect(flashStatus({ isActive: false, validFrom: '2026-10-10T11:00:00Z', validTo: '2026-10-10T13:00:00Z' }, now)).toBe('stopped');
  });
});

describe('mutlu saat şeması ve Türkçe arama', () => {
  it('çarpan listeden, gün en az bir, başlangıç ≠ bitiş', () => {
    const ok = { name: 'Öğle', multiplier: 2, startTime: '12:00', endTime: '14:00', daysOfWeek: [5, 1, 1] };
    const parsed = dealerHappyHourSchema.parse(ok);
    expect(parsed.daysOfWeek).toEqual([1, 5]);
    expect(dealerHappyHourSchema.safeParse({ ...ok, multiplier: 10 }).success).toBe(false);
    expect(dealerHappyHourSchema.safeParse({ ...ok, daysOfWeek: [] }).success).toBe(false);
    expect(dealerHappyHourSchema.safeParse({ ...ok, endTime: '12:00' }).success).toBe(false);
  });
  it('foldTr İ/ı/ş duyarsız', () => {
    expect(foldTr('İsmail Şahin')).toBe(foldTr('ismail sahin'));
    expect(foldTr('IŞIK')).toBe('isik');
  });
});

describe('createFlashOffer', () => {
  const input = { ...base, offerType: 'PERCENT' as const, value: 15 };

  it('işletme adı yoksa 409 (müşteri listeleri adsız mekânı göstermez → sahte başarı olurdu)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'DEALER', latitude: null, longitude: null, businessName: '  ' });
    await expect(createFlashOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input, audit: AUDIT })).rejects.toMatchObject({
      code: 'BUSINESS_NAME_REQUIRED',
      status: 409,
    });
    expect(tx.dealerFlashOffer.create).not.toHaveBeenCalled();
  });

  it('açık teklif tavanı kilit altında sayılır → 409 FLASH_LIMIT', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'DEALER', latitude: 41, longitude: 29, businessName: 'Kafe' });
    tx.dealerFlashOffer.count.mockResolvedValueOnce(3);
    await expect(createFlashOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input, audit: AUDIT })).rejects.toMatchObject({ code: 'FLASH_LIMIT' });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.dealerFlashOffer.create).not.toHaveBeenCalled();
  });

  it('başarı: sunucu penceresi + geohash + denetim izi', async () => {
    const now = new Date('2026-10-10T12:00:00Z');
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'DEALER', latitude: 41, longitude: 29, businessName: 'Kafe' });
    tx.dealerFlashOffer.count.mockResolvedValueOnce(1);
    tx.dealerFlashOffer.create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'f1',
      validFrom: data.validFrom,
      validTo: data.validTo,
      isActive: true,
    }));
    const res = await createFlashOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input, audit: AUDIT, now });
    expect(res).toEqual({ id: 'f1', status: 'live', hasLocation: true });
    const data = tx.dealerFlashOffer.create.mock.calls[0][0].data;
    expect(data.value).toBe(15);
    expect(data.validTo.getTime() - data.validFrom.getTime()).toBe(30 * 60_000);
    expect(typeof data.geohash5).toBe('string');
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE_FLASH_OFFER' }) }));
  });
});

describe('stopFlashOffer', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('bitmiş teklif 409', async () => {
    prismaMock.dealerFlashOffer.findFirst.mockResolvedValueOnce({
      id: 'f1',
      isActive: true,
      validFrom: new Date('2026-10-10T09:00:00Z'),
      validTo: new Date('2026-10-10T10:00:00Z'),
    });
    await expect(stopFlashOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', offerId: 'f1', audit: AUDIT, now })).rejects.toMatchObject({
      code: 'ALREADY_ENDED',
    });
  });
  it('canlı teklif: kiracı + koşullu güncelleme, bitiş şimdiye çekilir', async () => {
    prismaMock.dealerFlashOffer.findFirst.mockResolvedValueOnce({
      id: 'f1',
      isActive: true,
      validFrom: new Date('2026-10-10T11:00:00Z'),
      validTo: new Date('2026-10-10T13:00:00Z'),
    });
    prismaMock.dealerFlashOffer.updateMany.mockResolvedValueOnce({ count: 1 });
    await stopFlashOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', offerId: 'f1', audit: AUDIT, now });
    expect(prismaMock.dealerFlashOffer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'f1', dealerId: 'dealer-1' } }));
    expect(prismaMock.dealerFlashOffer.updateMany).toHaveBeenCalledWith({
      where: { id: 'f1', dealerId: 'dealer-1', isActive: true, validTo: { gt: now } },
      data: { isActive: false, validTo: now },
    });
  });
});

describe('sendPersonalOffer (B5: hedef müşteriye bağlı kişisel teklif)', () => {
  const stat = (customerId: string) => ({ customerId, visitCount: 3, lastVisitAt: null });
  const input = { ref: personalRef('dealer-1', 'cust-1'), message: 'Bizi tercih ettiğiniz için teşekkürler!', types: ['discount' as const] };

  it('işletmeyi ziyaret etmemiş müşteri (ref eşleşmez) → 404', async () => {
    mockStats.mockResolvedValueOnce({ stats: [stat('cust-2')] });
    await expect(sendPersonalOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input, audit: AUDIT })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockCreateRemedy).not.toHaveBeenCalled();
  });

  it('başka bayinin ref’i bu bayide çözülmez', async () => {
    mockStats.mockResolvedValueOnce({ stats: [stat('cust-1')] });
    const foreign = { ...input, ref: personalRef('dealer-OTHER', 'cust-1') };
    await expect(sendPersonalOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input: foreign, audit: AUDIT })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('kampanya bildirimini kapatan müşteri → 409 CUSTOMER_OPTED_OUT', async () => {
    mockStats.mockResolvedValueOnce({ stats: [stat('cust-1')] });
    mockAudience.mockResolvedValueOnce({ ineligibleCount: 0, appUserIds: [], pushUserIds: [] });
    await expect(sendPersonalOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input, audit: AUDIT })).rejects.toMatchObject({
      code: 'CUSTOMER_OPTED_OUT',
      status: 409,
    });
    expect(mockCreateRemedy).not.toHaveBeenCalled();
  });

  it('başarı: kaynaksız kişisel kaynak, şablon allowlist’inden süzülmüş seçenekler, müşteriye gönder', async () => {
    mockStats.mockResolvedValueOnce({ stats: [stat('cust-1')] });
    mockAudience.mockResolvedValueOnce({ ineligibleCount: 0, appUserIds: ['cust-1'], pushUserIds: [] });
    prismaMock.remedyTemplate.findMany.mockResolvedValueOnce([
      { type: 'discount', label: 'İndirim', unit: '%', values: [10, 20] },
      { type: 'points', label: 'Puan', unit: 'puan', values: [100] },
    ]);
    mockCreateRemedy.mockResolvedValueOnce({ offerId: 'r1', status: 'pending', notificationSent: true });
    const res = await sendPersonalOffer({ dealerId: 'dealer-1', actorId: 'dealer-1', input, audit: AUDIT });
    expect(res).toEqual({ offerId: 'r1', status: 'pending' });
    const arg = mockCreateRemedy.mock.calls[0][0];
    expect(arg).toMatchObject({ source: { kind: 'personal' }, dealerId: 'dealer-1', userId: 'cust-1', mode: 'send', blockIfAccepted: false });
    expect(arg.options).toEqual([{ type: 'discount', label: 'İndirim', unit: '%', values: [10, 20] }]);
    expect(arg.createdMeta).toMatchObject({ trigger: 'dealer_personal' });
  });
});

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('BFF uçları (varsayılan reddet)', () => {
  it('POST /flash: yalnız DEALER istenir; şemasız gövde 400', async () => {
    const { POST } = await import('@/app/api/dealer/offers/flash/route');
    const res = await POST(req('/api/dealer/offers/flash', 'POST', { title: 'x', offerType: 'PERCENT', value: 500 }), {});
    expect(mockRequireAuth).toHaveBeenCalledWith(['DEALER']);
    expect(res.status).toBe(400);
  });

  it('POST /flash: platform ayarı kapalıysa 403 MODULE_DISABLED, yazma yok', async () => {
    mockCfg.mockResolvedValueOnce({ features: { flashOffers: false } });
    const { POST } = await import('@/app/api/dealer/offers/flash/route');
    const res = await POST(req('/api/dealer/offers/flash', 'POST', { ...base, offerType: 'PERCENT', value: 15 }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('MODULE_DISABLED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('PATCH /flash/[id]: yalnız { action: "stop" } kabul edilir', async () => {
    const { PATCH } = await import('@/app/api/dealer/offers/flash/[id]/route');
    const res = await PATCH(req('/api/dealer/offers/flash/f1', 'PATCH', { isActive: true }), { params: Promise.resolve({ id: 'f1' }) });
    expect(res.status).toBe(400);
  });

  it('POST /personal: telafi modülü kapalıysa 403', async () => {
    const { NextResponse } = await import('next/server');
    mockModuleBlocked.mockResolvedValueOnce(NextResponse.json({ success: false }, { status: 403 }));
    const { POST } = await import('@/app/api/dealer/offers/personal/route');
    const res = await POST(req('/api/dealer/offers/personal', 'POST', { ref: 'o_0123456789abcdef', message: 'Teşekkürler, size özel!', types: ['discount'] }), {});
    expect(res.status).toBe(403);
    expect(mockCreateRemedy).not.toHaveBeenCalled();
  });

  it('CUSTOMER rolü BFF’e erişemez', async () => {
    mockRequireAuth.mockResolvedValueOnce({ error: new Response(null, { status: 403 }) });
    const { GET } = await import('@/app/api/dealer/offers/route');
    const res = await GET(req('/api/dealer/offers', 'GET'), {});
    expect(res.status).toBe(403);
  });
});

describe('loadDealerOffers (bölüm bazlı durum — "hata = boş liste" yok)', () => {
  it('bir bölüm düşerse yalnız o bölüm error; flash kapalıysa disabled; diğerleri ready', async () => {
    const { loadDealerOffers } = await import('@/lib/dealer/offers/load.server');
    mockCfg.mockResolvedValueOnce({ features: { flashOffers: false } });
    prismaMock.happyHour.findMany.mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await loadDealerOffers('dealer-1', new Date('2026-10-10T12:00:00Z'));
    errSpy.mockRestore();
    expect(res.flash).toEqual({ status: 'disabled', reason: 'platform' });
    expect(res.happyHours.status).toBe('error');
    expect(res.personal.status).toBe('ready');
    expect(res.remedyTemplates.status).toBe('ready');
    expect(prismaMock.dealerFlashOffer.findMany).not.toHaveBeenCalled();
  });

  it('kişisel teklifler yalnız kaynaksız (feedback/yorum yok) ve bu bayinin kayıtları; şablon yoksa sistem varsayılanı açıkça işaretlenir', async () => {
    const { loadDealerOffers } = await import('@/lib/dealer/offers/load.server');
    prismaMock.user.findUnique.mockResolvedValueOnce({ latitude: null, longitude: null, businessName: 'Kafe' });
    const res = await loadDealerOffers('dealer-1', new Date('2026-10-10T12:00:00Z'));
    expect(prismaMock.remedyOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dealerId: 'dealer-1', feedbackId: null, consumptionReviewId: null } })
    );
    expect(res.flash.status === 'ready' && res.flash.data.hasLocation).toBe(false);
    expect(res.remedyTemplates.status === 'ready' && res.remedyTemplates.data.usingSystemDefault).toBe(true);
  });
});
