/**
 * LLM sağlayıcı dayanıklılığı — TEK yeniden deneme politikası + devre kesici (denetim Y3/Y6).
 *
 * Önceden üç ayrı `withRetry` vardı (ai-engine: 429'da 3+6+9 sn sabit bekleme, groq: jitter'lı
 * 3 deneme, ai-learning: her hatada 400 ms) ve SDK'nın kendi `maxRetries`'i üstüne biniyordu:
 * en kötü durumda tek çağrı ~2 dk sürüyor, sağlayıcı kotası bittiğinde her istek bu süreyi
 * tekrar tekrar yakıyordu. Şimdi:
 *  - Uygulama düzeyinde YALNIZ 429 yeniden denenir (5xx/bağlantı hatasını SDK `maxRetries: 1`
 *    zaten bir kez dener). `Retry-After` başlığına uyulur; toplam bekleme bütçesi sabittir
 *    (`AI_RETRY_POLICY.totalWaitBudgetMs`) — bütçeyi aşacak bekleme yapılmaz, hata hemen döner.
 *  - Devre kesici: sağlayıcı 60 sn içinde `failureThreshold` kez 429/5xx/zaman aşımı/bağlantı
 *    hatası verirse devre `openMs` boyunca AÇILIR; bu sürede çağrı sağlayıcıya hiç gitmez,
 *    `AiProviderUnavailableError` fırlar ve çağıran kendi deterministik yedeğine düşer
 *    (analiz → yerel analiz, sohbet → "şu an kullanılamıyor", cron → deneme hakkı yakılmaz).
 *  - Durum Upstash Redis'te paylaşılır (sunucusuz örnekler aynı devreyi görür); Redis yoksa
 *    örnek-içi bellekle çalışır. Redis hatası devreyi asla açmaz (fail-open: yalnız gözlem).
 */
import { redisGetJson, redisIncrWithTtl, redisSetJson } from '@/lib/redis';

export const AI_RETRY_POLICY = {
  /** 429 için en fazla ek deneme (ilk çağrı hariç). */
  maxRetries: 2,
  baseDelayMs: 800,
  maxDelayMs: 4_000,
  /** Bir çağrının yeniden denemeler için harcayabileceği toplam bekleme. */
  totalWaitBudgetMs: 6_000,
} as const;

export const AI_CIRCUIT_POLICY = {
  failureThreshold: 5,
  windowSeconds: 60,
  openMs: 60_000,
  /** "Kapalı" Redis yanıtı bu süre örnek içinde önbelleklenir (her çağrıda REST turu olmasın). */
  closedCacheMs: 5_000,
} as const;

export class AiProviderUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'AI_PROVIDER_UNAVAILABLE';
  constructor(
    readonly provider: string,
    readonly retryAfterMs: number
  ) {
    super('AI sağlayıcısı şu anda yanıt vermiyor. Lütfen biraz sonra tekrar deneyin.');
    this.name = 'AiProviderUnavailableError';
  }
}

export function isAiProviderUnavailableError(err: unknown): err is AiProviderUnavailableError {
  return err instanceof AiProviderUnavailableError || (err as { code?: unknown } | null)?.code === 'AI_PROVIDER_UNAVAILABLE';
}

/** Ortamdaki birincil sağlayıcı anahtarı (devre kesici kimliği). */
export function primaryAiProvider(): 'groq' | 'openai' | 'none' {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

type ErrLike = {
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
  name?: unknown;
  headers?: unknown;
};

function statusOf(err: unknown): number {
  const e = (err ?? {}) as ErrLike;
  const s = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : 0;
  if (s) return s;
  const msg = typeof e.message === 'string' ? e.message : '';
  if (/\b429\b|rate[_ ]limit/i.test(msg)) return 429;
  return 0;
}

/** Yalnız 429 uygulama düzeyinde yeniden denenir. */
export function isRetryableAiError(err: unknown): boolean {
  return statusOf(err) === 429;
}

/** Devre kesiciyi besleyen sağlayıcı arızası mı? (istemci hatası 400/401/404 sayılmaz) */
export function isProviderFailure(err: unknown): boolean {
  const status = statusOf(err);
  if (status === 429 || status >= 500) return true;
  const name = String((err as ErrLike | null)?.name ?? '');
  return /APIConnection(Timeout)?Error|TimeoutError|AbortError|FetchError/.test(name);
}

function headerValue(headers: unknown, key: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const v = (headers as { get: (k: string) => string | null }).get(key);
    return v ?? null;
  }
  const v = (headers as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

/** `retry-after-ms` / `retry-after` (saniye ya da HTTP tarihi) başlığından bekleme süresi. */
export function retryAfterMsOf(err: unknown, now = Date.now()): number | null {
  const headers = (err as ErrLike | null)?.headers;
  const ms = headerValue(headers, 'retry-after-ms');
  if (ms && Number.isFinite(Number(ms))) return Math.max(0, Number(ms));
  const ra = headerValue(headers, 'retry-after');
  if (!ra) return null;
  if (Number.isFinite(Number(ra))) return Math.max(0, Number(ra) * 1000);
  const at = Date.parse(ra);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

// ───────────────────────────── Devre kesici ─────────────────────────────

type LocalCircuit = { openUntil: number; failures: number[]; closedCheckedAt: number };
const local = new Map<string, LocalCircuit>();

function stateOf(provider: string): LocalCircuit {
  let s = local.get(provider);
  if (!s) {
    s = { openUntil: 0, failures: [], closedCheckedAt: 0 };
    local.set(provider, s);
  }
  return s;
}

const openKey = (p: string) => `ai:cb:open:${p}`;
const failKey = (p: string) => `ai:cb:fail:${p}`;

/** Devre açıksa kalan süre (ms), kapalıysa 0. Redis hatası → kapalı sayılır. */
export async function aiCircuitRemainingMs(provider: string = primaryAiProvider(), now = Date.now()): Promise<number> {
  const s = stateOf(provider);
  if (s.openUntil > now) return s.openUntil - now;
  if (now - s.closedCheckedAt < AI_CIRCUIT_POLICY.closedCacheMs) return 0;
  const shared = await redisGetJson<number>(openKey(provider));
  s.closedCheckedAt = now;
  if (typeof shared === 'number' && shared > now) {
    s.openUntil = shared;
    return shared - now;
  }
  return 0;
}

export async function isAiCircuitOpen(provider: string = primaryAiProvider(), now = Date.now()): Promise<boolean> {
  return (await aiCircuitRemainingMs(provider, now)) > 0;
}

async function openCircuit(provider: string, now: number): Promise<void> {
  const until = now + AI_CIRCUIT_POLICY.openMs;
  const s = stateOf(provider);
  s.openUntil = until;
  s.failures = [];
  console.warn(`[AI_CIRCUIT] ${provider} devresi ${AI_CIRCUIT_POLICY.openMs / 1000} sn açıldı (üst üste sağlayıcı arızası).`);
  await redisSetJson(openKey(provider), until, Math.ceil(AI_CIRCUIT_POLICY.openMs / 1000));
}

/** Sağlayıcı arızasını say; eşik aşılırsa devreyi aç. */
export async function recordAiProviderFailure(provider: string = primaryAiProvider(), now = Date.now()): Promise<void> {
  const s = stateOf(provider);
  const windowMs = AI_CIRCUIT_POLICY.windowSeconds * 1000;
  s.failures = s.failures.filter((t) => now - t < windowMs);
  s.failures.push(now);
  const shared = await redisIncrWithTtl(failKey(provider), AI_CIRCUIT_POLICY.windowSeconds);
  const count = shared ? Math.max(shared.count, s.failures.length) : s.failures.length;
  if (count >= AI_CIRCUIT_POLICY.failureThreshold && s.openUntil <= now) await openCircuit(provider, now);
}

/** Başarılı çağrı yerel arıza penceresini temizler (paylaşılan sayaç TTL ile düşer). */
export function recordAiProviderSuccess(provider: string = primaryAiProvider()): void {
  const s = stateOf(provider);
  s.failures = [];
}

/** Testler için: örnek-içi durumu sıfırla. */
export function __resetAiCircuitForTests(): void {
  local.clear();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Tek sağlayıcı çağrısını politika ile sarar: devre açıksa hemen `AiProviderUnavailableError`;
 * 429'da `Retry-After`'a uyarak (yoksa tam jitter'lı üstel) bütçe içinde yeniden dener;
 * sonuç devre kesiciye işlenir.
 */
export async function withAiRetry<T>(
  fn: () => Promise<T>,
  opts: { provider?: string; maxRetries?: number; totalWaitBudgetMs?: number } = {}
): Promise<T> {
  const provider = opts.provider ?? primaryAiProvider();
  const maxRetries = opts.maxRetries ?? AI_RETRY_POLICY.maxRetries;
  const budget = opts.totalWaitBudgetMs ?? AI_RETRY_POLICY.totalWaitBudgetMs;

  const remaining = await aiCircuitRemainingMs(provider);
  if (remaining > 0) throw new AiProviderUnavailableError(provider, remaining);

  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await fn();
      recordAiProviderSuccess(provider);
      return out;
    } catch (err) {
      if (isRetryableAiError(err) && attempt < maxRetries) {
        const hinted = retryAfterMsOf(err);
        const exp = Math.min(AI_RETRY_POLICY.maxDelayMs, AI_RETRY_POLICY.baseDelayMs * 2 ** attempt);
        const delay = hinted !== null ? Math.min(hinted, AI_RETRY_POLICY.maxDelayMs) : Math.floor(Math.random() * exp);
        // Sağlayıcı bütçeden uzun bekleme istiyorsa beklemek anlamsız: hemen dön.
        if ((hinted === null || hinted <= AI_RETRY_POLICY.maxDelayMs) && waited + delay <= budget) {
          waited += delay;
          await sleep(delay);
          continue;
        }
      }
      if (isProviderFailure(err)) await recordAiProviderFailure(provider);
      throw err;
    }
  }
}
