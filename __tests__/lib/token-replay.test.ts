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
const mockRoam = jest.fn();
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimitDb: (...a: unknown[]) => mockRoam(...a),
}));

import { checkTokenReplay } from '@/lib/token-replay';

const IP = '1.2.3.4';
const UA = 'Mozilla/5.0';

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue({});
  mockUpdate.mockReset().mockResolvedValue({});
  mockRedisGet.mockReset().mockResolvedValue(null);
  mockRedisSet.mockReset().mockResolvedValue(undefined);
  mockRoam.mockReset().mockResolvedValue({ ok: true });
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

  it('DOLAŞIM (Redis yolu): aynı tarayıcı farklı IP → serbest, bağ yeni IP’ye taşınır', async () => {
    await checkTokenReplay('jti-3', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };
    mockRedisGet.mockResolvedValue({ ...hotWritten, dbTouchedAt: Date.now() });
    mockRedisSet.mockClear();

    const r = await checkTokenReplay('jti-3', '9.9.9.9', UA);
    expect(r.ok).toBe(true);
    expect(mockRoam).toHaveBeenCalledWith('trp_roam:jti-3', expect.any(Number), expect.any(Number));
    const rebound = mockRedisSet.mock.calls[0][1] as { ipHash: string };
    expect(rebound.ipHash).not.toBe(hotWritten.ipHash);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { jti: 'jti-3' } }));
  });

  it('DOLAŞIM bütçesi aşıldı → ALARM + jti iptal edilir', async () => {
    await checkTokenReplay('jti-3b', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };
    mockRedisGet.mockResolvedValue({ ...hotWritten, dbTouchedAt: Date.now() });
    mockRoam.mockResolvedValue({ ok: false });
    mockRedisSet.mockClear();

    const r = await checkTokenReplay('jti-3b', '9.9.9.9', UA);
    expect(r.ok).toBe(false);
    expect(mockRedisSet.mock.calls[0][1]).toMatchObject({ ipHash: 'revoked', uaHash: 'revoked' });
  });

  it('tarayıcı güncellemesi (yalnız sürüm farkı) alarm DEĞİL', async () => {
    const v1 = 'Mozilla/5.0 (Windows NT 10.0) Chrome/129.0.6668.89 Safari/537.36';
    const v2 = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.6723.58 Safari/537.36';
    await checkTokenReplay('jti-up', IP, v1);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };
    mockRedisGet.mockResolvedValue({ ...hotWritten, dbTouchedAt: Date.now() });
    expect((await checkTokenReplay('jti-up', IP, v2)).ok).toBe(true);
  });

  it('farklı tarayıcı (Redis yolu) → ALARM + iptal; iptal sonrası sahibi de reddedilir', async () => {
    await checkTokenReplay('jti-ua', IP, UA);
    const hotWritten = mockRedisSet.mock.calls[0][1] as { ipHash: string; uaHash: string };
    mockRedisGet.mockResolvedValue({ ...hotWritten, dbTouchedAt: Date.now() });
    mockRedisSet.mockClear();

    expect((await checkTokenReplay('jti-ua', IP, 'curl/8.4.0')).ok).toBe(false);
    const revoked = mockRedisSet.mock.calls[0][1];
    expect(revoked).toMatchObject({ ipHash: 'revoked' });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipHash: 'revoked', userAgentHash: 'revoked' }) })
    );

    mockRedisGet.mockResolvedValue(revoked);
    expect((await checkTokenReplay('jti-ua', IP, UA)).ok).toBe(false);
  });

  it('geçiş: ham UA özetli ESKİ kayıt kabul edilir ve yeni biçime yükseltilir', async () => {
    const { createHash } = await import('crypto');
    const h = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
    mockFindUnique.mockResolvedValue({ jti: 'jti-old', ipHash: h(IP), userAgentHash: h(UA) });
    const r = await checkTokenReplay('jti-old', IP, UA);
    expect(r.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userAgentHash: expect.any(String) }) })
    );
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
