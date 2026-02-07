import OpenAI from 'openai';

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
  fast: 'llama-3.3-70b-versatile', // Hızlı ve güçlü (70B)
  reasoning: 'deepseek-r1-distill-llama-70b', // Akıl yürütme
  instant: 'llama-3.1-8b-instant', // Çok hızlı, küçük model (8B)
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

export default {
  chatWithQRA,
  suggestResponseWithGroq,
};
