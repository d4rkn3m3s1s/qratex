import OpenAI from 'openai';
import { detectPromptInjection } from '@/lib/prompt-injection';
import { buildQraKnowledgeBlock } from '@/lib/qra-knowledge-base';

// Groq API Client (OpenAI uyumlu)
let groqClient: OpenAI | null = null;

function getGroqClient(): OpenAI | null {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return groqClient;
}

// Model seçenekleri
/**
 * MODEL SEÇİMİ — Groq ÜCRETSİZ tier limitlerine göre kullanım-başına ayrılmıştır.
 * (Doğrulandı: console.groq.com/docs/rate-limits + /docs/models + /docs/structured-outputs)
 *
 *   model                  | RPM |   RPD | TPM |  TPD  | not
 *   llama-3.1-8b-instant   |  30 | 14.4K |  6K |  500K | HACİM kralı → yüksek frekanslı işler
 *   openai/gpt-oss-120b    |  30 |    1K |  8K |  200K | KALİTE + strict JSON şema desteği
 *   openai/gpt-oss-20b     |  30 |    1K |  8K |  200K | 120B ile AYNI limit → 120B tercih edilir
 *   groq/compound          |  30 |   250 | 70K |    -  | ajanik (web arama), TPD sınırsız
 *
 * KURAL: yüksek hacimli yollar (feedback analizi, aksiyon önerileri, öğrenme özetleri)
 * `instant` kullanır — 14.4K istek/gün. Düşük hacimli ama kalite/JSON kritik yollar
 * (sohbet botu, sistem öğrenmesi) `fast` kullanır — günde 1K istek yeterli.
 * llama-3.3-70b-versatile 2026-08-16'da decommission edildi (Groq bildirimi).
 */
export const MODELS = {
  /** Kalite + strict JSON: sohbet botu, sistem öğrenmesi. Ücretsiz: 1K istek/gün. */
  fast: 'openai/gpt-oss-120b',
  /** Akıl yürütme: gpt-oss-120b MoE zaten reasoning yetenekli (eski deepseek-r1-distill
   *  Groq üretim listesinden kalktı). Ayrı bir kota tüketmemesi için `fast` ile aynı. */
  reasoning: 'openai/gpt-oss-120b',
  /** Hacim: yüksek frekanslı analizler. Ücretsiz: 14.4K istek/gün, 500K token/gün. */
  instant: 'llama-3.1-8b-instant',
} as const;

// Retry yapılandırması
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRY_CAP_MS = 8000;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && error instanceof Error) {
      if (error.message.includes('rate_limit') || error.message.includes('429')) {
        // FULL JITTER + üstel backoff: aynı anda 429 yiyen N istek senkron tekrar denemesin
        // (thundering herd). delay = random(0, min(CAP, base·2^attempt)).
        const attempt = MAX_RETRIES - retries; // 0,1,2...
        const expBackoff = Math.min(RETRY_CAP_MS, RETRY_DELAY * Math.pow(2, attempt));
        await sleep(Math.floor(Math.random() * expBackoff));
        return withRetry(fn, retries - 1);
      }
    }
    throw error;
  }
}

// QRATEX Chatbot system prompt
const CHATBOT_SYSTEM_PROMPT = `Sen QRATEX'in yapay zeka asistanı QRA'sın! 🤖✨

## Hakkında
QRATEX, işletmelerin müşteri deneyimini dönüştüren yenilikçi bir QR kod tabanlı geri bildirim ve sadakat platformudur.

## Kişiliğin
- Samimi, yardımsever ve pozitif bir asistansın
- Türkçe konuşuyorsun, bazen emoji kullanıyorsun
- Kullanıcıların sorularına net ve öz yanıtlar veriyorsun
- Teknik konuları basit bir dille açıklayabiliyorsun

## Platform Özellikleri
1. **QR Kod Yönetimi**: İşletmeler özel QR kodlar oluşturarak müşteri geri bildirimi toplayabilir
2. **Gamification**: Müşteriler puan kazanır, rozetler açar, görevler tamamlar
3. **AI Analiz**: Geri bildirimler yapay zeka ile analiz edilir (duygu, niyet, aciliyet, churn riski, tema, varlık tanıma)
4. **Sadakat Sistemi**: Müşteriler ödüller kazanabilir
5. **Dashboard**: Detaylı analitik ve raporlar
6. **Derin Öğrenme**: AI motoru sürekli öğrenerek işletmeye özel analiz profilleri oluşturur

## Kullanıcı Rolleri
- **Müşteri (Customer)**: QR kod tarar, geri bildirim verir, puan/rozet kazanır, kendi AI analizlerini görür
- **Bayi (Dealer)**: QR kod oluşturur, geri bildirimleri görür, AI analiz ve içgörüler alır, AI ayarlarını yönetir
- **Admin**: Tüm sistemi yönetir, sistem geneli AI kontrolü, derin öğrenme profilleri, detaylı analiz

## Yanıt Kuralların
1. Her zaman Türkçe yanıt ver
2. Kısa ve öz ol, gereksiz uzatma
3. Bilmediğin konularda dürüst ol
4. Platformla ilgili sorularda detaylı yardım et
5. Genel konularda da yardımcı ol
6. Uygunsuz içeriklere yanıt verme
${buildQraKnowledgeBlock()}

Şimdi kullanıcıya yardım etmeye hazırsın! 🚀`;

/**
 * QRATEX Chatbot - Kullanıcılarla sohbet
 */
export async function chatWithQRA(
  message: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  userContext?: {
    name?: string;
    role?: string;
    stats?: { points?: number; level?: number };
  }
): Promise<string> {
  const client = getGroqClient();
  if (!client) {
    return '🔧 AI asistanı şu anda bakımda. Lütfen daha sonra tekrar deneyin.';
  }
  if (detectPromptInjection(message)) {
    return 'Bu mesaj güvenlik nedeniyle işlenemiyor. Lütfen farklı bir soru deneyin.';
  }

  try {
    // Context ekle
    let contextInfo = '';
    if (userContext) {
      contextInfo = `\n\n[Kullanıcı Bilgisi: ${userContext.name || 'Misafir'}, Rol: ${userContext.role || 'Müşteri'}${userContext.stats ? `, Puan: ${userContext.stats.points || 0}, Seviye: ${userContext.stats.level || 1}` : ''}]`;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: CHATBOT_SYSTEM_PROMPT + contextInfo,
      },
    ];

    // Önceki konuşma geçmişini ekle
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      messages.push(...recentHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })));
    }

    // Yeni mesajı ekle
    messages.push({
      role: 'user',
      content: message,
    });

    const response = await withRetry(() =>
      client.chat.completions.create({
        model: MODELS.fast,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 0.9,
      })
    );

    return response.choices[0]?.message?.content || 'Yanıt oluşturulamadı.';
  } catch (error) {
    console.error('Groq chat error:', error);
    return '❌ Bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

/**
 * Hızlı yanıt önerileri
 */
export async function suggestResponseWithGroq(
  feedbackText: string,
  rating: number
): Promise<string[]> {
  const client = getGroqClient();
  if (!client) {
    return [];
  }

  const sentiment = rating >= 4 ? 'olumlu' : rating <= 2 ? 'olumsuz' : 'nötr';
  if (detectPromptInjection(feedbackText)) {
    return [];
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: MODELS.fast,
        messages: [
          {
            role: 'system',
            content: `Sen bir işletme sahibinin müşteri yorumlarına profesyonel yanıt yazan AI asistanısın.

Kurallar:
- Türkçe yaz, samimi ama profesyonel ol
- Müşteriye ismiyle değil "Değerli müşterimiz" diye hitap et
- ${sentiment === 'olumlu' ? 'Teşekkür et, tekrar bekle, memnuniyetini vurgula' : sentiment === 'olumsuz' ? 'Özür dile, sorunu anladığını göster, çözüm öner, telafi teklif et' : 'Teşekkür et, gelişim için not aldığını belirt'}
- Her yanıt 2-4 cümle olsun
- Emoji kullanabilirsin ama abartma
- 3 farklı ton/yaklaşımla yanıt üret: 1) Profesyonel 2) Samimi/sıcak 3) Çözüm odaklı

SADECE JSON array döndür: ["yanıt1", "yanıt2", "yanıt3"]`,
          },
          {
            role: 'user',
            content: `Müşteri yorumu: "${feedbackText}"\nPuan: ${rating}/5 (${sentiment})`,
          },
        ],
        temperature: 0.7,
        max_tokens: 600,
      })
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  } catch (error) {
    console.error('Error suggesting response:', error);
    return [];
  }
}

const groqApi = {
  chatWithQRA,
  suggestResponseWithGroq,
};

export default groqApi;
