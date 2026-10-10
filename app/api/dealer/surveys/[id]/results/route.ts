import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { aggregateSurveyResults } from '@/lib/survey-results';

// GET — survey results with aggregated answers

export const dynamic = 'force-dynamic';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const survey = await prisma.survey.findUnique({
            where: { id },
            include: {
                questions: { orderBy: { order: 'asc' } },
                responses: { orderBy: { createdAt: 'desc' }, select: { answers: true } },
            },
        });

        if (!survey || survey.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Anket bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Savunmacı toplama: yalnız tanımlı seçenekler, 1-5 tamsayı puanlar ve dolu metinler
        // sayılır; eski kirli cevaplar `ignoredAnswers` olarak görünür (lib/survey-results.ts).
        const questionResults = aggregateSurveyResults(survey.questions, survey.responses);

        return NextResponse.json({
            success: true,
            survey: { id: survey.id, title: survey.title, description: survey.description, isActive: survey.isActive, createdAt: survey.createdAt },
            totalResponses: survey.responses.length,
            questionResults,
        }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error fetching survey results:', error);
        return NextResponse.json({ error: 'Sonuçlar yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
