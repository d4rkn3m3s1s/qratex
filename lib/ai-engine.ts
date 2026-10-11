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
import {
  checkAiCostGuard,
  dealerDailyLimitFor,
  guardAiCall,
  isAiGuardError,
  recordAiCostUsage,
  type AiTask,
} from '@/lib/ai-cost-guard';
import { normalizeAnalysisPayload } from '@/lib/ai-analysis-normalize';
import {
  isAiCircuitOpen,
  isProviderFailure,
  recordAiProviderFailure,
  recordAiProviderSuccess,
  withAiRetry,
} from '@/lib/ai-provider-resilience';
import { getApprovedLearnedPayload, getSystemLearningProfile } from '@/lib/ai-learning';
import { canUseAi, getDealerAiPolicy } from '@/lib/ai-policy';
import { getRoutedModel, refreshAiModelRouting } from '@/lib/ai-studio/model-routing';
import {
  CONTEXT_LIMITS,
  PROMPT_VERSIONS,
  UNTRUSTED_DATA_RULE,
  buildBoundedContextBlock,
  detectPromptInjectionTr as detectPromptInjection,
  sanitizeContextLine,
  sanitizeContextText,
  wrapUntrusted,
} from '@/lib/ai-prompt-safety';
import type { AIAnalysisResult, AIThemeClusterData } from '@/types';

export interface AnalyzeOptions {
  customPrompt?: string;
  adaptiveProfile?: string;
  dealerId?: string;
  /** Bayi yoksa dakikalık limit anahtarı (kullanıcı id vb.). */
  actorKey?: string;
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
        // Timeout ZORUNLU: SDK varsayılanı 10 dk. Sağlayıcı asılırsa after() içindeki
        // analiz Vercel maxDuration'a kadar bekler → istek başına dakikalarca CPU yanar.
        timeout: 15_000,
        maxRetries: 1,
      });
    }
    return aiClient;
  }
  if (process.env.OPENAI_API_KEY) {
    if (!aiClient) {
      aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 1 });
    }
    return aiClient;
  }
  return null;
}

/** Ortam/varsayılan hacim modeli (yönetici seçimi yokken). */
export function getVolumeModelEnvDefault(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  // HACİM yolu (her feedback analiz edilir) → ücretsiz tier'da 14.4K istek/gün + 500K token/gün.
  // Model tablosu/gerekçe: lib/groq.ts MODELS.
  // llama-3.1-8b-instant Groq'tan kalktı (404 model_not_found, 2026-10) → gpt-oss-20b.
  if (process.env.GROQ_API_KEY) return 'openai/gpt-oss-20b';
  return process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
}

/**
 * gpt-oss (Groq) akıl yürüten modeldir: gizli düşünme token'ları `max_tokens` bütçesinden yer.
 * Düşük bütçeli çağrılarda (konsey turu 320-380) bütçe düşünmeye gidip içerik BOŞ dönüyordu →
 * "yanıt üretemedi". Hacim/sohbet yollarında düşünme kısa tutulur.
 */
function reasoningOpts(model: string): { reasoning_effort?: 'low' } {
  return model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
}

/** Yönetici seçimi (Prompt ve Model Stüdyosu, katalog denetimli) > ortam > varsayılan. */
function getModel(): string {
  return getRoutedModel('volume') ?? getVolumeModelEnvDefault();
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
 * Bayi kapsamlı LLM çağrısından önce: AI ana anahtarı açık mı? (P0-32)
 * `dealerId` yoksa (platform/müşteri kapsamı) politika uygulanmaz → true.
 */
async function dealerAllowsAi(dealerId: string | undefined | null): Promise<boolean> {
  // Her LLM yolu buradan geçer: model yönlendirmesini (TTL'li, asla fırlatmaz) tazele.
  await refreshAiModelRouting();
  if (!dealerId) return true;
  return canUseAi(await getDealerAiPolicy(dealerId));
}

/**
 * Başarısız çağrıyı da kullanım kaydına yaz. Bayisiz çağrılar `dealerId=null` ile yazılır
 * (platform günlük tavanı bu kayıtlardan hesaplanır).
 */
async function recordFailure(dealerId: string | undefined | null, task: AiTask, startedAt: number, error: unknown) {
  await recordAiCostUsage(dealerId ?? null, 0, 0, task, `${getModelProvider()}/${getModel()}`, Date.now() - startedAt, {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

type UsageLike = { usage?: { prompt_tokens?: number; completion_tokens?: number } | null };
function usageOf(r: unknown): { in_: number; out: number } {
  const u = (r as UsageLike | null)?.usage;
  return { in_: u?.prompt_tokens ?? 0, out: u?.completion_tokens ?? 0 };
}

/**
 * Genel amaçlı LLM chat completion. Gerçek sağlayıcı yoksa null döner
 * (sahte/şablon yanıt ÜRETMEZ — çağıran taraf dürüstçe degraded davranır).
 * Agent Council ve diğer üretken akışlar bunu kullanır.
 *
 * `dealerId` verilirse: bayi AI'ı kapalıysa null (LLM çağrısı yok), dakikalık limit ve
 * günlük token tavanı uygulanır (aşımda AiRateLimitExceededError / AiCostLimitExceededError).
 */
export async function runChatCompletion(params: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  dealerId?: string;
  /** Kullanım kaydı / limit etiketi (varsayılan chat_completion). */
  task?: AiTask;
  /** Bayi yoksa dakikalık limit anahtarı (kullanıcı id vb.). */
  actorKey?: string;
}): Promise<{ content: string; modelUsed: string } | null> {
  const client = getAIClient();
  if (!client) return null;

  if (detectPromptInjection(params.user)) {
    console.warn('[AI] Prompt injection detected in runChatCompletion input');
    return null;
  }

  if (!(await dealerAllowsAi(params.dealerId))) return null;

  const task: AiTask = params.task ?? 'chat_completion';
  await guardAiCall({ task, dealerId: params.dealerId, actorKey: params.actorKey });

  const start = Date.now();
  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        ...reasoningOpts(getModel()),
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
    await recordAiCostUsage(
      params.dealerId ?? null,
      response.usage?.prompt_tokens ?? 0,
      response.usage?.completion_tokens ?? 0,
      task,
      modelUsed,
      latencyMs
    );
    return { content, modelUsed };
  } catch (error) {
    await recordFailure(params.dealerId, task, start, error);
    console.error('[AI] runChatCompletion failed:', error);
    return null;
  }
}

/**
 * Tek yeniden deneme politikası + devre kesici (`lib/ai-provider-resilience`). Eski sabit
 * 3+6+9 sn bekleme SDK yeniden denemesinin üstüne biniyor, tek çağrıyı ~2 dk'ya uzatıyordu.
 */
function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withAiRetry(fn, { provider: getModelProvider() });
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
}

${UNTRUSTED_DATA_RULE}
Analiz edilecek metin <musteri_yorumu> etiketi içinde gelir.`;

/**
 * Analiz sistem promptu: temel prompt KODDA sabit (PROMPT_VERSIONS.analysis). Bayinin
 * öğrenilmiş profili ve özel promptu yalnız SINIRLI ek bağlam olarak eklenir; çıktı
 * biçimini ve güvenlik kuralını değiştiremez. İkisi de yalnız o bayinin kendi verisidir.
 */
export function buildAnalysisSystemPrompt(customPrompt?: string, adaptiveProfile?: string) {
  let prompt = ANALYSIS_SYSTEM_PROMPT;

  const adaptive = sanitizeContextText(adaptiveProfile, CONTEXT_LIMITS.adaptiveProfile);
  if (adaptive) {
    prompt += buildBoundedContextBlock(
      'isletme_profili',
      'Öğrenilmiş işletme profili (yalnız bu işletmenin verisinden)',
      adaptive.split('\n'),
      CONTEXT_LIMITS.adaptiveProfile
    );
  }

  const custom = sanitizeContextText(customPrompt, CONTEXT_LIMITS.dealerCustomPrompt);
  if (custom) {
    prompt += buildBoundedContextBlock(
      'isletme_baglami',
      'İşletmenin kendi analiz notları',
      custom.split('\n'),
      CONTEXT_LIMITS.dealerCustomPrompt
    );
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
  // Denetim O1: enjeksiyon kalıbı içeren yorum REDDEDİLMEZ (eskiden analiz tamamen düşüyor,
  // kayıt yerel tahmine ve deneme kuyruğuna kalıyordu; "act as", "system:" gibi masum ifadeler
  // de yakalanıyordu). Metin zaten <musteri_yorumu> sınırlayıcısında VERİ olarak gider ve çıktı
  // dar bir JSON şemasıyla sınırlıdır; şüphe yalnız ETİKETLENİR (`injectionSuspect`) ve
  // müşteriye giden AI metni (otomatik yanıt) bu kayıtlarda üretilmez.
  const injectionSuspect = detectPromptInjection(text);

  // P0-32: bayi AI'ı kapalıysa müşteri metni LLM'e gitmez (çağıran yerel analize düşer).
  if (!(await dealerAllowsAi(options.dealerId))) return null;

  const startTime = Date.now();

  // Bayisiz çağrı da korumasız kalmaz: aktör ya da platform dakikalık + günlük tavan.
  await guardAiCall({ task: 'analyze', dealerId: options.dealerId, actorKey: options.actorKey });

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        ...reasoningOpts(getModel()),
        messages: [
          { role: 'system', content: buildAnalysisSystemPrompt(options.customPrompt, options.adaptiveProfile) },
          { role: 'user', content: `Analiz et:\n${wrapUntrusted('musteri_yorumu', text)}` },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      })
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const latencyMs = Date.now() - startTime;
    const modelUsed = `${getModelProvider()}/${getModel()}`;
    // Şema doğrulama + [0,1] sıkıştırma + sözlük zorlaması (denetim Y6; saf ve testli).
    const result = normalizeAnalysisPayload(JSON.parse(content), {
      modelUsed,
      version: `${AI_VERSION}/${PROMPT_VERSIONS.analysis}`,
    });
    if (injectionSuspect) result.injectionSuspect = true;

    {
      const { in_, out } = usageOf(response);
      await recordAiCostUsage(options.dealerId ?? null, in_, out, 'analyze', modelUsed, latencyMs);
    }

    return result;
  } catch (error) {
    console.error('Error in comprehensive analysis:', error);
    await recordFailure(options.dealerId, 'analyze', startTime, error);
    return null;
  }
}

/**
 * Sistem öğrenme profilinden SINIRLI ek bağlam bloğu (P0-33).
 *  - Yalnız admin ONAY damgalı içerik okunur (`profile.approval.approvedAt`). Bekleyen öneri
 *    (`profile.pendingProposal`) ve damgasız eski/LLM yazımı profiller YOK SAYILIR.
 *  - `systemPrompt` / `chatSystemPrompt` yalnız admin'in elle yazdığı notlarsa
 *    (`profile.adminPromptsEditedAt`) ve tavanla eklenir; temel promptun YERİNE asla geçmez.
 *  - Her öğe tek satıra indirilir, injection kalıplı öğeler düşer, toplam uzunluk tavanlı.
 */
export function buildLearnedSystemContext(
  systemProfile: { profile?: unknown; systemPrompt?: string | null; chatSystemPrompt?: string | null } | null | undefined,
  opts: { includeChatContext?: boolean } = {}
): string {
  if (!systemProfile) return '';
  const lines: string[] = [];
  const approved = getApprovedLearnedPayload(systemProfile.profile);
  if (approved) {
    for (const r of approved.learnedRules.slice(0, 8)) lines.push(`Kural: ${r}`);
    for (const d of approved.responseGuidelines.do.slice(0, 5)) lines.push(`Yap: ${d}`);
    for (const a of approved.responseGuidelines.avoid.slice(0, 5)) lines.push(`Kaçın: ${a}`);
    const themeNames = approved.learnedThemes.slice(0, 6).map((t) => t.theme);
    if (themeNames.length) lines.push(`Platform genelinde sık temalar: ${themeNames.join(', ')}`);
    if (approved.promptAppendix) lines.push(...approved.promptAppendix.split('\n'));
  }

  const p = (systemProfile.profile && typeof systemProfile.profile === 'object'
    ? systemProfile.profile
    : {}) as { adminPromptsEditedAt?: unknown };
  const adminAuthored = typeof p.adminPromptsEditedAt === 'string' && p.adminPromptsEditedAt.length > 0;

  if (adminAuthored && typeof systemProfile.systemPrompt === 'string') {
    lines.push(...sanitizeContextText(systemProfile.systemPrompt, 600).split('\n'));
  }
  let block = buildBoundedContextBlock(
    'ogrenilmis_ek_baglam',
    'Platform genelinden anonim toplulaştırmayla öğrenilmiş, admin onaylı ek bağlam',
    lines,
    CONTEXT_LIMITS.learnedBlock
  );

  if (adminAuthored && opts.includeChatContext && typeof systemProfile.chatSystemPrompt === 'string') {
    const chatCtx = sanitizeContextText(systemProfile.chatSystemPrompt, CONTEXT_LIMITS.adminChatContext);
    if (chatCtx) {
      block += buildBoundedContextBlock(
        'yonetici_sohbet_notlari',
        'Yönetici sohbet notları (üslup/öncelik ipuçları)',
        chatCtx.split('\n'),
        CONTEXT_LIMITS.adminChatContext
      );
    }
  }
  return block;
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
  /**
   * (İsteğe bağlı, admin asistanı) Bayi risk sıralaması — "hangi bayi" sorularının bağlamda
   * gerçekten cevabı olsun diye (admin_ai-dashboard B6). Bayi adları sınırlı/temizlenmiş girer.
   */
  dealerRanking?: { name: string; feedbacks: number; negativePercent: number | null; urgent: number; churnHigh: number; avgRating: number | null }[];
}

/**
 * Sohbet TEMEL promptu — KODDA sabit ve sürümlü (PROMPT_VERSIONS.chat). P0-33: veritabanındaki
 * hiçbir metin (sistem öğrenmesi `chatSystemPrompt`/`systemPrompt`, admin düzenlemesi) bu
 * promptun YERİNE geçemez; yalnız `buildLearnedSystemContext` ile sınırlı ek bağlam olarak
 * sonuna eklenir.
 */
export const CHAT_SYSTEM_PROMPT_BASE = `Sen QRATEX'in birincil AI asistanısın. İşletme sahiplerinin geri bildirim verileri hakkındaki sorularını doğal dilde yanıtlıyorsun.

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
5. Hassas konularda (müşteri isimleri, şikayet detayları) özet ve genel ifade kullan.
6. Yalnız bu sohbetteki verilere dayan; başka işletmeler hakkında bilgi verme veya tahmin yürütme.

${UNTRUSTED_DATA_RULE}`;

/** askAI çağrı kapsamı (kiracı politikası, limit ve kullanım kaydı için). */
export interface AskAIOptions {
  /** Bayi kapsamı: AI ana anahtarı + kiracı dakikalık limit + günlük token tavanı. */
  dealerId?: string;
  /** Bayi yoksa dakikalık limit anahtarı (kullanıcı id vb.). */
  actorKey?: string;
}

/** Önceki sohbet turları: injection kalıplı turlar düşer, uzunluk sınırlanır. */
export function sanitizeChatHistory(
  history: { role: 'user' | 'assistant'; content: string }[] | undefined,
  maxTurns = 12,
  maxLen = 1_500
): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(history)) return [];
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of history.slice(-maxTurns)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.slice(0, maxLen).trim();
    if (!content || detectPromptInjection(content)) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

/**
 * askAI sistem mesajı — saf fonksiyon (test edilebilir). Temel prompt HER ZAMAN başta;
 * öğrenilmiş bağlam yalnız sınırlı blok; veri bloğu güvenilmeyen veri olarak etiketli.
 */
export function buildAskAISystemContent(
  context: AskAIContext,
  systemProfile: Parameters<typeof buildLearnedSystemContext>[0]
): string {
  const learnedBlock = buildLearnedSystemContext(systemProfile, { includeChatContext: true });

  const extraDataParts: string[] = [];
  if (context.intentDist && Object.keys(context.intentDist).length > 0) {
    extraDataParts.push(`- Niyet Dağılımı: ${Object.entries(context.intentDist).map(([k, v]) => `${sanitizeContextLine(k, 40) ?? '-'}=${Number(v) || 0}`).join(', ')}`);
  }
  if (context.urgencyChurnSummary) {
    extraDataParts.push(`- Yüksek Aciliyet: ${Number(context.urgencyChurnSummary.highUrgencyCount) || 0} adet, Yüksek Churn Riski: ${Number(context.urgencyChurnSummary.highChurnCount) || 0} adet`);
  }
  if (context.last7DaysTrend && context.last7DaysTrend.length > 0) {
    extraDataParts.push(`- Son 7 Gün Trend: ${context.last7DaysTrend.map(t => `${sanitizeContextLine(t.date, 20) ?? '-'}: ${Number(t.count) || 0}`).join(', ')}`);
  }
  if (context.dealerRanking && context.dealerRanking.length > 0) {
    extraDataParts.push(
      `- Bayi Risk Sıralaması (yüksekten düşüğe): ${context.dealerRanking
        .slice(0, 10)
        .map(d => `${sanitizeContextLine(d.name, 60) ?? '-'} [geri bildirim ${Number(d.feedbacks) || 0}, olumsuz %${d.negativePercent ?? '-'}, acil ${Number(d.urgent) || 0}, kayıp riski ${Number(d.churnHigh) || 0}, ort. puan ${d.avgRating ?? '-'}]`)
        .join('; ')}`
    );
  }

  const topics = (context.topTopics ?? [])
    .map(t => `${sanitizeContextLine(t.topic, 60) ?? '-'}(${Number(t.count) || 0})`)
    .join(', ');
  const clusters = context.themeClusters
    ? context.themeClusters
        .map(t => `${sanitizeContextLine(t.theme, 80) ?? '-'}(${t.sentiment}, ${Number(t.count) || 0} adet)`)
        .join(', ')
    : '';
  const recent = (context.recentFeedbacks ?? [])
    .slice(0, 10)
    .map((f, i) => `${i + 1}. ${wrapUntrusted('musteri_yorumu', f.text ?? '', 500)} (⭐${Number(f.rating) || '-'}, ${sanitizeContextLine(f.sentiment, 20) ?? '-'}, ${sanitizeContextLine(String(f.createdAt ?? ''), 40) ?? '-'})`)
    .join('\n');

  const dataContext = `<veri>
Mevcut Veriler:
- Toplam Geri Bildirim: ${Number(context.totalFeedbacks) || 0}
- Ortalama Puan: ${Number(context.avgRating ?? 0).toFixed(1)}/5
- Duygu Dağılımı: Olumlu %${Number(context.sentimentDist?.positive) || 0}, Nötr %${Number(context.sentimentDist?.neutral) || 0}, Olumsuz %${Number(context.sentimentDist?.negative) || 0}
- En Çok Bahsedilen Konular: ${topics || '-'}
${clusters ? `- Tema Kümeleri: ${clusters}` : ''}
${extraDataParts.join('\n')}

Son 10 Geri Bildirim:
${recent || '-'}
</veri>`;

  return `${CHAT_SYSTEM_PROMPT_BASE}${learnedBlock}

${dataContext}

Yanıt verirken yalnız <veri> bloğundaki verileri dikkate al. Kullanıcı sorusuna doğrudan, veriye dayalı ve kısa yanıt ver.
[prompt: ${PROMPT_VERSIONS.chat}]`;
}

/**
 * Doğal dil ile feedback verilerine soru sor.
 * P0-33: temel prompt kodda sabit; sistem öğrenmesi yalnız sınırlı ek bağlam.
 * P0-32: `dealerId` verilirse bayi AI ana anahtarı kapalıyken LLM çağrısı yapılmaz.
 * Kota/limit aşımında kullanıcıya Türkçe bilgi metni döner (çağıranlar metin bekliyor).
 */
export async function askAI(
  question: string,
  context: AskAIContext,
  opts: AskAIOptions = {}
): Promise<string | null> {
  const client = getAIClient();
  if (!client) return 'AI asistanı şu anda kullanılamıyor.';

  // Prompt-injection koruması (İngilizce + Türkçe kalıplar).
  if (detectPromptInjection(question)) {
    console.warn('[AI] Prompt injection detected in askAI input');
    return 'Bu mesaj güvenlik nedeniyle işlenemiyor.';
  }

  if (!(await dealerAllowsAi(opts.dealerId))) {
    return 'AI özellikleri bu işletme için kapalı. Ayarlar > AI ekranından açabilirsiniz.';
  }

  try {
    await guardAiCall({ task: 'ask_ai', dealerId: opts.dealerId, actorKey: opts.actorKey });
  } catch (err) {
    if (isAiGuardError(err)) return err.message;
    throw err;
  }

  const startTime = Date.now();

  try {
    let systemProfile: Parameters<typeof buildLearnedSystemContext>[0] = null;
    try {
      systemProfile = await getSystemLearningProfile();
    } catch {
      systemProfile = null;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildAskAISystemContent(context, systemProfile) },
    ];

    // Önceki mesajlar (son 12 tur) — injection kalıplı turlar düşer.
    for (const msg of sanitizeChatHistory(context.previousMessages)) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: question });

    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        ...reasoningOpts(getModel()),
        messages,
        temperature: 0.5,
        max_tokens: 800,
      })
    );

    const modelUsed = `${getModelProvider()}/${getModel()}`;
    {
      const { in_, out } = usageOf(response);
      await recordAiCostUsage(opts.dealerId ?? null, in_, out, 'ask_ai', modelUsed, Date.now() - startTime);
    }
    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error in Ask AI:', error);
    await recordFailure(opts.dealerId, 'ask_ai', startTime, error);
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

  // Fallback: Yerel analiz (gerçek LLM sonucu yok; `modelUsed: local-fallback` ile işaretli)
  const sentiment = analyzeSentimentLocal(text);
  const toxicity = checkToxicityLocal(text);
  const intent = detectIntentLocal(text);

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

/**
 * Otomatik yanıt TEMEL kuralları — kodda sabit, sürümlü (PROMPT_VERSIONS.autoReply).
 * Admin'in DB'de tanımladığı üslup promptu (AITone.systemPrompt) bu kuralların YERİNE
 * geçmez; yalnız sınırlı "üslup" ek bağlamı olarak eklenir.
 */
const AUTO_REPLY_BASE_PROMPT = `Sen bir müşteri ilişkileri uzmanısın. İşletme adına müşteri geri bildirimlerine yanıt veriyorsun.
Kurallar:
- Kısa (en fazla 3-4 cümle), öz ve müşteriyi değerli hissettiren bir yanıt yaz.
- Yanıtın dili Türkçe olsun.
- Puan düşükse (1-2) özür dile ve çözüm odaklı ol; puan yüksekse (4-5) teşekkür et ve tekrar beklediğini belirt.
- İşletmeyi bağlayan vaat VERME: indirim, kupon, ücretsiz ürün, iade, yüzde, kampanya kodu yazma.
- Bağlantı, telefon, e-posta adresi yazma. Kendinden yapay zeka olarak bahsetme.
- Müşterinin adını ya da kişisel bilgisini kullanma.

${UNTRUSTED_DATA_RULE}`;

const FALLBACK_TONE_MAP: Record<string, string> = {
  formal: 'Resmi, kurumsal ve nazik',
  friendly: 'Samimi, sıcak ve arkadaş canlısı',
  humorous: 'Esprili, enerjik ve eğlenceli',
  professional: 'Profesyonel, çözüm odaklı ve ciddi',
};

/** Otomatik yanıt sistem mesajı — saf fonksiyon (test edilebilir). */
export function buildAutoReplySystemPrompt(toneSlug: string, dbTonePrompt?: string | null): string {
  const toneLines: string[] = [`Üslup: ${FALLBACK_TONE_MAP[toneSlug] || FALLBACK_TONE_MAP.professional}`];
  const custom = sanitizeContextText(dbTonePrompt, 600);
  if (custom) toneLines.push(...custom.split('\n'));
  return `${AUTO_REPLY_BASE_PROMPT}${buildBoundedContextBlock('uslup', 'Yanıt üslubu', toneLines, 700)}
[prompt: ${PROMPT_VERSIONS.autoReply}]`;
}

/**
 * Geri bildirime üsluba göre AI yanıtı üretir.
 * P0-32: `dealerId` verilirse bayinin AI ana anahtarı kapalıyken LLM çağrılmaz (null).
 * Kota/limit aşımında null (çağıran bayinin şablonuna düşer).
 */
export async function generateAutoReply(
  feedbackText: string,
  rating: number,
  toneSlug: string,
  dealerId?: string
): Promise<string | null> {
  const client = getAIClient();
  if (!client) return null;
  if (!feedbackText || detectPromptInjection(feedbackText)) return null;
  if (!(await dealerAllowsAi(dealerId))) return null;

  try {
    await guardAiCall({ task: 'auto_reply', dealerId });
  } catch (err) {
    if (isAiGuardError(err)) return null;
    throw err;
  }

  const startTime = Date.now();

  let dbTonePrompt: string | null = null;
  try {
    const { prisma } = await import('@/lib/prisma');
    const dbTone = await prisma.aITone.findUnique({ where: { slug: toneSlug, isActive: true } });
    dbTonePrompt = dbTone?.systemPrompt ?? null;
  } catch {
    dbTonePrompt = null;
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
        ...reasoningOpts(getModel()),
        messages: [
          { role: 'system', content: buildAutoReplySystemPrompt(toneSlug, dbTonePrompt) },
          {
            role: 'user',
            content: `Müşteri Puanı: ${Number(rating) || '-'}/5\nMüşteri Yorumu:\n${wrapUntrusted('musteri_yorumu', feedbackText, 1_500)}\n\nBu geri bildirime uygun bir yanıt üret.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      })
    );

    const reply = response.choices[0]?.message?.content?.trim() || null;
    const modelUsed = `${getModelProvider()}/${getModel()}`;
    {
      const { in_, out } = usageOf(response);
      await recordAiCostUsage(dealerId ?? null, in_, out, 'auto_reply', modelUsed, Date.now() - startTime);
    }
    return reply;
  } catch (error) {
    console.error('Error generating auto reply:', error);
    await recordFailure(dealerId, 'auto_reply', startTime, error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// ARAÇ ÇAĞRILI AKIŞ GEÇİDİ (b-asistan "verine sor")
// ─────────────────────────────────────────────────────────────

export type ToolChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

export interface ToolChatCall {
  id: string;
  name: string;
  arguments: string;
}

export type ToolChatTurnResult =
  | { ok: true; content: string; toolCalls: ToolChatCall[]; modelUsed: string; finishReason: string | null; inputTokens: number; outputTokens: number }
  | { ok: false; reason: 'unconfigured' | 'disabled' | 'aborted' | 'provider_error'; error?: string };

/** Asistan modeli: araç çağrısını güvenilir yapan kalite modeli (Groq'ta gpt-oss-120b). */
function getToolChatModel(): string {
  if (process.env.AI_ASSISTANT_MODEL) return process.env.AI_ASSISTANT_MODEL;
  if (process.env.GROQ_API_KEY) return 'openai/gpt-oss-120b';
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

/**
 * Tek bir araç çağrılı model turu — AKIŞLI. Mevcut geçitlerin aynısı uygulanır:
 * sağlayıcı yoksa `unconfigured`, bayi AI'ı kapalıysa `disabled` (LLM çağrısı yok),
 * dakikalık limit + günlük token tavanı `guardAiCall` ile (aşımda AiRateLimitExceededError /
 * AiCostLimitExceededError FIRLATILIR; çağıran `isAiGuardError` ile ayırır), kullanım
 * `AIUsageLog`'a yazılır (sağlayıcı kullanım bildirmezse karakterden tahmin edilir; tavan
 * kör kalmasın). Sahte/şablon metin ÜRETMEZ.
 *
 * `onDelta` metin parçalarını gerçek zamanlı iletir. `signal` iptal edilirse `aborted`
 * döner ve o ana kadar akan metin kullanılmaz.
 */
export async function streamToolChatTurn(params: {
  dealerId: string;
  messages: ToolChatMessage[];
  tools?: ToolChatTool[];
  task?: AiTask;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  /** Aynı istekteki ilk tur dışında dakikalık limit sayılmasın (tek soru = tek limit hakkı). */
  skipRateGuard?: boolean;
}): Promise<ToolChatTurnResult> {
  const client = getAIClient();
  if (!client) return { ok: false, reason: 'unconfigured' };
  if (!(await dealerAllowsAi(params.dealerId))) return { ok: false, reason: 'disabled' };

  const task: AiTask = params.task ?? 'ask_ai';
  if (params.skipRateGuard) {
    await checkAiCostGuard(params.dealerId, dealerDailyLimitFor(task));
  } else {
    await guardAiCall({ task, dealerId: params.dealerId });
  }

  // Ortak devre kesici: sağlayıcı üst üste arızalıyken akışı hiç açma (kullanıcı 45 sn beklemesin).
  const provider = getModelProvider();
  if (await isAiCircuitOpen(provider)) {
    return { ok: false, reason: 'provider_error', error: 'AI_PROVIDER_UNAVAILABLE' };
  }

  const model = getToolChatModel();
  const modelUsed = `${getModelProvider()}/${model}`;
  const start = Date.now();
  let content = '';
  const calls = new Map<number, ToolChatCall>();
  let finishReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: params.messages,
        ...(params.tools && params.tools.length > 0 ? { tools: params.tools, tool_choice: 'auto' as const } : {}),
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 1100,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: params.signal, timeout: 45_000, maxRetries: 0 }
    );
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        content += delta.content;
        params.onDelta?.(delta.content);
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = calls.get(idx) ?? { id: '', name: '', arguments: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          calls.set(idx, cur);
        }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } | null }).usage
        ?? (chunk as { x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } }).x_groq?.usage;
      if (usage) {
        inputTokens = usage.prompt_tokens ?? inputTokens;
        outputTokens = usage.completion_tokens ?? outputTokens;
      }
    }
  } catch (error) {
    const aborted = params.signal?.aborted === true;
    // İptalde de o ana kadarki tahmini tüketim yazılır (tavan kör kalmasın).
    const estIn = inputTokens || Math.ceil(JSON.stringify(params.messages).length / 4);
    const estOut = outputTokens || Math.ceil(content.length / 4);
    await recordAiCostUsage(params.dealerId, estIn, estOut, task, modelUsed, Date.now() - start, {
      success: false,
      error: aborted ? 'aborted' : error instanceof Error ? error.message : String(error),
    });
    if (aborted) return { ok: false, reason: 'aborted' };
    if (isProviderFailure(error)) await recordAiProviderFailure(provider);
    console.error('[AI] streamToolChatTurn failed:', error);
    return { ok: false, reason: 'provider_error', error: error instanceof Error ? error.message : String(error) };
  }

  recordAiProviderSuccess(provider);
  if (!inputTokens) inputTokens = Math.ceil(JSON.stringify(params.messages).length / 4);
  if (!outputTokens) outputTokens = Math.ceil((content.length + [...calls.values()].reduce((s, c) => s + c.arguments.length, 0)) / 4);
  const latencyMs = Date.now() - start;
  await recordAiCostUsage(params.dealerId, inputTokens, outputTokens, task, modelUsed, latencyMs);
  const toolCalls = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }))
    .filter((c) => c.name);
  return { ok: true, content, toolCalls, modelUsed, finishReason, inputTokens, outputTokens };
}
