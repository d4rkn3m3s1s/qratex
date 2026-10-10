/**
 * Oluşturucu taslak modeli (saf; Jest ile test edilir). `lib/survey-draft.ts`'in taslak tipinin
 * üstüne düzenleme bilgisini ekler: sunucu kimliği ve yanıt almış (kilitli) seçenekler.
 */
import type { DraftOption, DraftQuestion, SurveyDraft } from '@/lib/survey-draft';
import { isChoiceType, SURVEY_LIMITS, type SurveyQuestionType } from '@/lib/survey-schema';
import type { SurveyEditorData } from '@/lib/dealer-surveys/types';
import type { SurveyTemplate } from '@/lib/dealer-surveys/templates';

export type BuilderOption = DraftOption & { locked?: boolean };
export type BuilderQuestion = Omit<DraftQuestion, 'options'> & {
  options: BuilderOption[];
  /** Düzenlemede sunucudaki soru kimliği; yeni soruda null. */
  serverId: string | null;
  /** Yanıt almış ankette mevcut soru: tip değişmez, silinemez. */
  locked: boolean;
};
export type BuilderDraft = { title: string; description: string; questions: BuilderQuestion[] };

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}-${seq}`;
}

export function blankOption(value = ''): BuilderOption {
  return { id: uid('o'), value };
}

export function blankQuestion(type: SurveyQuestionType = 'single_choice'): BuilderQuestion {
  return {
    id: uid('q'),
    type,
    text: '',
    options: isChoiceType(type) ? [blankOption(), blankOption()] : [],
    required: true,
    serverId: null,
    locked: false,
  };
}

export const EMPTY_DRAFT: BuilderDraft = { title: '', description: '', questions: [] };

export function draftFromTemplate(tpl: SurveyTemplate): BuilderDraft {
  return {
    title: tpl.title,
    description: tpl.description,
    questions: tpl.questions.map((q) => ({
      id: uid('q'),
      type: q.type,
      text: q.text,
      options: (q.options ?? []).map((o) => blankOption(o)),
      required: q.required,
      serverId: null,
      locked: false,
    })),
  };
}

export function draftFromEditor(data: SurveyEditorData): BuilderDraft {
  const lock = data.structuralLock;
  return {
    title: data.survey.title,
    description: data.survey.description ?? '',
    questions: data.questions.map((q) => {
      const known = (['single_choice', 'multiple_choice', 'open_text', 'rating'] as const).includes(q.type as SurveyQuestionType);
      const type = (known ? q.type : 'open_text') as SurveyQuestionType;
      const options = isChoiceType(type)
        ? [
            ...q.options.map((o) => ({ id: uid('o'), value: o, locked: lock })),
            // Eski bozuk (seçeneksiz) soru: en az iki boş satır hazır olsun.
            ...Array.from({ length: Math.max(0, SURVEY_LIMITS.optionsMin - q.options.length) }, () => blankOption()),
          ]
        : [];
      return { id: uid('q'), type, text: q.text, options, required: q.required, serverId: q.id, locked: lock };
    }),
  };
}

/** Kirli karşılaştırması için kararlı imza (geçici kimlikler hariç). */
export function draftSignature(d: BuilderDraft): string {
  return JSON.stringify({
    t: d.title.trim(),
    d: d.description.trim(),
    q: d.questions.map((q) => [q.serverId, q.type, q.text.trim(), q.required, isChoiceType(q.type) ? q.options.map((o) => o.value.trim()) : []]),
  });
}

/** `lib/survey-draft` doğrulayıcısına giden şekil (fazla alanlar zararsız). */
export function toSurveyDraft(d: BuilderDraft): SurveyDraft {
  return d as unknown as SurveyDraft;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function duplicateQuestion(q: BuilderQuestion): BuilderQuestion {
  return {
    ...q,
    id: uid('q'),
    serverId: null,
    locked: false,
    options: q.options.map((o) => ({ id: uid('o'), value: o.value })),
  };
}

// ───────────────────────────── Yerel taslak (yalnız oluşturma) ─────────────────────────────

export const DRAFT_STORAGE_KEY = 'qx:dealer-survey-draft:v1';

type StoredDraft = { v: 1; savedAt: number; draft: { title: string; description: string; questions: { type: string; text: string; options: string[]; required: boolean }[] } };

export function serializeDraft(d: BuilderDraft, now = Date.now()): string {
  const payload: StoredDraft = {
    v: 1,
    savedAt: now,
    draft: {
      title: d.title,
      description: d.description,
      questions: d.questions.map((q) => ({ type: q.type, text: q.text, options: q.options.map((o) => o.value), required: q.required })),
    },
  };
  return JSON.stringify(payload);
}

/** Bozuk/eski/30 günden yaşlı taslak → null. */
export function parseStoredDraft(raw: string | null, now = Date.now()): BuilderDraft | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as StoredDraft;
    if (!p || p.v !== 1 || typeof p.savedAt !== 'number' || now - p.savedAt > 30 * 86_400_000) return null;
    const d = p.draft;
    if (!d || typeof d.title !== 'string' || !Array.isArray(d.questions)) return null;
    const types = ['single_choice', 'multiple_choice', 'open_text', 'rating'];
    const questions = d.questions
      .filter((q) => q && types.includes(q.type) && typeof q.text === 'string')
      .slice(0, SURVEY_LIMITS.questionsMax)
      .map((q) => ({
        id: uid('q'),
        type: q.type as SurveyQuestionType,
        text: q.text.slice(0, SURVEY_LIMITS.questionTextMax),
        options: (Array.isArray(q.options) ? q.options : [])
          .filter((o): o is string => typeof o === 'string')
          .slice(0, SURVEY_LIMITS.optionsMax)
          .map((o) => blankOption(o.slice(0, SURVEY_LIMITS.optionMax))),
        required: q.required !== false,
        serverId: null,
        locked: false,
      }));
    const draft: BuilderDraft = {
      title: d.title.slice(0, SURVEY_LIMITS.titleMax),
      description: typeof d.description === 'string' ? d.description.slice(0, SURVEY_LIMITS.descriptionMax) : '',
      questions,
    };
    return draft.title.trim() || draft.questions.length > 0 ? draft : null;
  } catch {
    return null;
  }
}
