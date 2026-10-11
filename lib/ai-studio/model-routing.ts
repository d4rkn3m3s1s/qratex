/**
 * AI model yönlendirmesi — yönetici seçimi (Settings `ai.model-routing`) için çalışma zamanı okuyucusu.
 *
 * Tüketiciler (lib/ai-engine `getModel`, lib/ai-learning öğrenme modelleri) eşzamanlı okur;
 * bu yüzden değer süreç içi önbellekte tutulur ve her LLM çağrı yolunun başında
 * `refreshAiModelRouting()` (TTL 60 sn) ile tazelenir. Okuma hatası asla çağrıyı düşürmez:
 * önceki değer korunur, hiç yoksa ortam/varsayılan modeller geçerlidir.
 *
 * Güvenlik: yalnız `MODEL_CATALOG`'daki, etkin sağlayıcıya ait model kimlikleri uygulanır;
 * katalog dışı bir değer (elle DB yazımı vb.) yok sayılır.
 */
import { prisma } from '@/lib/prisma';
import { MODEL_SLOTS, isAllowedModel, type AiProvider, type ModelRouting, type ModelSlot } from './contract';

export const MODEL_ROUTING_KEY = 'ai.model-routing';
const TTL_MS = 60_000;

let cache: { at: number; routing: ModelRouting } | null = null;
let inflight: Promise<void> | null = null;

export function currentAiProvider(): AiProvider {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/** DB değerini güvenli biçime indirger (bilinmeyen anahtar / tip düşer). */
export function parseModelRouting(value: unknown): ModelRouting {
  const out: ModelRouting = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const v = value as Record<string, unknown>;
  for (const slot of MODEL_SLOTS) {
    const raw = v[slot];
    if (typeof raw === 'string' && raw.trim()) out[slot] = raw.trim();
  }
  return out;
}

/** Önbellekteki yönetici seçimi (katalog ve sağlayıcı denetimli); yoksa null. */
export function getRoutedModel(slot: ModelSlot): string | null {
  const model = cache?.routing[slot];
  if (!model) return null;
  return isAllowedModel(currentAiProvider(), model) ? model : null;
}

/** Önbelleği TTL dolduysa tazeler. Asla fırlatmaz. */
export async function refreshAiModelRouting(force = false): Promise<void> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const row = await prisma.settings.findUnique({ where: { key: MODEL_ROUTING_KEY }, select: { value: true } });
      cache = { at: Date.now(), routing: parseModelRouting(row?.value ?? null) };
    } catch {
      // Okunamadı: önceki değer kalsın; hiç yoksa varsayılanlar. Kısa süre sonra yeniden denensin.
      cache = cache ? { at: Date.now() - TTL_MS + 10_000, routing: cache.routing } : null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Yazımdan sonra aynı süreçte hemen geçerli olsun. */
export function setAiModelRoutingCache(routing: ModelRouting): void {
  cache = { at: Date.now(), routing };
}

/** Test yardımcısı. */
export function __resetAiModelRoutingCache(): void {
  cache = null;
  inflight = null;
}
