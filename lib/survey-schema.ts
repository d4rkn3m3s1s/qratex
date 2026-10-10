/**
 * Anket sözleşmesi — OLUŞTURMA ve DOLDURMA için TEK kaynak (istemci + sunucu ortak).
 *
 * Kök neden (P0-39 / bayi anketleri): oluşturma şeması `options`'ı tipten bağımsız ve
 * minimumsuz tutuyordu → seçenekleri boş bir seçim sorusu `[]` olarak kaydediliyor,
 * zorunlu olduğu için anket HİÇBİR müşteri tarafından gönderilemiyordu. Doldurma ucu da
 * cevabın ankete ait olup olmadığını, seçeneğin listede olup olmadığını ve puan aralığını
 * denetlemiyordu → bayi sonuçları anonim olarak kirletilebiliyordu.
 *
 * Çözüm: soru tipi üzerinde ayrık birleşim (`z.discriminatedUnion('type', …)`):
 *  - seçim tipleri: 2–20 dolu, kırpılmış, birbirinden farklı seçenek ZORUNLU;
 *  - açık uçlu / puan: seçenek kabul edilmez (sessizce atılır).
 * Doldurmada her soru için tipinden türetilen değer şeması uygulanır (seçim ∈ seçenekler,
 * puan 1–5 tamsayı, metin ≤ 2000) ve bilinmeyen/yinelenen soru reddedilir.
 *
 * Bu dosya saf TS + zod'dur (DB/next bağımlılığı yok) — istemci bileşenleri de içe aktarır.
 */
import { z, type ZodError, type ZodTypeAny } from 'zod';

export const SURVEY_QUESTION_TYPES = ['single_choice', 'multiple_choice', 'open_text', 'rating'] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];
export type SurveyChoiceType = 'single_choice' | 'multiple_choice';

export const SURVEY_LIMITS = {
  titleMax: 200,
  descriptionMax: 2000,
  questionTextMax: 500,
  questionsMin: 1,
  questionsMax: 20,
  optionsMin: 2,
  optionsMax: 20,
  optionMax: 200,
  openTextMax: 2000,
  ratingMin: 1,
  ratingMax: 5,
  /** Bayi başına anket kotası. */
  surveysPerDealer: 50,
  /** Tek gönderimdeki cevap girdisi üst sınırı (soru sayısı ≤ 20, pay bırakıldı). */
  answersMax: 100,
  questionIdMax: 64,
} as const;

export function isSurveyQuestionType(value: unknown): value is SurveyQuestionType {
  return typeof value === 'string' && (SURVEY_QUESTION_TYPES as readonly string[]).includes(value);
}

export function isChoiceType(value: unknown): value is SurveyChoiceType {
  return value === 'single_choice' || value === 'multiple_choice';
}

/** Seçenek tekilliği anahtarı: kırpılmış + Türkçe kurallı küçük harf ("Evet" ≡ " evet "). */
export function optionKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

// ───────────────────────────── Oluşturma şeması ─────────────────────────────

const choiceOptionsSchema = z
  .array(
    z
      .string({ invalid_type_error: 'Seçenek metin olmalı' })
      .trim()
      .min(1, 'Seçenekler boş bırakılamaz')
      .max(SURVEY_LIMITS.optionMax, `Bir seçenek en fazla ${SURVEY_LIMITS.optionMax} karakter olabilir`),
    {
      required_error: `Seçim sorularında en az ${SURVEY_LIMITS.optionsMin} seçenek olmalı`,
      invalid_type_error: `Seçim sorularında en az ${SURVEY_LIMITS.optionsMin} seçenek olmalı`,
    },
  )
  .min(SURVEY_LIMITS.optionsMin, `Seçim sorularında en az ${SURVEY_LIMITS.optionsMin} dolu seçenek olmalı`)
  .max(SURVEY_LIMITS.optionsMax, `Bir soruda en fazla ${SURVEY_LIMITS.optionsMax} seçenek olabilir`)
  .superRefine((options, ctx) => {
    const seen = new Set<string>();
    options.forEach((opt, index) => {
      const key = optionKey(opt);
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Seçenekler birbirinden farklı olmalı',
        });
      }
      seen.add(key);
    });
  });

const questionBase = {
  text: z
    .string({ required_error: 'Soru metni gerekli', invalid_type_error: 'Soru metni gerekli' })
    .trim()
    .min(1, 'Soru metni gerekli')
    .max(SURVEY_LIMITS.questionTextMax, `Soru metni en fazla ${SURVEY_LIMITS.questionTextMax} karakter olabilir`),
  required: z.boolean({ invalid_type_error: 'Zorunluluk alanı geçersiz' }).default(true),
  /** Geriye uyumluluk: eski istemci `order` gönderiyor; sıra her zaman dizi indeksinden alınır. */
  order: z.number().int().min(0).max(1000).optional(),
};

/**
 * Tek soru girdisi — `type` üzerinde ayrık birleşim. Seçim tiplerinde seçenek zorunlu ve
 * doğrulanmış; diğer tiplerde `options` anahtarı şemada yok → zod onu ATAR (null yazılır).
 */
export const surveyQuestionInputSchema = z.discriminatedUnion(
  'type',
  [
    z.object({ type: z.literal('single_choice'), ...questionBase, options: choiceOptionsSchema }),
    z.object({ type: z.literal('multiple_choice'), ...questionBase, options: choiceOptionsSchema }),
    z.object({ type: z.literal('open_text'), ...questionBase }),
    z.object({ type: z.literal('rating'), ...questionBase }),
  ],
  { errorMap: () => ({ message: 'Geçersiz soru tipi' }) },
);
export type SurveyQuestionInput = z.infer<typeof surveyQuestionInputSchema>;

export const createSurveyInputSchema = z.object({
  title: z
    .string({ required_error: 'Anket başlığı gerekli', invalid_type_error: 'Anket başlığı gerekli' })
    .trim()
    .min(1, 'Anket başlığı gerekli')
    .max(SURVEY_LIMITS.titleMax, `Anket başlığı en fazla ${SURVEY_LIMITS.titleMax} karakter olabilir`),
  description: z
    .string({ invalid_type_error: 'Açıklama metin olmalı' })
    .trim()
    .max(SURVEY_LIMITS.descriptionMax, `Açıklama en fazla ${SURVEY_LIMITS.descriptionMax} karakter olabilir`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined)),
  questions: z
    .array(surveyQuestionInputSchema, {
      required_error: 'En az 1 soru ekleyin',
      invalid_type_error: 'Sorular geçersiz',
    })
    .min(SURVEY_LIMITS.questionsMin, 'En az 1 soru ekleyin')
    .max(SURVEY_LIMITS.questionsMax, `En fazla ${SURVEY_LIMITS.questionsMax} soru ekleyebilirsiniz`),
});
export type CreateSurveyInput = z.infer<typeof createSurveyInputSchema>;

/** Prisma `SurveyQuestion.create` verisine dönüştürür (sıra = dizi indeksi; seçim dışı → options yok). */
export function toQuestionCreateData(questions: SurveyQuestionInput[]) {
  return questions.map((q, i) => ({
    type: q.type,
    text: q.text,
    options: isChoiceType(q.type) && 'options' in q ? q.options : undefined,
    required: q.required,
    order: i,
  }));
}

export type SurveyIssue = {
  /** zod yolu, ör. `['questions', 2, 'options', 1]`. */
  path: (string | number)[];
  message: string;
  /** Yol bir soruya işaret ediyorsa 0 tabanlı soru indeksi. */
  questionIndex: number | null;
  /** Yol bir seçeneğe işaret ediyorsa 0 tabanlı seçenek indeksi. */
  optionIndex: number | null;
};

export function describeSurveyIssues(error: ZodError): { message: string; issues: SurveyIssue[] } {
  const issues: SurveyIssue[] = error.issues.map((issue) => {
    const path = issue.path.slice();
    const qPos = path.indexOf('questions');
    const questionIndex = qPos >= 0 && typeof path[qPos + 1] === 'number' ? (path[qPos + 1] as number) : null;
    const oPos = path.indexOf('options');
    const optionIndex = oPos >= 0 && typeof path[oPos + 1] === 'number' ? (path[oPos + 1] as number) : null;
    return { path, message: issue.message, questionIndex, optionIndex };
  });
  const first = issues[0];
  const message = !first
    ? 'Anket bilgileri geçersiz'
    : first.questionIndex != null
      ? `Soru ${first.questionIndex + 1}: ${first.message}`
      : first.message;
  return { message, issues };
}

// ───────────────────────────── Kayıtlı soru → kamusal görünüm ─────────────────────────────

/** DB'deki `SurveyQuestion` satırının bu modülün ihtiyaç duyduğu kısmı. */
export type StoredSurveyQuestion = {
  id: string;
  type: string;
  text?: string;
  options: unknown;
  required: boolean;
};

/**
 * Kayıtlı (Json) seçenekleri güvenle diziye çevirir: yalnız dolu string'ler, kırpılmış,
 * tekilleştirilmiş (ilk görülen korunur). Eski bozuk kayıtlara (`[]`, `null`, yinelenen)
 * karşı savunma.
 */
export function normalizeStoredOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = optionKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, SURVEY_LIMITS.optionMax));
  }
  return out;
}

/**
 * Soru müşteri tarafından yanıtlanabilir mi? Bilinmeyen tip ya da hiç seçeneği olmayan
 * (eski şemayla kaydedilmiş) seçim sorusu yanıtlanamaz: kamusal görünümden çıkarılır ve
 * zorunluluk denetimine girmez — böylece eski bozuk anketler de yeniden yanıt alabilir.
 */
export function isAnswerableQuestion(q: Pick<StoredSurveyQuestion, 'type' | 'options'>): boolean {
  if (!isSurveyQuestionType(q.type)) return false;
  if (isChoiceType(q.type)) return normalizeStoredOptions(q.options).length >= 1;
  return true;
}

export type PublicSurveyQuestion = {
  id: string;
  type: SurveyQuestionType;
  text: string;
  options: string[] | null;
  required: boolean;
};

/** Doldurma ekranına giden sorular: yalnız yanıtlanabilir olanlar, normalize seçeneklerle. */
export function toPublicSurveyQuestions(questions: StoredSurveyQuestion[]): PublicSurveyQuestion[] {
  return questions.filter(isAnswerableQuestion).map((q) => ({
    id: q.id,
    type: q.type as SurveyQuestionType,
    text: q.text ?? '',
    options: isChoiceType(q.type) ? normalizeStoredOptions(q.options) : null,
    required: q.required,
  }));
}

/** Bayi listesinde uyarı için: yanıtlanamaz durumdaki soru sayısı. */
export function countUnanswerableQuestions(questions: Pick<StoredSurveyQuestion, 'type' | 'options'>[]): number {
  return questions.filter((q) => !isAnswerableQuestion(q)).length;
}

// ───────────────────────────── Doldurma (cevap) doğrulaması ─────────────────────────────

/** Gönderim zarfı: cevap değerlerinin şekli soruya göre ayrıca doğrulanır. */
export const surveySubmissionSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z
          .string({ required_error: 'Soru kimliği gerekli', invalid_type_error: 'Soru kimliği gerekli' })
          .min(1, 'Soru kimliği gerekli')
          .max(SURVEY_LIMITS.questionIdMax, 'Soru kimliği geçersiz'),
        value: z.unknown(),
      }),
      { required_error: 'Yanıt bulunamadı', invalid_type_error: 'Yanıtlar geçersiz' },
    )
    .max(SURVEY_LIMITS.answersMax, 'Çok fazla yanıt gönderildi'),
});
export type SurveySubmission = z.infer<typeof surveySubmissionSchema>;

export type SurveyAnswerValue = string | string[] | number;
export type NormalizedSurveyAnswer = { questionId: string; value: SurveyAnswerValue };

/** Bir sorunun (tipine göre) cevap değeri şeması — ayrık birleşimin cevap tarafı. */
export function surveyAnswerValueSchema(q: { type: SurveyQuestionType; options: string[] | null }): ZodTypeAny {
  switch (q.type) {
    case 'single_choice': {
      const allowed = new Set(q.options ?? []);
      return z
        .string({ invalid_type_error: 'Tek bir seçenek seçin' })
        .refine((v) => allowed.has(v), 'Seçenek bu soruya ait değil');
    }
    case 'multiple_choice': {
      const allowed = new Set(q.options ?? []);
      return z
        .array(z.string({ invalid_type_error: 'Seçenek geçersiz' }).refine((v) => allowed.has(v), 'Seçenek bu soruya ait değil'), {
          invalid_type_error: 'En az bir seçenek seçin',
        })
        .min(1, 'En az bir seçenek seçin')
        .max(Math.max(1, allowed.size), 'Seçenek sayısı geçersiz')
        .refine((arr) => new Set(arr).size === arr.length, 'Aynı seçenek birden fazla kez seçilemez');
    }
    case 'rating':
      return z
        .number({ invalid_type_error: `Puan ${SURVEY_LIMITS.ratingMin}-${SURVEY_LIMITS.ratingMax} arasında olmalı` })
        .int(`Puan tam sayı olmalı`)
        .min(SURVEY_LIMITS.ratingMin, `Puan ${SURVEY_LIMITS.ratingMin}-${SURVEY_LIMITS.ratingMax} arasında olmalı`)
        .max(SURVEY_LIMITS.ratingMax, `Puan ${SURVEY_LIMITS.ratingMin}-${SURVEY_LIMITS.ratingMax} arasında olmalı`);
    case 'open_text':
    default:
      return z
        .string({ invalid_type_error: 'Yanıt metin olmalı' })
        .trim()
        .min(1, 'Yanıt boş olamaz')
        .max(SURVEY_LIMITS.openTextMax, `Yanıt en fazla ${SURVEY_LIMITS.openTextMax} karakter olabilir`);
  }
}

/** Boş cevap mı? (yanıtlanmamış sayılır: undefined/null, boşluk metni, boş dizi) */
export function isBlankAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export type SurveyAnswerErrorCode =
  | 'UNKNOWN_QUESTION'
  | 'DUPLICATE_ANSWER'
  | 'INVALID_ANSWER'
  | 'REQUIRED_MISSING'
  | 'EMPTY_SUBMISSION';

export type SurveyAnswerValidation =
  | { ok: true; answers: NormalizedSurveyAnswer[] }
  | { ok: false; code: SurveyAnswerErrorCode; questionId?: string; message: string };

/**
 * Cevapları anketin GERÇEK sorularına karşı doğrular ve normalize eder.
 *  - ankete ait olmayan soru kimliği → UNKNOWN_QUESTION
 *  - aynı soruya iki cevap → DUPLICATE_ANSWER
 *  - tipine uymayan değer (listede olmayan seçenek, aralık dışı puan, uzun metin) → INVALID_ANSWER
 *  - yanıtlanabilir zorunlu soru boş → REQUIRED_MISSING
 *  - hiçbir geçerli cevap yok → EMPTY_SUBMISSION
 * Yanıtlanamaz (eski bozuk) sorulara gelen cevaplar sessizce atılır. Çıktı soru sırasındadır.
 */
export function validateSurveyAnswers(
  questions: StoredSurveyQuestion[],
  answers: { questionId: string; value?: unknown }[],
): SurveyAnswerValidation {
  const byId = new Map(questions.map((q, index) => [q.id, { q, index }]));
  const publicById = new Map(toPublicSurveyQuestions(questions).map((q) => [q.id, q]));
  const seen = new Set<string>();
  const accepted = new Map<string, SurveyAnswerValue>();

  for (const answer of answers) {
    const entry = byId.get(answer.questionId);
    if (!entry) {
      return { ok: false, code: 'UNKNOWN_QUESTION', questionId: answer.questionId, message: 'Yanıt bu ankete ait olmayan bir soru içeriyor' };
    }
    if (seen.has(answer.questionId)) {
      return { ok: false, code: 'DUPLICATE_ANSWER', questionId: answer.questionId, message: 'Aynı soru birden fazla kez yanıtlanamaz' };
    }
    seen.add(answer.questionId);

    const pq = publicById.get(answer.questionId);
    if (!pq) continue; // yanıtlanamaz (eski bozuk) soru → yok say
    if (isBlankAnswer(answer.value)) continue; // zorunluluk aşağıda denetlenir

    const parsed = surveyAnswerValueSchema(pq).safeParse(answer.value);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'INVALID_ANSWER',
        questionId: answer.questionId,
        message: `Soru ${entry.index + 1}: ${parsed.error.issues[0]?.message ?? 'Yanıt geçersiz'}`,
      };
    }
    accepted.set(answer.questionId, parsed.data as SurveyAnswerValue);
  }

  for (const [id, pq] of publicById) {
    if (pq.required && !accepted.has(id)) {
      const index = byId.get(id)?.index ?? 0;
      return { ok: false, code: 'REQUIRED_MISSING', questionId: id, message: `Lütfen zorunlu soruları yanıtlayın (Soru ${index + 1})` };
    }
  }

  if (accepted.size === 0) {
    return { ok: false, code: 'EMPTY_SUBMISSION', message: 'En az bir soruyu yanıtlayın' };
  }

  const ordered: NormalizedSurveyAnswer[] = [];
  for (const q of questions) {
    if (accepted.has(q.id)) ordered.push({ questionId: q.id, value: accepted.get(q.id)! });
  }
  return { ok: true, answers: ordered };
}
