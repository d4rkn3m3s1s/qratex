/**
 * Admin: Sistem geneli AI öğrenme profili
 * GET: profil + istatistikler
 * POST: eğitimi tetikle (updateSystemLearningProfile)
 * PATCH: sistem/sohbet promptlarını manuel güncelle
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { updateSystemLearningProfile, getSystemLearningProfile, updateSystemLearningPrompts } from '@/lib/ai-learning';
import { prisma } from '@/lib/prisma';

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
    });
  } catch (error) {
    console.error('System learning GET error:', error);
    return NextResponse.json({ error: 'Profil yüklenemedi' }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  try {
    const result = await updateSystemLearningProfile();
    if (!result) {
      return NextResponse.json({ error: 'AI client kullanılamıyor veya eğitim başarısız' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      version: result.version,
      profile: result.profile,
      trainingDataStats: result.trainingDataStats,
    });
  } catch (error) {
    console.error('System learning POST error:', error);
    return NextResponse.json({ error: 'Sistem eğitimi başarısız' }, { status: 500 });
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
      return NextResponse.json({ error: 'systemPrompt veya chatSystemPrompt gerekli' }, { status: 400 });
    }

    const ok = await updateSystemLearningPrompts({ systemPrompt, chatSystemPrompt });
    if (!ok) {
      return NextResponse.json({ error: 'Profil bulunamadı' }, { status: 404 });
    }
    const profile = await getSystemLearningProfile();
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('System learning PATCH error:', error);
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 });
  }
}
