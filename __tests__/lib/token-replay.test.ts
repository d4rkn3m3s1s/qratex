/**
 * Token replay tespiti — Redis SICAK KATMAN + DB KAYNAK-DOĞRULUK tasarımı.
 * Kritik güvence: Redis devrede olsun ya da olmasın, farklı IP/UA ile gelen
 * aynı jti ALARM üretmeli. Redis yalnız hızlandırır, güvenliği değiştirmez.
 */
const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    sessionTokenUsage: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));
jest.mock('@/lib/redis', () => ({
  redisGetJson: (...a: unknown[]) => mockRedisGet(...a),
  redisSetJson: (...a: unknown[]) => mockRedisSet(...a),
}));
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

import { checkTokenReplay } from '@/lib/token-replay';

const IP = '1.2.3.4';
const UA = 'Mozilla/5.0';

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue({});
  mockUpdate.mockReset().mockResolvedValue({});
  mockRedisGet.mockReset().mockResolvedValue(null);
  mockRedisSet.mockReset().mockResolvedValue(undefined);
});

describe('checkTokenReplay', () => {
  it('jti yoksa serbest bırakır (anonim/eski token)', async () => {
    const r = await checkTokenReplay(undefined, IP, UA);
    expect(r.ok).toBe(true);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('İLK kullanım: DB kaydı yok → kaydeder, Redis sıcak kaydı doldurur', async () => {
    const r = await checkTokenReplay('jti-1', IP, UA);
    expect(r.ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('HIZLI YOL: Redis sıcak kayıt eşleşiyor → DB SORGUSU YAPILMAZ', async () => {
    // token-replay ipHash/uaHash'i sha256'nın ilk 16 hanesi olarak üretir;
    // testte gerçek değeri almak için önce bir kayıt oluşturup Redis'e yazılanı okuruz.
    await checkTokenReplay('jti-2', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };

    mockFindUnique.mockClear();
    mockUpdate.mockClear();
    mockRedisGet.mockResolvedValue({ ...hotWritten, dbTouchedAt: Date.now() });

    const r = await checkTokenReplay('jti-2', IP, UA);
    expect(r.ok).toBe(true);
    expect(mockFindUnique).not.toHaveBeenCalled(); // DB'ye hiç gidilmedi
    expect(mockUpdate).not.toHaveBeenCalled();     // lastSeen yazımı da yok (kısılmış)
  });

  it('REPLAY (Redis yolu): farklı IP → ALARM', async () => {
    await checkTokenReplay('jti-3', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };
    mockRedisGet.mockResolvedValue({ ...hotWritten, dbTouchedAt: Date.now() });

    const r = await checkTokenReplay('jti-3', '9.9.9.9', UA);
    expect(r.ok).toBe(false);
  });

  it('REPLAY (Redis KAPALI → DB yolu): farklı UA → ALARM', async () => {
    await checkTokenReplay('jti-4', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };

    mockRedisGet.mockResolvedValue(null); // Redis yok/boş
    mockFindUnique.mockResolvedValue({
      jti: 'jti-4', ipHash: hotWritten.ipHash, userAgentHash: hotWritten.uaHash,
    });

    const r = await checkTokenReplay('jti-4', IP, 'BaskaTarayici/1.0');
    expect(r.ok).toBe(false); // Redis olmadan da tespit ediliyor
  });

  it('Redis KAPALI + eşleşen kayıt → serbest (davranış eskisiyle aynı)', async () => {
    await checkTokenReplay('jti-5', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };

    mockRedisGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({
      jti: 'jti-5', ipHash: hotWritten.ipHash, userAgentHash: hotWritten.uaHash,
    });
    mockUpdate.mockClear();

    const r = await checkTokenReplay('jti-5', IP, UA);
    expect(r.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalled(); // DB yolunda lastSeen güncellenir
  });
});
