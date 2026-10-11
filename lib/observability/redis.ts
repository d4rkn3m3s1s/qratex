import { Redis } from '@upstash/redis';

/**
 * Gözlemlenebilirlik sayaçları için Upstash istemcisi (pipeline/hash komutları gerekir;
 * `lib/redis.ts` yalnız JSON get/set açar). Env yoksa null → sayaçlar sessizce kapalı,
 * okuma tarafı "toplanmıyor" boş durumunu gösterir (asla sahte sıfır değil).
 */
let client: Redis | null | undefined;

export function getObsRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    client = null;
    return null;
  }
  try {
    client = new Redis({ url, token, automaticDeserialization: false });
  } catch {
    client = null;
  }
  return client;
}

/** Test yardımcısı. */
export function __resetObsRedis(next?: Redis | null): void {
  client = next;
}

/** UTC saat kovası anahtarı: 2026101114 */
export function hourKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

/** Son `hours` saatin kovaları (eskiden yeniye) ve başlangıç anları. */
export function recentHours(now: Date, hours: number): Array<{ key: string; start: Date }> {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours());
  const out: Array<{ key: string; start: Date }> = [];
  for (let i = hours - 1; i >= 0; i--) {
    const start = new Date(base - i * 3_600_000);
    out.push({ key: hourKey(start), start });
  }
  return out;
}

/** HGETALL yanıtını (nesne ya da [k,v,k,v] dizisi) sayı sözlüğüne çevirir. */
export function toNumberMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const n = Number(raw[i + 1]);
      if (Number.isFinite(n)) out[String(raw[i])] = n;
    }
    return out;
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}
