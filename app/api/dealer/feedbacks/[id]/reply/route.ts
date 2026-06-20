import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { suggestResponseWithGroq } from '@/lib/groq';
import { z } from 'zod';
import { INPUT_LIMITS } from '@/lib/input-limits';
import { emailDealerReply } from '@/lib/notify-email';


export const dynamic = 'force-dynamic';

/** Yanıt veren bayinin gösterim adını çözer (e-posta için). */
async function resolveDealerName(dealerId: string): Promise<string> {
  const d = await prisma.user.findUnique({
    where: { id: dealerId },
    select: { businessName: true, name: true },
  });
  return d?.businessName || d?.name || 'İşletme';
}

/** Bayi yanıtı sonrası müşteriye e-posta (ateşle-unut, opt-out kontrollü). */
function fireReplyEmail(customerId: string, dealerId: string, snippet: string | null) {
  resolveDealerName(dealerId)
    .then((dealerName) => emailDealerReply({ customerId, dealerName, feedbackSnippet: snippet }))
    .catch((err) => console.error('[REPLY_EMAIL] gönderim hatası:', err));
}

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
          select: {
            text: true,
            rating: true,
            consumption: { select: { dealerId: true } },
          },
        });
        if (!review) {
          return NextResponse.json({ error: 'Yorum bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (session.user.role === 'DEALER' && review.consumption.dealerId !== session.user.id) {
          return NextResponse.json({ error: 'Bu yoruma erişim yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        text = review.text || '';
        rating = review.rating;
      } else {
        const feedback = await prisma.feedback.findUnique({
          where: { id },
          select: { text: true, rating: true, qrCode: { select: { dealerId: true } } },
        });
        if (!feedback) {
          return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
          return NextResponse.json({ error: 'Bu geri bildirime erişim yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        text = feedback.text || '';
        rating = feedback.rating;
      }

      if (!text) {
        return NextResponse.json({ error: 'Yorum bulunamadı veya metin yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      const suggestions = await suggestResponseWithGroq(text, rating);
      return NextResponse.json({ success: true, suggestions }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // ── Validate Reply ──
    const validated = replySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
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
        return NextResponse.json({ error: 'Yorum bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      if (session.user.role === 'DEALER' && review.consumption.dealerId !== session.user.id) {
        return NextResponse.json({ error: 'Bu yoruma yanıt verme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
      }

      if (session.user.role === 'ADMIN') {
        const updated = await prisma.consumptionReview.update({
          where: { id },
          data: {
            dealerReply: validated.data.reply,
            dealerRepliedAt: new Date(),
          },
        });
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
          fireReplyEmail(review.customerId, review.consumption.dealerId, review.text ?? null);
        }
        return NextResponse.json({ success: true, review: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
      }

      const wrote = await prisma.consumptionReview.updateMany({
        where: { id, consumption: { dealerId: session.user.id } },
        data: {
          dealerReply: validated.data.reply,
          dealerRepliedAt: new Date(),
        },
      });
      if (wrote.count === 0) {
        return NextResponse.json({ error: 'Yorum bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const updated = await prisma.consumptionReview.findUnique({ where: { id } });
      if (!updated) {
        return NextResponse.json({ error: 'Yorum bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }

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
        fireReplyEmail(review.customerId, session.user.id, review.text ?? null);
      }

      return NextResponse.json({ success: true, review: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // ── Handle QR Feedback Reply ──
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: { qrCode: { select: { dealerId: true } } },
    });

    if (!feedback) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu geri bildirime yanıt verme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (session.user.role === 'ADMIN') {
      const updated = await prisma.feedback.update({
        where: { id },
        data: {
          dealerReply: validated.data.reply,
          dealerRepliedAt: new Date(),
          dealerFirstViewedAt: feedback.dealerFirstViewedAt ?? new Date(),
        },
      });

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
        fireReplyEmail(feedback.userId, feedback.qrCode.dealerId, feedback.text ?? null);
      }

      return NextResponse.json({ success: true, feedback: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const wroteFb = await prisma.feedback.updateMany({
      where: { id, qrCode: { dealerId: session.user.id } },
      data: {
        dealerReply: validated.data.reply,
        dealerRepliedAt: new Date(),
        dealerFirstViewedAt: feedback.dealerFirstViewedAt ?? new Date(),
      },
    });
    if (wroteFb.count === 0) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const updated = await prisma.feedback.findUnique({ where: { id } });
    if (!updated) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

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
      fireReplyEmail(feedback.userId, session.user.id, feedback.text ?? null);
    }

    return NextResponse.json({ success: true, feedback: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/dealer/feedbacks/[id]/reply', status: 500 });
    console.error('Error replying to feedback:', error);
    return NextResponse.json({ error: 'Yanıt kaydedilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
