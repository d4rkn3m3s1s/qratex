import { Redis } from '@upstash/redis';

/**
 * Upstash Redis (REST) — serverless dostu HTTP client. Rate-limit + hot cache için.
 *
 * FAIL-SAFE: env yoksa (UPSTASH_REDIS_REST_URL/TOKEN) client null olur; tüm helper'lar
 * sessizce "yok" davranır → çağıranlar DB'ye/mevcut yola düşer. Yani Redis opsiyonel bir
 * HIZLANDIRMA katmanıdır; devre dışıyken sistem eskisi gibi çalışır.
 */
let client: Redis | null | undefined;

function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    client = null;
    return null;
  }
  try {
    client = new Redis({ url, token });
  } catch {
    client = null;
  }
  return client;
}

export function isRedisConfigured(): boolean {
  return getRedis() !== null;
}

/** Atomik sayaç artır + ilk artışta TTL ata. Rate-limit için. Redis yoksa null döner. */
export async function redisIncrWithTtl(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; ttlMs: number } | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const count = await r.incr(key);
    if (count === 1) {
      // İlk istek → pencere TTL'i ata.
      await r.expire(key, windowSeconds);
    }
    // Kalan TTL (retryAfter için). pttl ms cinsinden; -1/-2 ise pencere bilinmiyor → window kadar say.
    let ttl = await r.pttl(key);
    if (ttl < 0) ttl = windowSeconds * 1000;
    return { count, ttlMs: ttl };
  } catch {
    return null; // Redis hatası → çağıran DB'ye düşer.
  }
}

/** Cache oku (JSON). Redis yoksa/hata → null (çağıran taze hesaplar). */
export async function redisGetJson<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.get<T>(key)) ?? null;
  } catch {
    return null;
  }
}

/** Cache yaz (JSON) + TTL (saniye). Redis yoksa/hata → sessizce geç. */
export async function redisSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttlSeconds });
  } catch {
    /* yut */
  }
}

/**
 * GET-OR-COMPUTE: key Redis'te varsa döndür; yoksa fetcher()'ı çalıştır, sonucu ttl kadar
 * cache'le ve döndür. Redis yoksa/hata → doğrudan fetcher (cache'siz, davranış bozulmaz).
 * Ağır agregasyon uçlarını (dealer analytics vb.) sarmak için.
 */
export async function cachedJson<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redisGetJson<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  // null/undefined cache'leme (miss ile karışmasın).
  if (fresh != null) await redisSetJson(key, fresh, ttlSeconds);
  return fresh;
}
