import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

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
                responses: { orderBy: { createdAt: 'desc' } },
            },
        });

        if (!survey || survey.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Anket bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Aggregate answers per question
        const questionResults = survey.questions.map((q) => {
            const answers = survey.responses
                .map((r) => {
                    const arr = r.answers as { questionId: string; value: unknown }[];
                    return arr.find((a) => a.questionId === q.id);
                })
                .filter(Boolean);

            if (q.type === 'multiple_choice' || q.type === 'single_choice') {
                const optionCounts: Record<string, number> = {};
                const opts = (q.options as string[]) ?? [];
                opts.forEach((o) => (optionCounts[o] = 0));
                answers.forEach((a) => {
                    if (Array.isArray(a!.value)) {
                        (a!.value as string[]).forEach((v) => { optionCounts[v] = (optionCounts[v] || 0) + 1; });
                    } else if (typeof a!.value === 'string') {
                        optionCounts[a!.value] = (optionCounts[a!.value] || 0) + 1;
                    }
                });
                return { questionId: q.id, text: q.text, type: q.type, totalAnswers: answers.length, optionCounts };
            }

            if (q.type === 'rating') {
                const values = answers.map((a) => Number(a!.value)).filter((v) => !isNaN(v));
                const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
                const dist: Record<number, number> = {};
                values.forEach((v) => { dist[v] = (dist[v] || 0) + 1; });
                return { questionId: q.id, text: q.text, type: q.type, totalAnswers: values.length, avg: Math.round(avg * 10) / 10, distribution: dist };
            }

            // open_text
            const texts = answers.map((a) => String(a!.value)).filter(Boolean);
            return { questionId: q.id, text: q.text, type: q.type, totalAnswers: texts.length, recentTexts: texts.slice(0, 20) };
        });

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
