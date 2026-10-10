/**
 * Anket DOLDURMA — sunucu tarafı tek kaynak (`/surveys/[id]` sunucu bileşeni + `/api/surveys/[id]/fill`).
 *
 * Denetim (docs/audit/2026-10-08/musteri/surveys_id.md) kapanışları:
 *  - B1/B2: cevap doğrulaması ortak sözleşmeden (lib/survey-schema.ts → validateSurveyAnswers);
 *    eski seçeneksiz sorular kamusal görünüme girmez.
 *  - B3: oturumlu kullanıcı DB'den tekil (aynı anket bir kez); anonim yanıtta tarayıcıya
 *    HttpOnly `qx_sv` çerezi (anket kimlikleri) yazılır → aynı cihazdan ikinci yanıt 409.
 *  - B4/B9: sonuç ayrışır: `ok | closed | not_found | unavailable`. Pasif anket, kapalı modül
 *    (`dealer_surveys`) ve askıdaki/anonimleştirilmiş bayi "artık yanıt kabul etmiyor" ekranıdır.
 *  - B8: işletme adı + logosu ilk HTML'de (sunucu); bayinin KİŞİSEL adı asla dönmez.
 */
import { prisma, isPrismaConnectivityError } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import {
  SURVEY_LIMITS,
  toPublicSurveyQuestions,
  validateSurveyAnswers,
  type PublicSurveyQuestion,
  type SurveyAnswerErrorCode,
} from '@/lib/survey-schema';

/** Anonim tekillik çerezi. */
export const SURVEY_DONE_COOKIE = 'qx_sv';
/** Çerezde tutulan en çok anket kimliği (eskiler düşer). */
export const SURVEY_DONE_COOKIE_MAX_IDS = 30;
export const SURVEY_DONE_COOKIE_MAX_AGE_S = 180 * 24 * 60 * 60;

const SURVEY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isPlausibleSurveyId(id: unknown): id is string {
  return typeof id === 'string' && SURVEY_ID_RE.test(id);
}

/** Çerez değerini kimlik listesine çevirir (bozuk/yabancı parçalar atılır). */
export function parseDoneCookie(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('.')
    .map((s) => s.trim())
    .filter((s) => isPlausibleSurveyId(s))
    .slice(-SURVEY_DONE_COOKIE_MAX_IDS);
}

/** Kimliği listeye ekler (tekrarsız, en yeni sonda, en çok 30). Ayırıcı `.` (cuid'de yok). */
export function appendDoneCookie(raw: string | null | undefined, surveyId: string): string {
  const ids = parseDoneCookie(raw).filter((id) => id !== surveyId);
  ids.push(surveyId);
  return ids.slice(-SURVEY_DONE_COOKIE_MAX_IDS).join('.');
}

/** Soru tipine göre kaba süre tahmini (sn): seçim 7, puan 5, açık uçlu 30. En az 30 sn. */
export function estimateSurveySeconds(questions: Pick<PublicSurveyQuestion, 'type'>[]): number {
  const total = questions.reduce((sum, q) => {
    if (q.type === 'open_text') return sum + 30;
    if (q.type === 'rating') return sum + 5;
    return sum + 7;
  }, 0);
  return Math.max(30, total);
}

export type SurveyFillView = {
  id: string;
  title: string;
  description: string | null;
  dealer: { id: string; name: string | null; logo: string | null };
  questions: PublicSurveyQuestion[];
  requiredCount: number;
  estimatedSeconds: number;
  limits: { openTextMax: number };
};

export type SurveyFillLoad =
  | { status: 'ok'; survey: SurveyFillView; alreadyResponded: boolean }
  | { status: 'closed'; dealerName: string | null }
  | { status: 'not_found' }
  | { status: 'unavailable' };

const SURVEY_SELECT = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  dealer: {
    select: { id: true, role: true, businessName: true, businessLogo: true, suspendedAt: true, anonymizedAt: true },
  },
  questions: {
    orderBy: { order: 'asc' as const },
    select: { id: true, type: true, text: true, options: true, required: true },
  },
} as const;

type SurveyRow = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  dealer: {
    id: string;
    role: string;
    businessName: string | null;
    businessLogo: string | null;
    suspendedAt: Date | null;
    anonymizedAt: Date | null;
  } | null;
  questions: { id: string; type: string; text: string; options: unknown; required: boolean }[];
};

async function surveysModuleEnabled(): Promise<boolean> {
  try {
    return (await getModuleControls()).dealer_surveys !== false;
  } catch {
    return true;
  }
}

type Availability = { ok: true; row: SurveyRow } | { ok: false; status: 'closed'; dealerName: string | null } | { ok: false; status: 'not_found' };

async function findAvailableSurvey(id: string): Promise<Availability> {
  if (!isPlausibleSurveyId(id)) return { ok: false, status: 'not_found' };
  const row = (await prisma.survey.findUnique({ where: { id }, select: SURVEY_SELECT })) as SurveyRow | null;
  if (!row) return { ok: false, status: 'not_found' };
  const dealer = row.dealer;
  const dealerName = dealer?.businessName?.trim() || null;
  if (!dealer || dealer.anonymizedAt || dealer.role !== 'DEALER') return { ok: false, status: 'not_found' };
  if (!row.isActive || dealer.suspendedAt || !(await surveysModuleEnabled())) {
    return { ok: false, status: 'closed', dealerName };
  }
  return { ok: true, row };
}

function toView(row: SurveyRow): SurveyFillView {
  const questions = toPublicSurveyQuestions(row.questions);
  return {
    id: row.id,
    title: row.title,
    description: row.description?.trim() || null,
    dealer: {
      id: row.dealer!.id,
      name: row.dealer!.businessName?.trim() || null,
      logo: row.dealer!.businessLogo || null,
    },
    questions,
    requiredCount: questions.filter((q) => q.required).length,
    estimatedSeconds: estimateSurveySeconds(questions),
    limits: { openTextMax: SURVEY_LIMITS.openTextMax },
  };
}

async function hasResponded(surveyId: string, userId: string | null, doneIds: string[]): Promise<boolean> {
  if (doneIds.includes(surveyId)) return true;
  if (!userId) return false;
  const existing = await prisma.surveyResponse.findFirst({ where: { surveyId, userId }, select: { id: true } });
  return Boolean(existing);
}

/** Doldurma ekranının tek okuma modeli. YAZMAZ. */
export async function loadSurveyForFill(
  id: string,
  viewer: { userId: string | null; doneIds?: string[] }
): Promise<SurveyFillLoad> {
  try {
    const found = await findAvailableSurvey(id);
    if (!found.ok) return found.status === 'closed' ? { status: 'closed', dealerName: found.dealerName } : { status: 'not_found' };
    const alreadyResponded = await hasResponded(id, viewer.userId, viewer.doneIds ?? []);
    return { status: 'ok', survey: toView(found.row), alreadyResponded };
  } catch (error) {
    if (!isPrismaConnectivityError(error)) console.error('[survey-fill] okuma hatası', error);
    return { status: 'unavailable' };
  }
}

/** Metadata / OG için hafif okuma (yalnız başlık + işletme). Hata → null. */
export async function loadSurveyMeta(id: string): Promise<{ title: string; dealerName: string | null; questionCount: number } | null> {
  try {
    const found = await findAvailableSurvey(id);
    if (!found.ok) return null;
    return {
      title: found.row.title,
      dealerName: found.row.dealer?.businessName?.trim() || null,
      questionCount: toPublicSurveyQuestions(found.row.questions).length,
    };
  } catch {
    return null;
  }
}

export type SurveySubmitErrorCode =
  | 'SURVEY_NOT_FOUND'
  | 'SURVEY_CLOSED'
  | 'ALREADY_RESPONDED'
  | SurveyAnswerErrorCode;

export type SurveySubmitResult =
  | { ok: true; responseId: string }
  | { ok: false; code: SurveySubmitErrorCode; status: number; message: string; questionId?: string };

/**
 * Yanıtı doğrular ve yazar. Kimlik YALNIZ oturumdan (`userId`), istemciden gelmez.
 * Sıra: kullanılabilirlik → tekillik (çerez + oturumlu DB) → ortak sözleşme doğrulaması → kayıt.
 */
export async function submitSurveyResponse(
  id: string,
  answers: { questionId: string; value?: unknown }[],
  viewer: { userId: string | null; doneIds?: string[] }
): Promise<SurveySubmitResult> {
  const found = await findAvailableSurvey(id);
  if (!found.ok) {
    return found.status === 'closed'
      ? { ok: false, code: 'SURVEY_CLOSED', status: 410, message: 'Bu anket artık yanıt kabul etmiyor.' }
      : { ok: false, code: 'SURVEY_NOT_FOUND', status: 404, message: 'Anket bulunamadı.' };
  }

  if (await hasResponded(id, viewer.userId, viewer.doneIds ?? [])) {
    return { ok: false, code: 'ALREADY_RESPONDED', status: 409, message: 'Bu anketi zaten yanıtladınız.' };
  }

  const validation = validateSurveyAnswers(found.row.questions, answers);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      status: 400,
      message: validation.message,
      ...(validation.questionId ? { questionId: validation.questionId } : {}),
    };
  }

  const data = { surveyId: id, userId: viewer.userId, answers: validation.answers as object[] };
  if (!viewer.userId) {
    const created = await prisma.surveyResponse.create({ data, select: { id: true } });
    return { ok: true, responseId: created.id };
  }

  // Oturumlu: şemada @@unique([surveyId,userId]) yok (ŞEMA İSTEĞİ) → aynı kullanıcı×anket
  // için işlem içi danışma kilidi; eşzamanlı iki gönderimden yalnız biri yazar.
  const userId = viewer.userId;
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`survey-response:${id}:${userId}`}))`;
    const dup = await tx.surveyResponse.findFirst({ where: { surveyId: id, userId }, select: { id: true } });
    if (dup) return null;
    return tx.surveyResponse.create({ data, select: { id: true } });
  });
  if (!created) return { ok: false, code: 'ALREADY_RESPONDED', status: 409, message: 'Bu anketi zaten yanıtladınız.' };
  return { ok: true, responseId: created.id };
}
