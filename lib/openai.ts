/**
 * QRATEX AI - OpenAI/Groq Integration (Legacy compat wrapper)
 * 
 * Bu dosya geriye uyumluluk için korunmuştur.
 * Tüm yeni AI işlemleri lib/ai-engine.ts üzerinden yapılmalıdır.
 */

import {
  analyzeComprehensive,
  analyzeWithFallback as _analyzeWithFallback,
  analyzeSentimentLocal,
  checkToxicityLocal,
  type AnalyzeOptions,
} from './ai-engine';
import type { AIAnalysisResult } from '@/types';
import OpenAI from 'openai';

// Re-export from ai-engine for backward compatibility
export { analyzeSentimentLocal, checkToxicityLocal };

// Lazy initialize AI client (Groq veya OpenAI)
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
  if (process.env.GROQ_API_KEY) return 'llama-3.3-70b-versatile';
  return process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries: number = MAX_RETRIES): Promise<T> {
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

/**
 * Analyze feedback text using AI - now delegates to ai-engine
 */
export async function analyzeFeedback(text: string): Promise<AIAnalysisResult | null> {
  return analyzeComprehensive(text);
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
  const client = getAIClient();
  if (!client) {
    console.warn('AI API key not configured');
    return null;
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
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
export async function chatWithAI(message: string, context?: string): Promise<string | null> {
  const client = getAIClient();
  if (!client) {
    return 'AI asistanı şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.';
  }

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: getModel(),
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
 * Full analysis with fallback - delegates to ai-engine
 */
export async function analyzeWithFallback(
  text: string,
  options: AnalyzeOptions = {}
): Promise<AIAnalysisResult> {
  return _analyzeWithFallback(text, options);
}

export default {
  analyzeFeedback,
  generateInsights,
  chatWithAI,
  checkToxicityLocal,
  analyzeSentimentLocal,
  analyzeWithFallback,
};
