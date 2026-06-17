import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getMockReplyBucket } from '@/lib/ai-reply-tone';
import { suggestResponseWithGroq } from '@/lib/groq';
import { isAIConfigured } from '@/lib/ai-engine';


export const dynamic = 'force-dynamic';

const RECOVERY_REPLIES: string[] = [
    `Değerli müşterimiz, yaşadığınız olumsuz deneyim için içtenlikle özür dileriz. Yaşanan durumu netleştirmek ve telafi etmek için ekibimizle birlikte harekete geçiyoruz.`,
    `Geri bildiriminiz için teşekkürler. Yaşadığınız aksaklığı ilgili ekibe ilettik; standartlarımızı yükseltmek için bu uyarılar bizim için çok değerli.`,
    `Merhaba, beklentilerinizi karşılayamadığımız için üzgünüz. Sorunu çözmek ve size doğru deneyimi yaşatmak için en kısa sürede sizinle iletişime geçmek isteriz.`,
];

/** 4 yıldız veya nötr/ölçülü metin — coşkulu övgü yok */
const MILD_POSITIVE_REPLIES: string[] = [
    `Geri bildiriminiz için teşekkür ederiz. Deneyiminizi daha iyi hale getirmek için notlarınızı dikkate alıyoruz.`,
    `Yorumunuz için teşekkürler. Ekibimizle paylaştık; gelişim için referans alacağız.`,
    `Değerlendirmeniz bizim için önemli. Bir sonraki ziyaretinizde deneyiminizi iyileştirmek için çalışıyoruz.`,
];

/** Yalnızca güçlü pozitif sinyal (yüksek puan + telafi gerektirmeyen içerik) */
const STRONG_POSITIVE_REPLIES: string[] = [
    `Harika yorumunuz için çok teşekkür ederiz! Sizi tekrar aramızda görmekten mutluluk duyarız.`,
    `Geri bildiriminiz ekibimize çok iyi geldi. İlginiz için teşekkürler; her zaman bekleriz.`,
    `Güzel sözleriniz için teşekkür ederiz; motivasyon kaynağı oldunuz. Tekrar görüşmek dileğiyle.`,
];

/** Şablon yanıtlar — yalnızca LLM yapılandırılmadığında/başarısızsa kullanılır. */
function buildFallbackReplies(
    rating: number,
    text: string | null | undefined,
    feedbackSentiment?: string | null,
    feedbackIntent?: string | null
): string[] {
    const bucket = getMockReplyBucket(rating, {
        reviewText: text,
        feedbackSentiment,
        feedbackIntent,
    });
    if (bucket === 'recovery') return RECOVERY_REPLIES;
    if (bucket === 'mild_positive') return MILD_POSITIVE_REPLIES;
    return STRONG_POSITIVE_REPLIES;
}

/**
 * QR geri bildirimi (`feedbackId`) veya tüketim sonrası yorum (`consumptionReviewId`) için yanıt taslağı.
 * Geriye dönük: yalnızca `feedbackId` gönderilirse ve QR kaydı yoksa aynı id ile ConsumptionReview denenir.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'DEALER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const dealerId = session.user.id;
        const body = await req.json();
        const { feedbackId, consumptionReviewId } = body as {
            feedbackId?: string;
            consumptionReviewId?: string;
            /** İleride LLM system prompt için ayrılmış; mock çıktıya eklenmez */
            context?: string;
        };

        let rating: number | null = null;
        let reviewText: string | null | undefined;
        let feedbackSentiment: string | null | undefined;
        let feedbackIntent: string | null | undefined;

        if (consumptionReviewId) {
            const review = await prisma.consumptionReview.findFirst({
                where: {
                    id: consumptionReviewId,
                    consumption: { dealerId },
                },
                select: { rating: true, text: true },
            });
            if (!review) {
                return NextResponse.json(
                    { error: 'Consumption review not found or unauthorized' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
            rating = review.rating;
            reviewText = review.text;
        } else if (feedbackId) {
            const feedback = await prisma.feedback.findUnique({
                where: { id: feedbackId },
                include: { qrCode: true },
            });
            if (feedback && feedback.qrCode.dealerId === dealerId) {
                rating = feedback.rating;
                reviewText = feedback.text;
                feedbackSentiment = feedback.sentiment;
                feedbackIntent = feedback.intent;
            } else {
                const review = await prisma.consumptionReview.findFirst({
                    where: {
                        id: feedbackId,
                        consumption: { dealerId },
                    },
                    select: { rating: true, text: true },
                });
                if (!review) {
                    return NextResponse.json(
                        { error: 'Feedback not found or unauthorized' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
                }
                rating = review.rating;
                reviewText = review.text;
            }
        } else {
            return NextResponse.json(
                { error: 'feedbackId or consumptionReviewId is required' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // GERÇEK LLM ile yanıt önerileri (Groq). reviewText varsa modele sorulur;
        // başarısız/boş dönerse veya AI yoksa şablon yanıtlara düşülür.
        let replies: string[] = [];
        let source: 'ai' | 'template' = 'template';

        if (isAIConfigured() && reviewText && reviewText.trim().length > 0) {
            try {
                const aiReplies = await suggestResponseWithGroq(reviewText, rating!);
                const cleaned = Array.isArray(aiReplies)
                    ? aiReplies.filter((r) => typeof r === 'string' && r.trim().length > 0).slice(0, 3)
                    : [];
                if (cleaned.length > 0) {
                    replies = cleaned;
                    source = 'ai';
                }
            } catch (err) {
                console.error('[AI_GENERATE_REPLY] LLM failed, using template fallback:', err);
            }
        }

        if (replies.length === 0) {
            replies = buildFallbackReplies(rating!, reviewText, feedbackSentiment, feedbackIntent);
            source = 'template';
        }

        return NextResponse.json({ replies, source }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('[AI_GENERATE_REPLY_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
