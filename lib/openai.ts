import OpenAI from 'openai';
import type { AIAnalysisResult } from '@/types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Retry configuration
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
      // Check if it's a rate limit error
      if (error.message.includes('rate_limit') || error.message.includes('429')) {
        await sleep(RETRY_DELAY * (MAX_RETRIES - retries + 1));
        return withRetry(fn, retries - 1);
      }
    }
    throw error;
  }
}

/**
 * Analyze feedback text using OpenAI
 */
export async function analyzeFeedback(text: string): Promise<AIAnalysisResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured');
    return null;
  }

  if (!text || text.trim().length < 5) {
    return null;
  }

  try {
    const response = await withRetry(() =>
      openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Sen bir müşteri geri bildirimi analiz asistanısın. Türkçe metinleri analiz et ve JSON formatında yanıt ver.

Analiz etmen gereken özellikler:
1. sentiment: Genel duygu (positive, negative, neutral)
2. sentiment_score: Duygu skoru (0-1 arası)
3. emotions: Tespit edilen duygular ve skorları
4. topics: Metinde geçen konular (service, quality, price, atmosphere, staff, food, cleanliness, speed, etc.)
5. toxicity: Toksik içerik kontrolü
6. summary: Kısa özet (max 50 kelime)

JSON formatı:
{
  "sentiment": { "label": "positive|negative|neutral", "score": 0.85 },
  "emotions": [{ "label": "happy", "score": 0.8 }, { "label": "satisfied", "score": 0.7 }],
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
        temperature: 0.3,
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
    console.error('Error analyzing feedback:', error);
    return null;
  }
}

/**
 * Generate AI-powered insights from feedback data
 */
export async function generateInsights(feedbackData: {
  totalCount: number;
  averageRating: number;
  sentimentDistribution: { positive: number; negative: number; neutral: number };
  topTopics: string[];
  recentFeedbacks: { text: string; rating: number; sentiment: string }[];
}): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured');
    return null;
  }

  try {
    const response = await withRetry(() =>
      openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Sen bir iş analisti asistanısın. Müşteri geri bildirim verilerini analiz edip işletme sahiplerine actionable insights sağla. Türkçe yanıt ver.`,
          },
          {
            role: 'user',
            content: `Aşağıdaki geri bildirim verilerini analiz et ve işletme sahibine 3-5 maddelik öneriler sun:

Toplam Geri Bildirim: ${feedbackData.totalCount}
Ortalama Puan: ${feedbackData.averageRating}/5
Duygu Dağılımı: Olumlu %${feedbackData.sentimentDistribution.positive}, Olumsuz %${feedbackData.sentimentDistribution.negative}, Nötr %${feedbackData.sentimentDistribution.neutral}
En Çok Bahsedilen Konular: ${feedbackData.topTopics.join(', ')}

Son Geri Bildirimler:
${feedbackData.recentFeedbacks.map((f) => `- ${f.text} (Puan: ${f.rating}, Duygu: ${f.sentiment})`).join('\n')}

Analiz et ve öneriler sun:`,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
      })
    );

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating insights:', error);
    return null;
  }
}

/**
 * AI Chat assistant for dealers
 */
export async function chatWithAI(
  message: string,
  context?: string
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    return 'AI asistanı şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.';
  }

  try {
    const response = await withRetry(() =>
      openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `Sen QRATEX platformunun AI asistanısın. İşletme sahiplerine müşteri deneyimi, geri bildirim yönetimi ve gamification konularında yardım ediyorsun. Türkçe yanıt ver, samimi ve yardımsever ol.${context ? `\n\nKullanıcı bağlamı: ${context}` : ''}`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      })
    );

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error in AI chat:', error);
    return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

/**
 * Check text for toxicity (fallback without AI)
 */
export function checkToxicityLocal(text: string): { isToxic: boolean; score: number } {
  const toxicWords = [
    'aptal', 'salak', 'gerizekalı', 'mal', 'ahmak', 'pislik',
    'lanet', 'kahretsin', 'berbat', 'rezil', 'kepaze',
  ];

  const lowerText = text.toLowerCase();
  let toxicCount = 0;

  for (const word of toxicWords) {
    if (lowerText.includes(word)) {
      toxicCount++;
    }
  }

  const score = Math.min(toxicCount * 0.25, 1);
  return {
    isToxic: score > 0.5,
    score,
  };
}

/**
 * Simple sentiment analysis fallback
 */
export function analyzeSentimentLocal(text: string): {
  label: 'positive' | 'negative' | 'neutral';
  score: number;
} {
  const positiveWords = [
    'harika', 'mükemmel', 'güzel', 'muhteşem', 'süper', 'iyi', 'teşekkür',
    'memnun', 'beğendim', 'tavsiye', 'harikulade', 'enfes', 'lezzetli',
    'temiz', 'hızlı', 'ilgili', 'kibar', 'profesyonel',
  ];

  const negativeWords = [
    'kötü', 'berbat', 'rezil', 'yetersiz', 'hayal kırıklığı', 'memnun değil',
    'pişman', 'sorun', 'problem', 'yavaş', 'pahalı', 'kirli', 'ilgisiz',
    'beklentim', 'olumsuz', 'şikayet',
  ];

  const lowerText = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (lowerText.includes(word)) positiveCount++;
  }

  for (const word of negativeWords) {
    if (lowerText.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { label: 'neutral', score: 0.5 };
  }

  const positiveRatio = positiveCount / total;

  if (positiveRatio >= 0.6) {
    return { label: 'positive', score: 0.5 + positiveRatio * 0.5 };
  } else if (positiveRatio <= 0.4) {
    return { label: 'negative', score: 0.5 - (1 - positiveRatio) * 0.5 };
  }

  return { label: 'neutral', score: 0.5 };
}

/**
 * Full analysis with fallback
 */
export async function analyzeWithFallback(text: string): Promise<AIAnalysisResult> {
  // Try AI analysis first
  const aiResult = await analyzeFeedback(text);

  if (aiResult) {
    return aiResult;
  }

  // Fallback to local analysis
  const sentiment = analyzeSentimentLocal(text);
  const toxicity = checkToxicityLocal(text);

  return {
    sentiment,
    emotions: [],
    topics: [],
    toxicity: {
      ...toxicity,
      categories: [],
    },
  };
}

export default {
  analyzeFeedback,
  generateInsights,
  chatWithAI,
  checkToxicityLocal,
  analyzeSentimentLocal,
  analyzeWithFallback,
};

