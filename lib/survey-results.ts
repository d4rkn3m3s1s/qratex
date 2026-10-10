/**
 * Anket sonuç toplayıcı — SAVUNMACI (saf fonksiyon, Jest ile test edilir).
 *
 * Doldurma ucu artık cevapları doğruluyor (lib/survey-schema.ts), ama eski kayıtlarda
 * listede olmayan seçenekler, 1–5 dışı puanlar ve ankete ait olmayan soru kimlikleri
 * bulunabilir. Toplayıcı bunları SAYMAZ: yalnız tanımlı seçenekler, tamsayı 1–5 puanlar
 * ve dolu metinler sonuca girer; atılan girdi sayısı `ignoredAnswers` ile görünür kalır.
 */
import { isChoiceType, normalizeStoredOptions, SURVEY_LIMITS, type StoredSurveyQuestion } from '@/lib/survey-schema';

export type SurveyQuestionResult = {
  questionId: string;
  text: string;
  type: string;
  totalAnswers: number;
  /** Doğrulanamadığı için sayılmayan (eski/kirli) cevap sayısı. */
  ignoredAnswers: number;
  optionCounts?: Record<string, number>;
  avg?: number;
  distribution?: Record<number, number>;
  recentTexts?: string[];
};

type StoredAnswer = { questionId?: unknown; value?: unknown };

function answersOf(raw: unknown): StoredAnswer[] {
  return Array.isArray(raw) ? (raw.filter((a) => a && typeof a === 'object') as StoredAnswer[]) : [];
}

export const RECENT_TEXTS_LIMIT = 20;

/**
 * @param questions anketin soruları (sıralı)
 * @param responses yanıt satırları (yeniden eskiye sıralı verilirse `recentTexts` en yenileri içerir)
 */
export function aggregateSurveyResults(
  questions: (StoredSurveyQuestion & { text: string })[],
  responses: { answers: unknown }[],
): SurveyQuestionResult[] {
  return questions.map((q) => {
    const values: unknown[] = [];
    for (const r of responses) {
      const hit = answersOf(r.answers).find((a) => a.questionId === q.id);
      if (hit) values.push(hit.value);
    }

    if (isChoiceType(q.type)) {
      const options = normalizeStoredOptions(q.options);
      const allowed = new Set(options);
      const optionCounts: Record<string, number> = {};
      options.forEach((o) => (optionCounts[o] = 0));
      let total = 0;
      let ignored = 0;
      for (const v of values) {
        const picked = Array.isArray(v) ? [...new Set(v)] : [v];
        const valid = picked.filter((p): p is string => typeof p === 'string' && allowed.has(p));
        if (valid.length === 0) {
          ignored += 1;
          continue;
        }
        total += 1;
        valid.forEach((p) => (optionCounts[p] += 1));
      }
      return { questionId: q.id, text: q.text, type: q.type, totalAnswers: total, ignoredAnswers: ignored, optionCounts };
    }

    if (q.type === 'rating') {
      const distribution: Record<number, number> = {};
      for (let s = SURVEY_LIMITS.ratingMin; s <= SURVEY_LIMITS.ratingMax; s += 1) distribution[s] = 0;
      let sum = 0;
      let n = 0;
      let ignored = 0;
      for (const v of values) {
        const num = typeof v === 'number' ? v : NaN;
        if (!Number.isInteger(num) || num < SURVEY_LIMITS.ratingMin || num > SURVEY_LIMITS.ratingMax) {
          ignored += 1;
          continue;
        }
        sum += num;
        n += 1;
        distribution[num] += 1;
      }
      const avg = n > 0 ? Math.round((sum / n) * 10) / 10 : 0;
      return { questionId: q.id, text: q.text, type: q.type, totalAnswers: n, ignoredAnswers: ignored, avg, distribution };
    }

    // open_text (ve bilinmeyen tipler metin olarak)
    const texts: string[] = [];
    let ignored = 0;
    for (const v of values) {
      if (typeof v !== 'string' || !v.trim()) {
        ignored += 1;
        continue;
      }
      texts.push(v.trim().slice(0, SURVEY_LIMITS.openTextMax));
    }
    return {
      questionId: q.id,
      text: q.text,
      type: q.type,
      totalAnswers: texts.length,
      ignoredAnswers: ignored,
      recentTexts: texts.slice(0, RECENT_TEXTS_LIMIT),
    };
  });
}
