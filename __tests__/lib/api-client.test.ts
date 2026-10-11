/**
 * lib/api-client (mimari-api B9): zarf v2 tek yerden çözülür; hata asla boş veri gibi dönmez.
 */
import { ApiClientError, api, buildApiUrl, decodeApiResponse, apiErrorMessage } from '@/lib/api-client';

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('decodeApiResponse', () => {
  it('zarf v2 başarısında data döner', async () => {
    await expect(decodeApiResponse(json({ ok: true, success: true, data: { a: 1 }, requestId: 'r' }))).resolves.toEqual({ a: 1 });
  });

  it('eski { success, ...alanlar } yanıtında gövdeyi döner', async () => {
    await expect(decodeApiResponse(json({ success: true, items: [1] }))).resolves.toEqual({ success: true, items: [1] });
  });

  it('HTTP hatasında sunucunun Türkçe mesajı, kodu, ayrıntısı ve requestId taşınır', async () => {
    const err = await decodeApiResponse(
      json(
        { ok: false, success: false, error: 'Ad zorunlu', code: 'VALIDATION', details: [{ path: 'name', message: 'Ad zorunlu' }], requestId: 'req-12345678' },
        { status: 400 }
      )
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.message).toBe('Ad zorunlu');
    expect(err.code).toBe('VALIDATION');
    expect(err.status).toBe(400);
    expect(err.requestId).toBe('req-12345678');
    expect(err.fieldErrors()).toEqual({ name: 'Ad zorunlu' });
  });

  it('200 + success:false da hatadır (sahte boş veri yok)', async () => {
    const err = await decodeApiResponse(json({ success: false, error: 'Olmadı' })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.message).toBe('Olmadı');
  });

  it('429 Retry-After saniyesini taşır ve yeniden denenebilir', async () => {
    const err = await decodeApiResponse(json({ success: false, code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '17' } })).catch((e) => e);
    expect(err.retryAfterSec).toBe(17);
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/Çok fazla istek/);
  });

  it('JSON olmayan 500 gövdesinde Türkçe varsayılan + INTERNAL', async () => {
    const err = await decodeApiResponse(new Response('<html>', { status: 500 })).catch((e) => e);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toMatch(/Beklenmeyen/);
  });

  it('JSON olmayan 2xx gövde boş veri sayılmaz', async () => {
    const err = await decodeApiResponse(new Response('ok', { status: 200 })).catch((e) => e);
    expect(err.code).toBe('BAD_RESPONSE');
  });

  it('204 boş yanıt null döner', async () => {
    await expect(decodeApiResponse(new Response(null, { status: 204 }))).resolves.toBeNull();
  });
});

describe('buildApiUrl', () => {
  it('boş değerleri atar, dizileri tekrarlar, mevcut sorguya ekler', () => {
    expect(buildApiUrl('/api/x', { q: 'çay', page: 2, empty: '', none: undefined, tag: ['a', 'b'] })).toBe(
      '/api/x?q=%C3%A7ay&page=2&tag=a&tag=b'
    );
    expect(buildApiUrl('/api/x?a=1', { b: true })).toBe('/api/x?a=1&b=true');
    expect(buildApiUrl('/api/x', {})).toBe('/api/x');
  });
});

describe('api.*', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('ağ hatası NETWORK koduna çevrilir', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
    const err = await api.get('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('NETWORK');
    expect(err.status).toBe(0);
  });

  it('iptal (AbortError) hata sınıfına sarılmadan yeniden fırlatılır', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abort) as unknown as typeof fetch;
    await expect(api.get('/api/x')).rejects.toBe(abort);
    expect(apiErrorMessage(abort, 'yedek')).toBe('yedek');
  });

  it('yazma isteği JSON gövde + idempotency başlığı gönderir', async () => {
    const fetchMock = jest.fn().mockResolvedValue(json({ ok: true, success: true, data: { id: 'n1' } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(api.post<{ id: string }>('/api/x', { a: 1 }, { idempotencyKey: 'k-1' })).resolves.toEqual({ id: 'n1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['idempotency-key']).toBe('k-1');
    expect(init.credentials).toBe('same-origin');
  });
});
