import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { suggestResponseWithGroq } from '@/lib/groq';
import { z } from 'zod';
import { INPUT_LIMITS } from '@/lib/input-limits';


export const dynamic = 'force-dynamic';

const replySchema = z.object({
  reply: z.string().min(1, 'Yanıt boş olamaz').max(INPUT_LIMITS.replyText),
  type: z.enum(['feedback', 'review']).optional(), // feedback = QR, review = consumption
});

// POST - Dealer replies to a feedback or consumption review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await request.json();
    const replyType = body.type || 'feedback';

    // ── AI Suggestion Mode ──
    if (body.action === 'suggest') {
      let text = '';
      let rating = 3;

      if (replyType === 'review') {
        const review = await prisma.consumptionReview.findUnique({
          where: { id },
          select: { text: true, rating: true },
        });
        if (review) { text = review.text || ''; rating = review.rating; }
      } else {
        const feedback = await prisma.feedback.findUnique({
          where: { id },
          select: { text: true, rating: true },
        });
        if (feedback) { text = feedback.text || ''; rating = feedback.rating; }
      }

      if (!text) {
        return NextResponse.json({ error: 'Yorum bulunamadı veya metin yok' }, { status: 404 });
      }

      const suggestions = await suggestResponseWithGroq(text, rating);
      return NextResponse.json({ success: true, suggestions });
    }

    // ── Validate Reply ──
    const validated = replySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.errors[0].message }, { status: 400 });
    }

    // ── Handle Consumption Review Reply ──
    if (replyType === 'review') {
      const review = await prisma.consumptionReview.findUnique({
        where: { id },
        include: {
          consumption: {
            select: { dealerId: true },
          },
        },
      });

      if (!review) {
        return NextResponse.json({ error: 'Yorum bulunamadı' }, { status: 404 });
      }

      if (session.user.role === 'DEALER' && review.consumption.dealerId !== session.user.id) {
        return NextResponse.json({ error: 'Bu yoruma yanıt verme yetkiniz yok' }, { status: 403 });
      }

      const updated = await prisma.consumptionReview.update({
        where: { id },
        data: {
          dealerReply: validated.data.reply,
          dealerRepliedAt: new Date(),
        },
      });

      // Notify customer
      if (review.customerId) {
        try {
          await prisma.notification.create({
            data: {
              userId: review.customerId,
              type: 'REVIEW_REPLY',
              title: 'İşletme Yanıtı',
              message: 'Tüketim yorumunuza işletme yanıt verdi.',
              data: { reviewId: id },
            },
          });
        } catch { /* non-critical */ }
      }

      return NextResponse.json({ success: true, review: updated });
    }

    // ── Handle QR Feedback Reply ──
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: { qrCode: { select: { dealerId: true } } },
    });

    if (!feedback) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 });
    }

    if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu geri bildirime yanıt verme yetkiniz yok' }, { status: 403 });
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        dealerReply: validated.data.reply,
        dealerRepliedAt: new Date(),
        dealerFirstViewedAt: feedback.dealerFirstViewedAt ?? new Date(),
      },
    });

    // Notify customer
    if (feedback.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: feedback.userId,
            type: 'FEEDBACK_REPLY',
            title: 'İşletme Yanıtı',
            message: 'Geri bildiriminize işletme yanıt verdi.',
            data: { feedbackId: id },
          },
        });
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true, feedback: updated });
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/dealer/feedbacks/[id]/reply', status: 500 });
    console.error('Error replying to feedback:', error);
    return NextResponse.json({ error: 'Yanıt kaydedilemedi' }, { status: 500 });
  }
}
