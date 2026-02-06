import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { recordFeedbackCorrection, updateAdaptiveProfile } from '@/lib/ai-learning';

const correctionSchema = z.object({
  feedbackId: z.string(),
  field: z.string().min(2),
  newValue: z.any(),
  oldValue: z.any().optional(),
  note: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const dealerId = session.user.role === 'ADMIN' ? searchParams.get('dealerId') || undefined : session.user.id;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);

    const profile = dealerId ? await prisma.aIDealerLearningProfile.findUnique({ where: { dealerId } }) : null;
    const embeddingsCount = dealerId ? await prisma.aIEmbedding.count({ where: { dealerId } }) : 0;
    const correctionsCount = dealerId ? await prisma.aIFeedbackCorrection.count({ where: { dealerId } }) : 0;
    const corrections = dealerId ? await prisma.aIFeedbackCorrection.findMany({
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
    }) : [];

    return NextResponse.json({
      success: true,
      profile,
      embeddingsCount,
      correctionsCount,
      corrections,
    });
  } catch (error) {
    console.error('Learning status error:', error);
    return NextResponse.json({ error: 'Learning status alınamadı' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'record_correction';
    const body = await request.json();

    if (action === 'record_correction') {
      const validated = correctionSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json({ error: validated.error.errors[0].message }, { status: 400 });
      }

      const { feedbackId, field, newValue, oldValue, note } = validated.data;
      const fb = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        select: { qrCode: { select: { dealerId: true } } },
      });
      if (!fb) return NextResponse.json({ error: 'Feedback bulunamadı' }, { status: 404 });
      if (session.user.role === 'DEALER' && fb.qrCode.dealerId !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const correction = await recordFeedbackCorrection({
        dealerId: fb.qrCode.dealerId,
        feedbackId,
        field,
        newValue,
        oldValue,
        note,
      });

      return NextResponse.json({ success: true, correction });
    }

    if (action === 'update_profile') {
      const dealerId = session.user.role === 'ADMIN' ? body?.dealerId : session.user.id;
      if (!dealerId) return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 });

      const profile = await updateAdaptiveProfile(dealerId);
      return NextResponse.json({ success: true, profile });
    }

    return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 });
  } catch (error) {
    console.error('Learning action error:', error);
    return NextResponse.json({ error: 'Learning işlemi başarısız' }, { status: 500 });
  }
}
