import { prisma } from '@/lib/prisma';
import { askAI } from '@/lib/ai-engine';
import { checkRateLimitDb, type RateLimitResult } from '@/lib/rate-limit';
import { redisSetJson } from '@/lib/redis';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  LLM_LIMITS,
  MIN_FEEDBACKS_FOR_RECOMMENDATIONS,
  RECOMMENDATION_CACHE_TTL_SECONDS,
  RECOMMENDATION_MESSAGES,
  RECOMMENDATION_SAMPLE_SIZE,
  buildRecommendationQuestion,
  computeRecommendationStats,
  corpusFingerprint,
  hasMeaningfulText,
  insufficientPayload,
  normalizeAskAiResult,
  recommendationCacheKey,
  redactContactInfo,
  type RecommendationFeedbackRow,
  type RecommendationsPayload,
} from './core';
import { inFlight, memorySet, readCache, type CachedRecommendation, type GenerationOutcome } from './cache';

export const dynamic = 'force-dynamic';

/**
 * LLM kotası — kullanıcı saatlik + günlük + platform saatlik. Sayaç altyapısı hata verirse
 * KAPALI başarısız olur (ücretli çağrı yapılmaz).
 */
async function consumeLlmQuota(userId: string): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const checks: Array<[string, { max: number; windowMs: number }]> = [
    [`ai_rec_llm:h:${userId}`, LLM_LIMITS.perUserHour],
    [`ai_rec_llm:d:${userId}`, LLM_LIMITS.perUserDay],
    ['ai_rec_llm:platform:h', LLM_LIMITS.platformHour],
  ];
  for (const [bucket, policy] of checks) {
    let result: RateLimitResult;
    try {
      result = await checkRateLimitDb(bucket, policy.max, policy.windowMs);
    } catch (error) {
      console.warn('[ai-recommendations] kota sayacı okunamadı, LLM çağrısı yapılmadı:', error);
      return { ok: false, retryAfterSec: 60 };
    }
    if (!result.ok) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((result.retryAfterMs ?? policy.windowMs) / 1000)) };
    }
  }
  return { ok: true };
}

async function generate(
  rows: RecommendationFeedbackRow[],
  stats: ReturnType<typeof computeRecommendationStats>
): Promise<CachedRecommendation | null> {
  let raw: unknown;
  try {
    raw = await askAI(buildRecommendationQuestion(stats), {
      totalFeedbacks: stats.totalFeedbacks,
      avgRating: stats.avgRating,
      sentimentDist: stats.sentimentDist,
      topTopics: stats.topTopics,
      recentFeedbacks: rows.slice(0, 10).map((f) => ({
        text: redactContactInfo(String(f.text ?? '')).slice(0, 600),
        rating: f.rating,
        sentiment: f.sentiment || 'neutral',
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[ai-recommendations] askAI hata:', error);
    return null;
  }
  const result = normalizeAskAiResult(raw);
  if (!result.ok) return null;
  return { text: result.text, generatedAt: new Date().toISOString() };
}

/**
 * GET /api/customer/ai-recommendations
 *
 * Yalnız CUSTOMER; `customer_ai_insights` modülü kapalıysa 403. Yanıt `data` içinde ve geriye
 * uyum için kökte `RecommendationsPayload` taşır — `stats` HER dalda tam şekillidir.
 */
export const GET = defineRoute(
  {
    name: 'customer.ai-recommendations.get',
    roles: ['CUSTOMER'],
    module: 'customer_ai_insights',
    // Okuma tavanı (önbellek isabetleri dahil); ücretli LLM kotası ayrıca uygulanır.
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
  },
  async ({ user }) => {
    const feedbacks = await prisma.feedback.findMany({
      where: { userId: user.id, deletedAt: null, text: { not: null } },
      select: {
        id: true,
        text: true,
        rating: true,
        sentiment: true,
        topics: true,
        urgency: true,
        effortScore: true,
        churnRisk: true,
        createdAt: true,
        updatedAt: true,
        qrCode: { select: { name: true, dealer: { select: { businessName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: RECOMMENDATION_SAMPLE_SIZE,
    });

    const rows = (feedbacks as RecommendationFeedbackRow[]).filter(hasMeaningfulText);
    const stats = computeRecommendationStats(rows);

    if (rows.length < MIN_FEEDBACKS_FOR_RECOMMENDATIONS) {
      return ok(insufficientPayload(stats), { legacySpread: true });
    }

    const base: Omit<RecommendationsPayload, 'recommendationsStatus' | 'recommendations' | 'message' | 'cached' | 'generatedAt' | 'retryAfterSec'> = {
      status: 'ready',
      required: MIN_FEEDBACKS_FOR_RECOMMENDATIONS,
      have: rows.length,
      stats,
    };

    const cacheKey = recommendationCacheKey(user.id, corpusFingerprint(rows));
    const cached = await readCache(cacheKey);
    if (cached) {
      const payload: RecommendationsPayload = {
        ...base,
        recommendationsStatus: 'ready',
        recommendations: cached.text,
        message: null,
        cached: true,
        generatedAt: cached.generatedAt,
        retryAfterSec: null,
      };
      return ok(payload, { legacySpread: true });
    }

    // Tek-uçuş: harita okuma ve yazma aynı mikro görevde (araya `await` girmeden) yapılır;
    // böylece eşzamanlı ıskalar kota ve LLM çağrısını paylaşır.
    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = (async (): Promise<GenerationOutcome> => {
        const quota = await consumeLlmQuota(user.id);
        if (!quota.ok) return { kind: 'rate_limited', retryAfterSec: quota.retryAfterSec };
        const fresh = await generate(rows, stats);
        if (!fresh) return { kind: 'unavailable' };
        memorySet(cacheKey, fresh);
        await redisSetJson(cacheKey, fresh, RECOMMENDATION_CACHE_TTL_SECONDS);
        return { kind: 'ready', value: fresh };
      })().finally(() => {
        inFlight.delete(cacheKey);
      });
      inFlight.set(cacheKey, pending);
    }

    const outcome = await pending;
    const payload: RecommendationsPayload =
      outcome.kind === 'ready'
        ? {
            ...base,
            recommendationsStatus: 'ready',
            recommendations: outcome.value.text,
            message: null,
            cached: false,
            generatedAt: outcome.value.generatedAt,
            retryAfterSec: null,
          }
        : outcome.kind === 'rate_limited'
          ? {
              ...base,
              recommendationsStatus: 'rate_limited',
              recommendations: null,
              message: RECOMMENDATION_MESSAGES.rateLimited,
              cached: false,
              generatedAt: null,
              retryAfterSec: outcome.retryAfterSec,
            }
          : {
              ...base,
              recommendationsStatus: 'unavailable',
              recommendations: null,
              message: RECOMMENDATION_MESSAGES.unavailable,
              cached: false,
              generatedAt: null,
              retryAfterSec: null,
            };
    return ok(payload, { legacySpread: true });
  }
);

