/**
 * Admin: Sistem geneli AI öğrenme profili
 * GET: profil + istatistikler
 * POST: eğitimi tetikle (updateSystemLearningProfile) → yalnız ONAY BEKLEYEN öneri üretir (P0-33)
 * PATCH: sistem/sohbet notlarını manuel güncelle (yalnız sınırlı ek bağlam olarak kullanılır)
 * PUT: bekleyen öneriyi onayla / reddet ({ action: 'approve' | 'reject', proposalId })
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import {
  updateSystemLearningProfile,
  getSystemLearningProfile,
  updateSystemLearningPrompts,
  getSystemLearningProposal,
  approveSystemLearningProposal,
  rejectSystemLearningProposal,
} from '@/lib/ai-learning';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const profile = await getSystemLearningProfile();
    const [feedbackCount, correctionCount, dealerCount, embeddingCount] = await Promise.all([
      prisma.feedback.count({ where: { deletedAt: null } }),
      prisma.aIFeedbackCorrection.count(),
      prisma.user.count({ where: { role: 'DEALER' } }),
      prisma.aIEmbedding.count(),
    ]);

    return NextResponse.json({
      success: true,
      profile: profile || null,
      stats: {
        feedbackCount,
        correctionCount,
        dealerCount,
        embeddingCount,
      },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('System learning GET error:', error);
    return NextResponse.json({ error: 'Profil yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const result = await updateSystemLearningProfile();
    if (!result) {
      return NextResponse.json({ error: 'AI client kullanılamıyor veya eğitim başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({
      success: true,
      status: result.status,
      proposalId: result.proposal.id,
      diff: result.diff,
      message: 'Öneri oluşturuldu; yönetici onayından sonra yürürlüğe girer.',
      version: result.version,
      profile: result.profile,
      trainingDataStats: result.trainingDataStats,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (isAiGuardError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
    }
    console.error('System learning POST error:', error);
    return NextResponse.json({ error: 'Sistem eğitimi başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const systemPrompt = body.systemPrompt as string | null | undefined;
    const chatSystemPrompt = body.chatSystemPrompt as string | null | undefined;

    if (systemPrompt === undefined && chatSystemPrompt === undefined) {
      return NextResponse.json({ error: 'systemPrompt veya chatSystemPrompt gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const ok = await updateSystemLearningPrompts({ systemPrompt, chatSystemPrompt });
    if (!ok) {
      return NextResponse.json({ error: 'Profil bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const profile = await getSystemLearningProfile();
    return NextResponse.json({ success: true, profile }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('System learning PATCH error:', error);
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; proposalId?: unknown };
    const action = body.action;
    const proposalId = typeof body.proposalId === 'string' ? body.proposalId : '';
    if ((action !== 'approve' && action !== 'reject') || !proposalId) {
      return NextResponse.json({ error: "action ('approve' | 'reject') ve proposalId gerekli" }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const adminId = auth.session.user.id;
    const result = action === 'approve'
      ? await approveSystemLearningProposal({ adminId, proposalId })
      : await rejectSystemLearningProposal({ adminId, proposalId });
    if (!result.ok) {
      const reason = 'reason' in result ? result.reason : undefined;
      return NextResponse.json(
        { error: reason === 'stale' ? 'Öneri değişmiş; sayfayı yenileyip tekrar deneyin.' : 'Bekleyen öneri bulunamadı.', reason },
        { status: reason === 'stale' ? 409 : 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const proposal = await getSystemLearningProposal();
    return NextResponse.json({ success: true, action, ...proposal }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('System learning PUT error:', error);
    return NextResponse.json({ error: 'İşlem başarısız' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
