import OpenAI from 'openai';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseNonNegativeIntEnv } from '@/lib/safe-env-number';
import { guardAiCall, recordAiCostUsage } from '@/lib/ai-cost-guard';
import { withAiRetry } from '@/lib/ai-provider-resilience';
import { canUseAi, getDealerAiPolicy } from '@/lib/ai-policy';
import { getRoutedModel, refreshAiModelRouting } from '@/lib/ai-studio/model-routing';
import {
  PROMPT_VERSIONS,
  UNTRUSTED_DATA_RULE,
  sanitizeContextLine,
  sanitizeContextText,
  wrapUntrusted,
} from '@/lib/ai-prompt-safety';
import { localEmbed, embedFromFeatures, LOCAL_EMBEDDING_MODEL, cosineSimilarity } from '@/lib/local-embedding';

/** Groq LLM destekli embedding model etiketi (yerel uzayla uyumlu vektör). */
const GROQ_EMBED_MODEL = 'groq-llm-features-v1';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
/** Ortam/varsayılan bayi öğrenme modeli (Stüdyo seçimi yokken). */
export const LEARNING_MODEL =
  process.env.AI_LEARNING_MODEL ||
  process.env.OPENAI_LEARNING_MODEL ||
  (process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'gpt-4o-mini');

let embeddingClient: OpenAI | null = null;
let learningClient: OpenAI | null = null;

function getEmbeddingClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!embeddingClient) {
    embeddingClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 8_000, maxRetries: 1 });
  }
  return embeddingClient;
}

function getLearningClient(): OpenAI | null {
  if (process.env.GROQ_API_KEY) {
    if (!learningClient || (learningClient as OpenAI & { baseURL?: string }).baseURL !== 'https://api.groq.com/openai/v1') {
      learningClient = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
        // Timeout ZORUNLU (SDK varsayılanı 10 dk): arka plan hattını kilitlemesin.
        timeout: 20_000,
        maxRetries: 1,
      });
    }
    return learningClient;
  }
  if (process.env.OPENAI_API_KEY) {
    if (!learningClient) {
      learningClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 1 });
    }
    return learningClient;
  }
  return null;
}

/**
 * Ortak politika (`lib/ai-provider-resilience`): eskiden HER hatayı (400/401 dahil) 400 ms sonra
 * körlemesine tekrar ediyordu; artık yalnız 429, bütçeli ve paylaşılan devre kesiciyle.
 */
function withRetry<T>(fn: () => Promise<T>, provider: string = process.env.GROQ_API_KEY ? 'groq' : 'openai'): Promise<T> {
  return withAiRetry(fn, { provider });
}

/**
 * Groq LLM ile metni deterministik semantik özelliklere indirir (tema, niyet,
 * anahtar kelimeler), sonra bu özelliklerden cosine-karşılaştırılabilir vektör
 * türetir. Groq embedding modeli SUNMADIĞI için (canlı doğrulandı), gerçek LLM
 * anlayışını embedding'e dönüştürmenin Groq-yolu budur.
 */
async function groqFeatureEmbedding(text: string, dealerId?: string): Promise<number[] | null> {
  if (!process.env.GROQ_API_KEY) return null;

  // Dinamik import: ai-engine ↔ ai-learning döngüsel bağımlılığını kırar.
  const { runChatCompletion } = await import('@/lib/ai-engine');
  const res = await runChatCompletion({
    system:
      'Bir müşteri geri bildirimini semantik aramaya uygun, NORMALİZE anahtar ' +
      'özelliklere indir. Eş anlamlıları tek köke indir (ör. "yavaştı/geç/bekledik" ' +
      '→ "yavaş_servis"). Türkçe, küçük harf, snake_case. SADECE şu JSON: ' +
      '{"themes":[...3-6 tema...],"intent":"...tek kelime...","keywords":[...4-8 anahtar kelime...]}',
    user: text.slice(0, 1500),
    temperature: 0,
    maxTokens: 220,
    jsonMode: true,
    // P0-32: bayi kapsamı → AI kapalıysa null (yerel embedding'e düşülür), limit + kayıt.
    dealerId,
    task: 'embedding',
  });
  if (!res) return null;

  try {
    const parsed = JSON.parse(res.content) as { themes?: unknown; intent?: unknown; keywords?: unknown };
    const features: string[] = [];
    const pushArr = (v: unknown, prefix: string) => {
      if (Array.isArray(v)) {
        for (const x of v) if (typeof x === 'string' && x.trim()) features.push(`${prefix}:${x.trim()}`);
      }
    };
    pushArr(parsed.themes, 'theme');
    pushArr(parsed.keywords, 'kw');
    if (typeof parsed.intent === 'string' && parsed.intent.trim()) features.push(`intent:${parsed.intent.trim()}`);
    if (features.length === 0) return null;
    return embedFromFeatures(features);
  } catch {
    return null;
  }
}

async function generateEmbedding(text: string, dealerId?: string): Promise<{ vector: number[]; model: string } | null> {
  if (!text || text.trim().length < 5) return null;
  const safeText = text.trim().slice(0, 4000);

  // P0-32: AI'ı kapalı bayinin metni HİÇBİR sağlayıcıya gitmez → yalnız yerel embedding.
  if (dealerId && !canUseAi(await getDealerAiPolicy(dealerId))) {
    return { vector: localEmbed(safeText), model: LOCAL_EMBEDDING_MODEL };
  }

  // 1) Tercih: gerçek OpenAI embedding (en yüksek kalite).
  const client = getEmbeddingClient();
  if (client) {
    try {
      await guardAiCall({ task: 'embedding', dealerId });
      // Her denemeye 5sn timeout (AbortController): yavaş/asılı sağlayıcı isteği
      // sonsuza dek bloklamasın; süre aşımında aşağıdaki Groq/yerel'e düşeriz.
      const response = await withRetry(() => {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        return client.embeddings
          .create({ model: EMBEDDING_MODEL, input: safeText }, { signal: ac.signal })
          .finally(() => clearTimeout(t));
      }, 'openai');
      const vector = response.data?.[0]?.embedding;
      await recordAiCostUsage(dealerId ?? null, response.usage?.prompt_tokens ?? 0, 0, 'embedding', EMBEDDING_MODEL);
      if (vector) return { vector, model: EMBEDDING_MODEL };
    } catch (err) {
      console.error('OpenAI embedding failed, falling back:', err);
    }
  }

  // 2) Groq LLM destekli embedding: LLM metni semantik özelliklere indirir,
  //    biz vektörleştiririz (Groq gerçekten kullanılır — embedding modeli yok).
  try {
    const groqVec = await groqFeatureEmbedding(safeText, dealerId);
    if (groqVec) return { vector: groqVec, model: GROQ_EMBED_MODEL };
  } catch (err) {
    console.error('Groq feature embedding failed, falling back:', err);
  }

  // 3) Son çare: anahtarsız deterministik yerel embedding (yine gerçek, sahte değil).
  return { vector: localEmbed(safeText), model: LOCAL_EMBEDDING_MODEL };
}

export async function storeFeedbackEmbedding(params: {
  feedbackId: string;
  dealerId: string;
  text: string;
}) {
  try {
    const embedding = await generateEmbedding(params.text, params.dealerId);
    if (!embedding) return null;

    return await prisma.aIEmbedding.upsert({
      where: { feedbackId: params.feedbackId },
      update: {
        vector: embedding.vector,
        model: embedding.model,
        dimension: embedding.vector.length,
      },
      create: {
        feedbackId: params.feedbackId,
        dealerId: params.dealerId,
        vector: embedding.vector,
        model: embedding.model,
        dimension: embedding.vector.length,
      },
    });
  } catch (error) {
    console.error('Failed to store embedding:', error);
    return null;
  }
}

/**
 * Bir metne en benzer geçmiş feedback'leri bulur (aynı bayi içinde, cosine).
 * Embedding'i gerçek bir özelliğe dönüştürür: tekrarlayan şikâyet/temaları,
 * benzer geçmiş yorumları ve onlara verilen yanıtları yüzeye çıkarmak için.
 * OpenAI varsa onun, yoksa yerel embedding'in vektörlerini kullanır (model alanı
 * uyumlu kayıtlar arasında karşılaştırma yapılır).
 */
export async function findSimilarFeedback(params: {
  dealerId: string;
  text: string;
  limit?: number;
  minScore?: number;
}): Promise<Array<{ feedbackId: string; score: number }>> {
  const query = await generateEmbedding(params.text, params.dealerId);
  if (!query) return [];

  const limit = params.limit ?? 5;
  const minScore = params.minScore ?? 0.4;

  // Aynı model ailesiyle üretilmiş vektörler kıyaslanabilir (boyut + uzay aynı). Silinmiş
  // (moderasyonla kaldırılmış) yorumun vektörü aday olmaz (denetim O4: silinmiş metin AI
  // bağlamına giriyordu).
  const buckets: Array<{ model: string; vector: number[] }> = [query];
  // Denetim O4: sağlayıcı o an düştüğünde kayıt YEREL vektörle saklanır; sorgu sağlayıcı
  // modeliyle üretilince bu kayıtlar `model` süzgeci yüzünden HİÇ bulunamıyordu. Yerel kova
  // da aynı metnin yerel vektörüyle taranır (yerel kova = anahtar kelime benzerliği).
  if (query.model !== LOCAL_EMBEDDING_MODEL) {
    buckets.push({ model: LOCAL_EMBEDDING_MODEL, vector: localEmbed(params.text.trim().slice(0, 4000)) });
  }

  const best = new Map<string, number>();
  for (const b of buckets) {
    const rows = await prisma.aIEmbedding.findMany({
      where: {
        dealerId: params.dealerId,
        model: b.model,
        dimension: b.vector.length,
        feedback: { deletedAt: null },
      },
      select: { feedbackId: true, vector: true },
      orderBy: { createdAt: 'desc' },
      take: 1000, // bellek koruması: kova başına en güncel 1000 vektör (pgvector isteği: SCHEMA-REQUESTS)
    });
    for (const r of rows) {
      const vec = r.vector as unknown;
      if (!Array.isArray(vec)) continue;
      const score = cosineSimilarity(b.vector, vec as number[]);
      if (score >= minScore && score > (best.get(r.feedbackId) ?? -1)) best.set(r.feedbackId, score);
    }
  }

  return Array.from(best, ([feedbackId, score]) => ({ feedbackId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function recordFeedbackCorrection(params: {
  dealerId: string;
  feedbackId: string;
  field: string;
  newValue: unknown;
  oldValue?: unknown;
  note?: string;
}) {
  return prisma.aIFeedbackCorrection.create({
    data: {
      dealerId: params.dealerId,
      feedbackId: params.feedbackId,
      field: params.field,
      newValue: params.newValue as any,
      oldValue: params.oldValue ? (params.oldValue as any) : null,
      note: params.note ?? null,
    },
  });
}

function buildFallbackProfile(feedbacks: Array<{ topics: unknown; entities: unknown; themes: unknown }>) {
  const topicMap = new Map<string, number>();
  const entityMap = new Map<string, number>();
  const themeMap = new Map<string, number>();

  feedbacks.forEach(fb => {
    const topics = Array.isArray(fb.topics) ? fb.topics : [];
    topics.forEach(t => topicMap.set(String(t), (topicMap.get(String(t)) || 0) + 1));

    const entities = Array.isArray(fb.entities) ? fb.entities : [];
    entities.forEach((e: any) => {
      if (!e?.name) return;
      const key = `${e.type || 'other'}:${e.name}`;
      entityMap.set(key, (entityMap.get(key) || 0) + 1);
    });

    const themes = Array.isArray(fb.themes) ? fb.themes : [];
    themes.forEach((t: any) => {
      if (!t?.theme) return;
      const key = `${t.theme}${t.subTheme ? `>${t.subTheme}` : ''}`;
      themeMap.set(key, (themeMap.get(key) || 0) + 1);
    });
  });

  const topTopics = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const topEntities = Array.from(entityMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  const topThemes = Array.from(themeMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);

  return {
    businessContext: {
      sector: 'unknown',
      keyTerms: topTopics,
    },
    learnedThemes: topThemes.map((t) => ({ theme: t, priority: 'medium' })),
    entityAliases: topEntities.map((e) => ({ alias: e.split(':')[1] || e, canonical: e, type: e.split(':')[0] || 'other' })),
    responseGuidelines: {
      do: ['Kısa ve somut geri bildirim analiz et'],
      avoid: ['Belirsiz öneriler üretme'],
    },
  };
}

export function formatAdaptiveProfile(profile: any): string {
  if (!profile || typeof profile !== 'object') return '';
  const parts: string[] = [];
  if (profile.businessContext?.sector) parts.push(`Sektör: ${profile.businessContext.sector}`);
  if (Array.isArray(profile.businessContext?.keyTerms) && profile.businessContext.keyTerms.length > 0) {
    parts.push(`Ana terimler: ${profile.businessContext.keyTerms.slice(0, 10).join(', ')}`);
  }
  if (Array.isArray(profile.learnedThemes) && profile.learnedThemes.length > 0) {
    parts.push(`Öncelikli temalar: ${profile.learnedThemes.slice(0, 8).map((t: any) => t.theme || t).join(', ')}`);
  }
  if (Array.isArray(profile.entityAliases) && profile.entityAliases.length > 0) {
    parts.push(`Öne çıkan varlıklar: ${profile.entityAliases.slice(0, 8).map((e: any) => e.canonical || e.alias).join(', ')}`);
  }
  if (Array.isArray(profile.responseGuidelines?.do) && profile.responseGuidelines.do.length > 0) {
    parts.push(`Yapılacaklar: ${profile.responseGuidelines.do.slice(0, 6).join('; ')}`);
  }
  if (Array.isArray(profile.responseGuidelines?.avoid) && profile.responseGuidelines.avoid.length > 0) {
    parts.push(`Kaçınılacaklar: ${profile.responseGuidelines.avoid.slice(0, 6).join('; ')}`);
  }
  const combined = parts.join('\n');
  return combined.slice(0, 1200);
}

export async function getAdaptiveProfileForDealer(dealerId: string) {
  return prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } });
}

export async function updateAdaptiveProfile(dealerId: string) {
  await refreshAiModelRouting();
  const learningModel = getRoutedModel('dealerLearning') ?? LEARNING_MODEL;
  const feedbacks = await prisma.feedback.findMany({
    where: { deletedAt: null, qrCode: { dealerId }, text: { not: null } },
    select: { text: true, sentiment: true, intent: true, topics: true, themes: true, entities: true, actionSuggestions: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const corrections = await prisma.aIFeedbackCorrection.findMany({
    where: { dealerId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  let profile: any = null;
  // P0-32: bayi AI'ı kapalıysa LLM çağrılmaz; yerel (deterministik) profil kullanılır.
  const client = canUseAi(await getDealerAiPolicy(dealerId)) ? getLearningClient() : null;
  if (client) {
    await guardAiCall({ task: 'dealer_learning', dealerId });
    const compactText = (value: string | null) => (value || '').replace(/\s+/g, ' ').slice(0, 240);
    const contextSample = feedbacks
      .slice(0, 30)
      .map((f, i) => `${i + 1}. ${wrapUntrusted('musteri_yorumu', compactText(f.text), 260)} [sentiment: ${sanitizeContextLine(f.sentiment, 20) || '-'}, intent: ${sanitizeContextLine(f.intent, 20) || '-'}]`)
      .join('\n');
    const correctionSample = corrections
      .slice(0, 15)
      .map((c, i) => `${i + 1}. ${c.field} old=${JSON.stringify(c.oldValue)} new=${JSON.stringify(c.newValue)}`)
      .join('\n');

    const startedAt = Date.now();
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: learningModel,
        messages: [
          {
            role: 'system',
            content: `Sen bir AI öğrenme motorusun. İşletmeye özel adaptif profil çıkar ve SADECE JSON döndür.

JSON formatı:
{
  "businessContext": { "sector": "string", "keyTerms": ["string"] },
  "learnedThemes": [{ "theme": "string", "priority": "low|medium|high", "note": "string" }],
  "entityAliases": [{ "alias": "string", "canonical": "string", "type": "product|location|person|service|facility|brand|other" }],
  "riskSignals": [{ "pattern": "string", "action": "string" }],
  "responseGuidelines": { "do": ["string"], "avoid": ["string"] }
}

Kurallar:
- Türkçe, kısa ve somut yaz
- Geri bildirimlerde geçen terimlere odaklan
- 5-8 tema ve 6-10 terim ile sınırlı kal
- Müşteri ya da personel adı, telefon, e-posta YAZMA

${UNTRUSTED_DATA_RULE}`,
          },
          {
            role: 'user',
            content: `Geri Bildirim Örnekleri:\n${contextSample}\n\nDüzeltmeler:\n${correctionSample || 'yok'}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      })
    );

    await recordAiCostUsage(
      dealerId,
      response.usage?.prompt_tokens ?? 0,
      response.usage?.completion_tokens ?? 0,
      'dealer_learning',
      learningModel,
      Date.now() - startedAt
    );
    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        profile = JSON.parse(content);
      } catch {
        profile = null;
      }
    }
  }

  if (!profile) {
    profile = buildFallbackProfile(feedbacks);
  }

  const existing = await prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } });
  const nextVersion = (existing?.version || 0) + 1;

  return prisma.aIDealerLearningProfile.upsert({
    where: { dealerId },
    update: {
      profile,
      version: nextVersion,
      status: 'ready',
      lastTrainedAt: new Date(),
      trainingFeedbackCount: feedbacks.length,
      correctionsUsed: corrections.length,
    },
    create: {
      dealerId,
      profile,
      version: nextVersion,
      status: 'ready',
      lastTrainedAt: new Date(),
      trainingFeedbackCount: feedbacks.length,
      correctionsUsed: corrections.length,
    },
  });
}

const NEW_FEEDBACK_THRESHOLD = 30;
const NEW_FEEDBACK_THRESHOLD_FIRST = 20;
const NEW_CORRECTIONS_THRESHOLD = 5;

/** Yeni geri bildirim / düzeltme sayısına göre yeniden eğitim önerisi */
export async function getLearningRetrainSuggestion(dealerId: string): Promise<{
  shouldRetrain: boolean;
  reason: string | null;
  newFeedbackCount: number;
  newCorrectionsCount: number;
}> {
  const profile = await prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } });
  const lastTrainedAt = profile?.lastTrainedAt || new Date(0);

  const newFeedbackCount = await prisma.feedback.count({
    where: {
      deletedAt: null,
      qrCode: { dealerId },
      text: { not: null },
      createdAt: { gt: lastTrainedAt },
    },
  });

  const newCorrectionsCount = await prisma.aIFeedbackCorrection.count({
    where: { dealerId, createdAt: { gt: lastTrainedAt } },
  });

  const threshold = profile ? NEW_FEEDBACK_THRESHOLD : NEW_FEEDBACK_THRESHOLD_FIRST;
  if (!profile && newFeedbackCount >= NEW_FEEDBACK_THRESHOLD_FIRST) {
    return {
      shouldRetrain: true,
      reason: `${newFeedbackCount} yeni geri bildirim var; ilk profil oluşturulabilir.`,
      newFeedbackCount,
      newCorrectionsCount,
    };
  }
  if (profile && newFeedbackCount >= threshold) {
    return {
      shouldRetrain: true,
      reason: `${newFeedbackCount} yeni geri bildirim; profil güncellenmeli.`,
      newFeedbackCount,
      newCorrectionsCount,
    };
  }
  if (profile && newCorrectionsCount >= NEW_CORRECTIONS_THRESHOLD) {
    return {
      shouldRetrain: true,
      reason: `${newCorrectionsCount} yeni düzeltme; AI'ın öğrenmesi için profili güncelleyin.`,
      newFeedbackCount,
      newCorrectionsCount,
    };
  }
  return {
    shouldRetrain: false,
    reason: null,
    newFeedbackCount,
    newCorrectionsCount,
  };
}

export async function maybeTriggerAdaptiveUpdate(dealerId: string) {
  try {
    const profile = await prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } });
    const lastTrainedAt = profile?.lastTrainedAt || new Date(0);
    const newFeedbackCount = await prisma.feedback.count({
      where: {
        deletedAt: null,
        qrCode: { dealerId },
        text: { not: null },
        createdAt: { gt: lastTrainedAt },
      },
    });

    if (!profile && newFeedbackCount >= NEW_FEEDBACK_THRESHOLD_FIRST) {
      await updateAdaptiveProfile(dealerId);
    } else if (profile && newFeedbackCount >= NEW_FEEDBACK_THRESHOLD) {
      await updateAdaptiveProfile(dealerId);
    }
  } catch (error) {
    console.error('Adaptive update check failed:', error);
  }
}

// ─────────────────────────────────────────────────────────────
// SİSTEM GENELİ AI ÖĞRENME — anonim toplulaştırma + admin onayı (P0-33)
// ─────────────────────────────────────────────────────────────
//
// Eski davranış (kaldırıldı): bütün kiracıların ham geri bildirim metinleri, işletme adları,
// ürün adları ve bayilerin özel promptları tek bir LLM'e veriliyor; LLM'in yazdığı
// `chatSystemPrompt` onaysız kaydedilip HER sohbette güvenlik kurallarını taşıyan temel
// promptun YERİNE geçiyordu (kalıcı prompt enjeksiyonu + kiracılar arası kirlenme).
//
// Yeni davranış:
//  1. LLM'e yalnız ANONİM TOPLULAŞTIRILMIŞ istatistik gider: sayılar, dağılımlar ve en az
//     `MIN_DEALERS_PER_THEME` farklı işletmede geçen tema/konu ETİKETLERİ. Ham metin, işletme
//     adı, ürün adı, bayi özel promptu GİTMEZ.
//  2. Çıktı `profile.pendingProposal` olarak kaydedilir; hiçbir prompta etki etmez.
//  3. Admin diff'i görüp onaylayınca (`approveSystemLearningProposal`) üst düzey alanlara
//     kopyalanır ve `profile.approval` damgası basılır. Prompt kurucular (`buildLearnedSystemContext`)
//     YALNIZ onay damgalı içeriği, sınırlı ek bağlam olarak kullanır.
//  4. `systemPrompt` / `chatSystemPrompt` sütunları artık yalnız admin'in elle yazdığı notlardır
//     (`updateSystemLearningPrompts` → `profile.adminPromptsEditedAt`); LLM bunlara yazmaz.

/** Ortam/varsayılan sistem öğrenme modeli (Stüdyo seçimi yokken). */
export const SYSTEM_LEARNING_MODEL =
  process.env.AI_SYSTEM_LEARNING_MODEL ||
  process.env.AI_LEARNING_MODEL ||
  process.env.OPENAI_LEARNING_MODEL ||
  (process.env.GROQ_API_KEY ? 'openai/gpt-oss-120b' : 'gpt-4o-mini'); // llama-3.3-70b-versatile decommission (2026-08-16)

/** Toplulaştırma için taranan en fazla geri bildirim (bellek/süre koruması). */
const MAX_FEEDBACKS = Math.min(
  parseNonNegativeIntEnv(process.env.AI_SYSTEM_LEARNING_MAX_FEEDBACKS, 3_000) || 3_000,
  10_000
);
const MAX_CORRECTIONS = Math.min(
  parseNonNegativeIntEnv(process.env.AI_SYSTEM_LEARNING_MAX_CORRECTIONS, 1_000) || 1_000,
  5_000
);
/** k-anonimlik: bir tema/konu etiketi en az bu kadar FARKLI işletmede geçmeli. */
export const MIN_DEALERS_PER_THEME = 3;

export const SYSTEM_LEARNING_SCHEMA_VERSION = 2;

/** Onaylanabilir öğrenme içeriği (temizlenmiş, tavanlı). */
export interface LearnedPayload {
  learnedRules: string[];
  learnedThemes: Array<{ theme: string; priority: 'high' | 'medium' | 'low'; count?: number }>;
  responseGuidelines: { do: string[]; avoid: string[] };
  promptAppendix: string | null;
}

export interface SystemLearningProposal extends LearnedPayload {
  id: string;
  createdAt: string;
  promptVersion: string;
  model: string;
  trainingDataStats: Record<string, unknown>;
}

const PAYLOAD_LIMITS = { rules: 10, themes: 10, guidelines: 6, appendix: 400, line: 200 } as const;

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const line = sanitizeContextLine(v, PAYLOAD_LIMITS.line);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

/** LLM ya da DB'den gelen öğrenme içeriğini temizler (injection kalıplı öğe düşer, tavanlı). */
export function sanitizeLearnedPayload(raw: unknown): LearnedPayload {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const guidelines = (r.responseGuidelines && typeof r.responseGuidelines === 'object'
    ? r.responseGuidelines
    : {}) as Record<string, unknown>;
  const themes: LearnedPayload['learnedThemes'] = [];
  if (Array.isArray(r.learnedThemes)) {
    for (const t of r.learnedThemes) {
      const obj = (t && typeof t === 'object' ? t : { theme: t }) as Record<string, unknown>;
      const theme = sanitizeContextLine(obj.theme, 80);
      if (!theme || themes.some((x) => x.theme === theme)) continue;
      const priority = obj.priority === 'high' || obj.priority === 'low' ? obj.priority : 'medium';
      const count = Number(obj.count);
      themes.push({ theme, priority, ...(Number.isFinite(count) && count > 0 ? { count: Math.round(count) } : {}) });
      if (themes.length >= PAYLOAD_LIMITS.themes) break;
    }
  }
  const appendix = sanitizeContextText(r.promptAppendix ?? r.systemPromptAppendix, PAYLOAD_LIMITS.appendix);
  return {
    learnedRules: cleanList(r.learnedRules, PAYLOAD_LIMITS.rules),
    learnedThemes: themes,
    responseGuidelines: {
      do: cleanList(guidelines.do, PAYLOAD_LIMITS.guidelines),
      avoid: cleanList(guidelines.avoid, PAYLOAD_LIMITS.guidelines),
    },
    promptAppendix: appendix || null,
  };
}

/** Liste farkı: admin onay ekranı için (eklenen / çıkarılan). */
function diffList(active: string[], proposed: string[]) {
  return {
    added: proposed.filter((x) => !active.includes(x)),
    removed: active.filter((x) => !proposed.includes(x)),
    unchanged: proposed.filter((x) => active.includes(x)),
  };
}

/** Aktif (onaylı) içerik ile öneri arasındaki fark — saf fonksiyon. */
export function diffLearnedPayload(active: LearnedPayload | null, proposed: LearnedPayload) {
  const a = active ?? { learnedRules: [], learnedThemes: [], responseGuidelines: { do: [], avoid: [] }, promptAppendix: null };
  return {
    learnedRules: diffList(a.learnedRules, proposed.learnedRules),
    learnedThemes: diffList(a.learnedThemes.map((t) => t.theme), proposed.learnedThemes.map((t) => t.theme)),
    guidelinesDo: diffList(a.responseGuidelines.do, proposed.responseGuidelines.do),
    guidelinesAvoid: diffList(a.responseGuidelines.avoid, proposed.responseGuidelines.avoid),
    promptAppendix: { before: a.promptAppendix, after: proposed.promptAppendix, changed: a.promptAppendix !== proposed.promptAppendix },
  };
}

type ProfileJson = Record<string, unknown> & {
  schemaVersion?: number;
  approval?: { approvedAt?: string; approvedBy?: string; proposalId?: string } | null;
  pendingProposal?: SystemLearningProposal | null;
  adminPromptsEditedAt?: string | null;
  history?: unknown[];
};

function asProfileJson(value: unknown): ProfileJson {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as ProfileJson) } : {};
}

/** Profil satırındaki ONAYLI içerik (onay damgası yoksa null — eski/onaysız profil yok sayılır). */
export function getApprovedLearnedPayload(profile: unknown): LearnedPayload | null {
  const p = asProfileJson(profile);
  if (!p.approval || typeof p.approval !== 'object' || !p.approval.approvedAt) return null;
  return sanitizeLearnedPayload(p);
}

/** Bounded tema/konu sayımı: etiket → farklı işletme sayısı + toplam geçiş. */
function countLabels(
  rows: Array<{ dealerId: string; labels: string[] }>
): Array<{ label: string; dealers: number; count: number }> {
  const map = new Map<string, { dealers: Set<string>; count: number }>();
  for (const r of rows) {
    for (const raw of r.labels) {
      const label = sanitizeContextLine(raw, 60);
      if (!label) continue;
      const key = label.toLocaleLowerCase('tr-TR');
      const e = map.get(key) ?? { dealers: new Set<string>(), count: 0 };
      e.dealers.add(r.dealerId);
      e.count += 1;
      map.set(key, e);
    }
  }
  return Array.from(map.entries())
    .map(([label, e]) => ({ label, dealers: e.dealers.size, count: e.count }))
    .sort((a, b) => b.count - a.count);
}

function labelsOf(value: unknown, kind: 'topics' | 'themes'): string[] {
  if (!Array.isArray(value)) return [];
  if (kind === 'topics') return value.filter((x): x is string => typeof x === 'string');
  return value
    .map((x) => {
      const t = x as { theme?: unknown; subTheme?: unknown } | null;
      if (!t || typeof t.theme !== 'string') return null;
      return typeof t.subTheme === 'string' && t.subTheme ? `${t.theme} > ${t.subTheme}` : t.theme;
    })
    .filter((x): x is string => !!x);
}

const LABEL_RE = /^[\p{L}_ -]{2,24}$/u;

/**
 * ANONİM toplulaştırma (P0-33). Ham metin, işletme/ürün adı, bayi özel promptu TOPLANMAZ.
 * Tema/konu etiketleri yalnız en az `MIN_DEALERS_PER_THEME` farklı işletmede geçiyorsa
 * çıkar (tek işletmeye özgü ürün/şube adı sızmasın). Taramalar `take` ile sınırlı.
 */
export async function aggregateSystemTrainingData() {
  const [feedbacks, corrections, dealerCount, intentGroups, sentimentGroups, agg, highUrgency, highChurn] =
    await Promise.all([
      prisma.feedback.findMany({
        where: { deletedAt: null, text: { not: null } },
        select: { topics: true, themes: true, qrCode: { select: { dealerId: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_FEEDBACKS,
      }),
      prisma.aIFeedbackCorrection.findMany({
        orderBy: { createdAt: 'desc' },
        select: { field: true, oldValue: true, newValue: true },
        take: MAX_CORRECTIONS,
      }),
      prisma.user.count({ where: { role: 'DEALER' } }),
      prisma.feedback.groupBy({ by: ['intent'], where: { deletedAt: null }, _count: true }),
      prisma.feedback.groupBy({ by: ['sentiment'], where: { deletedAt: null }, _count: true }),
      prisma.feedback.aggregate({
        where: { deletedAt: null },
        _avg: { rating: true, urgency: true, churnRisk: true },
        _count: true,
      }),
      prisma.feedback.count({ where: { deletedAt: null, urgency: { gte: 0.7 } } }),
      prisma.feedback.count({ where: { deletedAt: null, churnRisk: { gte: 0.7 } } }),
    ]);

  const topicRows = feedbacks.map((f) => ({ dealerId: f.qrCode?.dealerId ?? '', labels: labelsOf(f.topics, 'topics') }));
  const themeRows = feedbacks.map((f) => ({ dealerId: f.qrCode?.dealerId ?? '', labels: labelsOf(f.themes, 'themes') }));
  const topTopics = countLabels(topicRows).filter((x) => x.dealers >= MIN_DEALERS_PER_THEME).slice(0, 30);
  const topThemes = countLabels(themeRows).filter((x) => x.dealers >= MIN_DEALERS_PER_THEME).slice(0, 30);

  const intentDist: Record<string, number> = {};
  for (const g of intentGroups) {
    const k = String(g.intent || 'general');
    if (LABEL_RE.test(k)) intentDist[k] = g._count;
  }
  const sentimentDist: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
  for (const g of sentimentGroups) {
    const k = (g.sentiment || 'neutral').toLowerCase();
    if (sentimentDist[k] !== undefined) sentimentDist[k] = g._count;
  }

  // Düzeltmeler: alan başına sayım + yalnız ETİKET değerli geçişler (serbest metin değil).
  const correctionByField: Record<string, number> = {};
  const transitions = new Map<string, number>();
  for (const c of corrections) {
    const field = LABEL_RE.test(c.field) ? c.field : 'other';
    correctionByField[field] = (correctionByField[field] ?? 0) + 1;
    const from = typeof c.oldValue === 'string' && LABEL_RE.test(c.oldValue) ? c.oldValue : null;
    const to = typeof c.newValue === 'string' && LABEL_RE.test(c.newValue) ? c.newValue : null;
    if (field !== 'other' && from && to) {
      const key = `${field}: ${from} → ${to}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
    }
  }
  const correctionTransitions = Array.from(transitions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, v]) => `${k} (${v})`);

  return {
    sampledFeedbackCount: feedbacks.length,
    correctionCount: corrections.length,
    dealerCount,
    totalFeedbackCount: agg._count,
    avgRating: agg._avg.rating,
    avgUrgency: agg._avg.urgency,
    avgChurnRisk: agg._avg.churnRisk,
    highUrgencyCount: highUrgency,
    highChurnCount: highChurn,
    intentDist,
    sentimentDist,
    topTopics,
    topThemes,
    correctionByField,
    correctionTransitions,
  };
}

/** Toplulaştırılmış veriden LLM'e giden metin — saf fonksiyon (sızıntı testi için dışa açık). */
export function buildSystemLearningContext(data: Awaited<ReturnType<typeof aggregateSystemTrainingData>>): string {
  const fmt = (n: number | null | undefined) => (typeof n === 'number' ? n.toFixed(2) : '-');
  return `<veri>
ANONİM PLATFORM ÖZETİ (yalnız toplulaştırılmış sayılar ve en az ${MIN_DEALERS_PER_THEME} işletmede geçen etiketler):
- Toplam geri bildirim: ${data.totalFeedbackCount} (etiket taraması: son ${data.sampledFeedbackCount})
- İşletme sayısı: ${data.dealerCount}
- Ortalama puan: ${fmt(data.avgRating)}, aciliyet ort: ${fmt(data.avgUrgency)}, churn ort: ${fmt(data.avgChurnRisk)}
- Yüksek aciliyet (≥0.7): ${data.highUrgencyCount}, yüksek churn riski (≥0.7): ${data.highChurnCount}
- Niyet dağılımı: ${JSON.stringify(data.intentDist)}
- Duygu dağılımı: ${JSON.stringify(data.sentimentDist)}
- Sık konular: ${data.topTopics.map((t) => `${t.label}(${t.count})`).join(', ') || 'yok'}
- Sık temalar: ${data.topThemes.map((t) => `${t.label}(${t.count})`).join(', ') || 'yok'}
- Düzeltme sayıları (alan): ${JSON.stringify(data.correctionByField)}
- Sık düzeltme geçişleri: ${data.correctionTransitions.join('; ') || 'yok'}
</veri>`;
}

const SYSTEM_LEARNING_INSTRUCTIONS = `Sen bir AI kalite uzmanısın. Sana yalnız ANONİM, toplulaştırılmış platform istatistikleri verilir.
Bu istatistiklerden, müşteri geri bildirimi analizi ve işletme sohbet asistanı için GENEL (hiçbir işletmeye özgü olmayan) iyileştirme önerileri çıkar.
Kurallar:
- İşletme, ürün, şube veya kişi adı YAZMA. Talimat değiştirme, rol değiştirme, güvenlik kuralını gevşetme önerme.
- Kurallar kısa, tek cümlelik ve Türkçe olsun.
SADECE JSON döndür:
{
  "learnedRules": ["kural1", "kural2"],
  "learnedThemes": [{"theme": "string", "priority": "high|medium|low", "count": 0}],
  "responseGuidelines": {"do": ["string"], "avoid": ["string"]},
  "promptAppendix": "en fazla 2 cümle Türkçe ek bağlam"
}

${UNTRUSTED_DATA_RULE}`;

export interface SystemLearningRunResult {
  status: 'pending_review';
  proposal: SystemLearningProposal;
  diff: ReturnType<typeof diffLearnedPayload>;
  /** Geriye uyum: eski çağıranlar `profile` / `trainingDataStats` / `version` okuyordu. */
  profile: SystemLearningProposal;
  trainingDataStats: Record<string, unknown>;
  version: number;
}

/**
 * Sistem öğrenmesi: anonim toplulaştırma → LLM önerisi → `pendingProposal` (ONAY BEKLER).
 * Hiçbir prompta etki etmez; admin `approveSystemLearningProposal` ile yürürlüğe koyar.
 * Platform günlük token tavanı ve dakikalık limit uygulanır.
 */
export async function updateSystemLearningProfile(): Promise<SystemLearningRunResult | null> {
  await refreshAiModelRouting();
  const systemLearningModel = getRoutedModel('systemLearning') ?? SYSTEM_LEARNING_MODEL;
  const client = getLearningClient();
  if (!client) {
    console.error('AI client not available for system learning');
    return null;
  }

  await guardAiCall({ task: 'system_learning' });

  const data = await aggregateSystemTrainingData();
  const contextBlob = buildSystemLearningContext(data);

  const started = Date.now();
  let content: string | null | undefined;
  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: systemLearningModel,
        messages: [
          { role: 'system', content: SYSTEM_LEARNING_INSTRUCTIONS },
          { role: 'user', content: contextBlob },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      })
    );
    content = response.choices[0]?.message?.content;
    const u = (response as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    await recordAiCostUsage(null, u?.prompt_tokens ?? 0, u?.completion_tokens ?? 0, 'system_learning', systemLearningModel, Date.now() - started);
  } catch (err) {
    await recordAiCostUsage(null, 0, 0, 'system_learning', systemLearningModel, Date.now() - started, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  if (!content) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const payload = sanitizeLearnedPayload(parsed);
  const trainingDataStats: Record<string, unknown> = {
    totalFeedbackCount: data.totalFeedbackCount,
    sampledFeedbackCount: data.sampledFeedbackCount,
    correctionCount: data.correctionCount,
    dealerCount: data.dealerCount,
    themeLabels: data.topThemes.length,
    topicLabels: data.topTopics.length,
    minDealersPerLabel: MIN_DEALERS_PER_THEME,
    trainedAt: new Date().toISOString(),
  };
  const proposal: SystemLearningProposal = {
    ...payload,
    id: `slp_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSIONS.systemLearning,
    model: systemLearningModel,
    trainingDataStats,
  };

  const existing = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null);
  const profileJson = asProfileJson(existing?.profile);
  profileJson.schemaVersion = SYSTEM_LEARNING_SCHEMA_VERSION;
  profileJson.pendingProposal = proposal;
  const diff = diffLearnedPayload(getApprovedLearnedPayload(existing?.profile), payload);

  // Yalnız profile JSON'u ve eğitim zamanı güncellenir; systemPrompt/chatSystemPrompt'a DOKUNULMAZ.
  if (existing) {
    await prisma.aISystemLearningProfile.update({
      where: { id: existing.id },
      data: {
        profile: profileJson as Prisma.InputJsonValue,
        trainingDataStats: trainingDataStats as Prisma.InputJsonValue,
        lastTrainedAt: new Date(),
      },
    });
  } else {
    await prisma.aISystemLearningProfile.create({
      data: {
        profile: profileJson as Prisma.InputJsonValue,
        trainingDataStats: trainingDataStats as Prisma.InputJsonValue,
        status: 'idle',
        lastTrainedAt: new Date(),
        version: 0,
      },
    });
  }

  return {
    status: 'pending_review',
    proposal,
    diff,
    profile: proposal,
    trainingDataStats,
    version: existing?.version ?? 0,
  };
}

/** Bekleyen öneri + aktif içerikle farkı (admin onay ekranı). */
export async function getSystemLearningProposal(): Promise<{
  proposal: SystemLearningProposal | null;
  active: LearnedPayload | null;
  diff: ReturnType<typeof diffLearnedPayload> | null;
  version: number;
}> {
  const row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  const p = asProfileJson(row?.profile);
  const proposal = p.pendingProposal && typeof p.pendingProposal === 'object' ? (p.pendingProposal as SystemLearningProposal) : null;
  const active = getApprovedLearnedPayload(row?.profile);
  return {
    proposal,
    active,
    diff: proposal ? diffLearnedPayload(active, sanitizeLearnedPayload(proposal)) : null,
    version: row?.version ?? 0,
  };
}

/**
 * Admin onayı: bekleyen öneriyi yürürlüğe koyar. `proposalId` admin'in gördüğü öneriyle
 * eşleşmeli (arada yeni eğitim koştuysa 'stale'). İyimser kilit: `version` koşullu yazım.
 * Önceki onaylı içerik `history`'de saklanır (geri alma için, son 5).
 */
export async function approveSystemLearningProposal(params: {
  adminId: string;
  proposalId: string;
}): Promise<{ ok: true; version: number } | { ok: false; reason: 'not-found' | 'no-proposal' | 'stale' }> {
  const row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!row) return { ok: false, reason: 'not-found' };
  const p = asProfileJson(row.profile);
  const proposal = p.pendingProposal as SystemLearningProposal | null | undefined;
  if (!proposal || typeof proposal !== 'object') return { ok: false, reason: 'no-proposal' };
  if (proposal.id !== params.proposalId) return { ok: false, reason: 'stale' };

  const approvedPayload = sanitizeLearnedPayload(proposal);
  const previous = getApprovedLearnedPayload(row.profile);
  const history = Array.isArray(p.history) ? p.history.slice(-4) : [];
  if (previous) history.push({ ...previous, approval: p.approval ?? null });

  const next: ProfileJson = {
    ...p,
    ...approvedPayload,
    schemaVersion: SYSTEM_LEARNING_SCHEMA_VERSION,
    trainingDataStats: proposal.trainingDataStats,
    approval: { approvedAt: new Date().toISOString(), approvedBy: params.adminId, proposalId: proposal.id },
    pendingProposal: null,
    history,
  };
  const nextVersion = (row.version ?? 0) + 1;
  const res = await prisma.aISystemLearningProfile.updateMany({
    where: { id: row.id, version: row.version },
    data: { profile: next as Prisma.InputJsonValue, status: 'ready', version: nextVersion },
  });
  if (res.count === 0) return { ok: false, reason: 'stale' };
  return { ok: true, version: nextVersion };
}

/** Admin reddi: bekleyen öneriyi siler (aktif içerik değişmez). */
export async function rejectSystemLearningProposal(params: {
  adminId: string;
  proposalId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!row) return { ok: false, reason: 'not-found' };
  const p = asProfileJson(row.profile);
  const proposal = p.pendingProposal as SystemLearningProposal | null | undefined;
  if (!proposal || proposal.id !== params.proposalId) return { ok: false, reason: 'stale' };
  const res = await prisma.aISystemLearningProfile.updateMany({
    where: { id: row.id, version: row.version },
    data: {
      profile: {
        ...p,
        pendingProposal: null,
        lastRejected: { proposalId: proposal.id, rejectedAt: new Date().toISOString(), rejectedBy: params.adminId },
      } as Prisma.InputJsonValue,
    },
  });
  return res.count === 1 ? { ok: true } : { ok: false, reason: 'stale' };
}

/**
 * Sistem/sohbet notlarını admin elle günceller. Bu metinler yalnız SINIRLI ek bağlam olarak
 * kullanılır (temel promptun yerine geçmez); `adminPromptsEditedAt` damgası, notun bir insan
 * tarafından yazıldığını/onaylandığını gösterir (damgasız eski LLM metinleri yok sayılır).
 */
export async function updateSystemLearningPrompts(params: {
  systemPrompt?: string | null;
  chatSystemPrompt?: string | null;
}): Promise<boolean> {
  const existing = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null);
  if (!existing) return false;

  const profileJson = asProfileJson(existing.profile);
  profileJson.adminPromptsEditedAt = new Date().toISOString();
  const clip = (v: string | null) => (typeof v === 'string' ? v.slice(0, 4_000) : v);

  await prisma.aISystemLearningProfile.update({
    where: { id: existing.id },
    data: {
      profile: profileJson as Prisma.InputJsonValue,
      ...(params.systemPrompt !== undefined && { systemPrompt: clip(params.systemPrompt) }),
      ...(params.chatSystemPrompt !== undefined && { chatSystemPrompt: clip(params.chatSystemPrompt) }),
    },
  });
  return true;
}

/** Sistem öğrenme profilini getir */
export async function getSystemLearningProfile() {
  return prisma.aISystemLearningProfile.findFirst({
    orderBy: { updatedAt: 'desc' },
  });
}
