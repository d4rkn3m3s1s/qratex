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
  askAI,
  type AnalyzeOptions,
} from './ai-engine';
import type { AIAnalysisResult } from '@/types';

// Re-export from ai-engine for backward compatibility
export { analyzeSentimentLocal, checkToxicityLocal };

// AI client - ai-engine.ts'deki merkezi client kullanılır
// Bu dosyada ayrı client oluşturmaya gerek yok.

/**
 * Analyze feedback text using AI - delegates to ai-engine
 */
export async function analyzeFeedback(text: string): Promise<AIAnalysisResult | null> {
  return analyzeComprehensive(text);
}

/**
 * Generate AI-powered insights from feedback data
 * Delegated to askAI with structured context
 */
export async function generateInsights(feedbackData: {
  totalCount: number;
  averageRating: number;
  sentimentDistribution: { positive: number; negative: number; neutral: number };
  topTopics: string[];
  recentFeedbacks: { text: string; rating: number; sentiment: string }[];
}): Promise<string | null> {
  // askAI kullanarak insights oluştur
  const question = `Aşağıdaki geri bildirim verilerini analiz et ve işletme sahibine 3-5 maddelik öneriler sun:
Toplam: ${feedbackData.totalCount}, Ort. Puan: ${feedbackData.averageRating}/5
Duygu: Olumlu %${feedbackData.sentimentDistribution.positive}, Olumsuz %${feedbackData.sentimentDistribution.negative}
Konular: ${feedbackData.topTopics.join(', ')}`;

  return askAI(question, {
    totalFeedbacks: feedbackData.totalCount,
    avgRating: feedbackData.averageRating,
    sentimentDist: feedbackData.sentimentDistribution,
    topTopics: feedbackData.topTopics.map(t => ({ topic: t, count: 1 })),
    recentFeedbacks: feedbackData.recentFeedbacks.map(f => ({
      text: f.text,
      rating: f.rating,
      sentiment: f.sentiment,
      createdAt: new Date().toISOString(),
    })),
  });
}

/**
 * AI Chat assistant - delegates to askAI
 */
export async function chatWithAI(message: string, context?: string): Promise<string | null> {
  return askAI(message, {
    totalFeedbacks: 0,
    avgRating: 0,
    sentimentDist: { positive: 0, negative: 0, neutral: 0 },
    topTopics: [],
    recentFeedbacks: [],
    previousMessages: context ? [{ role: 'user', content: context }] : undefined,
  });
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

const openaiApi = {
  analyzeFeedback,
  generateInsights,
  chatWithAI,
  checkToxicityLocal,
  analyzeSentimentLocal,
  analyzeWithFallback,
};

export default openaiApi;
