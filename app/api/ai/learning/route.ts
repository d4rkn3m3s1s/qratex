import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';
import { recordFeedbackCorrection, updateAdaptiveProfile, getLearningRetrainSuggestion } from '@/lib/ai-learning';
import { resolveAiScope, resolveDealerScope, scopeErrorResponse } from '@/lib/auth/scope';
import { checkRateLimitDb } from '@/lib/rate-limit';


export const dynamic = 'force-dynamic';

/** Düzeltme değeri üst sınırı: profil zehirleme / depolama şişirmesine karşı. */
const MAX_CORRECTION_JSON_CHARS = 2_000;

const boundedJson = z.unknown().refine(
  (v) => {
    try {
      return JSON.stringify(v ?? null).length <= MAX_CORRECTION_JSON_CHARS;
    } catch {
      return false;
    }
  },
  { message: 'Düzeltme değeri çok büyük.' }
);

const correctionSchema = z.object({
  feedbackId: z.string().min(1).max(191),
  field: z.string().min(2).max(64),
  newValue: boundedJson,
  oldValue: boundedJson.optional(),
  note: z.string().max(500).optional(),
});

const updateProfileSchema = z.object({ dealerId: z.string().max(191).optional().nullable() }).passthrough();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/**
 * GET /api/ai/learning — bayinin AI öğrenme profili ve düzeltme geçmişi.
 * P0-05: kapsam `resolveAiScope` (VARSAYILAN REDDET). STAFF yalnız AKTİF bağlı olduğu bayiyi,
 * ADMIN yalnız `?dealerId=` ile seçtiği bayiyi görür; ADMIN seçim yapmazsa boş durum döner.
 */
export async function GET(request: NextRequest) {
  try {
    // Rol kararı DB'deki GÜNCEL rolle (requireAuth); kapsam aşağıda resolveAiScope ile.
    const auth = await requireAuth(['ADMIN', 'DEALER', 'STAFF']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { searchParams } = new URL(request.url);
    const scope = await resolveAiScope(session, { dealerId: searchParams.get('dealerId'), allowPlatform: true });
    if (!scope.ok) return scopeErrorResponse(scope);

    const dealerId = scope.dealerId;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);

    if (!dealerId) {
      return json({
        success: true,
        profile: null,
        embeddingsCount: 0,
        correctionsCount: 0,
        corrections: [],
        retrainSuggestion: null,
      });
    }

    const [profile, embeddingsCount, correctionsCount, corrections, retrainSuggestion] = await Promise.all([
      prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } }),
      prisma.aIEmbedding.count({ where: { dealerId } }),
      prisma.aIFeedbackCorrection.count({ where: { dealerId } }),
      prisma.aIFeedbackCorrection.findMany({
        where: { dealerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          feedbackId: true,
          field: true,
          newValue: true,
          oldValue: true,
          note: true,
          createdAt: true,
          feedback: { select: { text: true } },
        },
      }),
      getLearningRetrainSuggestion(dealerId),
    ]);

    return json({
      success: true,
      profile,
      embeddingsCount,
      correctionsCount,
      corrections,
      retrainSuggestion,
    });
  } catch (error) {
    console.error('Learning status error:', error);
    return json({ error: 'Öğrenme durumu alınamadı' }, 500);
  }
}

/**
 * POST /api/ai/learning?action=record_correction|update_profile
 *
 * P0-05: Eski kod yalnız DEALER için sahiplik bakıyordu → STAFF (ve tanınmayan her rol) BAŞKA
 * bayinin yorumuna düzeltme yazıp o bayinin AI öğrenme profilini zehirleyebiliyordu.
 * Artık: CUSTOMER/bilinmeyen → 403; DEALER/STAFF → yorum kendi (aktif) bayisine ait olmalı;
 * ADMIN → yorumun bayisi hedeflenir (açık seçim) ya da `dealerId` gövdede verilmeli.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN', 'DEALER', 'STAFF']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'record_correction';

    // Kimlik ve rolü gövdeyi okumadan önce doğrula (CUSTOMER hiç ilerlemesin).
    const preScope = await resolveAiScope(session, { allowPlatform: true });
    if (!preScope.ok && preScope.code !== 'DEALER_ID_REQUIRED') return scopeErrorResponse(preScope);

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Geçersiz istek gövdesi' }, 400);

    if (action === 'record_correction') {
      const validated = correctionSchema.safeParse(body);
      if (!validated.success) {
        return json({ error: validated.error.errors[0]?.message ?? 'Geçersiz veri' }, 400);
      }

      const { feedbackId, field, newValue, oldValue, note } = validated.data;
      const fb = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        select: { qrCode: { select: { dealerId: true } } },
      });
      if (!fb) return json({ error: 'Geri bildirim bulunamadı' }, 404);

      // Yorumun sahibi bayi kapsamı: DEALER/STAFF kendi bayileri değilse 403; ADMIN için hedef
      // yorumun bayisidir (DEALER olduğu doğrulanır).
      const scope = await resolveDealerScope(session, { dealerId: fb.qrCode.dealerId });
      if (!scope.ok) return scopeErrorResponse(scope);

      const rl = await checkRateLimitDb(`ai-learning:correction:${scope.actorId}`, 60, 60_000);
      if (!rl.ok) return json({ error: 'Çok fazla düzeltme gönderdiniz. Lütfen biraz bekleyin.' }, 429);

      const correction = await recordFeedbackCorrection({
        dealerId: fb.qrCode.dealerId,
        feedbackId,
        field,
        newValue,
        oldValue,
        note,
      });

      return json({ success: true, correction });
    }

    if (action === 'update_profile') {
      const parsed = updateProfileSchema.safeParse(body);
      const requested = parsed.success ? parsed.data.dealerId ?? null : null;
      const scope = await resolveDealerScope(session, { dealerId: requested });
      if (!scope.ok) return scopeErrorResponse(scope);

      // Profil yenileme LLM çağrısı yapar: aktör başına dakikada 3.
      const rl = await checkRateLimitDb(`ai-learning:profile:${scope.actorId}`, 3, 60_000);
      if (!rl.ok) return json({ error: 'Profil kısa süre önce güncellendi. Lütfen biraz bekleyin.' }, 429);

      const profile = await updateAdaptiveProfile(scope.dealerId);
      return json({ success: true, profile });
    }

    return json({ error: 'Geçersiz işlem' }, 400);
  } catch (error) {
    console.error('Learning action error:', error);
    return json({ error: 'Öğrenme işlemi başarısız' }, 500);
  }
}
