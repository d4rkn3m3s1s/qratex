/**
 * Seslerim BFF uçları — varsayılan reddet + kapsam + hata görünürlüğü.
 *  - Müşteri olmayan rol 403 (bayi/personel başka müşterinin seslerini okuyamaz).
 *  - Liste sorgusu oturumdaki kullanıcıya ve normalize edilmiş filtreye bağlanır.
 *  - Detayda başkasının/olmayan kayıt 404; moderasyonla kaldırılan 404 + VOICE_REMOVED.
 *  - Geçersiz anahtar 404 (sorgu hiç çalışmaz).
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true, remaining: 100 })) }));
jest.mock('@/lib/capture-api-error', () => ({ captureApiError: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

const mockList = jest.fn();
const mockDetail = jest.fn();
const mockSummary = jest.fn();
jest.mock('@/lib/customer-voices/server', () => {
  class VoiceNotFoundError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    listVoices: (...a: unknown[]) => mockList(...a),
    getVoiceDetail: (...a: unknown[]) => mockDetail(...a),
    getVoiceSummary: (...a: unknown[]) => mockSummary(...a),
    VoiceNotFoundError,
  };
});

import { GET as listGET } from '@/app/api/customer/voices/route';
import { GET as detailGET } from '@/app/api/customer/voices/[key]/route';
import { GET as summaryGET } from '@/app/api/customer/voices/summary/route';
import { VoiceNotFoundError } from '@/lib/customer-voices/server';

const CUSTOMER = { session: { user: { id: 'cust-1', role: 'CUSTOMER' } } };
const req = (url: string) => new NextRequest(`http://localhost${url}`);
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(CUSTOMER);
});

describe('GET /api/customer/voices', () => {
  it('yalnız CUSTOMER rolü istenir', async () => {
    mockList.mockResolvedValue({ items: [], nextCursor: null });
    await listGET(req('/api/customer/voices'), ctx({}));
    expect(mockRequireAuth.mock.calls[0][0]).toEqual(['CUSTOMER']);
  });

  it('rol reddi 403 ve veri okunmaz', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const res = await listGET(req('/api/customer/voices'), ctx({}));
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('kullanıcıya ve normalize filtreye bağlanır (bilinmeyen değer → all)', async () => {
    mockList.mockResolvedValue({ items: [], nextCursor: null });
    const res = await listGET(req('/api/customer/voices?type=hack&status=replied&q=%20%20kahve%20%20&limit=5'), ctx({}));
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('cust-1', { type: 'all', status: 'replied', q: 'kahve', cursor: null, limit: 5 });
    const body = await res.json();
    expect(body.data).toEqual({ items: [], nextCursor: null });
  });

  it('limit üst sınırı aşılırsa 400 (sorgu yok)', async () => {
    const res = await listGET(req('/api/customer/voices?limit=999'), ctx({}));
    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('GET /api/customer/voices/[key]', () => {
  it('geçersiz anahtar 404 (yol parametresi doğrulanmaz → kayıt yok)', async () => {
    const res = await detailGET(req('/api/customer/voices/zz-1'), ctx({ key: 'zz-1' }));
    expect(res.status).toBe(404);
    expect(mockDetail).not.toHaveBeenCalled();
  });

  it('başkasının/olmayan kaydı 404; kaldırılan 404 + VOICE_REMOVED', async () => {
    mockDetail.mockRejectedValueOnce(new VoiceNotFoundError('NOT_FOUND', 'Geri bildirim bulunamadı.'));
    const a = await detailGET(req('/api/customer/voices/fb-x'), ctx({ key: 'fb-x' }));
    expect(a.status).toBe(404);
    expect(mockDetail).toHaveBeenCalledWith('cust-1', 'fb-x');

    mockDetail.mockRejectedValueOnce(new VoiceNotFoundError('VOICE_REMOVED', 'Bu geri bildirim moderasyon kararıyla kaldırıldı.'));
    const b = await detailGET(req('/api/customer/voices/fb-y'), ctx({ key: 'fb-y' }));
    expect(b.status).toBe(404);
    expect((await b.json()).code).toBe('VOICE_REMOVED');
  });
});

describe('GET /api/customer/voices/summary', () => {
  it('beklenmeyen hata 500 zarfı (200 + sıfırlar değil)', async () => {
    mockSummary.mockRejectedValue(new Error('db down'));
    const res = await summaryGET(req('/api/customer/voices/summary'), ctx({}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
