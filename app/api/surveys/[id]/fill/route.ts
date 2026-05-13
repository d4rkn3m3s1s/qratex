import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
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
    answers: z.array(answerSchema).min(1),
    userId: z.string().optional(),
});

// POST — submit survey response
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const parsed = submitSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

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
                userId: parsed.data.userId ?? null,
                answers: parsed.data.answers as object[],
            },
        });

        return NextResponse.json({ success: true, responseId: response.id }, { status: 201 , headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error submitting survey response:', error);
        return NextResponse.json({ error: 'Yanıt gönderilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
