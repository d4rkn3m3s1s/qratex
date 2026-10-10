/**
 * Bayi anket stüdyosu — sunucu ↔ istemci sözleşmesi (saf tipler + sabitler).
 *
 * Yüzey: /dealer/surveys (liste), /dealer/surveys/create + /[id]/edit (oluşturucu),
 * /dealer/surveys/[id]/results (sonuç merkezi). Sunucu tarafı: lib/dealer-surveys/service.server.ts.
 * Bu dosya DB/next bağımlılığı taşımaz; istemci bileşenleri de içe aktarır.
 */
import type { SurveyQuestionType } from '@/lib/survey-schema';

/** Sonuç dönemleri. `all` = anketin tüm ömrü (eğilim grafiği yine en çok 90 gün). */
export const SURVEY_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type SurveyRange = (typeof SURVEY_RANGES)[number];
export const DEFAULT_SURVEY_RANGE: SurveyRange = 'all';
/** Eğilim grafiğinin en uzun penceresi (gün). */
export const TREND_MAX_DAYS = 90;
/** Liste kartlarındaki mini eğilim (gün). */
export const LIST_TREND_DAYS = 14;
/** Sonuç kartında gösterilen en yeni açık uçlu yanıt sayısı. */
export const RESULT_TEXT_PREVIEW = 5;
/** Sayfalı uçların sayfa boyu. */
export const RESPONSES_PAGE_SIZE = 20;
export const TEXTS_PAGE_SIZE = 30;
/** CSV dışa aktarımında en çok satır (üstü kesilir ve başlıkta bildirilir). */
export const EXPORT_MAX_ROWS = 10_000;

export function isSurveyRange(v: unknown): v is SurveyRange {
  return typeof v === 'string' && (SURVEY_RANGES as readonly string[]).includes(v);
}

// ───────────────────────────── Liste ─────────────────────────────

export type SurveyListItem = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  responseCount: number;
  /** Eski şemayla kaydedilmiş, müşteriye gösterilemeyen soru sayısı. */
  unanswerableQuestions: number;
  lastResponseAt: string | null;
  /** Son 7 İstanbul günündeki yanıt (bugün dahil). */
  responses7d: number;
  /** Son 14 İstanbul günü, eskiden yeniye günlük yanıt sayısı. */
  trend: number[];
};

export type SurveyListData = {
  surveys: SurveyListItem[];
  quota: { used: number; limit: number };
  totals: { total: number; active: number; paused: number; responses7d: number; responsesAll: number; trend: number[] };
  asOf: string;
};

// ───────────────────────────── Oluşturucu ─────────────────────────────

export type SurveyEditorQuestion = {
  id: string;
  type: SurveyQuestionType | string;
  text: string;
  options: string[];
  required: boolean;
};

export type SurveyEditorData = {
  survey: { id: string; title: string; description: string | null; isActive: boolean; createdAt: string };
  questions: SurveyEditorQuestion[];
  responseCount: number;
  /**
   * Yanıt almış ankette YAPISAL kilit: soru silinemez, tipi değişmez, mevcut seçenek
   * silinemez/yeniden adlandırılamaz (yanıtlar seçenek METNİNE bağlı). Metin düzeltme,
   * zorunluluk, sıra, yeni seçenek ve yeni soru serbest.
   */
  structuralLock: boolean;
};

// ───────────────────────────── Sonuçlar ─────────────────────────────

export type SurveyQuestionSummary = {
  questionId: string;
  text: string;
  type: string;
  required: boolean;
  /** Bu soruyu (geçerli bir değerle) yanıtlayan kişi sayısı. */
  answered: number;
  /** Dönemdeki toplam yanıt − yanıtlayan. */
  skipped: number;
  /** Doğrulanamadığı için sayılmayan (eski/kirli) cevap sayısı. */
  ignoredAnswers: number;
  /** Seçim soruları: seçenekler ANKETTEKİ sırayla. */
  options?: { label: string; count: number }[];
  /** Puan soruları (1–5). */
  rating?: {
    avg: number | null;
    /** 1..5 → adet. */
    distribution: [number, number, number, number, number];
    /** 4–5 verenlerin yüzdesi (CSAT). */
    satisfiedPct: number | null;
  };
  /** Açık uçlu: en yeni birkaç yanıt. */
  texts?: { text: string; at: string }[];
};

export type SurveyResultsData = {
  survey: {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    questionCount: number;
    unanswerableQuestions: number;
  };
  range: { key: SurveyRange; from: string | null; to: string };
  totals: {
    /** Dönemdeki yanıt. */
    responses: number;
    /** Anketin tüm yanıtları. */
    responsesAll: number;
    /** Dönemde oturumlu (üye) yanıt. */
    members: number;
    lastResponseAt: string | null;
  };
  /** Günlük yanıt (eskiden yeniye, boş günler 0 ile). */
  trend: { day: string; n: number }[];
  /** Tüm puan sorularının birleşik ortalaması (dönem). */
  ratingOverall: { avg: number | null; n: number; satisfiedPct: number | null };
  questions: SurveyQuestionSummary[];
  asOf: string;
};

export type SurveyResponseItem = {
  id: string;
  createdAt: string;
  member: boolean;
  answers: { questionId: string; question: string; display: string }[];
};

export type SurveyResponsesPage = { items: SurveyResponseItem[]; nextCursor: string | null };

export type SurveyTextsPage = {
  items: { id: string; text: string; at: string }[];
  nextCursor: string | null;
  total: number | null;
};

/** Sunucu hata kodları (istemci kendi dilinde karşılar). */
export type SurveyErrorCode =
  | 'SURVEY_NOT_FOUND'
  | 'SURVEY_QUOTA'
  | 'SURVEY_HAS_RESPONSES'
  | 'STRUCTURE_LOCKED'
  | 'UNKNOWN_QUESTION'
  | 'VALIDATION'
  | 'MODULE_DISABLED';
