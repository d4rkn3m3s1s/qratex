/**
 * Bayi tüketim kapıları — route testleri (P0-13, P0-18, P0-21).
 *
 *  - PATCH /api/dealer/offline-sync: payload istemciden DEĞİL DB'den okunur; SYNCED öğe tekrar
 *    işlenmez; CAS sahiplenmesi kaybedilirse işlenmez; SCAN_CARD öğeleri ölür; kalıcı hata
 *    DEAD, oran sınırı deneme hakkı yakmaz; tüketim ortak servisle `offline:<id>` anahtarıyla.
 *  - POST /api/dealer/offline-sync: yalnız CREATE_CONSUMPTION + şemalı payload.
 *  - POST /api/happy-hour: 1.000.000× çarpan 400.
 *  - (Sezon kampanyası yazım kapıları /admin/campaigns-calendar BFF'ine taşındı:
 *    __tests__/lib/campaigns-calendar.test.ts)
 *  - POST /api/dealer/consumptions: Idempotency-Key başlığı servise clientOpId olarak gider.
 * Gerçek DB'ye GİDİLMEZ.
 */
import { NextRequest } from 'next/server';

const mockAfter = jest.fn();
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (...a: unknown[]) => mockAfter(...a) };
});

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: jest.fn(async () => null) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
const mockRateLimit = jest.fn();
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: (...a: unknown[]) => mockRateLimit(...a) }));

const mockCreateConsumption = jest.fn();
const mockSideEffects = jest.fn();
jest.mock('@/lib/consumption/service', () => {
  const actual = jest.requireActual('@/lib/consumption/service');
  return {
    ...actual,
    createConsumption: (...a: unknown[]) => mockCreateConsumption(...a),
    runConsumptionSideEffects: (...a: unknown[]) => mockSideEffects(...a),
  };
});

const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma, isPrismaConnectivityError: () => false }));

import { ConsumptionError } from '@/lib/consumption/service';

const DEALER = 'dealer_1';
const QID = 'queue_item_1';

function req(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function resetPrisma(extra: Record<string, unknown>) {
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, extra);
}

const okResult = (duplicate = false) => ({
  consumption: { id: 'cons_1', amount: 100 },
  duplicate,
  customerId: 'cust_1',
  passive: { requested: 5, credited: 5, capped: false, combinedMultiplier: 1, happyHourId: null, seasonalCampaignId: null },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: DEALER, role: 'DEALER' } } });
  mockRateLimit.mockResolvedValue({ ok: true });
});

describe('PATCH /api/dealer/offline-sync', () => {
  function queue(row: Record<string, unknown> | null, claimCount = 1) {
    const updateMany = jest.fn().mockResolvedValueOnce({ count: claimCount }).mockResolvedValue({ count: 1 });
    resetPrisma({
      offlineQueue: {
        findFirst: jest.fn(async () => row),
        updateMany,
      },
    });
    return updateMany;
  }
  const pendingRow = {
    id: QID,
    action: 'CREATE_CONSUMPTION',
    payload: { cardToken: 'tok_db', amount: 40 },
    status: 'PENDING',
    retries: 0,
  };

  async function patch(body: unknown) {
    const { PATCH } = await import('@/app/api/dealer/offline-sync/route');
    return PATCH(req('/api/dealer/offline-sync', 'PATCH', body));
  }

  it('saldırı: gövdedeki action/payload YOK SAYILIR, DB payload’ı offline:<id> anahtarıyla işlenir', async () => {
    const updateMany = queue(pendingRow);
    mockCreateConsumption.mockResolvedValue(okResult());
    const res = await patch({
      items: [{ id: QID, action: 'CREATE_CONSUMPTION', payload: { cardToken: 'victim', amount: -999999 }, retries: -50 }],
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(mockCreateConsumption).toHaveBeenCalledTimes(1);
    expect(mockCreateConsumption.mock.calls[0][0]).toEqual({ cardToken: 'tok_db', amount: 40, clientOpId: `offline:${QID}` });
    expect(mockCreateConsumption.mock.calls[0][1]).toMatchObject({ dealerId: DEALER, channel: 'offline' });
    // CAS sahiplenmesi: status + retries koşullu
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { id: QID, dealerId: DEALER, status: { in: ['PENDING', 'FAILED'] }, retries: 0 },
      data: { retries: { increment: 1 } },
    });
    expect(updateMany.mock.calls[1][0].data).toMatchObject({ status: 'SYNCED' });
    expect(data.results[0]).toMatchObject({ id: QID, success: true, consumptionId: 'cons_1' });
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it('SYNCED öğe tekrar oynatılamaz (aynı kuyruk id’siyle sınırsız tüketim kapandı)', async () => {
    queue({ ...pendingRow, status: 'SYNCED' });
    const data = await (await patch({ ids: [QID, QID, QID] })).json();
    expect(mockCreateConsumption).not.toHaveBeenCalled();
    expect(data.results).toHaveLength(1); // kimlikler tekilleşir
    expect(data.results[0]).toMatchObject({ skipped: true });
  });

  it('eşzamanlı ikinci senkronizasyon CAS’ı kaybederse işlemez', async () => {
    queue(pendingRow, 0);
    const data = await (await patch({ ids: [QID] })).json();
    expect(mockCreateConsumption).not.toHaveBeenCalled();
    expect(data.results[0]).toMatchObject({ success: false, skipped: true });
  });

  it('deneme hakkı dolmuş / DEAD öğe işlenmez', async () => {
    queue({ ...pendingRow, status: 'FAILED', retries: 5 });
    await patch({ ids: [QID] });
    queue({ ...pendingRow, status: 'DEAD' });
    await patch({ ids: [QID] });
    expect(mockCreateConsumption).not.toHaveBeenCalled();
  });

  it('eski SCAN_CARD öğesi işlenmez ve DEAD olur (BLOCKED kart e-posta sızıntısı kapandı)', async () => {
    const updateMany = queue({ ...pendingRow, action: 'SCAN_CARD' });
    const data = await (await patch({ ids: [QID] })).json();
    expect(mockCreateConsumption).not.toHaveBeenCalled();
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: 'DEAD' });
    expect(data.results[0]).toMatchObject({ success: false });
    expect(JSON.stringify(data)).not.toContain('email');
  });

  it('kalıcı hata (bloklu kart) → DEAD; oran sınırı → deneme hakkı geri verilir', async () => {
    let updateMany = queue(pendingRow);
    mockCreateConsumption.mockRejectedValueOnce(new ConsumptionError('CARD_BLOCKED', 'Bu kart bloklanmış'));
    let data = await (await patch({ ids: [QID] })).json();
    expect(updateMany.mock.calls[1][0].data).toMatchObject({ status: 'DEAD' });
    expect(data.results[0]).toMatchObject({ success: false, code: 'CARD_BLOCKED' });

    updateMany = queue(pendingRow);
    mockCreateConsumption.mockRejectedValueOnce(new ConsumptionError('RATE_LIMITED', 'Çok hızlı!', { retryAfterSec: 5 }));
    data = await (await patch({ ids: [QID] })).json();
    expect(updateMany.mock.calls[1][0]).toEqual({
      where: { id: QID, dealerId: DEALER, retries: 1 },
      data: { retries: { decrement: 1 }, error: 'Çok hızlı!' },
    });
    expect(data.results[0]).toMatchObject({ retryable: true });
  });

  it('başka bayinin kuyruk öğesi bulunamaz', async () => {
    queue(null);
    const data = await (await patch({ ids: [QID] })).json();
    expect(data.results[0]).toMatchObject({ success: false, error: 'Kayıt bulunamadı veya yetkisiz' });
  });

  it('kimlik listesi yoksa 400', async () => {
    queue(pendingRow);
    expect((await patch({ foo: 1 })).status).toBe(400);
  });
});

describe('POST /api/dealer/offline-sync', () => {
  async function post(body: unknown) {
    resetPrisma({
      offlineQueue: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: { data: unknown }) => ({ id: QID, ...(data as object) })),
      },
    });
    const { POST } = await import('@/app/api/dealer/offline-sync/route');
    return POST(req('/api/dealer/offline-sync', 'POST', body));
  }

  it('SCAN_CARD ve bilinmeyen işlem reddedilir', async () => {
    expect((await post({ action: 'SCAN_CARD', payload: { cardToken: 'x' } })).status).toBe(400);
    expect((await post({ action: 'X', payload: {} })).status).toBe(400);
  });
  it('negatif / sınırsız tutar kuyruğa giremez', async () => {
    expect((await post({ action: 'CREATE_CONSUMPTION', payload: { cardToken: 't', amount: -5 } })).status).toBe(400);
    expect((await post({ action: 'CREATE_CONSUMPTION', payload: { cardToken: 't', amount: '1e9' } })).status).toBe(400);
  });
  it('geçerli öğe; istemcinin clientOpId’si saklanmaz', async () => {
    const res = await post({ action: 'CREATE_CONSUMPTION', payload: { cardToken: 't', amount: 10, clientOpId: 'attacker-key-1' } });
    expect(res.status).toBe(200);
    const create = mockPrisma.offlineQueue.create as jest.Mock;
    expect(create.mock.calls[0][0].data.payload).toEqual({ cardToken: 't', amount: 10, productId: null, note: null });
  });
});

describe('POST /api/happy-hour', () => {
  async function post(body: unknown) {
    resetPrisma({
      happyHour: { count: jest.fn(async () => 0) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          happyHour: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'hh1', ...data })) },
          auditLog: { create: jest.fn(async () => ({ id: 'a1' })) },
        })
      ),
    });
    const { POST } = await import('@/app/api/happy-hour/route');
    return POST(req('/api/happy-hour', 'POST', body));
  }
  const valid = { name: 'Akşam', startTime: '17:00', endTime: '19:00', daysOfWeek: [1, 2] };

  it('saldırı: multiplier 1.000.000 → 400 (Türkçe mesaj)', async () => {
    const res = await post({ ...valid, multiplier: 1_000_000 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Çarpan en fazla 3 olabilir');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it('çarpan verilmezse 2, geçerli gövde kaydedilir', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).happyHour).toMatchObject({ multiplier: 2, dealerId: DEALER, daysOfWeek: [1, 2] });
  });
  it('müşteri rolü 403 (requireAuth)', async () => {
    const { NextResponse } = jest.requireActual('next/server');
    mockRequireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: 'Yetkisiz' }, { status: 403 }) });
    expect((await post(valid)).status).toBe(403);
  });
});

describe('POST /api/dealer/consumptions', () => {
  it('Idempotency-Key başlığı servise clientOpId olarak gider; duplicate yan etki çalıştırmaz', async () => {
    mockCreateConsumption.mockResolvedValue(okResult(true));
    const { POST } = await import('@/app/api/dealer/consumptions/route');
    const res = await POST(
      req('/api/dealer/consumptions', 'POST', { cardToken: 'tok', amount: 10 }, { 'Idempotency-Key': 'scan-0123456789' })
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(mockCreateConsumption.mock.calls[0][0]).toMatchObject({ cardToken: 'tok', clientOpId: 'scan-0123456789' });
    expect(data).toMatchObject({ success: true, duplicate: true });
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('servis hatası HTTP durumuna ve Retry-After başlığına çevrilir', async () => {
    mockCreateConsumption.mockRejectedValue(new ConsumptionError('RATE_LIMITED', 'Çok hızlı! Lütfen biraz bekleyin.', { retryAfterSec: 7 }));
    const { POST } = await import('@/app/api/dealer/consumptions/route');
    const res = await POST(req('/api/dealer/consumptions', 'POST', { cardToken: 'tok' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect((await res.json()).code).toBe('RATE_LIMITED');
  });
});
