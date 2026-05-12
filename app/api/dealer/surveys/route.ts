import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const questionSchema = z.object({
    type: z.enum(['multiple_choice', 'single_choice', 'open_text', 'rating']),
    text: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).optional(),
    required: z.boolean().default(true),
    order: z.number().int().min(0).default(0),
});

const createSurveySchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    questions: z.array(questionSchema).min(1).max(20),
});

// GET — list dealer's surveys
export async function GET() {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const surveys = await prisma.survey.findMany({
            where: { dealerId: auth.session.user.id },
            include: {
                _count: { select: { responses: true, questions: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ success: true, surveys });
    } catch (error) {
        console.error('Error fetching surveys:', error);
        return NextResponse.json({ error: 'Anketler yüklenemedi' }, { status: 500 });
    }
}

// POST — create a survey with questions
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const parsed = createSurveySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        const count = await prisma.survey.count({ where: { dealerId: auth.session.user.id } });
        if (count >= 50) {
            return NextResponse.json({ error: 'En fazla 50 anket oluşturabilirsiniz' }, { status: 400 });
        }

        const survey = await prisma.survey.create({
            data: {
                dealerId: auth.session.user.id,
                title: parsed.data.title,
                description: parsed.data.description,
                questions: {
                    create: parsed.data.questions.map((q, i) => ({
                        type: q.type,
                        text: q.text,
                        options: q.options ?? undefined,
                        required: q.required,
                        order: q.order || i,
                    })),
                },
            },
            include: { questions: true },
        });

        return NextResponse.json({ success: true, survey }, { status: 201 });
    } catch (error) {
        console.error('Error creating survey:', error);
        return NextResponse.json({ error: 'Anket oluşturulamadı' }, { status: 500 });
    }
}
