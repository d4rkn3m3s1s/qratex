/**
 * withIdempotency rezervasyon temizliği (denetim O7).
 *
 * Yeniden üretilen hata: handler fırlatınca `statusCode = 0` rezervasyonu silinmiyordu; aynı
 * Idempotency-Key ile her yeniden deneme 24 saat boyunca 409 IN_PROGRESS alıyordu. 5xx sonuçları
 * da önbelleğe yazılıyordu (geçici hata kalıcı yanıt oluyordu).
 */
type Row = { key: string; route: string; statusCode: number; responseBody: string; expiresAt: Date };
const rows = new Map<string, Row>();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    idempotencyKey: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null),
      create: jest.fn(async ({ data }: { data: Row }) => {
        if (rows.has(data.key)) throw Object.assign(new Error('Unique'), { code: 'P2002' });
        rows.set(data.key, { ...data });
        return data;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { key: string; expiresAt: { lte: Date } }; data: Partial<Row> }) => {
        const r = rows.get(where.key);
        if (!r || r.expiresAt > where.expiresAt.lte) return { count: 0 };
        rows.set(where.key, { ...r, ...data } as Row);
        return { count: 1 };
      }),
      upsert: jest.fn(async ({ where, create, update }: { where: { key: string }; create: Row; update: Partial<Row> }) => {
        const r = rows.get(where.key);
        rows.set(where.key, r ? ({ ...r, ...update } as Row) : { ...create });
        return rows.get(where.key);
      }),
      deleteMany: jest.fn(async ({ where }: { where: { key: string; statusCode: number } }) => {
        const r = rows.get(where.key);
        if (r && r.statusCode === where.statusCode) {
          rows.delete(where.key);
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
  },
}));

import { storeIdempotency, withIdempotency } from '@/lib/idempotency';

const KEY = 'test-key-0123456789abcdef';
const req = () => new Request('http://localhost/api/x', { method: 'POST', headers: { 'Idempotency-Key': KEY } });

beforeEach(() => rows.clear());

describe('withIdempotency', () => {
  it('handler fırlatırsa rezervasyon silinir; aynı anahtarla yeniden deneme işlenir (409 değil)', async () => {
    await expect(
      withIdempotency(req(), '/api/x', async () => {
        throw new Error('DB zaman aşımı');
      })
    ).rejects.toThrow('DB zaman aşımı');
    expect(rows.has(KEY)).toBe(false);

    const res = await withIdempotency(req(), '/api/x', async () => ({ statusCode: 200, body: { ok: true } }));
    expect(res.status).toBe(200);
  });

  it('5xx sonucu önbelleğe alınmaz', async () => {
    const res = await withIdempotency(req(), '/api/x', async () => ({ statusCode: 503, body: { error: 'geçici' } }));
    expect(res.status).toBe(503);
    expect(rows.has(KEY)).toBe(false);
  });

  it('başarılı sonuç önbelleğe alınır ve tekrar istekte handler çalışmaz', async () => {
    const handler = jest.fn(async () => ({ statusCode: 201, body: { id: 'a' } }));
    await withIdempotency(req(), '/api/x', handler);
    const again = await withIdempotency(req(), '/api/x', handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(again.status).toBe(201);
    expect(await again.json()).toEqual({ id: 'a' });
  });

  it('işlenmekte olan anahtar 409 döner', async () => {
    rows.set(KEY, { key: KEY, route: '/api/x', statusCode: 0, responseBody: '', expiresAt: new Date(Date.now() + 60_000) });
    const handler = jest.fn();
    const res = await withIdempotency(req(), '/api/x', handler);
    expect(res.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();
  });

  it('süresi dolmamış başka rotaya ait anahtarla rezervasyonsuz işlem yapılmaz', async () => {
    rows.set(KEY, { key: KEY, route: '/api/baska', statusCode: 200, responseBody: '{}', expiresAt: new Date(Date.now() + 60_000) });
    const handler = jest.fn();
    const res = await withIdempotency(req(), '/api/x', handler);
    expect(res.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();
  });

  it('storeIdempotency süresi dolmamış BAŞKA rotanın (başka kullanıcının) kaydını ezmez (denetim D2)', async () => {
    const victim = { key: KEY, route: 'quest-claim:userA', statusCode: 200, responseBody: '{"mine":true}', expiresAt: new Date(Date.now() + 60_000) };
    rows.set(KEY, { ...victim });
    await storeIdempotency(KEY, 'quest-claim:userB', 200, { mine: false });
    expect(rows.get(KEY)).toEqual(victim);
  });

  it('storeIdempotency süresi dolmuş kaydı yeni rotayla yeniden yazar', async () => {
    rows.set(KEY, { key: KEY, route: 'eski', statusCode: 200, responseBody: '{}', expiresAt: new Date(Date.now() - 1_000) });
    await storeIdempotency(KEY, 'yeni', 201, { ok: 1 });
    expect(rows.get(KEY)?.route).toBe('yeni');
    expect(rows.get(KEY)?.statusCode).toBe(201);
  });
});
