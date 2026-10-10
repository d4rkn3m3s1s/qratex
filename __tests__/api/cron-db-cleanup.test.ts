/**
 * db-cleanup cron — An Motoru temizliği (spec §1 · Temizlik) + fail-closed yetki.
 *
 * Senaryolar:
 *  - CRON_SECRET yoksa 503, yanlış Bearer 401; DB'ye hiç dokunulmaz.
 *  - Görülmüş anlar 30 gün (seenAt), görülmemişler 90 gün (createdAt) sonra silinir.
 *  - Bir adımın hatası diğerlerini durdurmaz (an tablosu henüz yoksa da token temizliği sürer).
 */
const mockAuthDelete = jest.fn();
const mockRlDelete = jest.fn();
const mockNotifDelete = jest.fn();
const mockMomentDelete = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    authEmailToken: { deleteMany: (...a: unknown[]) => mockAuthDelete(...a) },
    rateLimitCounter: { deleteMany: (...a: unknown[]) => mockRlDelete(...a) },
    notification: { deleteMany: (...a: unknown[]) => mockNotifDelete(...a) },
    customerMoment: { deleteMany: (...a: unknown[]) => mockMomentDelete(...a) },
  },
}));
// KVKK saklama adımı (P0-34) kendi testinde (`lib/gdpr-core`) doğrulanır; burada etkisiz.
const mockRetention = jest.fn(async () => ({ counts: {} as Record<string, number>, errors: [] as string[] }));
jest.mock('@/lib/gdpr-core', () => ({
  applyPersonalDataRetention: (...a: unknown[]) => (mockRetention as (...x: unknown[]) => unknown)(...a),
}));

import { GET } from '@/app/api/cron/db-cleanup/route';

const SECRET = 'test-cron-secret';
const call = (auth?: string) =>
  GET(new Request('http://localhost/api/cron/db-cleanup', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  mockAuthDelete.mockResolvedValue({ count: 1 });
  mockRlDelete.mockResolvedValue({ count: 2 });
  mockNotifDelete.mockResolvedValue({ count: 3 });
  mockMomentDelete.mockResolvedValueOnce({ count: 4 }).mockResolvedValueOnce({ count: 5 });
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/db-cleanup', () => {
  it('CRON_SECRET yoksa 503 (fail-closed), DB okunmaz', async () => {
    delete process.env.CRON_SECRET;
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
    expect(mockMomentDelete).not.toHaveBeenCalled();
  });

  it('yanlış Bearer 401', async () => {
    const res = await call('Bearer yanlis');
    expect(res.status).toBe(401);
    expect(mockAuthDelete).not.toHaveBeenCalled();
  });

  it('anları saklama sürelerine göre siler', async () => {
    const before = Date.now();
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toEqual({
      authTokens: 1,
      rateLimitBuckets: 2,
      oldNotifications: 3,
      momentsSeen: 4,
      momentsUnseen: 5,
    });
    const day = 24 * 60 * 60 * 1000;
    const seenWhere = mockMomentDelete.mock.calls[0][0].where;
    const unseenWhere = mockMomentDelete.mock.calls[1][0].where;
    expect(seenWhere.seenAt.not).toBeNull();
    expect(Math.abs(seenWhere.seenAt.lt.getTime() - (before - 30 * day))).toBeLessThan(5_000);
    expect(unseenWhere.seenAt).toBeNull();
    expect(Math.abs(unseenWhere.createdAt.lt.getTime() - (before - 90 * day))).toBeLessThan(5_000);
  });

  it('an temizliği patlasa da diğer adımlar sonuç döner', async () => {
    mockMomentDelete.mockReset().mockRejectedValue(new Error('relation "CustomerMoment" does not exist'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toMatchObject({ authTokens: 1, momentsSeen: 0, momentsUnseen: 0 });
    spy.mockRestore();
  });

  it('aktif login kilidi olan rate-limit kovası silinmez (denetim D2)', async () => {
    await call(`Bearer ${SECRET}`);
    const where = mockRlDelete.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ lockedUntil: null }, { lockedUntil: { lt: expect.any(Date) } }]);
  });

  it('çekirdek temizlik adımı patlarsa 500 + ok:false (eskiden yutulup 200 dönüyordu)', async () => {
    mockAuthDelete.mockRejectedValue(new Error('bağlantı koptu'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('authTokens');
    expect(mockNotifDelete).toHaveBeenCalled();
    spy.mockRestore();
  });
});
