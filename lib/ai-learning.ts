import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';

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

async function generateEmbedding(text: string): Promise<{ vector: number[]; model: string } | null> {
  const client = getEmbeddingClient();
  if (!client) return null;
  if (!text || text.trim().length < 5) return null;

  const safeText = text.trim().slice(0, 4000);
  const response = await withRetry(() =>
    client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: safeText,
    })
  );

  const vector = response.data?.[0]?.embedding;
  if (!vector) return null;
  return { vector, model: EMBEDDING_MODEL };
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

    if (!profile && newFeedbackCount >= 20) {
      await updateAdaptiveProfile(dealerId);
    } else if (profile && newFeedbackCount >= 30) {
      await updateAdaptiveProfile(dealerId);
    }
  } catch (error) {
    console.error('Adaptive update check failed:', error);
  }
}
