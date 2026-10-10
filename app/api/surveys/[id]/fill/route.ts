import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkPublicActionRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-metadata';
import {
    surveySubmissionSchema,
    toPublicSurveyQuestions,
    validateSurveyAnswers,
    type SurveyAnswerErrorCode,
} from '@/lib/survey-schema';

export const dynamic = 'force-dynamic';

type FillErrorCode = 'SURVEY_NOT_FOUND' | 'RATE_LIMITED' | 'VALIDATION' | 'ALREADY_RESPONDED' | 'INTERNAL' | SurveyAnswerErrorCode;

function fail(status: number, code: FillErrorCode, error: string, extra?: Record<string, unknown>, headers?: HeadersInit) {
    return NextResponse.json(
        { success: false, error, code, ...extra },
        { status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...(headers as Record<string, string> | undefined) } },
    );
}

async function sessionUserId(): Promise<string | null> {
    try {
        const session = await getServerSession(authOptions);
        return session?.user?.id ?? null;
    } catch {
        return null; // oturum okunamazsa anonim akış
    }
}

// GET — herkese açık: doldurulacak anket (yalnız yanıtlanabilir sorular)
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
            return fail(404, 'SURVEY_NOT_FOUND', 'Anket bulunamadı veya aktif değil');
        }

        const userId = await sessionUserId();
        const alreadyResponded = userId
            ? !!(await prisma.surveyResponse.findFirst({ where: { surveyId: id, userId }, select: { id: true } }))
            : false;

        return NextResponse.json({
            success: true,
            survey: {
                id: survey.id,
                title: survey.title,
                description: survey.description,
                business: survey.dealer.businessName,
                logo: survey.dealer.businessLogo,
                // Eski şemayla kaydedilmiş seçeneksiz seçim soruları müşteriye gösterilmez ve
                // zorunluluk denetimine girmez (lib/survey-schema.ts → isAnswerableQuestion).
                questions: toPublicSurveyQuestions(survey.questions),
            },
            alreadyResponded,
        }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        console.error('Error fetching survey:', error);
        return fail(500, 'INTERNAL', 'Anket yüklenemedi');
    }
}

// POST — anket yanıtı gönder (cevaplar anketin gerçek sorularına karşı doğrulanır)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Rate limit (IP + anket) — toplu yanıt doldurmayı engeller.
        const ip = getClientIp({ headers: request.headers }) || 'unknown';
        const rl = await checkPublicActionRateLimit(`survey-fill:${id}:${ip}`, 10, 60_000);
        if (!rl.ok) {
            return fail(429, 'RATE_LIMITED', 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.', undefined, {
                'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)),
            });
        }

        const body = await request.json().catch(() => null); // bozuk gövde → null → temiz 400
        const parsed = surveySubmissionSchema.safeParse(body);
        if (!parsed.success) {
            return fail(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Yanıt geçersiz');
        }

        const survey = await prisma.survey.findUnique({
            where: { id, isActive: true },
            include: { questions: { orderBy: { order: 'asc' } } },
        });
        if (!survey) {
            return fail(404, 'SURVEY_NOT_FOUND', 'Anket bulunamadı veya aktif değil');
        }

        // Ortak sözleşme: bilinmeyen soru, listede olmayan seçenek, aralık dışı puan,
        // aşırı uzun metin ve boş zorunlu soru REDDEDİLİR; kayda yalnız normalize cevap girer.
        const validation = validateSurveyAnswers(survey.questions, parsed.data.answers);
        if (!validation.ok) {
            return fail(400, validation.code, validation.message, validation.questionId ? { questionId: validation.questionId } : undefined);
        }

        // Kimlik yalnızca oturumdan; oturum yoksa anonim (null).
        const userId = await sessionUserId();
        if (userId) {
            // Oturumlu kullanıcı aynı anketi bir kez yanıtlar (sonuç şişirmeyi önler).
            // Kalıcı DB kısıtı (@@unique([surveyId,userId])) F3.4 şema işinde.
            const existing = await prisma.surveyResponse.findFirst({ where: { surveyId: id, userId }, select: { id: true } });
            if (existing) {
                return fail(409, 'ALREADY_RESPONDED', 'Bu anketi zaten yanıtladınız');
            }
        }

        const response = await prisma.surveyResponse.create({
            data: {
                surveyId: id,
                userId,
                answers: validation.answers as object[],
            },
            select: { id: true },
        });

        return NextResponse.json({ success: true, responseId: response.id }, { status: 201, headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        console.error('Error submitting survey response:', error);
        return fail(500, 'INTERNAL', 'Yanıt gönderilemedi');
    }
}
