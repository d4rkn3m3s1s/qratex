/**
 * Oluşturma/düzenleme gövdesi — ortak anket sözleşmesinin (lib/survey-schema.ts) üstüne
 * yalnız yüzeye özgü iki alan ekler (saf; istemci + sunucu + Jest):
 *  - `publish`: false → anket DURDURULMUŞ (taslak gibi) kaydedilir; varsayılan yayında.
 *  - `questionIds`: düzenlemede soruların mevcut kimlikleri (paralel dizi, null = yeni soru).
 * Hatalar soru/seçenek indeksli döner → oluşturucu ilgili kartı işaretler.
 */
import { z } from 'zod';
import { createSurveyInputSchema, describeSurveyIssues, SURVEY_LIMITS, type CreateSurveyInput, type SurveyIssue } from '@/lib/survey-schema';

export const surveyWriteSchema = createSurveyInputSchema
  .extend({
    publish: z.boolean({ invalid_type_error: 'Yayın durumu geçersiz' }).optional(),
    questionIds: z
      .array(z.string().min(1).max(SURVEY_LIMITS.questionIdMax).nullable(), { invalid_type_error: 'Soru kimlikleri geçersiz' })
      .max(SURVEY_LIMITS.questionsMax)
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.questionIds && v.questionIds.length !== v.questions.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questionIds'], message: 'Soru listesi eşleşmiyor. Sayfayı yenileyip tekrar deneyin.' });
    }
  });

export type SurveyWriteInput = CreateSurveyInput & { publish?: boolean; questionIds?: (string | null)[] };

export type SurveyWriteParse =
  | { ok: true; data: SurveyWriteInput }
  | { ok: false; message: string; issues: SurveyIssue[] };

export function parseSurveyWrite(raw: unknown): SurveyWriteParse {
  const parsed = surveyWriteSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data as SurveyWriteInput };
  const { message, issues } = describeSurveyIssues(parsed.error);
  return { ok: false, message, issues };
}

/** PATCH: hızlı alan güncellemesi (yayın anahtarı, başlık, açıklama). */
export const surveyPatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    title: z.string().trim().min(1, 'Anket başlığı gerekli').max(SURVEY_LIMITS.titleMax).optional(),
    description: z.string().trim().max(SURVEY_LIMITS.descriptionMax).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Güncellenecek alan yok');
