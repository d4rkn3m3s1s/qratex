/**
 * AI önerileri önbelleği: Redis (paylaşılan, 24 sa) + süreç içi sınırlı TTL katmanı +
 * aynı külliyat için uçuştaki LLM çağrısını paylaşan tek-uçuş haritası.
 */
import { redisGetJson } from '@/lib/redis';
import { RECOMMENDATION_CACHE_TTL_SECONDS } from './core';

export type CachedRecommendation = { text: string; generatedAt: string };

/** Tek-uçuş sonucu: kota doldu / LLM yanıt vermedi / öneri hazır. */
export type GenerationOutcome =
  | { kind: 'ready'; value: CachedRecommendation }
  | { kind: 'rate_limited'; retryAfterSec: number }
  | { kind: 'unavailable' };

// İkinci katman (Redis yoksa ya da geçici hata): süreç içi, sınırlı, TTL'li önbellek.
const MEMORY_CACHE_MAX = 500;
const memoryCache = new Map<string, { value: CachedRecommendation; expiresAt: number }>();
// Aynı külliyat için eşzamanlı ıskaları tek LLM çağrısında birleştir (çift tık, nearby filtre fırtınası).
export const inFlight = new Map<string, Promise<GenerationOutcome>>();

export function memoryGet(key: string): CachedRecommendation | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
}

export function memorySet(key: string, value: CachedRecommendation): void {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + RECOMMENDATION_CACHE_TTL_SECONDS * 1000 });
}

export async function readCache(key: string): Promise<CachedRecommendation | null> {
  const fromMemory = memoryGet(key);
  if (fromMemory) return fromMemory;
  const fromRedis = await redisGetJson<CachedRecommendation>(key);
  if (fromRedis && typeof fromRedis.text === 'string' && fromRedis.text) {
    memorySet(key, fromRedis);
    return fromRedis;
  }
  return null;
}

/** Testler için: süreç içi önbellek ve uçuştaki istekleri sıfırla. */
export function resetRecommendationMemoryCache(): void {
  memoryCache.clear();
  inFlight.clear();
}
