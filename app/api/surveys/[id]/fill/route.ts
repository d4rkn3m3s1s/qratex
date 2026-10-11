import { z } from 'zod';
import { getOptionalSession } from '@/lib/api-auth';
import { authOptions } from '@/lib/auth';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { checkPublicActionRateLimit } from '@/lib/rate-limit';
import { surveySubmissionSchema } from '@/lib/survey-schema';
import {
  appendDoneCookie,
  loadSurveyForFill,
  parseDoneCookie,
  submitSurveyResponse,
  SURVEY_DONE_COOKIE,
  SURVEY_DONE_COOKIE_MAX_AGE_S,
} from '@/lib/survey-fill';

export const dynamic = 'force-dynamic';

/**
 * Herkese açık anket doldurma uçları. Sayfa (`/surveys/[id]`) ilk veriyi sunucuda okur;
 * GET aynı okuma modelini API olarak sunar (yan etkisiz). Kimlik YALNIZ oturumdan: NextAuth
 * `jwt` geri çağrısı oturumu DB durumuna karşı doğrular (lib/auth/session-state.ts); oturum
 * okunamazsa yanıt anonimdir — istemciden gelen `userId` hiçbir zaman kabul edilmez.
 */
const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

async function sessionUserId(): Promise<string | null> {
  try {
    const session = await getOptionalSession();
    return session?.user?.id ?? null;
  } catch {
    return null; // oturum okunamazsa anonim akış
  }
}

function readDoneCookie(request: { cookies?: { get(name: string): { value: string } | undefined } }): string | null {
  try {
    return request.cookies?.get(SURVEY_DONE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

export const GET = defineRoute(
  { name: 'surveys.fill.read', roles: 'public', params: paramsSchema, rateLimit: 'read' },
  async ({ params, request }) => {
    const load = await loadSurveyForFill(params.id, { userId: await sessionUserId(), doneIds: parseDoneCookie(readDoneCookie(request)) });
    switch (load.status) {
      case 'ok':
        return ok({ survey: load.survey, alreadyResponded: load.alreadyResponded }, { legacySpread: true });
      case 'closed':
        throw new ApiError('SURVEY_CLOSED', 'Bu anket artık yanıt kabul etmiyor.', {
          status: 410,
          details: { dealerName: load.dealerName },
        });
      case 'not_found':
        throw new ApiError('SURVEY_NOT_FOUND', 'Anket bulunamadı.', { status: 404 });
      default:
        throw new ApiError('SERVICE_UNAVAILABLE', 'Anket şu anda yüklenemiyor. Lütfen birazdan tekrar deneyin.', {
          retryable: true,
          headers: { 'Retry-After': '8' },
        });
    }
  }
);

export const POST = defineRoute(
  {
    name: 'surveys.fill.submit',
    roles: 'public',
    params: paramsSchema,
    schema: surveySubmissionSchema,
    // IP başına genel tavan (aynı kafe ağındaki müşteriler için geniş); anket başına ayrıca aşağıda.
    rateLimit: { max: 30, windowMs: 60_000, by: 'ip' },
    maxBodyBytes: 256_000,
  },
  async ({ params, body, request, ip }) => {
    const rl = await checkPublicActionRateLimit(`survey-fill:${params.id}:${ip ?? 'unknown'}`, 10, 60_000);
    if (!rl.ok) {
      throw new ApiError('RATE_LIMITED', 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.', {
        retryable: true,
        headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
      });
    }

    const userId = await sessionUserId();
    const cookieRaw = readDoneCookie(request);
    const result = await submitSurveyResponse(params.id, body.answers, { userId, doneIds: parseDoneCookie(cookieRaw) });
    if (!result.ok) {
      throw new ApiError(result.code, result.message, {
        status: result.status,
        ...(result.questionId ? { details: { questionId: result.questionId } } : {}),
      });
    }

    // Aynı cihazdan ikinci (anonim) yanıtı önleyen yumuşak işaret; oturumlu tekillik DB'den.
    const cookie = [
      `${SURVEY_DONE_COOKIE}=${appendDoneCookie(cookieRaw, params.id)}`,
      'Path=/',
      `Max-Age=${SURVEY_DONE_COOKIE_MAX_AGE_S}`,
      'HttpOnly',
      'SameSite=Lax',
      ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
    ].join('; ');

    return ok(
      { responseId: result.responseId },
      { status: 201, legacySpread: true, headers: { 'Set-Cookie': cookie } }
    );
  }
);
