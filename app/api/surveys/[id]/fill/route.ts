import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { checkPublicActionRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-metadata';
import { z } from 'zod';

// GET — public: get survey for filling
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const survey = await prisma.survey.findUnique({
            where: { id, isActive: true },
            include: {
                questions: { orderBy: { order: 'asc' } },
                dealer: { select: { businessName: true, businessLogo: true } },
            },
        });

        if (!survey) {
            return NextResponse.json({ error: 'Anket bulunamadı veya aktif değil' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        return NextResponse.json({
            success: true,
            survey: {
                id: survey.id,
                title: survey.title,
                description: survey.description,
                business: survey.dealer.businessName,
                logo: survey.dealer.businessLogo,
                questions: survey.questions.map((q) => ({
                    id: q.id,
                    type: q.type,
                    text: q.text,
                    options: q.options,
                    required: q.required,
                })),
            },
        }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error fetching survey:', error);
        return NextResponse.json({ error: 'Anket yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

const answerSchema = z.object({
    questionId: z.string(),
    value: z.union([z.string(), z.array(z.string()), z.number()]),
});

const submitSchema = z.object({
    answers: z.array(answerSchema).min(1).max(100),
    // userId ARTIK kabul edilmiyor — atfedilen kimlik client'ten gelemez (forgery).
});

// POST — submit survey response
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Rate limit (IP + survey bazlı) — toplu yanıt doldurmayı engeller.
        const ip = getClientIp({ headers: request.headers }) || 'unknown';
        const rl = await checkPublicActionRateLimit(`survey-fill:${id}:${ip}`, 10, 60_000);
        if (!rl.ok) {
            return NextResponse.json(
                { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' },
                { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
            );
        }

        const body = await request.json();
        const parsed = submitSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Kimlik yalnızca oturumdan; oturum yoksa anonim (null).
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id ?? null;

        const survey = await prisma.survey.findUnique({
            where: { id, isActive: true },
            include: { questions: true },
        });

        if (!survey) {
            return NextResponse.json({ error: 'Anket bulunamadı veya aktif değil' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Validate required questions
        const requiredIds = survey.questions.filter((q) => q.required).map((q) => q.id);
        const answeredIds = new Set(parsed.data.answers.map((a) => a.questionId));
        const missing = requiredIds.filter((id) => !answeredIds.has(id));
        if (missing.length > 0) {
            return NextResponse.json({ error: `Zorunlu soruları yanıtlayın` }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const response = await prisma.surveyResponse.create({
            data: {
                surveyId: id,
                userId,
                answers: parsed.data.answers as object[],
            },
        });

        return NextResponse.json({ success: true, responseId: response.id }, { status: 201 , headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error submitting survey response:', error);
        return NextResponse.json({ error: 'Yanıt gönderilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
