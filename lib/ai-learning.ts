import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { parseNonNegativeIntEnv } from '@/lib/safe-env-number';
import { localEmbed, embedFromFeatures, LOCAL_EMBEDDING_MODEL, cosineSimilarity } from '@/lib/local-embedding';

/** Groq LLM destekli embedding model etiketi (yerel uzayla uyumlu vektör). */
const GROQ_EMBED_MODEL = 'groq-llm-features-v1';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const LEARNING_MODEL =
  process.env.AI_LEARNING_MODEL ||
  process.env.OPENAI_LEARNING_MODEL ||
  (process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'gpt-4o-mini');

let embeddingClient: OpenAI | null = null;
let learningClient: OpenAI | null = null;

function getEmbeddingClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!embeddingClient) {
    embeddingClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return embeddingClient;
}

function getLearningClient(): OpenAI | null {
  if (process.env.GROQ_API_KEY) {
    if (!learningClient || (learningClient as OpenAI & { baseURL?: string }).baseURL !== 'https://api.groq.com/openai/v1') {
      learningClient = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
    return learningClient;
  }
  if (process.env.OPENAI_API_KEY) {
    if (!learningClient) {
      learningClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return learningClient;
  }
  return null;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(resolve => setTimeout(resolve, 400));
    return withRetry(fn, retries - 1);
  }
}

/**
 * Groq LLM ile metni deterministik semantik özelliklere indirir (tema, niyet,
 * anahtar kelimeler), sonra bu özelliklerden cosine-karşılaştırılabilir vektör
 * türetir. Groq embedding modeli SUNMADIĞI için (canlı doğrulandı), gerçek LLM
 * anlayışını embedding'e dönüştürmenin Groq-yolu budur.
 */
async function groqFeatureEmbedding(text: string): Promise<number[] | null> {
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

async function generateEmbedding(text: string): Promise<{ vector: number[]; model: string } | null> {
  if (!text || text.trim().length < 5) return null;
  const safeText = text.trim().slice(0, 4000);

  // 1) Tercih: gerçek OpenAI embedding (en yüksek kalite).
  const client = getEmbeddingClient();
  if (client) {
    try {
      const response = await withRetry(() =>
        client.embeddings.create({ model: EMBEDDING_MODEL, input: safeText })
      );
      const vector = response.data?.[0]?.embedding;
      if (vector) return { vector, model: EMBEDDING_MODEL };
    } catch (err) {
      console.error('OpenAI embedding failed, falling back:', err);
    }
  }

  // 2) Groq LLM destekli embedding: LLM metni semantik özelliklere indirir,
  //    biz vektörleştiririz (Groq gerçekten kullanılır — embedding modeli yok).
  try {
    const groqVec = await groqFeatureEmbedding(safeText);
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
    const embedding = await generateEmbedding(params.text);
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
  const query = await generateEmbedding(params.text);
  if (!query) return [];

  const limit = params.limit ?? 5;
  const minScore = params.minScore ?? 0.4;

  // Aynı model ailesiyle üretilmiş vektörler kıyaslanabilir (boyut + uzay aynı).
  const rows = await prisma.aIEmbedding.findMany({
    where: { dealerId: params.dealerId, model: query.model, dimension: query.vector.length },
    select: { feedbackId: true, vector: true },
    orderBy: { createdAt: 'desc' },
    take: 1000, // bellek koruması: en güncel 1000 vektör
  });

  const scored = rows
    .map((r) => {
      const vec = r.vector as unknown;
      if (!Array.isArray(vec)) return null;
      return { feedbackId: r.feedbackId, score: cosineSimilarity(query.vector, vec as number[]) };
    })
    .filter((x): x is { feedbackId: string; score: number } => x !== null && x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
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
  const feedbacks = await prisma.feedback.findMany({
    where: { qrCode: { dealerId }, text: { not: null } },
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
  const client = getLearningClient();
  if (client) {
    const compactText = (value: string | null) => (value || '').replace(/\s+/g, ' ').slice(0, 240);
    const contextSample = feedbacks
      .slice(0, 30)
      .map((f, i) => `${i + 1}. "${compactText(f.text)}" [sentiment: ${f.sentiment || '-'}, intent: ${f.intent || '-'}]`)
      .join('\n');
    const correctionSample = corrections
      .slice(0, 15)
      .map((c, i) => `${i + 1}. ${c.field} old=${JSON.stringify(c.oldValue)} new=${JSON.stringify(c.newValue)}`)
      .join('\n');

    const response = await withRetry(() =>
      client.chat.completions.create({
        model: LEARNING_MODEL,
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
- 5-8 tema ve 6-10 terim ile sınırlı kal`,
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

    const content = response.choices[0]?.message?.content;
    if (content) {
      profile = JSON.parse(content);
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
// SISTEM GENELİ AI ÖĞRENME (Tüm veritabanı verileriyle)
// ─────────────────────────────────────────────────────────────

const SYSTEM_LEARNING_MODEL =
  process.env.AI_SYSTEM_LEARNING_MODEL ||
  process.env.AI_LEARNING_MODEL ||
  process.env.OPENAI_LEARNING_MODEL ||
  (process.env.GROQ_API_KEY ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');

const MAX_FEEDBACKS = parseNonNegativeIntEnv(process.env.AI_SYSTEM_LEARNING_MAX_FEEDBACKS, 0);
const MAX_CORRECTIONS = parseNonNegativeIntEnv(process.env.AI_SYSTEM_LEARNING_MAX_CORRECTIONS, 0);
// 0 = sınırsız (tüm Neon DB verisi), aksi halde belirtilen limit

/** Tüm veritabanı verilerini topla (Neon DB'deki tüm veriler - derin öğrenme için) */
async function aggregateSystemTrainingData() {
  const [
    feedbacks,
    corrections,
    userCounts,
    dealerCount,
    aiSettings,
    intentGroups,
    sentimentGroups,
    topTopics,
    topThemes,
    businessNames,
    productNames,
    themeClusters,
    urgencyChurnStats,
  ] = await Promise.all([
    prisma.feedback.findMany({
      where: { deletedAt: null, text: { not: null } },
      select: {
        text: true,
        rating: true,
        sentiment: true,
        intent: true,
        topics: true,
        themes: true,
        entities: true,
        urgency: true,
        churnRisk: true,
        actionSuggestions: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      ...(MAX_FEEDBACKS > 0 && { take: MAX_FEEDBACKS }),
    }),
    prisma.aIFeedbackCorrection.findMany({
      orderBy: { createdAt: 'desc' },
      select: { field: true, oldValue: true, newValue: true, note: true },
      ...(MAX_CORRECTIONS > 0 && { take: MAX_CORRECTIONS }),
    }),
    prisma.user.groupBy({
      by: ['role'],
      _count: true,
    }),
    prisma.user.count({ where: { role: 'DEALER' } }),
    prisma.aISettings.findMany({
      select: { analysisLanguage: true, sentimentEnabled: true, customPrompt: true },
    }),
    prisma.feedback.groupBy({
      by: ['intent'],
      where: { deletedAt: null },
      _count: true,
    }).then((g) => {
      const m: Record<string, number> = {};
      g.forEach((r) => { m[String(r.intent || 'general')] = r._count; });
      return m;
    }),
    prisma.feedback.groupBy({
      by: ['sentiment'],
      where: { deletedAt: null },
      _count: true,
    }).then((g) => {
      const m: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
      g.forEach((r) => {
        const k = (r.sentiment || 'neutral').toLowerCase();
        if (m[k] !== undefined) m[k] = r._count;
      });
      return m;
    }),
    prisma.feedback
      .findMany({
        where: { deletedAt: null },
        select: { topics: true },
        ...(MAX_FEEDBACKS > 0 ? { take: Math.min(MAX_FEEDBACKS, 15000) } : {}),
      })
      .then((fs) => {
        const m = new Map<string, number>();
        fs.forEach((f) => {
          const t = (f.topics as string[]) || [];
          t.forEach((x) => m.set(String(x), (m.get(String(x)) || 0) + 1));
        });
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
      }),
    prisma.feedback
      .findMany({
        where: { deletedAt: null },
        select: { themes: true },
        ...(MAX_FEEDBACKS > 0 ? { take: Math.min(MAX_FEEDBACKS, 15000) } : {}),
      })
      .then((fs) => {
        const m = new Map<string, number>();
        fs.forEach((f) => {
          const t = (f.themes as Array<{ theme?: string; subTheme?: string }>) || [];
          t.forEach((x) => {
            const k = [x.theme, x.subTheme].filter(Boolean).join(' > ') || 'unknown';
            m.set(k, (m.get(k) || 0) + 1);
          });
        });
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
      }),
    prisma.user
      .findMany({
        where: { role: 'DEALER' },
        select: { businessName: true, name: true },
      })
      .then((u) => u.map((x) => x.businessName || x.name).filter(Boolean)),
    prisma.product
      .findMany({ select: { name: true }, take: 500 })
      .then((p) => p.map((x) => x.name).filter(Boolean)),
    prisma.aIThemeCluster
      .findMany({
        orderBy: { count: 'desc' },
        take: 50,
        select: { theme: true, subTheme: true, sentiment: true, count: true },
      })
      .then((t) => t.map((x) => `${x.theme}${x.subTheme ? ` > ${x.subTheme}` : ''} (${x.sentiment}, ${x.count})`)),
    Promise.all([
      prisma.feedback.count({ where: { deletedAt: null, urgency: { gte: 0.7 } } }),
      prisma.feedback.count({ where: { deletedAt: null, churnRisk: { gte: 0.7 } } }),
      prisma.feedback.aggregate({
        where: { deletedAt: null },
        _avg: { rating: true, urgency: true, churnRisk: true },
        _count: true,
      }),
    ]).then(([highUrgency, highChurn, agg]) => ({
      highUrgencyCount: highUrgency,
      highChurnCount: highChurn,
      avgRating: agg._avg.rating,
      avgUrgency: agg._avg.urgency,
      avgChurnRisk: agg._avg.churnRisk,
      totalCount: agg._count,
    })),
  ]);

  const userByRole = Object.fromEntries(userCounts.map((u) => [u.role, u._count]));
  const sampleTexts = feedbacks
    .filter((_, i) => i % Math.max(1, Math.floor(feedbacks.length / 200)) === 0)
    .slice(0, 200)
    .map((f) => (f.text || '').slice(0, 180))
    .filter(Boolean);
  const correctionSample = corrections
    .slice(0, 150)
    .map((c) => `${c.field}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`)
    .join('\n');
  const customPrompts = aiSettings
    .map((s) => s.customPrompt)
    .filter((p): p is string => !!p && p.length > 5)
    .slice(0, 30);

  return {
    feedbackCount: feedbacks.length,
    correctionCount: corrections.length,
    dealerCount,
    userByRole,
    topTopics: topTopics.map(([k, v]) => `${k}(${v})`).join(', '),
    topThemes: topThemes.map(([k, v]) => `${k}(${v})`).join(', '),
    intentDist: intentGroups,
    sentimentDist: sentimentGroups,
    sampleTexts,
    correctionSample,
    customPrompts,
    businessNames: Array.from(new Set(businessNames)).slice(0, 100),
    productNames: Array.from(new Set(productNames)).slice(0, 100),
    themeClusters,
    urgencyChurnStats,
  };
}

/** Dünya standartlarında sistem promptu + adaptif profil oluştur */
export async function updateSystemLearningProfile(): Promise<{
  profile: unknown;
  systemPrompt: string;
  chatSystemPrompt?: string;
  trainingDataStats: unknown;
  version: number;
} | null> {
  const client = getLearningClient();
  if (!client) {
    console.error('AI client not available for system learning');
    return null;
  }

  const data = await aggregateSystemTrainingData();
  const totalFeedbacks = await prisma.feedback.count({ where: { deletedAt: null } });
  const totalCorrections = await prisma.aIFeedbackCorrection.count();

  const stats = data.urgencyChurnStats as {
    highUrgencyCount: number;
    highChurnCount: number;
    avgRating: number | null;
    avgUrgency: number | null;
    avgChurnRisk: number | null;
    totalCount: number;
  } | undefined;
  const contextBlob = `
VERİ ÖZETİ (Neon DB - tüm canlı veriler):
- Toplam geri bildirim: ${totalFeedbacks}
- Toplam AI düzeltmesi: ${totalCorrections}
- Dealer sayısı: ${data.dealerCount}
- Kullanıcı dağılımı: ${JSON.stringify(data.userByRole)}
${stats ? `- Ortalama puan: ${stats.avgRating?.toFixed(2) ?? '-'}, Aciliyet ort: ${stats.avgUrgency?.toFixed(2) ?? '-'}, Churn ort: ${stats.avgChurnRisk?.toFixed(2) ?? '-'}` : ''}
${stats ? `- Yüksek aciliyet (≥0.7): ${stats.highUrgencyCount}, Yüksek churn riski (≥0.7): ${stats.highChurnCount}` : ''}

EN ÇOK GEÇEN KONULAR: ${data.topTopics || 'yok'}
EN ÇOK GEÇEN TEMALAR: ${data.topThemes || 'yok'}
NİYET DAĞILIMI: ${JSON.stringify(data.intentDist)}
DUYGU DAĞILIMI: ${JSON.stringify(data.sentimentDist)}
${(data.themeClusters as string[])?.length ? `TEMA KÜMELERİ (AIThemeCluster): ${(data.themeClusters as string[]).join('; ')}` : ''}
${(data.businessNames as string[])?.length ? `İŞLETME ADLARI: ${(data.businessNames as string[]).join(', ')}` : ''}
${(data.productNames as string[])?.length ? `ÜRÜN ADLARI: ${(data.productNames as string[]).join(', ')}` : ''}

GERİ BİLDİRİM ÖRNEKLERİ (tüm veritabanından örneklenmiş):
${data.sampleTexts.slice(0, 120).map((t, i) => `${i + 1}. "${t}"`).join('\n')}

KULLANICI DÜZELTMELERİ (AI'ın öğrenmesi gereken - tüm düzeltmeler):
${data.correctionSample || 'Henüz düzeltme yok'}

İŞLETME ÖZEL PROMPTLARI (örnekler):
${data.customPrompts.slice(0, 15).join('\n---\n') || 'Yok'}
`.trim();

  const WORLD_CLASS_SYSTEM_PROMPT_BASE = `Sen QRATEX platformunun merkezi yapay zeka motorusun. Müşteri geri bildirimi analizi, içgörü üretimi ve doğal dil sorgulama için dünya standartlarında performans sergilersin.

ROL VE SORUMLULUKLAR:
1. Geri bildirim metinlerini Türkçe bağlamda derinlemesine analiz et (duygu, niyet, aciliyet, churn riski, temalar, varlıklar).
2. Somut, uygulanabilir (actionable) öneriler üret; belirsiz veya genel ifadelerden kaçın.
3. İşletme verilerine dayalı yanıt ver; veri yoksa "Bu konuda yeterli veri yok" de.
4. Türkçe dilbilgisi ve tonuna uygun yaz; profesyonel ve saygılı ol.

KALİTE PRENSİPLERİ:
- Her çıktı veriye dayalı, tekrarlanabilir ve tutarlı olsun.
- Düzeltmelerden öğren: Kullanıcılar AI sonucunu düzelttiğinde bu kalıpları sonraki analizlere yansıt.
- İşletme özel terimlerini (ürün adları, lokasyonlar, marka terimleri) koru ve doğru kullan.
- Toksik, küfür veya uygunsuz içeriği tespit et ve işaretle.`;

  const response = await withRetry(() =>
    client.chat.completions.create({
      model: SYSTEM_LEARNING_MODEL,
      messages: [
        {
          role: 'system',
          content: `Sen bir AI öğrenme ve adaptasyon uzmanısın. Verilen VERİ ÖZETİ'ni analiz edip:
1) Sisteme eklenecek ÖĞRENILEN KURALLAR (learnedRules) JSON dizisi
2) ÖĞRENILEN TEMALAR (learnedThemes) - sık geçen temalar ve öncelikleri
3) VARLIK ALIAS'LARI (entityAliases) - yaygın varlık eşleştirmeleri
4) YANIT REHBERİ (responseGuidelines) - "yap" ve "kaçın" kuralları
5) GÜNCELLENMİŞ SİSTEM PROMPT EKİ - mevcut prompta eklenmesi gereken 2-4 cümle

SADECE JSON döndür:
{
  "learnedRules": ["kural1", "kural2"],
  "learnedThemes": [{"theme": "string", "priority": "high|medium|low", "count": number}],
  "entityAliases": [{"alias": "string", "canonical": "string", "type": "string"}],
  "responseGuidelines": {"do": ["string"], "avoid": ["string"]},
  "systemPromptAppendix": "2-4 cümle Türkçe ek"
}`,
        },
        { role: 'user', content: contextBlob },
      ],
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    })
  );

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  let learned: Record<string, unknown>;
  try {
    learned = JSON.parse(content);
  } catch {
    return null;
  }

  const systemPromptAppendix = (learned.systemPromptAppendix as string) || '';
  const fullSystemPrompt = `${WORLD_CLASS_SYSTEM_PROMPT_BASE}\n\n${systemPromptAppendix}`.trim();

  // Sohbet için ayrı prompt üret (chatSystemPrompt)
  let chatSystemPrompt: string | null = null;
  try {
    const chatResponse = await withRetry(() =>
      client.chat.completions.create({
        model: SYSTEM_LEARNING_MODEL,
        messages: [
          {
            role: 'system',
            content: `Sen bir sohbet asistanı prompt tasarım uzmanısın. Verilen VERİ ÖZETİ ve ÖĞRENILEN KURALLAR'a göre, QRATEX platformundaki AI sohbet asistanı için ÖZEL bir "Sohbet Sistemi Promptu" yaz. Bu prompt:
1) Sadece doğal dil sohbeti için kullanılacak (analiz değil)
2) Kullanıcı sorularına veriye dayalı, kısa, net yanıt vermeyi vurgulasın
3) Öğrenilmiş kuralları ve rehberleri içersin
4) Türkçe, profesyonel ama samimi ton
5) Max 400 kelime

Sadece prompt metnini döndür, JSON veya etiket kullanma.`,
          },
          { role: 'user', content: `Öğrenilen kurallar: ${JSON.stringify(learned.learnedRules)}\nRehber: ${JSON.stringify(learned.responseGuidelines)}\n\nVeri özeti: ${contextBlob.slice(0, 1500)}` },
        ],
        temperature: 0.3,
        max_tokens: 600,
      })
    );
    const chatContent = chatResponse.choices[0]?.message?.content;
    if (chatContent?.trim()) {
      chatSystemPrompt = chatContent.trim();
    }
  } catch (err) {
    console.warn('Chat system prompt generation failed:', err);
  }

  const profile = {
    learnedRules: learned.learnedRules || [],
    learnedThemes: learned.learnedThemes || [],
    entityAliases: learned.entityAliases || [],
    responseGuidelines: learned.responseGuidelines || { do: [], avoid: [] },
    trainingDataStats: {
      feedbackCount: totalFeedbacks,
      correctionCount: totalCorrections,
      dealerCount: data.dealerCount,
      userByRole: data.userByRole,
      businessNamesCount: (data.businessNames as string[])?.length ?? 0,
      productNamesCount: (data.productNames as string[])?.length ?? 0,
      themeClustersCount: (data.themeClusters as string[])?.length ?? 0,
      urgencyChurnStats: data.urgencyChurnStats,
      trainedAt: new Date().toISOString(),
    },
  };

  const existing = await prisma.aISystemLearningProfile.findFirst().catch(() => null);
  const nextVersion = existing?.version ? existing.version + 1 : 1;

  const updateData = {
    profile,
    systemPrompt: fullSystemPrompt,
    chatSystemPrompt: chatSystemPrompt ?? undefined,
    trainingDataStats: profile.trainingDataStats as object,
    status: 'ready' as const,
    lastTrainedAt: new Date(),
    version: nextVersion,
  };

  if (existing) {
    await prisma.aISystemLearningProfile.update({
      where: { id: existing.id },
      data: updateData,
    });
  } else {
    await prisma.aISystemLearningProfile.create({
      data: { ...updateData, chatSystemPrompt: chatSystemPrompt ?? null },
    });
  }

  return {
    profile,
    systemPrompt: fullSystemPrompt,
    chatSystemPrompt: chatSystemPrompt ?? undefined,
    trainingDataStats: profile.trainingDataStats,
    version: nextVersion,
  };
}

/** Sistem/sohbet promptlarını manuel güncelle (admin düzenlemesi) */
export async function updateSystemLearningPrompts(params: {
  systemPrompt?: string | null;
  chatSystemPrompt?: string | null;
}): Promise<boolean> {
  const existing = await prisma.aISystemLearningProfile.findFirst().catch(() => null);
  if (!existing) return false;

  await prisma.aISystemLearningProfile.update({
    where: { id: existing.id },
    data: {
      ...(params.systemPrompt !== undefined && { systemPrompt: params.systemPrompt }),
      ...(params.chatSystemPrompt !== undefined && { chatSystemPrompt: params.chatSystemPrompt }),
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
