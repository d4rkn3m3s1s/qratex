/**
 * P0-28 — istemci durum makinesi (lib/versioned-resource.ts).
 * Kural: hata/yükleme asla düzenlenebilir form olarak görünmez; 409 bir SONUÇTUR.
 */
import {
  HttpError,
  diffFields,
  fetchResourceJson,
  initialResourceState,
  isEditable,
  requireVersion,
  resourceReducer,
  saveVersioned,
  signatureOf,
  toQueryLike,
  type ResourceState,
} from '@/lib/versioned-resource';

type Data = { a: number };

describe('resourceReducer: idle → loading → ready | error', () => {
  const s0 = initialResourceState<Data>();

  it('başlangıç idle ve düzenlenemez', () => {
    expect(s0.status).toBe('idle');
    expect(isEditable(s0)).toBe(false);
  });

  it('yükleme → hazır', () => {
    const s1 = resourceReducer(s0, { type: 'load', requestId: 1 });
    expect(s1.status).toBe('loading');
    expect(isEditable(s1)).toBe(false);
    const s2 = resourceReducer(s1, { type: 'loaded', requestId: 1, data: { a: 1 }, version: 'v1' });
    expect(s2).toMatchObject({ status: 'ready', data: { a: 1 }, version: 'v1' });
    expect(isEditable(s2)).toBe(true);
  });

  it('hata → error; veri ve sürüm TEMİZ (form açılamaz)', () => {
    const ready: ResourceState<Data> = { status: 'ready', data: { a: 1 }, version: 'v1', error: null, requestId: 1 };
    const loading = resourceReducer(ready, { type: 'load', requestId: 2 });
    expect(loading.data).toBeNull();
    const failed = resourceReducer(loading, { type: 'failed', requestId: 2, error: new Error('500') });
    expect(failed.status).toBe('error');
    expect(failed.data).toBeNull();
    expect(failed.version).toBeNull();
    expect(isEditable(failed)).toBe(false);
  });

  it('sürümsüz başarı yanıtı → error (sürüm yoksa kaydetme imkânsız)', () => {
    const s1 = resourceReducer(s0, { type: 'load', requestId: 1 });
    const s2 = resourceReducer(s1, { type: 'loaded', requestId: 1, data: { a: 1 }, version: '' });
    expect(s2.status).toBe('error');
    expect(isEditable(s2)).toBe(false);
  });

  it('geç gelen ESKİ yanıt yok sayılır', () => {
    let s = resourceReducer(s0, { type: 'load', requestId: 1 });
    s = resourceReducer(s, { type: 'load', requestId: 2 });
    s = resourceReducer(s, { type: 'loaded', requestId: 1, data: { a: 99 }, version: 'eski' });
    expect(s.status).toBe('loading');
    s = resourceReducer(s, { type: 'failed', requestId: 1, error: new Error('eski') });
    expect(s.status).toBe('loading');
    s = resourceReducer(s, { type: 'loaded', requestId: 2, data: { a: 2 }, version: 'v2' });
    expect(s).toMatchObject({ status: 'ready', data: { a: 2 }, version: 'v2' });
  });

  it('committed yalnız ready iken uygulanır', () => {
    const loading = resourceReducer(s0, { type: 'load', requestId: 1 });
    expect(resourceReducer(loading, { type: 'committed', data: { a: 5 }, version: 'v5' })).toBe(loading);
    const ready = resourceReducer(loading, { type: 'loaded', requestId: 1, data: { a: 1 }, version: 'v1' });
    expect(resourceReducer(ready, { type: 'committed', data: { a: 5 }, version: 'v5' })).toMatchObject({ data: { a: 5 }, version: 'v5' });
  });

  it('toQueryLike: hata asla veri taşımaz', () => {
    const refetch = jest.fn();
    const err: ResourceState<Data> = { status: 'error', data: null, version: null, error: new Error('x'), requestId: 1 };
    expect(toQueryLike(err, refetch)).toMatchObject({ data: null, isError: true, isLoading: false });
    expect(toQueryLike(s0, refetch)).toMatchObject({ isLoading: true, data: null });
  });
});

describe('fetch yardımcıları', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(status: number, body: unknown, json = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: json ? async () => body : async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;
  }

  it('fetchResourceJson: 500 → HttpError (asla boş veri değil)', async () => {
    mockFetch(500, { success: false, error: 'Puan matrisi getirilemedi' });
    await expect(fetchResourceJson('/x')).rejects.toMatchObject({ status: 500, message: 'Puan matrisi getirilemedi' });
  });

  it('fetchResourceJson: oturum düşünce gelen HTML → HttpError INVALID_RESPONSE', async () => {
    mockFetch(200, null, false);
    await expect(fetchResourceJson('/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fetchResourceJson: success:false 200 bile olsa hata', async () => {
    mockFetch(200, { success: false, error: 'nope' });
    await expect(fetchResourceJson('/x')).rejects.toBeInstanceOf(HttpError);
  });

  it('requireVersion sürüm yoksa fırlatır', () => {
    expect(() => requireVersion({ success: true })).toThrow(HttpError);
    expect(requireVersion({ version: 'v1' })).toBe('v1');
  });

  it('saveVersioned: 409 VERSION_CONFLICT → sonuç (istisna değil)', async () => {
    mockFetch(409, { success: false, code: 'VERSION_CONFLICT', currentVersion: 'v9', error: 'Değişti' });
    await expect(saveVersioned('/x', 'PUT', { baseVersion: 'v1' })).resolves.toEqual({
      ok: false,
      conflict: true,
      currentVersion: 'v9',
      message: 'Değişti',
    });
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body)).toEqual({ baseVersion: 'v1' });
  });

  it('saveVersioned: 428 / 500 → HttpError', async () => {
    mockFetch(428, { success: false, code: 'BASE_VERSION_REQUIRED', error: 'Yenileyin' });
    await expect(saveVersioned('/x', 'PUT', {})).rejects.toMatchObject({ status: 428, code: 'BASE_VERSION_REQUIRED' });
  });

  it('saveVersioned: başarı', async () => {
    mockFetch(200, { success: true, version: 'v2' });
    await expect(saveVersioned('/x', 'PATCH', {})).resolves.toEqual({ ok: true, body: { success: true, version: 'v2' } });
  });
});

describe('kirli alan farkı', () => {
  it('yalnız değişen alanları döndürür (dokunulmamış alan ezilmez)', () => {
    const base = { businessName: 'Kafe', address: 'Moda', phone: null as string | null, tags: ['a', 'b'] };
    const cur = { ...base, address: 'Kadıköy', tags: ['a', 'b'] };
    expect(diffFields(base, cur)).toEqual({ address: 'Kadıköy' });
  });

  it('signatureOf anahtar sırasından bağımsız', () => {
    expect(signatureOf({ a: 1, b: { d: 1, c: 2 } })).toBe(signatureOf({ b: { c: 2, d: 1 }, a: 1 }));
  });
});
