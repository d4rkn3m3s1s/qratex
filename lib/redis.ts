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

/** KEYS[1] sayaç, ARGV[1] pencere (ms). Dönüş: {sayı, kalan ms}. */
const RATE_LIMIT_INCR_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local t = redis.call('PTTL', KEYS[1])
if c == 1 or t < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  t = tonumber(ARGV[1])
end
return {c, t}
`;

/** Atomik sayaç artır + ilk artışta TTL ata. Rate-limit için. Redis yoksa null döner. */
export async function redisIncrWithTtl(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; ttlMs: number } | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    // Tek tur (perf O4): INCR + ilk artışta PEXPIRE + PTTL tek Lua betiğinde. Eskiden her oran
    // sınırlı istek (defineRoute'taki tüm uçlar) Upstash'e 2–3 SIRALI REST turu atıyordu. Betik
    // ayrıca TTL'siz kalmış sayacı (INCR sonrası EXPIRE yarıda kalırsa kalıcı kilit) onarır.
    const windowMs = windowSeconds * 1000;
    const res = await r.eval<[number], [number, number]>(RATE_LIMIT_INCR_SCRIPT, [key], [windowMs]);
    const count = Number(Array.isArray(res) ? res[0] : NaN);
    let ttl = Number(Array.isArray(res) ? res[1] : NaN);
    if (!Number.isFinite(count)) return null; // beklenmeyen yanıt → çağıran DB'ye düşer
    if (!Number.isFinite(ttl) || ttl < 0) ttl = windowMs;
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

/**
 * Anahtar(lar)ı sil — önbellek geçersizleştirme (ör. oyun liderliği yeni skorla bayatladı).
 * Redis yoksa/hata → sessizce geç (önbellek zaten TTL ile düşer).
 */
export async function redisDel(...keys: string[]): Promise<void> {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch {
    /* yut */
  }
}
