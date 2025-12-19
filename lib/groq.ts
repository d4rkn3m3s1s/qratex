import OpenAI from 'openai';
import type { AIAnalysisResult } from '@/types';

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
const MODELS = {
  fast: 'llama-3.3-70b-versatile', // Hızlı ve güçlü
  reasoning: 'deepseek-r1-distill-llama-70b', // Akıl yürütme
  large: 'llama-3.1-8b-instant', // Çok hızlı
} as const;

// Retry yapılandırması
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && error instanceof Error) {
      if (error.message.includes('rate_limit') || error.message.includes('429')) {
        await sleep(RETRY_DELAY * (MAX_RETRIES - retries + 1));
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
3. **AI Analiz**: Geri bildirimler yapay zeka ile analiz edilir
4. **Sadakat Sistemi**: Müşteriler ödüller kazanabilir
5. **Dashboard**: Detaylı analitik ve raporlar

## Kullanıcı Rolleri
- **Müşteri (Customer)**: QR kod tarar, geri bildirim verir, puan/rozet kazanır
- **Bayi (Dealer)**: QR kod oluşturur, geri bildirimleri görür, analiz yapar
- **Admin**: Tüm sistemi yönetir

## Yanıt Kuralların
1. Her zaman Türkçe yanıt ver
2. Kısa ve öz ol, gereksiz uzatma
3. Bilmediğin konularda dürüst ol
4. Platformla ilgili sorularda detaylı yardım et
5. Genel konularda da yardımcı ol
6. Uygunsuz içeriklere yanıt verme

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
      // Son 10 mesajı al
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
 * Geri bildirim analizi
 */
export async function analyzeFeedbackWithGroq(text: string): Promise<AIAnalysisResult | null> {
  const client = getGroqClient();
  if (!client) {
    console.warn('Groq API key not configured');
    return null;
  }

  if (!text || text.trim().length < 5) {
    return null;
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: MODELS.fast,
        messages: [
          {
            role: 'system',
            content: `Sen bir müşteri geri bildirimi analiz asistanısın. Türkçe metinleri analiz et ve SADECE JSON formatında yanıt ver, başka hiçbir şey yazma.

Analiz özellikleri:
1. sentiment: Genel duygu (positive, negative, neutral)
2. sentiment_score: Duygu skoru (0-1 arası)
3. emotions: Tespit edilen duygular ve skorları
4. topics: Metinde geçen konular (service, quality, price, atmosphere, staff, food, cleanliness, speed, etc.)
5. toxicity: Toksik içerik kontrolü
6. summary: Kısa özet (max 30 kelime)

JSON formatı:
{
  "sentiment": { "label": "positive", "score": 0.85 },
  "emotions": [{ "label": "happy", "score": 0.8 }],
  "topics": ["service", "quality"],
  "toxicity": { "isToxic": false, "score": 0.1, "categories": [] },
  "summary": "Kısa özet"
}`,
          },
          {
            role: 'user',
            content: `Analiz et: "${text}"`,
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      })
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const analysis = JSON.parse(content);

    return {
      sentiment: {
        label: analysis.sentiment?.label || 'neutral',
        score: analysis.sentiment?.score || 0.5,
      },
      emotions: analysis.emotions || [],
      topics: analysis.topics || [],
      toxicity: {
        isToxic: analysis.toxicity?.isToxic || false,
        score: analysis.toxicity?.score || 0,
        categories: analysis.toxicity?.categories || [],
      },
      summary: analysis.summary,
    };
  } catch (error) {
    console.error('Error analyzing feedback with Groq:', error);
    return null;
  }
}

/**
 * İşletme içgörüleri oluştur
 */
export async function generateInsightsWithGroq(feedbackData: {
  totalCount: number;
  averageRating: number;
  sentimentDistribution: { positive: number; negative: number; neutral: number };
  topTopics: string[];
  recentFeedbacks: { text: string; rating: number; sentiment: string }[];
}): Promise<string | null> {
  const client = getGroqClient();
  if (!client) {
    console.warn('Groq API key not configured');
    return null;
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: MODELS.fast,
        messages: [
          {
            role: 'system',
            content: `Sen QRATEX platformunun iş analisti asistanısın. Müşteri geri bildirim verilerini analiz edip işletme sahiplerine actionable insights sağla. Türkçe, kısa ve öz yanıt ver. Emoji kullan.`,
          },
          {
            role: 'user',
            content: `Aşağıdaki geri bildirim verilerini analiz et ve işletme sahibine 3-5 maddelik öneriler sun:

📊 Toplam Geri Bildirim: ${feedbackData.totalCount}
⭐ Ortalama Puan: ${feedbackData.averageRating.toFixed(1)}/5
😊 Olumlu: %${feedbackData.sentimentDistribution.positive}
😐 Nötr: %${feedbackData.sentimentDistribution.neutral}
😞 Olumsuz: %${feedbackData.sentimentDistribution.negative}
🏷️ En Çok Bahsedilen Konular: ${feedbackData.topTopics.join(', ') || 'Yok'}

Son Geri Bildirimler:
${feedbackData.recentFeedbacks.slice(0, 5).map((f) => `- "${f.text}" (⭐${f.rating})`).join('\n')}

Analiz et ve öneriler sun:`,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
      })
    );

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating insights with Groq:', error);
    return null;
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

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: MODELS.large, // Hızlı model
        messages: [
          {
            role: 'system',
            content: `Müşteri geri bildirimine 3 farklı profesyonel yanıt önerisi oluştur. Her yanıt kısa ve samimi olsun. SADECE JSON array döndür: ["yanıt1", "yanıt2", "yanıt3"]`,
          },
          {
            role: 'user',
            content: `Geri bildirim: "${feedbackText}" (Puan: ${rating}/5)`,
          },
        ],
        temperature: 0.8,
        max_tokens: 300,
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

export default {
  chatWithQRA,
  analyzeFeedbackWithGroq,
  generateInsightsWithGroq,
  suggestResponseWithGroq,
};
