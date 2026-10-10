/**
 * Anket oluşturucu taslağı ↔ ortak sözleşme köprüsü (saf, istemci + Jest).
 *
 * Oluşturucu ekranı taslağı bu modülle gövdeye çevirir ve AYNI zod şemasıyla
 * (lib/survey-schema.ts) doğrular; hatalar soru/seçenek bazında satır içi gösterilir.
 * Sunucunun döndürdüğü `issues` da aynı eşlemeyle karta bağlanır.
 */
import {
  createSurveyInputSchema,
  describeSurveyIssues,
  isChoiceType,
  type SurveyIssue,
  type SurveyQuestionType,
} from '@/lib/survey-schema';

export type DraftOption = { id: string; value: string };
export type DraftQuestion = {
  id: string;
  type: SurveyQuestionType;
  text: string;
  options: DraftOption[];
  required: boolean;
};
export type SurveyDraft = { title: string; description: string; questions: DraftQuestion[] };

export type QuestionErrors = {
  text?: string;
  type?: string;
  /** Soru düzeyinde seçenek hatası (ör. "en az 2 dolu seçenek"). */
  options?: string;
  /** Seçenek kimliği → hata. */
  option?: Record<string, string>;
  other?: string;
};

export type DraftErrors = {
  title?: string;
  description?: string;
  questions?: string;
  byQuestion: Record<string, QuestionErrors>;
  /** Toplam hata sayısı (0 → gönderilebilir). */
  count: number;
};

export type SurveyPayload = {
  title: string;
  description?: string;
  questions: { type: SurveyQuestionType; text: string; options?: string[]; required: boolean; order: number }[];
};

/**
 * Taslağı API gövdesine çevirir. Seçim sorularında BOŞ seçenek satırları atılır (kullanıcı
 * fazladan boş satır bırakabilir) — ama şema en az 2 dolu seçenek ister; bu yüzden eskiden
 * olduğu gibi `[]` ile "başarılı" kayıt artık mümkün değildir. `optionIds` gönderilen her
 * seçeneğin taslaktaki kimliğini tutar (hata eşlemesi için).
 */
export function buildSurveyPayload(draft: SurveyDraft): { payload: SurveyPayload; optionIds: string[][] } {
  const optionIds: string[][] = [];
  const questions = draft.questions.map((q, i) => {
    if (isChoiceType(q.type)) {
      const kept = q.options.filter((o) => o.value.trim() !== '');
      optionIds.push(kept.map((o) => o.id));
      return { type: q.type, text: q.text.trim(), options: kept.map((o) => o.value.trim()), required: q.required, order: i };
    }
    optionIds.push([]);
    return { type: q.type, text: q.text.trim(), required: q.required, order: i };
  });
  const description = draft.description.trim();
  return {
    payload: { title: draft.title.trim(), ...(description ? { description } : {}), questions },
    optionIds,
  };
}

/** zod/sunucu `issues` listesini taslak alanlarına eşler. */
export function mapIssuesToDraftErrors(
  issues: Pick<SurveyIssue, 'path' | 'message'>[],
  draft: SurveyDraft,
  optionIds: string[][],
): DraftErrors {
  const errors: DraftErrors = { byQuestion: {}, count: 0 };
  for (const issue of issues) {
    const [head, qIdx, field, optIdx] = issue.path;
    if (head === 'title') {
      errors.title ??= issue.message;
    } else if (head === 'description') {
      errors.description ??= issue.message;
    } else if (head === 'questions' && typeof qIdx === 'number' && draft.questions[qIdx]) {
      const qid = draft.questions[qIdx].id;
      const qe = (errors.byQuestion[qid] ??= {});
      if (field === 'text') qe.text ??= issue.message;
      else if (field === 'type') qe.type ??= issue.message;
      else if (field === 'options' && typeof optIdx === 'number') {
        const optionId = optionIds[qIdx]?.[optIdx];
        if (optionId) (qe.option ??= {})[optionId] ??= issue.message;
        else qe.options ??= issue.message;
      } else if (field === 'options') qe.options ??= issue.message;
      else qe.other ??= issue.message;
    } else if (head === 'questions') {
      errors.questions ??= issue.message;
    } else {
      errors.questions ??= issue.message;
    }
    errors.count += 1;
  }
  return errors;
}

/** İstemci tarafı doğrulama: sunucuyla BİREBİR aynı şema. */
export function validateSurveyDraft(draft: SurveyDraft): {
  ok: boolean;
  payload: SurveyPayload;
  errors: DraftErrors;
  firstMessage: string | null;
} {
  const { payload, optionIds } = buildSurveyPayload(draft);
  const parsed = createSurveyInputSchema.safeParse(payload);
  if (parsed.success) return { ok: true, payload, errors: { byQuestion: {}, count: 0 }, firstMessage: null };
  const { message, issues } = describeSurveyIssues(parsed.error);
  return { ok: false, payload, errors: mapIssuesToDraftErrors(issues, draft, optionIds), firstMessage: message };
}
