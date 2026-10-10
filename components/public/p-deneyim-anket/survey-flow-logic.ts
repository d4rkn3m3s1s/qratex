/**
 * Anket akışının saf mantığı (istemci + Jest). Doğrulama kuralları ORTAK sözleşmeden
 * (lib/survey-schema.ts) gelir — istemci sunucuyla birebir aynı şemayı uygular.
 */
import {
  isBlankAnswer,
  surveyAnswerValueSchema,
  type PublicSurveyQuestion,
  type SurveyAnswerValue,
} from '@/lib/survey-schema';

export type SurveyAnswers = Record<string, SurveyAnswerValue>;

export const DRAFT_VERSION = 1;
export const draftKey = (surveyId: string) => `qx-survey-draft:${surveyId}`;

export type SurveyDraft = { v: typeof DRAFT_VERSION; answers: SurveyAnswers; step: number; savedAt: number };

/** Taslak en çok bu kadar eski olabilir (oturum deposu zaten sekmeyle ölür; ek güvence). */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Değer bu soru için geçerli mi (ortak şema)? Boş değer "geçersiz" değil, "yanıtsız"dır. */
export function isValidAnswer(q: PublicSurveyQuestion, value: unknown): boolean {
  if (isBlankAnswer(value)) return false;
  return surveyAnswerValueSchema(q).safeParse(value).success;
}

export function isAnswered(q: PublicSurveyQuestion, answers: SurveyAnswers): boolean {
  return isValidAnswer(q, answers[q.id]);
}

export function countAnswered(questions: PublicSurveyQuestion[], answers: SurveyAnswers): number {
  return questions.filter((q) => isAnswered(q, answers)).length;
}

export function missingRequired(questions: PublicSurveyQuestion[], answers: SurveyAnswers): PublicSurveyQuestion[] {
  return questions.filter((q) => q.required && !isAnswered(q, answers));
}

/**
 * Oturum deposundaki taslağı güvenle geri yükler: bilinmeyen soru, değişmiş seçenek ya da
 * aralık dışı değer ATILIR (anket bu arada düzenlenmiş olabilir). Bozuk/eski taslak → null.
 */
export function sanitizeDraft(
  raw: unknown,
  questions: PublicSurveyQuestion[],
  now: number = Date.now()
): { answers: SurveyAnswers; step: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SurveyDraft>;
  if (d.v !== DRAFT_VERSION || typeof d.answers !== 'object' || d.answers === null) return null;
  if (typeof d.savedAt !== 'number' || now - d.savedAt > DRAFT_MAX_AGE_MS) return null;
  const answers: SurveyAnswers = {};
  for (const q of questions) {
    const value = (d.answers as Record<string, unknown>)[q.id];
    if (q.type === 'open_text' && typeof value === 'string' && value.length > 0) {
      // Metin yarım kalmış olabilir: uzunluk sınırı içinde olduğu sürece (boşluk dahil) korunur.
      if (value.length <= 4000) answers[q.id] = value;
      continue;
    }
    if (isValidAnswer(q, value)) answers[q.id] = value as SurveyAnswerValue;
  }
  if (Object.keys(answers).length === 0) return null;
  const maxStep = Math.max(0, questions.length - 1);
  const step = typeof d.step === 'number' && Number.isInteger(d.step) ? Math.min(Math.max(0, d.step), maxStep) : 0;
  return { answers, step };
}

/** Gönderim gövdesi: yalnız dolu cevaplar, metin kırpılmış, soru sırasında. */
export function buildSubmission(
  questions: PublicSurveyQuestion[],
  answers: SurveyAnswers
): { answers: { questionId: string; value: SurveyAnswerValue }[] } {
  const out: { questionId: string; value: SurveyAnswerValue }[] = [];
  for (const q of questions) {
    const v = answers[q.id];
    if (isBlankAnswer(v)) continue;
    out.push({ questionId: q.id, value: typeof v === 'string' ? v.trim() : v });
  }
  return { answers: out };
}

/** Çoklu seçimde seçeneği aç/kapa — seçenek sırası korunur. */
export function toggleOption(q: PublicSurveyQuestion, current: unknown, option: string): string[] {
  const picked = new Set(Array.isArray(current) ? current.filter((x): x is string => typeof x === 'string') : []);
  if (picked.has(option)) picked.delete(option);
  else picked.add(option);
  return (q.options ?? []).filter((o) => picked.has(o));
}

/** Özet ekranı için kısa metin (null → yanıtsız). */
export function answerSummary(q: PublicSurveyQuestion, value: unknown, maxText = 120): string | null {
  if (!isValidAnswer(q, value)) return null;
  if (q.type === 'rating') return `${value as number}/5`;
  if (q.type === 'multiple_choice') return (value as string[]).join(', ');
  const text = String(value).trim();
  return text.length > maxText ? `${text.slice(0, maxText - 1)}…` : text;
}
