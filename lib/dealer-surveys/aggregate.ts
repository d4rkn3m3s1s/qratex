/**
 * Anket sonuç özeti — SQL'de gruplanmış cevaplardan (saf; Jest ile test edilir).
 *
 * Denetim (dealer_surveys_id_results #2): eskiden TÜM yanıtlar sınırsız belleğe çekilip
 * O(soru × yanıt × cevap) ile JS'te sayılıyordu. Artık Postgres `jsonb_array_elements` ile
 * `(questionId, value) → adet` gruplar; burada yalnız küçük grup listesi işlenir.
 *
 * SAVUNMACI sayım (denetim #1): yalnız ankette TANIMLI seçenekler, tamsayı 1–5 puanlar ve dolu
 * metinler sayılır; tek seçimli soruya gelen dizi sayılmaz. Atılanlar `ignoredAnswers`'ta görünür.
 */
import { isChoiceType, normalizeStoredOptions, SURVEY_LIMITS } from '@/lib/survey-schema';
import { addDays, dayDiff, istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import {
  RESULT_TEXT_PREVIEW,
  TREND_MAX_DAYS,
  type SurveyQuestionSummary,
  type SurveyRange,
  type SurveyResultsData,
} from './types';

export type GroupedAnswerRow = { questionId: string; value: unknown; n: number };
export type TextPreviewRow = { questionId: string; text: string; createdAt: Date | string; total: number };
export type SummaryQuestion = { id: string; type: string; text: string; options: unknown; required: boolean };

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/** Puan değeri: tamsayı 1–5 (eski kayıtlarda sayısal metin de kabul). Değilse null. */
export function ratingValue(v: unknown): number | null {
  const num = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(num) && num >= SURVEY_LIMITS.ratingMin && num <= SURVEY_LIMITS.ratingMax ? num : null;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function summarizeGroupedAnswers(
  questions: SummaryQuestion[],
  grouped: GroupedAnswerRow[],
  textRows: TextPreviewRow[],
  totalResponses: number,
): { questions: SurveyQuestionSummary[]; ratingOverall: SurveyResultsData['ratingOverall'] } {
  const groups = new Map<string, GroupedAnswerRow[]>();
  for (const row of grouped) {
    const list = groups.get(row.questionId) ?? [];
    list.push(row);
    groups.set(row.questionId, list);
  }
  const texts = new Map<string, TextPreviewRow[]>();
  for (const row of textRows) {
    const list = texts.get(row.questionId) ?? [];
    list.push(row);
    texts.set(row.questionId, list);
  }

  let overallSum = 0;
  let overallN = 0;
  let overallSatisfied = 0;

  const summaries = questions.map((q): SurveyQuestionSummary => {
    const rows = groups.get(q.id) ?? [];
    const base = { questionId: q.id, text: q.text, type: q.type, required: q.required };

    if (isChoiceType(q.type)) {
      const options = normalizeStoredOptions(q.options);
      const counts = new Map(options.map((o) => [o, 0]));
      let answered = 0;
      let ignored = 0;
      for (const { value, n } of rows) {
        let picked: string[] = [];
        if (typeof value === 'string') picked = [value];
        else if (Array.isArray(value) && q.type === 'multiple_choice') picked = [...new Set(value.filter((x): x is string => typeof x === 'string'))];
        const valid = picked.filter((p) => counts.has(p));
        if (valid.length === 0) {
          ignored += n;
          continue;
        }
        answered += n;
        for (const p of valid) counts.set(p, (counts.get(p) ?? 0) + n);
      }
      return {
        ...base,
        answered,
        skipped: Math.max(0, totalResponses - answered),
        ignoredAnswers: ignored,
        options: options.map((label) => ({ label, count: counts.get(label) ?? 0 })),
      };
    }

    if (q.type === 'rating') {
      const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      let sum = 0;
      let n = 0;
      let ignored = 0;
      for (const row of rows) {
        const r = ratingValue(row.value);
        if (r == null) {
          ignored += row.n;
          continue;
        }
        distribution[r - 1] += row.n;
        sum += r * row.n;
        n += row.n;
      }
      const satisfied = distribution[3] + distribution[4];
      overallSum += sum;
      overallN += n;
      overallSatisfied += satisfied;
      return {
        ...base,
        answered: n,
        skipped: Math.max(0, totalResponses - n),
        ignoredAnswers: ignored,
        rating: {
          avg: n > 0 ? Math.round((sum / n) * 100) / 100 : null,
          distribution,
          satisfiedPct: pct(satisfied, n),
        },
      };
    }

    // open_text (ve tanınmayan tipler metin olarak)
    const list = texts.get(q.id) ?? [];
    const answered = list[0]?.total ?? 0;
    return {
      ...base,
      answered,
      skipped: Math.max(0, totalResponses - answered),
      ignoredAnswers: 0,
      texts: list.slice(0, RESULT_TEXT_PREVIEW).map((r) => ({ text: r.text, at: toIso(r.createdAt) })),
    };
  });

  return {
    questions: summaries,
    ratingOverall: {
      avg: overallN > 0 ? Math.round((overallSum / overallN) * 100) / 100 : null,
      n: overallN,
      satisfiedPct: pct(overallSatisfied, overallN),
    },
  };
}

// ───────────────────────────── Dönem ve eğilim ─────────────────────────────

const RANGE_DAYS: Record<Exclude<SurveyRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export type ResolvedSurveyRange = {
  key: SurveyRange;
  /** Yanıt filtresinin alt sınırı (İstanbul gün başı); `all` → null. */
  from: Date | null;
  to: Date;
  /** Eğilim grafiğinin ilk ve son günü (İstanbul, uçlar dahil). */
  trendFrom: string;
  trendTo: string;
};

export function resolveSurveyRange(key: SurveyRange, now: Date, surveyCreatedAt: Date | string): ResolvedSurveyRange {
  const today = istanbulDay(now);
  const created = istanbulDay(new Date(surveyCreatedAt));
  const cap = addDays(today, -(TREND_MAX_DAYS - 1));
  if (key === 'all') {
    const start = created > today ? today : created;
    return { key, from: null, to: now, trendFrom: start < cap ? cap : start, trendTo: today };
  }
  const fromDay = addDays(today, -(RANGE_DAYS[key] - 1));
  return { key, from: istanbulDayStart(fromDay), to: now, trendFrom: fromDay, trendTo: today };
}

/** Günlük sayıları boş günler 0 olacak şekilde [from..to] aralığına yayar. */
export function fillDailySeries(rows: { day: string; n: number }[], fromDay: string, toDay: string): { day: string; n: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.n) || 0]));
  const len = Math.max(0, dayDiff(fromDay, toDay) + 1);
  const out: { day: string; n: number }[] = [];
  for (let i = 0; i < len; i += 1) {
    const day = addDays(fromDay, i);
    out.push({ day, n: byDay.get(day) ?? 0 });
  }
  return out;
}
