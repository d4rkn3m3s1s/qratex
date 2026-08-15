/**
 * QRATEX AI Engine v2.0
 * 
 * Kapsamlı AI analiz motoru:
 * - Experience Signals (intent, urgency, effort, churn)
 * - Advanced NLP (entity recognition, theme discovery, statement-level sentiment)
 * - Action Suggestions (otomatik aksiyon önerileri)
 * - Bulk Analysis (toplu analiz)
 * - Theme Clustering (tema kümeleme)
 * - AI Insights Report (haftalık/aylık rapor)
 * - Ask AI (doğal dil ile veri sorgulama)
 */

import OpenAI from 'openai';
import { checkAiCostGuard, recordAiCostUsage } from '@/lib/ai-cost-guard';
import { detectPromptInjection } from '@/lib/prompt-injection';
import { getSystemLearningProfile } from '@/lib/ai-learning';
import type {
  AIAnalysisResult,
  AIEntity,
  AITheme,
  AIStatementSentiment,
  AIActionSuggestion,
  AIInsightReportData,
  AIThemeClusterData,
} from '@/types';

export interface AnalyzeOptions {
  customPrompt?: string;
  adaptiveProfile?: string;
  dealerId?: string;
}

// ─────────────────────────────────────────────────────────────
// AI CLIENT & CONFIG
// ─────────────────────────────────────────────────────────────

const AI_VERSION = '2.0';

let aiClient: OpenAI | null = null;

function getAIClient(): OpenAI | null {
  if (process.env.GROQ_API_KEY) {
    if (!aiClient || (aiClient as OpenAI & { baseURL?: string }).baseURL !== 'https://api.groq.com/openai/v1') {
      aiClient = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
    return aiClient;
  }
  if (process.env.OPENAI_API_KEY) {
    if (!aiClient) {
      aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return aiClient;
  }
  return null;
}

function getModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  // HACİM yolu (her feedback analiz edilir) → ücretsiz tier'da 14.4K istek/gün + 500K token/gün.
  // Model tablosu/gerekçe: lib/groq.ts MODELS.
  if (process.env.GROQ_API_KEY) return 'llama-3.1-8b-instant';
  return process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
}

function getModelProvider(): string {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}

/** Gerçek bir LLM sağlayıcısı yapılandırılmış mı? (Groq veya OpenAI) */
export function isAIConfigured(): boolean {
  return getAIClient() !== null;
}

/** UI/health için sağlayıcı + model bilgisi. */
export function getAIProviderStatus(): { configured: boolean; provider: string; model: string | null } {
  const configured = isAIConfigured();
  return {
    configured,
    provider: getModelProvider(),
    model: configured ? getModel() : null,
  };
}

/**
 * Genel amaçlı LLM chat completion. Gerçek sağlayıcı yoksa null döner
 * (sahte/şablon yanıt ÜRETMEZ — çağıran taraf dürüstçe degraded davranır).
 * Agent Council ve diğer üretken akışlar bunu kullanır.
 */
export async function runChatCompletion(params: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  dealerId?: string;
}): Promise<{ content: string; modelUsed: string } | null> {
  const client = getAIClient();
  if (!client) return null;

  if (detectPromptInjection(params.user)) {
    console.warn('[AI] Prompt injection detected in runChatCompletion input');
    return null;
  }

  if (params.dealerId) {
    await checkAiCostGuard(params.dealerId);
  }

  const start = Date.now();
  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        temperature: params.temperature ?? 0.6,
        max_tokens: params.maxTokens ?? 900,
        ...(params.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      })
    );
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const latencyMs = Date.now() - start;
    const modelUsed = `${getModelProvider()}/${getModel()}`;
    logAIUsage('chat_completion', modelUsed, latencyMs, true);
    if (params.dealerId) {
      await recordAiCostUsage(
        params.dealerId,
        response.usage?.prompt_tokens ?? 0,
        response.usage?.completion_tokens ?? 0,
        'chat_completion',
        modelUsed,
        latencyMs
      );
    }
    return { content, modelUsed };
  } catch (error) {
    logAIUsage('chat_completion', getModel(), Date.now() - start, false, error instanceof Error ? error.message : 'unknown');
    console.error('[AI] runChatCompletion failed:', error);
    return null;
  }
}

// Retry logic
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const msg = error?.message || '';
    const status = error?.status || error?.statusCode || 0;
    const isRateLimit = msg.includes('rate_limit') || msg.includes('429') || msg.includes('Rate limit') || status === 429;
    if (retries > 0 && isRateLimit) {
      const delay = RETRY_DELAY * (MAX_RETRIES - retries + 1);
      console.log(`[AI] Rate limited, retrying in ${delay}ms (${retries} left)`);
      await sleep(delay);
      return withRetry(fn, retries - 1);
    }
    console.error(`[AI] withRetry failed:`, msg || error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// COMPREHENSIVE FEEDBACK ANALYSIS (Experience Signals)
// ─────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `Sen QRATEX platformunun gelişmiş müşteri geri bildirimi analiz motorusun. Türkçe metinleri derinlemesine analiz et ve SADECE JSON formatında yanıt ver.

Analiz etmen gereken tüm boyutlar:

1. **sentiment**: Genel duygu analizi
   - label: "positive" | "negative" | "neutral"
   - score: 0-1 arası güven skoru

2. **emotions**: Tespit edilen duygular (birden fazla olabilir)
   - Olası duygular: happy, satisfied, grateful, excited, disappointed, angry, frustrated, sad, confused, neutral, surprised, worried
   - Her duygu için score (0-1)

3. **topics**: Metinde geçen konular
   - Olası konular: service, quality, price, atmosphere, staff, food, cleanliness, speed, location, parking, menu, portion, taste, temperature, presentation, reservation, waiting, delivery, packaging, payment

4. **toxicity**: Toksik/uygunsuz içerik kontrolü
   - isToxic: boolean
   - score: 0-1
   - categories: ["harassment", "hate", "profanity", "threat", "spam"]

5. **intent**: Geri bildirimin amacı
   - label: "complaint" | "suggestion" | "praise" | "question" | "general"
   - score: 0-1 güven skoru

6. **urgency**: Aciliyet skoru (0-1)
   - 0: Acil değil, genel yorum
   - 0.3: Düşük aciliyet, iyileştirme önerisi
   - 0.5: Orta aciliyet, belirgin bir sorun var
   - 0.7: Yüksek aciliyet, ciddi memnuniyetsizlik
   - 1.0: Kritik, hemen aksiyon gerekli (sağlık, güvenlik vs.)

7. **effortScore**: Müşteri efor skoru (0-1)
   - 0: Hiç zorluk yaşamamış
   - 0.5: Orta düzey zorluk
   - 1.0: Çok fazla zorluk yaşamış

8. **churnRisk**: Müşteri kaybı riski (0-1)
   - 0: Sadık müşteri, kaybetme riski yok
   - 0.5: Orta risk
   - 1.0: Çok yüksek risk, muhtemelen geri gelmeyecek

9. **entities**: Metinde geçen varlıklar
   - type: "product" | "person" | "location" | "service" | "facility" | "brand" | "other"
   - name: Varlık adı
   - sentiment: Bu varlık hakkındaki duygu

10. **themes**: Ana temalar ve alt temalar
    - theme: Ana tema (ör: "Hizmet Kalitesi")
    - subTheme: Alt tema (ör: "Personel İlgisi")
    - sentiment: Bu tema hakkındaki duygu
    - score: 0-1

11. **statementSentiments**: Cümle bazlı duygu analizi
    - Her cümle/ifade için ayrı sentiment
    - statement: Orijinal cümle
    - sentiment: "positive" | "negative" | "neutral"
    - score: 0-1

12. **actionSuggestions**: Otomatik aksiyon önerileri
    - action: Yapılması gereken eylem
    - priority: "low" | "medium" | "high" | "critical"
    - impact: Beklenen etki açıklaması
    - category: "staff_training" | "process" | "product" | "facility" | "communication" | "pricing" | "other"

13. **summary**: Kısa özet (max 40 kelime, Türkçe)

JSON formatı:
{
  "sentiment": { "label": "positive", "score": 0.85 },
  "emotions": [{ "label": "happy", "score": 0.8 }],
  "topics": ["service", "quality"],
  "toxicity": { "isToxic": false, "score": 0.05, "categories": [] },
  "intent": { "label": "praise", "score": 0.9 },
  "urgency": 0.1,
  "effortScore": 0.2,
  "churnRisk": 0.1,
  "entities": [{ "type": "person", "name": "Ahmet", "sentiment": "positive" }],
  "themes": [{ "theme": "Hizmet Kalitesi", "subTheme": "Personel İlgisi", "sentiment": "positive", "score": 0.9 }],
  "statementSentiments": [{ "statement": "Yemekler harikaydı", "sentiment": "positive", "score": 0.95 }],
  "actionSuggestions": [{ "action": "Personeli takdir edin", "priority": "low", "impact": "Motivasyon artışı", "category": "staff_training" }],
  "summary": "Müşteri hizmetten ve yemeklerden çok memnun."
}`;

function buildAnalysisSystemPrompt(customPrompt?: string, adaptiveProfile?: string) {
  let prompt = ANALYSIS_SYSTEM_PROMPT;

  if (adaptiveProfile && adaptiveProfile.trim().length > 0) {
    prompt += `\n\n---\nÖğrenilmiş İşletme Profili (bağlam):\n${adaptiveProfile}\nBu bağlamı analizde dikkate al.`;
  }

  if (customPrompt && customPrompt.trim().length > 0) {
    prompt += `\n\n---\nÖzel Prompt (işletme bağlamı):\n${customPrompt}\nBu bağlamı analizde dikkate al.`;
  }

  return prompt;
}

/**
 * Kapsamlı AI feedback analizi - Experience Signals dahil
 */
export async function analyzeComprehensive(
  text: string,
  options: AnalyzeOptions = {}
): Promise<AIAnalysisResult | null> {
  const client = getAIClient();
  if (!client) {
    console.warn('AI API key not configured (GROQ_API_KEY or OPENAI_API_KEY)');
    return null;
  }

  if (!text || text.trim().length < 5) {
    return null;
  }
  if (detectPromptInjection(text)) {
    console.warn('[AI] Prompt injection attempt detected, rejecting input');
    return null;
  }

  const startTime = Date.now();

  if (options.dealerId) {
    await checkAiCostGuard(options.dealerId);
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: buildAnalysisSystemPrompt(options.customPrompt, options.adaptiveProfile) },
          { role: 'user', content: `Analiz et: "${text}"` },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      })
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const a = JSON.parse(content);
    const latencyMs = Date.now() - startTime;
    const modelUsed = `${getModelProvider()}/${getModel()}`;

    const result: AIAnalysisResult = {
      // Core
      sentiment: {
        label: a.sentiment?.label || 'neutral',
        score: a.sentiment?.score || 0.5,
      },
      // NORMALİZASYON (kök neden fix): LLM emotions'ı string veya {label,score} olarak
      // dönebilir; topics'i string veya {topic/label} obj olarak. DB'ye HER ZAMAN tutarlı
      // şekil yazılsın (aksi halde okuma tarafında .forEach/.map non-array/obj'de patlıyordu).
      emotions: (Array.isArray(a.emotions) ? a.emotions : [])
        .map((e: unknown) => {
          if (typeof e === 'string') return { label: e, score: 0.5 };
          const o = e as { label?: string; score?: number };
          return { label: String(o?.label ?? ''), score: typeof o?.score === 'number' ? o.score : 0.5 };
        })
        .filter((e: { label: string }) => e.label.length > 0),
      topics: (Array.isArray(a.topics) ? a.topics : [])
        .map((t: unknown) => {
          if (typeof t === 'string') return t;
          const o = t as { topic?: string; label?: string; name?: string };
          return String(o?.topic ?? o?.label ?? o?.name ?? '');
        })
        .filter((t: string) => t.length > 0),
      toxicity: {
        isToxic: a.toxicity?.isToxic || false,
        score: a.toxicity?.score || 0,
        categories: a.toxicity?.categories || [],
      },
      summary: a.summary,

      // Experience Signals
      intent: a.intent ? {
        label: a.intent.label || 'general',
        score: a.intent.score || 0.5,
      } : undefined,
      urgency: typeof a.urgency === 'number' ? a.urgency : undefined,
      effortScore: typeof a.effortScore === 'number' ? a.effortScore : undefined,
      churnRisk: typeof a.churnRisk === 'number' ? a.churnRisk : undefined,

      // Advanced NLP
      entities: (a.entities || []).map((e: AIEntity) => ({
        type: e.type || 'other',
        name: e.name,
        sentiment: e.sentiment,
      })),
      themes: (a.themes || []).map((t: AITheme) => ({
        theme: t.theme,
        subTheme: t.subTheme,
        sentiment: t.sentiment || 'neutral',
        score: t.score || 0.5,
      })),
      statementSentiments: (a.statementSentiments || []).map((s: AIStatementSentiment) => ({
        statement: s.statement,
        sentiment: s.sentiment || 'neutral',
        score: s.score || 0.5,
      })),
      actionSuggestions: (a.actionSuggestions || []).map((s: AIActionSuggestion) => ({
        action: s.action,
        priority: s.priority || 'medium',
        impact: s.impact,
        category: s.category,
      })),

      // Meta
      modelUsed,
      version: AI_VERSION,
    };

    logAIUsage('analyze', modelUsed, latencyMs, true);
    if (options.dealerId) {
      const u = (response as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
      const in_ = u?.prompt_tokens ?? 0;
      const out = u?.completion_tokens ?? 0;
      await recordAiCostUsage(options.dealerId, in_, out, 'analyze', modelUsed, latencyMs);
    }

    return result;
  } catch (error) {
    console.error('Error in comprehensive analysis:', error);
    logAIUsage('analyze', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, false, String(error));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// BULK ANALYSIS
// ─────────────────────────────────────────────────────────────

/**
 * Birden fazla feedback'i toplu analiz et
 */
export async function analyzeBulk(
  feedbacks: { id: string; text: string }[],
  options: AnalyzeOptions = {}
): Promise<Map<string, AIAnalysisResult>> {
  const results = new Map<string, AIAnalysisResult>();

  // 2'li batch'ler halinde işle (rate limit koruması - Groq free tier için)
  const batchSize = 2;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AI] analyzeBulk: ${feedbacks.length} feedbacks, batchSize=${batchSize}`);
  }
  for (let i = 0; i < feedbacks.length; i += batchSize) {
    const batch = feedbacks.slice(i, i + batchSize);
    const promises = batch.map(async (fb) => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[AI] Analyzing fb ${fb.id}: "${fb.text?.slice(0, 50) ?? ''}..."`);
        }
        const result = await analyzeComprehensive(fb.text, options);
        if (result) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[AI] ✓ fb ${fb.id} analyzed: intent=${result.intent?.label}, urgency=${result.urgency}`);
          }
          results.set(fb.id, result);
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[AI] ✗ fb ${fb.id} returned null`);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[AI] ✗ fb ${fb.id} error:`, err);
        } else {
          console.error('[AI] analyzeBulk item error:', err);
        }
      }
    });
    await Promise.allSettled(promises);

    // Rate limit arasında daha uzun bekleme (Groq free tier)
    if (i + batchSize < feedbacks.length) {
      await sleep(2000);
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// THEME CLUSTERING
// ─────────────────────────────────────────────────────────────

/**
 * Feedback'lerden tema kümeleri oluştur
 */
export async function clusterThemes(
  feedbacks: { text: string; sentiment?: string; rating?: number; themes?: AITheme[] }[],
  period: string
): Promise<AIThemeClusterData[]> {
  const client = getAIClient();
  if (!client || feedbacks.length === 0) return [];

  // Eğer zaten tema çıkarılmışsa, lokal kümeleme yap
  const existingThemes = feedbacks.filter(f => f.themes && f.themes.length > 0);
  if (existingThemes.length > feedbacks.length * 0.5) {
    return clusterFromExistingThemes(existingThemes.map(f => f.themes!).flat());
  }

  // AI ile kümeleme
  const startTime = Date.now();
  try {
    const feedbackTexts = feedbacks
      .slice(0, 50) // Max 50 feedback
      .map((f, i) => `${i + 1}. "${f.text}" (Puan: ${f.rating || '?'}, Duygu: ${f.sentiment || '?'})`)
      .join('\n');

    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        messages: [
          {
            role: 'system',
            content: `Sen bir tema analisti asistanısın. Verilen geri bildirimleri analiz edip ana temaları ve alt temaları keşfet. SADECE JSON formatında yanıt ver.

JSON formatı:
{
  "clusters": [
    {
      "theme": "Ana Tema Adı",
      "subTheme": "Alt Tema (opsiyonel)",
      "sentiment": "positive|negative|neutral|mixed",
      "count": 5,
      "avgScore": 0.8,
      "keywords": ["anahtar", "kelimeler"],
      "sampleTexts": ["Örnek metin 1", "Örnek metin 2"]
    }
  ]
}

Kurallar:
- En fazla 10 tema kümesi oluştur
- Her küme en az 2 feedback içermeli
- Benzer temaları birleştir
- Türkçe tema adları kullan
- sampleTexts max 3 adet ve kısa olsun`,
          },
          {
            role: 'user',
            content: `${period} dönemine ait ${feedbacks.length} geri bildirimi analiz et:\n\n${feedbackTexts}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      })
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const clusters: AIThemeClusterData[] = (parsed.clusters || []).map(
      (c: AIThemeClusterData) => ({
        theme: c.theme,
        subTheme: c.subTheme,
        sentiment: c.sentiment || 'neutral',
        count: c.count || 1,
        avgScore: c.avgScore || 0.5,
        keywords: c.keywords || [],
        sampleTexts: c.sampleTexts || [],
      })
    );

    logAIUsage('theme_cluster', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, true);
    return clusters;
  } catch (error) {
    console.error('Error clustering themes:', error);
    logAIUsage('theme_cluster', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, false, String(error));
    return [];
  }
}

/**
 * Mevcut temalardan lokal kümeleme
 */
function clusterFromExistingThemes(themes: AITheme[]): AIThemeClusterData[] {
  const clusterMap = new Map<string, {
    theme: string;
    subTheme?: string;
    sentiments: string[];
    scores: number[];
    count: number;
  }>();

  for (const t of themes) {
    const key = `${t.theme}|${t.subTheme || ''}`;
    const existing = clusterMap.get(key);
    if (existing) {
      existing.count++;
      existing.sentiments.push(t.sentiment);
      existing.scores.push(t.score);
    } else {
      clusterMap.set(key, {
        theme: t.theme,
        subTheme: t.subTheme,
        sentiments: [t.sentiment],
        scores: [t.score],
        count: 1,
      });
    }
  }

  return Array.from(clusterMap.values())
    .filter(c => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(c => {
      const avgScore = c.scores.reduce((a, b) => a + b, 0) / c.scores.length;
      const posCount = c.sentiments.filter(s => s === 'positive').length;
      const negCount = c.sentiments.filter(s => s === 'negative').length;
      let sentiment = 'neutral';
      if (posCount > negCount * 2) sentiment = 'positive';
      else if (negCount > posCount * 2) sentiment = 'negative';
      else if (posCount > 0 && negCount > 0) sentiment = 'mixed';

      return {
        theme: c.theme,
        subTheme: c.subTheme,
        sentiment,
        count: c.count,
        avgScore,
      };
    });
}

// ─────────────────────────────────────────────────────────────
// AI INSIGHT REPORT GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Dealer için AI içgörü raporu oluştur
 */
export async function generateInsightReport(data: {
  dealerId: string;
  period: string;
  totalFeedbacks: number;
  avgRating: number;
  sentimentDist: { positive: number; negative: number; neutral: number };
  topTopics: { topic: string; count: number }[];
  themeClusters: AIThemeClusterData[];
  recentFeedbacks: { text: string; rating: number; sentiment: string; intent?: string; urgency?: number; churnRisk?: number }[];
  previousPeriodScore?: number;
  /** Niyet dağılımı (şikayet, övgü, öneri, soru, genel) - AI için ek bağlam */
  intentSummary?: Record<string, number>;
  /** Yüksek aciliyet (>=0.7) ve yüksek churn (>=0.5) sayıları - AI için ek bağlam */
  signalsSummary?: { highUrgencyCount: number; highChurnCount: number };
}): Promise<AIInsightReportData | null> {
  const client = getAIClient();
  if (!client) return null;

  const startTime = Date.now();

  try {
    const feedbackSummary = data.recentFeedbacks
      .slice(0, 20)
      .map((f, i) => `${i + 1}. "${f.text}" (⭐${f.rating}, ${f.sentiment}${f.intent ? `, Amaç: ${f.intent}` : ''}${f.urgency && f.urgency > 0.5 ? ', ⚠️ ACİL' : ''}${f.churnRisk && f.churnRisk > 0.5 ? ', 🔴 Churn Riski' : ''})`)
      .join('\n');

    const themesSummary = data.themeClusters
      .map(t => `- ${t.theme}${t.subTheme ? ` > ${t.subTheme}` : ''}: ${t.sentiment} (${t.count} adet, skor: ${t.avgScore.toFixed(2)})`)
      .join('\n');

    // Sistem geneli öğrenilmiş prompt varsa bağlam olarak ekle
    let systemPromptPrefix = '';
    try {
      const systemProfile = await getSystemLearningProfile();
      if (systemProfile?.systemPrompt) {
        systemPromptPrefix = `\n\n[Sistem öğrenme bağlamı - tüm verilerden çıkarılan kurallar]\n${(systemProfile.systemPrompt as string).slice(0, 800)}\n\n`;
      }
    } catch {
      // ignore
    }

    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        messages: [
          {
            role: 'system',
            content: `${systemPromptPrefix}Sen QRATEX'in derin öğrenme tabanlı iş zekası motorusun. Müşteri geri bildirim verilerini makine öğrenmesi ve nedensel analiz perspektifiyle değerlendiriyorsun.

Görevin:
1. Verilerdeki kalıpları (pattern) ve korelasyonları tespit et.
2. Memnuniyeti tahmin eden anahtar faktörleri (key drivers) nedensel mantıkla çıkar.
3. Güçlü/zayıf yönleri kanıta dayalı skorla raporla.
4. Aksiyon önerilerini öncelik ve beklenen etki (ROI) ile sırala.
5. Acil, toksik veya churn riski taşıyan sinyalleri uyarı olarak işaretle.
6. Önceki dönemle karşılaştırarak trend ve tahmini bir sonraki dönem puanı ver.

Çıktı formatı: SADECE aşağıdaki JSON. Başka metin yazma.

{
  "overallScore": 82,
  "trend": "up|down|stable",
  "trendValue": 5.2,
  "summary": "2-4 cümle Türkçe özet. Veriye dayalı, somut. Kalıpları ve ana mesajı vurgula.",
  "strengths": [
    { "title": "Kısa başlık", "score": 92, "description": "Veriden nasıl çıkarıldığını kısaca açıkla" }
  ],
  "weaknesses": [
    { "title": "Kısa başlık", "score": 45, "description": "Veriden nasıl çıkarıldığını kısaca açıkla" }
  ],
  "recommendations": [
    { "text": "Somut, uygulanabilir öneri", "priority": "high|medium|low", "impact": "Beklenen etki (müşteri memnuniyeti / puan artışı vb.)", "category": "staff|process|product|facility|marketing" }
  ],
  "alerts": [
    { "type": "toxic|urgent|churn|trend|anomaly", "message": "Kısa uyarı mesajı", "severity": "info|warning|error|critical" }
  ],
  "keyDrivers": [
    { "factor": "Faktör adı", "impact": 0.0-1.0, "correlation": 0.0-1.0, "direction": "positive|negative" }
  ],
  "predictedRating": 4.2,
  "keyMetrics": {
    "responseRate": 0-100,
    "avgRating": 1-5,
    "nps": -100 ile 100,
    "csat": 0-100,
    "ces": 1-7
  }
}

Kurallar:
- overallScore: 0-100. Duygu dağılımı, puan, tema tonu ve aciliyet/churn sinyallerini birleştir.
- strengths/weaknesses: En fazla 4'er. Her biri tema veya konu verisine dayalı olsun.
- recommendations: En fazla 5. Öncelik yüksek aciliyet/churn/olumsuz temalara göre ver.
- alerts: Sadece gerçek risk veya fırsat varsa ekle (toksik, yüksek aciliyet, yüksek churn, belirgin düşüş).
- keyDrivers: Memnuniyet/puan ile en güçlü ilişkili 3-5 faktör. impact: etki büyüklüğü, correlation: verideki korelasyon.
- predictedRating: Bir sonraki dönem için makul tahmin (mevcut trend ve önerilere göre).
- Tüm metinler Türkçe. Sayılar gerçek veriyle tutarlı olsun.`,
          },
          {
            role: 'user',
            content: `${data.period} dönemi için derin analiz raporu oluştur:

📊 Toplam Geri Bildirim: ${data.totalFeedbacks}
⭐ Ortalama Puan: ${data.avgRating.toFixed(1)}/5
${data.previousPeriodScore != null ? `📈 Önceki Dönem Genel Skor: ${data.previousPeriodScore} (trend karşılaştırması yap)` : ''}

Duygu Dağılımı (veri):
- Olumlu: %${data.sentimentDist.positive}
- Nötr: %${data.sentimentDist.neutral}
- Olumsuz: %${data.sentimentDist.negative}

En Çok Bahsedilen Konular:
${data.topTopics.map(t => `- ${t.topic}: ${t.count} kez`).join('\n')}

Tema Kümeleri (duygu + skor):
${themesSummary || 'Henüz kümeleme yok'}

Son Geri Bildirim Örnekleri (niyet, aciliyet, churn sinyalleri dahil):
${feedbackSummary}
${data.intentSummary ? `\nNiyet dağılımı (toplam): ${Object.entries(data.intentSummary).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}
${data.signalsSummary ? `\nSinyal özeti: Yüksek aciliyet ${data.signalsSummary.highUrgencyCount} adet, Yüksek churn riski ${data.signalsSummary.highChurnCount} adet.` : ''}

Bu verilere dayanarak: (1) genel skor ve trend, (2) güçlü/zayıf yönler, (3) öncelikli öneriler, (4) uyarılar, (5) memnuniyeti en çok etkileyen faktörler ve (6) tahmini bir sonraki dönem puanı üret. Sadece JSON döndür.`,
          },
        ],
        temperature: 0.35,
        max_tokens: 2400,
        response_format: { type: 'json_object' },
      })
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const report = JSON.parse(content);

    const result: AIInsightReportData = {
      overallScore: report.overallScore || 50,
      trend: report.trend || 'stable',
      trendValue: report.trendValue || 0,
      totalFeedbacks: data.totalFeedbacks,
      summary: report.summary || 'Rapor oluşturulamadı.',
      strengths: (report.strengths || []).map((s: { title: string; score: number; description: string; icon?: string }) => ({
        title: s.title,
        score: s.score,
        description: s.description,
        icon: s.icon,
      })),
      weaknesses: (report.weaknesses || []).map((w: { title: string; score: number; description: string; icon?: string }) => ({
        title: w.title,
        score: w.score,
        description: w.description,
        icon: w.icon,
      })),
      recommendations: (report.recommendations || []).map((r: { text: string; priority: string; impact: string; category: string }) => ({
        text: r.text,
        priority: r.priority || 'medium',
        impact: r.impact || '',
        category: r.category || 'other',
      })),
      alerts: (report.alerts || []).map((a: { type: string; message: string; severity: string; feedbackId?: string }) => ({
        type: a.type || 'info',
        message: a.message,
        severity: a.severity || 'info',
        feedbackId: a.feedbackId,
      })),
      keyDrivers: (report.keyDrivers || []).map((k: { factor: string; impact: number; correlation: number; direction: string }) => ({
        factor: k.factor,
        impact: k.impact || 0,
        correlation: k.correlation || 0,
        direction: k.direction || 'positive',
      })),
      predictedRating: report.predictedRating,
      keyMetrics: {
        responseRate: report.keyMetrics?.responseRate || 0,
        avgRating: report.keyMetrics?.avgRating || data.avgRating,
        nps: report.keyMetrics?.nps || 0,
        csat: report.keyMetrics?.csat || 0,
        ces: report.keyMetrics?.ces || 0,
      },
    };

    logAIUsage('insights', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, true);
    return result;
  } catch (error) {
    console.error('Error generating insight report:', error);
    logAIUsage('insights', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, false, String(error));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// ASK AI - Doğal Dil ile Veri Sorgulama
// ─────────────────────────────────────────────────────────────

export interface AskAIContext {
  totalFeedbacks: number;
  avgRating: number;
  sentimentDist: { positive: number; negative: number; neutral: number };
  topTopics: { topic: string; count: number }[];
  recentFeedbacks: { text: string; rating: number; sentiment: string; createdAt: string }[];
  themeClusters?: AIThemeClusterData[];
  previousMessages?: { role: 'user' | 'assistant'; content: string }[];
  /** Niyet dağılımı (complaint, suggestion, praise, question, general) */
  intentDist?: Record<string, number>;
  /** Aciliyet/churn özeti */
  urgencyChurnSummary?: { highUrgencyCount: number; highChurnCount: number };
  /** Son 7 gün günlük trend (tarih -> adet) */
  last7DaysTrend?: { date: string; count: number }[];
}

/** Dünya standartlarında sohbet sistemi promptu (sistem öğrenmesi ile zenginleştirilir) */
const CHAT_SYSTEM_PROMPT_BASE = `Sen QRATEX'in birincil AI asistanısın. İşletme sahiplerinin geri bildirim verileri hakkındaki sorularını doğal dilde yanıtlıyorsun.

ROL:
- Veri analisti ve danışman: Sayıları, trendleri ve önerileri net ve anlaşılır sun.
- Dil: Her zaman Türkçe. Resmi ama samimi ton; gereksiz jargon yok.
- Kanıt: Yanıtlar yalnızca verilen verilere dayansın. Veri yoksa "Bu konuda yeterli veri bulunmuyor" de.
- Aksiyon: Somut, uygulanabilir öneriler ver; belirsiz genellemelerden kaçın.

YANIT STANDARTLARI:
1. Kısa paragraflar; gerekirse madde işaretleri kullan.
2. Sayı ve yüzde kullan (örn. "%65 olumlu", "ortalama 4.2 puan").
3. Emoji yerine anlamlı vurgu; gerektiğinde tek bir emoji yeterli.
4. Kişisel veri veya tahmin üretme; yalnızca bağlamda verilen verileri kullan.
5. Hassas konularda (müşteri isimleri, şikayet detayları) özet ve genel ifade kullan.`;

/**
 * Doğal dil ile feedback verilerine soru sor (sistem öğrenmesi + dünya standartları promptu ile)
 */
export async function askAI(
  question: string,
  context: AskAIContext
): Promise<string | null> {
  const client = getAIClient();
  if (!client) return 'AI asistanı şu anda kullanılamıyor.';

  // Prompt-injection koruması: kardeş fonksiyonlar (runChatCompletion/chatWithQRA)
  // gibi kullanıcı sorusunu modele vermeden önce filtrele. Soru, güvenilir veri
  // bloğundan SONRA eklendiği için "ignore previous instructions" türü saldırılara
  // açıktı; bu koruma jailbreak denemelerini reddeder.
  if (detectPromptInjection(question)) {
    console.warn('[AI] Prompt injection detected in askAI input');
    return 'Bu mesaj güvenlik nedeniyle işlenemiyor.';
  }

  const startTime = Date.now();

  try {
    // Sohbet promptu: chatSystemPrompt varsa onu kullan, yoksa standart + öğrenme profili
    let systemLearningBlock = '';
    let useChatPrompt = false;
    try {
      const systemProfile = await getSystemLearningProfile();
      if (systemProfile?.chatSystemPrompt && typeof systemProfile.chatSystemPrompt === 'string') {
        useChatPrompt = true;
        systemLearningBlock = (systemProfile.chatSystemPrompt as string).trim();
      } else if (systemProfile?.profile && typeof systemProfile.profile === 'object') {
        const p = systemProfile.profile as Record<string, unknown>;
        const rules = (p.learnedRules as string[]) || [];
        const guidelines = p.responseGuidelines as { do?: string[]; avoid?: string[] } | undefined;
        const themes = (p.learnedThemes as Array<{ theme?: string; priority?: string }>) || [];
        if (rules.length || guidelines?.do?.length || guidelines?.avoid?.length || themes.length) {
          systemLearningBlock = `

[Öğrenilmiş sistem kuralları - bu verilerle eğitilmiş asistan davranışı]
${rules.length ? `- Kurallar: ${rules.slice(0, 8).join('; ')}` : ''}
${guidelines?.do?.length ? `- Yap: ${guidelines.do.slice(0, 5).join('; ')}` : ''}
${guidelines?.avoid?.length ? `- Kaçın: ${guidelines.avoid.slice(0, 5).join('; ')}` : ''}
${themes.length ? `- Öne çıkan temalar: ${themes.slice(0, 6).map((t: { theme?: string }) => t.theme).filter(Boolean).join(', ')}` : ''}`;
        }
      }
      if (!useChatPrompt && systemProfile?.systemPrompt && systemLearningBlock === '') {
        systemLearningBlock = `\n\n[Sistem bağlamı]\n${(systemProfile.systemPrompt as string).slice(0, 600)}`;
      }
    } catch {
      // ignore
    }

    const basePrompt = useChatPrompt ? systemLearningBlock : CHAT_SYSTEM_PROMPT_BASE;

    const extraDataParts: string[] = [];
    if (context.intentDist && Object.keys(context.intentDist).length > 0) {
      extraDataParts.push(`- Niyet Dağılımı: ${Object.entries(context.intentDist).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    if (context.urgencyChurnSummary) {
      extraDataParts.push(`- Yüksek Aciliyet: ${context.urgencyChurnSummary.highUrgencyCount} adet, Yüksek Churn Riski: ${context.urgencyChurnSummary.highChurnCount} adet`);
    }
    if (context.last7DaysTrend && context.last7DaysTrend.length > 0) {
      extraDataParts.push(`- Son 7 Gün Trend: ${context.last7DaysTrend.map(t => `${t.date}: ${t.count}`).join(', ')}`);
    }

    const dataContext = `
Mevcut Veriler:
- Toplam Geri Bildirim: ${context.totalFeedbacks}
- Ortalama Puan: ${context.avgRating.toFixed(1)}/5
- Duygu Dağılımı: Olumlu %${context.sentimentDist.positive}, Nötr %${context.sentimentDist.neutral}, Olumsuz %${context.sentimentDist.negative}
- En Çok Bahsedilen Konular: ${context.topTopics.map(t => `${t.topic}(${t.count})`).join(', ')}
${context.themeClusters ? `- Tema Kümeleri: ${context.themeClusters.map(t => `${t.theme}(${t.sentiment}, ${t.count} adet)`).join(', ')}` : ''}
${extraDataParts.length ? extraDataParts.join('\n') : ''}

Son 10 Geri Bildirim:
${context.recentFeedbacks.slice(0, 10).map((f, i) => `${i + 1}. "${f.text}" (⭐${f.rating}, ${f.sentiment}, ${f.createdAt})`).join('\n')}`;

    const fullSystemContent = useChatPrompt
      ? `${basePrompt}\n\n${dataContext}\n\nYanıt verirken yukarıdaki verileri dikkate al. Kullanıcı sorusuna doğrudan, veriye dayalı ve kısa yanıt ver.`
      : `${basePrompt}${systemLearningBlock}\n\n${dataContext}\n\nYanıt verirken yukarıdaki verileri ve öğrenilmiş kuralları dikkate al. Kullanıcı sorusuna doğrudan, veriye dayalı ve kısa yanıt ver.`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: fullSystemContent,
      },
    ];

    // Önceki mesajları ekle (son 12 mesaj - çok turlu sohbet)
    if (context.previousMessages) {
      for (const msg of context.previousMessages.slice(-12)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: question });

    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        messages,
        temperature: 0.5,
        max_tokens: 800,
      })
    );

    logAIUsage('ask_ai', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, true);
    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error in Ask AI:', error);
    logAIUsage('ask_ai', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, false, String(error));
    return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

// ─────────────────────────────────────────────────────────────
// LOCAL FALLBACKS
// ─────────────────────────────────────────────────────────────

/**
 * Yerel duygu analizi (AI yokken fallback)
 */
export function analyzeSentimentLocal(text: string): { label: 'positive' | 'negative' | 'neutral'; score: number } {
  const positiveWords = [
    'harika', 'mükemmel', 'güzel', 'muhteşem', 'süper', 'iyi', 'teşekkür',
    'memnun', 'beğendim', 'tavsiye', 'harikulade', 'enfes', 'lezzetli',
    'temiz', 'hızlı', 'ilgili', 'kibar', 'profesyonel', 'başarılı',
    'kaliteli', 'kusursuz', 'mükemmel', 'harika', 'olağanüstü',
  ];

  const negativeWords = [
    'kötü', 'berbat', 'rezil', 'yetersiz', 'hayal kırıklığı', 'memnun değil',
    'pişman', 'sorun', 'problem', 'yavaş', 'pahalı', 'kirli', 'ilgisiz',
    'beklentim', 'olumsuz', 'şikayet', 'korkunç', 'rezalet', 'felaket',
    'kırık', 'bozuk', 'eksik', 'hatalı', 'geç',
  ];

  const lowerText = text.toLowerCase();
  let posCount = 0;
  let negCount = 0;

  for (const word of positiveWords) {
    if (lowerText.includes(word)) posCount++;
  }
  for (const word of negativeWords) {
    if (lowerText.includes(word)) negCount++;
  }

  const total = posCount + negCount;
  if (total === 0) return { label: 'neutral', score: 0.5 };

  const ratio = posCount / total;
  if (ratio >= 0.6) return { label: 'positive', score: 0.5 + ratio * 0.5 };
  if (ratio <= 0.4) return { label: 'negative', score: 0.5 - (1 - ratio) * 0.5 };
  return { label: 'neutral', score: 0.5 };
}

/**
 * Yerel toksisite kontrolü
 */
export function checkToxicityLocal(text: string): { isToxic: boolean; score: number } {
  const toxicWords = [
    'aptal', 'salak', 'gerizekalı', 'mal', 'ahmak', 'pislik',
    'lanet', 'kahretsin', 'berbat', 'rezil', 'kepaze',
    'siktir', 'amk', 'orospu', 'piç',
  ];

  const lowerText = text.toLowerCase();
  let count = 0;
  for (const word of toxicWords) {
    if (lowerText.includes(word)) count++;
  }

  const score = Math.min(count * 0.25, 1);
  return { isToxic: score > 0.5, score };
}

/**
 * Yerel intent tespiti
 */
export function detectIntentLocal(text: string): { label: string; score: number } {
  const lowerText = text.toLowerCase();

  const complaintWords = ['şikayet', 'sorun', 'problem', 'bozuk', 'kötü', 'berbat', 'rezil', 'memnun değil', 'hayal kırıklığı'];
  const suggestionWords = ['öneri', 'tavsiye', 'keşke', 'olsa', 'yapılabilir', 'iyileştir', 'geliştirilmeli'];
  const praiseWords = ['teşekkür', 'harika', 'mükemmel', 'süper', 'bravo', 'tebrik', 'memnun'];
  const questionWords = ['nasıl', 'neden', 'ne zaman', 'nerede', 'mi', 'mı', 'mu', 'mü', '?'];

  const scores = {
    complaint: complaintWords.filter(w => lowerText.includes(w)).length,
    suggestion: suggestionWords.filter(w => lowerText.includes(w)).length,
    praise: praiseWords.filter(w => lowerText.includes(w)).length,
    question: questionWords.filter(w => lowerText.includes(w)).length,
  };

  const max = Math.max(...Object.values(scores));
  if (max === 0) return { label: 'general', score: 0.5 };

  const label = Object.entries(scores).find(([, v]) => v === max)?.[0] || 'general';
  return { label, score: Math.min(0.5 + max * 0.15, 0.95) };
}

/**
 * Kapsamlı analiz - AI ile, yoksa fallback
 */
export async function analyzeWithFallback(
  text: string,
  options: AnalyzeOptions = {}
): Promise<AIAnalysisResult> {
  // Önce AI ile dene
  const aiResult = await analyzeComprehensive(text, options);
  if (aiResult) return aiResult;

  // Fallback: Yerel analiz (P2-29: fallback KPI izleme)
  const fallbackStart = Date.now();
  const sentiment = analyzeSentimentLocal(text);
  const toxicity = checkToxicityLocal(text);
  const intent = detectIntentLocal(text);
  logAIUsage('analyze', 'local-fallback', Date.now() - fallbackStart, true);

  return {
    sentiment,
    emotions: [],
    topics: [],
    toxicity: { ...toxicity, categories: [] },
    intent: { label: intent.label as AIAnalysisResult['intent'] extends { label: infer L } ? L : never, score: intent.score },
    summary: undefined,
    modelUsed: 'local-fallback',
    version: AI_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────
// AI USAGE LOGGING
// ─────────────────────────────────────────────────────────────

interface AIUsageEntry {
  action: string;
  model: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

// In-memory log (DB'ye yazma işlemi API route'ta yapılacak)
const usageLog: AIUsageEntry[] = [];

function logAIUsage(action: string, model: string, latencyMs: number, success: boolean, error?: string) {
  usageLog.push({ action, model, latencyMs, success, error, timestamp: new Date() });
  // Son 1000 kaydı tut
  if (usageLog.length > 1000) {
    usageLog.splice(0, usageLog.length - 1000);
  }
}

export function getRecentUsageLogs(limit = 50): AIUsageEntry[] {
  return usageLog.slice(-limit);
}

/** P2-29: Fallback oranı için - local-fallback kullanım sayısı (son N kayıttan) */
export function getFallbackStats(limit = 500): { total: number; fallbacks: number; fallbackRate: number } {
  const recent = usageLog.slice(-limit);
  const total = recent.length;
  const fallbacks = recent.filter((e) => e.model === 'local-fallback').length;
  return { total, fallbacks, fallbackRate: total > 0 ? fallbacks / total : 0 };
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

const aiEngine = {
  analyzeComprehensive,
  analyzeBulk,
  clusterThemes,
  generateInsightReport,
  askAI,
  analyzeWithFallback,
  analyzeSentimentLocal,
  checkToxicityLocal,
  detectIntentLocal,
  getRecentUsageLogs,
  getFallbackStats,
};

export default aiEngine;
/**
 * Geri bildirime üsluba göre AI yanıtı üretir
 */
export async function generateAutoReply(
  feedbackText: string,
  rating: number,
  toneSlug: string,
  dealerId?: string
): Promise<string | null> {
  const client = getAIClient();
  if (!client) return null;

  const startTime = Date.now();
  
  // 1. Veritabanından üslubu getir
  const dbTone = await import('@/lib/prisma').then(m => m.prisma.aITone.findUnique({
    where: { slug: toneSlug, isActive: true }
  }));

  const fallbackToneMap: Record<string, string> = {
    formal: 'Resmi, kurumsal ve nazik',
    friendly: 'Samimi, sıcak ve arkadaş canlısı',
    humorous: 'Esprili, enerjik ve eğlenceli',
    professional: 'Profesyonel, çözüm odaklı ve ciddi',
  };

  const systemPrompt = dbTone?.systemPrompt || `Sen bir müşteri ilişkileri uzmanısın. İşletme adına müşteri geri bildirimlerine yanıt veriyorsun.
    Üslubun: ${fallbackToneMap[toneSlug] || fallbackToneMap.professional} olmalı.
    Kısa, öz ve müşteriyi değerli hissettiren bir yanıt yaz.
    Yanıtın dili geri bildirimle aynı olsun (Türkçe).
    Eğer puan düşükse (1-2) özür dile ve çözüm odaklı ol.
    Eğer puan yüksekse (4-5) teşekkür et ve tekrar beklediğini belirt.`;

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Müşteri Puanı: ${rating}/5\nMüşteri Yorumu: "${feedbackText}"\n\nBu geri bildirime uygun bir yanıt üret.`
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      })
    );

    const reply = response.choices[0]?.message?.content?.trim() || null;
    logAIUsage('auto_reply', `${getModelProvider()}/${getModel()}`, Date.now() - startTime, true);
    return reply;
  } catch (error) {
    console.error('Error generating auto reply:', error);
    return null;
  }
}

