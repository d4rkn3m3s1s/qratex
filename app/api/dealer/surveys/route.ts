import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import {
    countUnanswerableQuestions,
    createSurveyInputSchema,
    describeSurveyIssues,
    SURVEY_LIMITS,
    toQuestionCreateData,
} from '@/lib/survey-schema';


export const dynamic = 'force-dynamic';

// GET — list dealer's surveys
export async function GET() {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const rows = await prisma.survey.findMany({
            where: { dealerId: auth.session.user.id },
            include: {
                _count: { select: { responses: true, questions: true } },
                questions: { select: { type: true, options: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        // Eski şemayla kaydedilmiş, müşteriye gösterilemeyen (seçeneksiz seçim) soru sayısı:
        // bayi listesinde uyarı olarak görünür. Soru gövdeleri yanıta konmaz.
        const surveys = rows.map(({ questions, ...s }) => ({
            ...s,
            unanswerableQuestions: countUnanswerableQuestions(questions),
        }));

        return NextResponse.json({ success: true, surveys }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error fetching surveys:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Anketler yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

// POST — create a survey with questions
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const body = await request.json().catch(() => null);
        // Ortak sözleşme (lib/survey-schema.ts): seçim sorularında 2-20 dolu ve farklı seçenek
        // zorunlu — boş seçenekli, yanıtlanamaz anket artık yayına giremez.
        const parsed = createSurveyInputSchema.safeParse(body);
        if (!parsed.success) {
            const { message, issues } = describeSurveyIssues(parsed.error);
            return NextResponse.json(
                { success: false, error: message, code: 'VALIDATION', issues },
                { status: 400 , headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const count = await prisma.survey.count({ where: { dealerId: auth.session.user.id } });
        if (count >= SURVEY_LIMITS.surveysPerDealer) {
            return NextResponse.json(
                { success: false, error: `En fazla ${SURVEY_LIMITS.surveysPerDealer} anket oluşturabilirsiniz`, code: 'SURVEY_QUOTA', limit: SURVEY_LIMITS.surveysPerDealer },
                { status: 400 , headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const survey = await prisma.survey.create({
            data: {
                dealerId: auth.session.user.id,
                title: parsed.data.title,
                description: parsed.data.description,
                questions: {
                    create: toQuestionCreateData(parsed.data.questions),
                },
            },
            include: { questions: true },
        });

        return NextResponse.json({ success: true, survey }, { status: 201 , headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error creating survey:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Anket oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
